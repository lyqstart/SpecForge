/**
 * Pre-merge contract integrity validation.
 *
 * The check projects candidate Project Spec entries over the current truth
 * source, then blocks destructive registry deltas while an explicitly marked
 * consumer still describes the removed contract surface.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

type Registry = {
  contracts?: {
    shared_enums?: Array<Record<string, unknown>>;
    invariants?: Array<Record<string, unknown>>;
    public_interfaces?: Array<Record<string, unknown>>;
    extension_points?: Array<Record<string, unknown>>;
  };
  namespaces?: Record<string, unknown>;
};

export type ContractIntegrityCheck = {
  check_id: string;
  description: string;
  passed: boolean;
  severity?: 'error' | 'warning';
  details?: string;
};

export type ContractIntegrityResult = {
  checks: ContractIntegrityCheck[];
  inputFiles: string[];
  registryTargeted: boolean;
};

const REGISTRY_TARGET = '.specforge/project/extension_registry.json';
const CONTRACT_FIELDS = [
  ['shared_enum', 'shared_enums'],
  ['invariant', 'invariants'],
  ['public_interface', 'public_interfaces'],
  ['extension_point', 'extension_points'],
] as const;

function normalize(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function readJson(filePath: string): Promise<Registry> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8')) as Registry;
}

function contractEntries(registry: Registry, field: string): Array<Record<string, unknown>> {
  const contracts = registry.contracts;
  const value = contracts?.[field as keyof NonNullable<Registry['contracts']>];
  return Array.isArray(value) ? value : [];
}

function sharedEnumValueType(entry: Record<string, unknown>): 'string' | 'number' | null {
  const raw = entry.value_type;
  if (raw === undefined) return 'string';
  return raw === 'string' || raw === 'number' ? raw : null;
}

function enumValueKey(value: unknown): string {
  return `${typeof value}:${String(value)}`;
}

function validateRegistry(registry: Registry): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [kind, field] of CONTRACT_FIELDS) {
    for (const [index, entry] of contractEntries(registry, field).entries()) {
      const id = String(entry.id ?? '').trim();
      const owner = String(entry.owner_module ?? '').trim();
      if (!id) errors.push(`${field}[${index}].id is required`);
      if (!owner) errors.push(`${field}[${index}].owner_module is required`);
      const key = `${kind}:${id}`;
      if (id && seen.has(key)) errors.push(`duplicate contract id: ${key}`);
      seen.add(key);
      if (kind === 'shared_enum') {
        const valueType = sharedEnumValueType(entry);
        const values = entry.values;
        if (!valueType) {
          errors.push(`${field}[${index}].value_type must be "string" or "number"`);
        } else if (!Array.isArray(values) || values.length === 0) {
          errors.push(`${field}[${index}].values must be a non-empty array`);
        } else if (
          valueType === 'string' &&
          (values.some(value => typeof value !== 'string' || value.trim().length === 0) ||
            new Set(values).size !== values.length)
        ) {
          errors.push(
            `${field}[${index}].values must contain unique non-empty strings when value_type is "string"`
          );
        } else if (
          valueType === 'number' &&
          (values.some(value => typeof value !== 'number' || !Number.isFinite(value)) ||
            new Set(values).size !== values.length)
        ) {
          errors.push(
            `${field}[${index}].values must contain unique finite numbers when value_type is "number"`
          );
        }
      }
    }
  }
  return errors;
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(current: string): Promise<void> {
    let entries: Array<import('node:fs').Dirent>;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) result.push(full);
    }
  }
  await visit(root);
  return result;
}

async function projectedSpecs(input: {
  projectRoot: string;
  workItemDir: string;
  manifest: Record<string, unknown>;
}): Promise<Map<string, string>> {
  const projectDir = path.join(input.projectRoot, '.specforge', 'project');
  const specs = new Map<string, string>();
  for (const filePath of await listMarkdownFiles(projectDir)) {
    specs.set(
      normalize(path.relative(input.projectRoot, filePath)),
      await fs.readFile(filePath, 'utf-8')
    );
  }

  const entries = Array.isArray(input.manifest.entries) ? input.manifest.entries : [];
  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== 'object') continue;
    const entry = rawEntry as Record<string, unknown>;
    const target = normalize(entry.target_path);
    if (!target.startsWith('.specforge/project/') || !target.toLowerCase().endsWith('.md'))
      continue;
    if (String(entry.operation ?? 'replace') === 'delete') {
      specs.delete(target);
      continue;
    }
    const candidate = path.resolve(input.workItemDir, normalize(entry.candidate_path));
    if (!isWithin(input.workItemDir, candidate)) continue;
    specs.set(target, await fs.readFile(candidate, 'utf-8'));
  }
  return specs;
}

function marker(kind: string, id: string): string {
  return `[contract:${kind}:${id}`;
}

function containsExact(content: string, value: string): boolean {
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`).test(content);
}

function changedFields(
  kind: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Array<{ name: string; oldValue: string }> {
  const fields =
    kind === 'invariant'
      ? ['rule', 'scope', 'owner_module']
      : kind === 'public_interface'
        ? ['surface', 'owner_module']
        : kind === 'extension_point'
          ? ['interface', 'extend_by', 'owner_module']
          : ['owner_module'];
  return fields
    .filter(name => JSON.stringify(before[name]) !== JSON.stringify(after[name]))
    .map(name => ({ name, oldValue: String(before[name] ?? '') }))
    .filter(change => change.oldValue.length > 0);
}

export async function checkContractIntegrity(input: {
  projectRoot: string;
  workItemDir: string;
}): Promise<ContractIntegrityResult> {
  const manifestPath = path.join(input.workItemDir, 'candidate_manifest.json');
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {
      registryTargeted: false,
      inputFiles: [manifestPath],
      checks: [
        {
          check_id: 'contract_manifest_readable',
          description: 'candidate_manifest.json is readable before contract integrity analysis',
          passed: false,
          severity: 'error',
        },
      ],
    };
  }

  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const registryEntry = entries.find(raw => {
    if (!raw || typeof raw !== 'object') return false;
    return normalize((raw as Record<string, unknown>).target_path) === REGISTRY_TARGET;
  }) as Record<string, unknown> | undefined;

  if (!registryEntry) {
    return {
      registryTargeted: false,
      inputFiles: [manifestPath],
      checks: [
        {
          check_id: 'contract_registry_not_targeted',
          description:
            'No extension_registry candidate; contract integrity delta check is not applicable',
          passed: true,
        },
      ],
    };
  }

  const candidatePath = path.resolve(input.workItemDir, normalize(registryEntry.candidate_path));
  const registryPath = path.join(
    input.projectRoot,
    '.specforge',
    'project',
    'extension_registry.json'
  );
  const inputFiles = [manifestPath, registryPath, candidatePath];
  if (!isWithin(input.workItemDir, candidatePath)) {
    return {
      registryTargeted: true,
      inputFiles,
      checks: [
        {
          check_id: 'contract_candidate_path_confined',
          description: 'extension_registry candidate stays within its Work Item',
          passed: false,
          severity: 'error',
        },
      ],
    };
  }

  let before: Registry = {};
  let after: Registry;
  try {
    before = await readJson(registryPath);
  } catch {
    // Brownfield-safe: a missing current registry is treated as an empty base.
  }
  try {
    after = await readJson(candidatePath);
  } catch {
    return {
      registryTargeted: true,
      inputFiles,
      checks: [
        {
          check_id: 'contract_candidate_registry_readable',
          description: 'Candidate extension_registry.json is valid JSON',
          passed: false,
          severity: 'error',
        },
      ],
    };
  }

  const schemaErrors = validateRegistry(after);
  const checks: ContractIntegrityCheck[] = [
    {
      check_id: 'contract_candidate_registry_schema',
      description: 'Candidate contract entries have unique IDs, required fields, and typed enum values',
      passed: schemaErrors.length === 0,
      severity: schemaErrors.length === 0 ? undefined : 'error',
      details: schemaErrors.join('; '),
    },
  ];
  if (schemaErrors.length > 0) return { registryTargeted: true, inputFiles, checks };

  const specs = await projectedSpecs({ ...input, manifest });
  inputFiles.push(...Array.from(specs.keys()).map(file => path.join(input.projectRoot, file)));
  const stale: string[] = [];

  for (const [kind, field] of CONTRACT_FIELDS) {
    const oldById = new Map(contractEntries(before, field).map(entry => [String(entry.id), entry]));
    const newById = new Map(contractEntries(after, field).map(entry => [String(entry.id), entry]));
    for (const [id, oldEntry] of oldById) {
      const nextEntry = newById.get(id);
      for (const [file, content] of specs) {
        if (!content.includes(marker(kind, id))) continue;
        if (!nextEntry) {
          stale.push(`${file}: still references removed ${kind}:${id}`);
          continue;
        }
        if (kind === 'shared_enum') {
          const oldValues = Array.isArray(oldEntry.values) ? oldEntry.values : [];
          const newValues = new Set(
            Array.isArray(nextEntry.values) ? nextEntry.values.map(enumValueKey) : []
          );
          for (const removed of oldValues.filter(value => !newValues.has(enumValueKey(value)))) {
            if (containsExact(content, String(removed))) {
              stale.push(
                `${file}: still uses removed ${kind}:${id} value ${JSON.stringify(removed)}`
              );
            }
          }
        }
        for (const change of changedFields(kind, oldEntry, nextEntry)) {
          if (containsExact(content, change.oldValue)) {
            stale.push(
              `${file}: still describes old ${kind}:${id} ${change.name} "${change.oldValue}"`
            );
          }
        }
      }
    }
  }

  checks.push({
    check_id: 'contract_reverse_dependencies_aligned',
    description:
      'Destructive contract changes update every explicitly marked Project Spec consumer',
    passed: stale.length === 0,
    severity: stale.length === 0 ? undefined : 'error',
    details:
      stale.length === 0
        ? 'No stale marked consumers found in the candidate-projected Project Spec.'
        : `${stale.join('; ')}. Update those consumers in this Work Item or keep the old contract surface.`,
  });
  return { registryTargeted: true, inputFiles, checks };
}
