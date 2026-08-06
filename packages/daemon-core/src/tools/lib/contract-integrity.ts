/**
 * Pre-merge Project/Module Contract integrity validation.
 *
 * Formal Contract consumers are read only from prospective Trace. Candidate
 * prose markers are not an authority source. Destructive Contract changes and
 * Module-to-Project promotion must update every formal consumer in the same WI.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  ContractRegistrySchema,
  extractModuleFromDdId,
  moduleCodeFromProjectSpecPath,
} from '@specforge/types';
import {
  inspectProjectGovernanceContractConsumers,
  type ProjectGovernanceContractConsumerSnapshot,
} from './project-governance-v2.js';

type Registry = {
  schema_version?: unknown;
  owner_module?: unknown;
  contracts?: {
    shared_enums?: Array<Record<string, unknown>>;
    invariants?: Array<Record<string, unknown>>;
    public_interfaces?: Array<Record<string, unknown>>;
    extension_points?: Array<Record<string, unknown>>;
  };
  namespaces?: Record<string, unknown>;
};

type ContractEntry = {
  id: string;
  kind: string;
  raw: Record<string, unknown>;
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

type ContractChangeClassificationKey =
  | 'api_contract_changed'
  | 'project_contract_changed'
  | 'contract_registry_only';

const CONTRACT_CHANGE_CLASSIFICATION_KEYS: ContractChangeClassificationKey[] = [
  'api_contract_changed',
  'project_contract_changed',
  'contract_registry_only',
];

function canonicalSemanticValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalSemanticValue)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalSemanticValue(nested)]),
    );
  }
  return value;
}

export function projectContractSemanticProjection(registry: Registry): unknown {
  return canonicalSemanticValue({
    namespaces: registry.namespaces ?? {},
    contracts: registry.contracts ?? {},
  });
}

export function hasProjectContractSemanticChange(before: Registry, after: Registry): boolean {
  return JSON.stringify(projectContractSemanticProjection(before)) !==
    JSON.stringify(projectContractSemanticProjection(after));
}

function findClassificationBoolean(value: unknown, key: string): boolean | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const nested of value) {
      const found = findClassificationBoolean(nested, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record[key] === 'boolean') return record[key] as boolean;
  for (const nested of Object.values(record)) {
    const found = findClassificationBoolean(nested, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findClassificationMarkdownBoolean(content: string, key: string): boolean | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)\\s*(?:[-*|]\\s*)?${escaped}\\s*(?::|=|\\|)\\s*(true|false)\\b`, 'i').exec(content);
  return match ? match[1].toLowerCase() === 'true' : undefined;
}

async function readProjectContractChangeClassification(workItemDir: string): Promise<{
  values: Record<ContractChangeClassificationKey, boolean | null>;
  files: string[];
}> {
  const values = Object.fromEntries(
    CONTRACT_CHANGE_CLASSIFICATION_KEYS.map(key => [key, null]),
  ) as Record<ContractChangeClassificationKey, boolean | null>;
  const files: string[] = [];
  const jsonPath = path.join(workItemDir, 'trigger_result.json');
  const markdownPath = path.join(workItemDir, 'change_classification.md');
  try {
    const parsed = JSON.parse(await fs.readFile(jsonPath, 'utf-8')) as unknown;
    files.push(jsonPath);
    for (const key of CONTRACT_CHANGE_CLASSIFICATION_KEYS) {
      const found = findClassificationBoolean(parsed, key);
      if (found !== undefined) values[key] = found;
    }
  } catch {
    // Optional source. Missing values remain null.
  }
  if (CONTRACT_CHANGE_CLASSIFICATION_KEYS.some(key => values[key] === null)) {
    try {
      const content = await fs.readFile(markdownPath, 'utf-8');
      files.push(markdownPath);
      for (const key of CONTRACT_CHANGE_CLASSIFICATION_KEYS) {
        if (values[key] !== null) continue;
        const found = findClassificationMarkdownBoolean(content, key);
        if (found !== undefined) values[key] = found;
      }
    } catch {
      // Optional source. Missing values remain null.
    }
  }
  return { values, files };
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

function normalizeContractKind(value: string): string {
  const normalized = String(value ?? '').trim();
  return normalized === 'shared_enums'
    ? 'shared_enum'
    : normalized === 'invariants'
      ? 'invariant'
      : normalized === 'public_interfaces'
        ? 'public_interface'
        : normalized === 'extension_points'
          ? 'extension_point'
          : normalized;
}

function validateRegistry(registry: Registry): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  for (const [kind, field] of CONTRACT_FIELDS) {
    for (const [index, entry] of contractEntries(registry, field).entries()) {
      const id = String(entry.id ?? '').trim();
      const owner = String(entry.owner_module ?? '').trim();
      if (!id) errors.push(`${field}[${index}].id is required`);
      if (!owner) errors.push(`${field}[${index}].owner_module is required`);
      if (id && seenIds.has(id)) errors.push(`duplicate contract id across governance levels: ${id}`);
      if (id) seenIds.add(id);
      if (kind !== 'shared_enum') continue;
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
          `${field}[${index}].values must contain unique non-empty strings when value_type is "string"`,
        );
      } else if (
        valueType === 'number' &&
        (values.some(value => typeof value !== 'number' || !Number.isFinite(value)) ||
          new Set(values).size !== values.length)
      ) {
        errors.push(
          `${field}[${index}].values must contain unique finite numbers when value_type is "number"`,
        );
      }
    }
  }
  return errors;
}

function validateModuleContractCandidate(candidate: Registry, moduleCode: string): string[] {
  const errors: string[] = [];
  if (candidate.schema_version !== '1.0') errors.push('schema_version must be "1.0"');
  const owner = String(candidate.owner_module ?? '').trim();
  if (owner !== moduleCode) errors.push(`owner_module must equal target module ${moduleCode}`);

  const registry = ContractRegistrySchema.safeParse(candidate.contracts);
  if (!registry.success) {
    errors.push(
      `contracts must match ContractRegistrySchema: ${registry.error.issues
        .map(issue => `${issue.path.join('.') || 'contracts'} ${issue.message}`)
        .join('; ')}`,
    );
    return errors;
  }
  errors.push(...validateRegistry(candidate));

  for (const [, field] of CONTRACT_FIELDS) {
    for (const [index, entry] of contractEntries(candidate, field).entries()) {
      const entryOwner = String(entry.owner_module ?? '').trim();
      if (entryOwner !== moduleCode) {
        errors.push(`${field}[${index}].owner_module must equal ${moduleCode}`);
      }
      const sourceRefs = Array.isArray(entry.source_refs)
        ? entry.source_refs.map(value => String(value ?? '').trim()).filter(Boolean)
        : [];
      if (sourceRefs.length === 0) {
        errors.push(`${field}[${index}].source_refs must contain at least one DD-* reference`);
      } else {
        for (const sourceRef of sourceRefs) {
          const sourceModule = extractModuleFromDdId(sourceRef);
          if (!sourceModule) {
            errors.push(`${field}[${index}].source_refs contains non-DD reference ${sourceRef}`);
          } else if (sourceModule !== moduleCode) {
            errors.push(
              `${field}[${index}].source_refs ${sourceRef} belongs to ${sourceModule}, expected ${moduleCode}`,
            );
          }
        }
      }
      if (!String(entry.enforcement ?? '').trim()) {
        errors.push(`${field}[${index}].enforcement is required`);
      }
    }
  }
  return errors;
}

function destructiveReasons(before: ContractEntry, after: ContractEntry | undefined): string[] {
  if (!after) return ['contract removed'];
  const reasons: string[] = [];
  if (before.kind !== after.kind) reasons.push(`kind changed ${before.kind} -> ${after.kind}`);
  const fields =
    before.kind === 'invariant'
      ? ['rule', 'scope', 'owner_module']
      : before.kind === 'public_interface'
        ? ['surface', 'owner_module']
        : before.kind === 'extension_point'
          ? ['interface', 'extend_by', 'owner_module']
          : ['owner_module', 'value_type'];
  for (const field of fields) {
    if (JSON.stringify(before.raw[field]) !== JSON.stringify(after.raw[field])) {
      reasons.push(`${field} changed`);
    }
  }
  if (before.kind === 'shared_enum' && after.kind === 'shared_enum') {
    const next = new Set(
      Array.isArray(after.raw.values) ? after.raw.values.map(enumValueKey) : [],
    );
    const removed = (Array.isArray(before.raw.values) ? before.raw.values : []).filter(
      value => !next.has(enumValueKey(value)),
    );
    if (removed.length > 0) reasons.push(`values removed: ${removed.map(String).join(', ')}`);
  }
  return reasons;
}

function candidateDesignModules(entries: unknown[]): Set<string> {
  const modules = new Set<string>();
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const target = normalize((raw as Record<string, unknown>).target_path);
    const moduleCode = moduleCodeFromProjectSpecPath(target);
    if (moduleCode && target.endsWith(`/modules/${moduleCode}/design.md`)) modules.add(moduleCode);
  }
  return modules;
}

function edgeKey(from: string, relation: string, to: string): string {
  return `${from}\u0000${relation}\u0000${to}`;
}

function consumerIds(
  snapshot: ProjectGovernanceContractConsumerSnapshot,
  contractId: string,
): string[] {
  return unique(
    snapshot.consumers
      .filter(consumer => consumer.contract_id === contractId)
      .map(consumer => consumer.design_id),
  );
}

function consumerModules(
  snapshot: ProjectGovernanceContractConsumerSnapshot,
  contractId: string,
): string[] {
  return unique(
    snapshot.consumers
      .filter(consumer => consumer.contract_id === contractId)
      .map(consumer => consumer.module_code),
  );
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
  const inputFiles = [manifestPath];
  const checks: ContractIntegrityCheck[] = [];

  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== 'object') continue;
    const entry = rawEntry as Record<string, unknown>;
    const target = normalize(entry.target_path);
    const moduleCode = moduleCodeFromProjectSpecPath(target);
    if (!moduleCode || target !== `.specforge/project/modules/${moduleCode}/contracts.json`) continue;

    const prefix = `module_contract_${moduleCode.toLowerCase()}`;
    if (String(entry.operation ?? 'replace') === 'delete') {
      checks.push({
        check_id: `${prefix}_not_deleted`,
        description: `Module Contract file for ${moduleCode} remains present while the Module is governed`,
        passed: false,
        severity: 'error',
      });
      continue;
    }
    const candidatePath = path.resolve(input.workItemDir, normalize(entry.candidate_path));
    inputFiles.push(candidatePath);
    const confined = isWithin(input.workItemDir, candidatePath);
    checks.push({
      check_id: `${prefix}_candidate_confined`,
      description: `Module Contract candidate for ${moduleCode} stays within its Work Item`,
      passed: confined,
      severity: confined ? undefined : 'error',
    });
    if (!confined) continue;
    try {
      const candidate = await readJson(candidatePath);
      const errors = validateModuleContractCandidate(candidate, moduleCode);
      checks.push({
        check_id: `${prefix}_candidate_integrity`,
        description: `Module Contract candidate for ${moduleCode} has owner, DD provenance, and enforcement metadata`,
        passed: errors.length === 0,
        severity: errors.length === 0 ? undefined : 'error',
        details: errors.join('; '),
      });
    } catch (error) {
      checks.push({
        check_id: `${prefix}_candidate_readable`,
        description: `Module Contract candidate for ${moduleCode} is valid JSON`,
        passed: false,
        severity: 'error',
        details: (error as Error).message,
      });
    }
  }

  const registryEntry = entries.find(raw => {
    if (!raw || typeof raw !== 'object') return false;
    return normalize((raw as Record<string, unknown>).target_path) === REGISTRY_TARGET;
  }) as Record<string, unknown> | undefined;
  const registryTargeted = Boolean(registryEntry);

  let beforeRegistry: Registry = {};
  try {
    beforeRegistry = await readJson(
      path.join(input.projectRoot, '.specforge', 'project', 'extension_registry.json'),
    );
  } catch {
    // Brownfield-safe empty base.
  }
  let afterRegistry = beforeRegistry;
  if (registryEntry) {
    const candidatePath = path.resolve(input.workItemDir, normalize(registryEntry.candidate_path));
    inputFiles.push(candidatePath);
    if (!isWithin(input.workItemDir, candidatePath)) {
      checks.push({
        check_id: 'contract_candidate_path_confined',
        description: 'extension_registry candidate stays within its Work Item',
        passed: false,
        severity: 'error',
      });
      return { registryTargeted, inputFiles, checks };
    }
    try {
      afterRegistry = await readJson(candidatePath);
      const errors = validateRegistry(afterRegistry);
      checks.push({
        check_id: 'contract_candidate_registry_schema',
        description: 'Candidate Project Contract registry has unique IDs, required fields, and typed enum values',
        passed: errors.length === 0,
        severity: errors.length === 0 ? undefined : 'error',
        details: errors.join('; '),
      });
      if (errors.length > 0) return { registryTargeted, inputFiles, checks };
    } catch (error) {
      checks.push({
        check_id: 'contract_candidate_registry_readable',
        description: 'Candidate extension_registry.json is valid JSON',
        passed: false,
        severity: 'error',
        details: (error as Error).message,
      });
      return { registryTargeted, inputFiles, checks };
    }
  }

  const contractClassification = await readProjectContractChangeClassification(input.workItemDir);
  inputFiles.push(...contractClassification.files);
  const declaredProjectContractChange = CONTRACT_CHANGE_CLASSIFICATION_KEYS.some(
    key => contractClassification.values[key] === true,
  );
  if (declaredProjectContractChange) {
    const semanticChange =
      registryTargeted && hasProjectContractSemanticChange(beforeRegistry, afterRegistry);
    checks.push({
      check_id: 'contract_registry_semantic_change_required',
      description:
        'Declared Project Contract change must alter namespaces or contracts, not metadata only',
      passed: semanticChange,
      severity: semanticChange ? undefined : 'error',
      details: `classification=${JSON.stringify(contractClassification.values)}; registry_targeted=${registryTargeted}`,
    });
  }

  const current = await inspectProjectGovernanceContractConsumers({
    projectRoot: input.projectRoot,
    workItemDir: input.workItemDir,
    prospective: false,
  });
  const prospective = await inspectProjectGovernanceContractConsumers({
    projectRoot: input.projectRoot,
    workItemDir: input.workItemDir,
    prospective: true,
  });
  inputFiles.push(...current.inputFiles, ...prospective.inputFiles);

  checks.push({
    check_id: 'contract_trace_projection_valid',
    description: 'Prospective Trace is valid before Contract integrity decisions',
    passed: prospective.trace_issues.length === 0,
    severity: prospective.trace_issues.length === 0 ? undefined : 'error',
    details: prospective.trace_issues.map(issue => issue.message).join('; '),
  });

  const currentDefinitions = new Map(
    current.contracts.map(contract => [
      contract.id,
      { id: contract.id, kind: normalizeContractKind(contract.kind), raw: contract.raw } as ContractEntry,
    ]),
  );
  const prospectiveDefinitions = new Map(
    prospective.contracts.map(contract => [
      contract.id,
      { id: contract.id, kind: normalizeContractKind(contract.kind), raw: contract.raw } as ContractEntry,
    ]),
  );
  const designModules = candidateDesignModules(entries);
  const operationKeys = new Set(
    prospective.trace_delta_operations.map(operation =>
      edgeKey(operation.edge.from, operation.edge.relation, operation.edge.to),
    ),
  );
  const removeKeys = new Set(
    prospective.trace_delta_operations
      .filter(operation => operation.operation === 'REMOVE')
      .map(operation => edgeKey(operation.edge.from, operation.edge.relation, operation.edge.to)),
  );
  const addKeys = new Set(
    prospective.trace_delta_operations
      .filter(operation => operation.operation === 'ADD')
      .map(operation => edgeKey(operation.edge.from, operation.edge.relation, operation.edge.to)),
  );

  const stale: string[] = [];
  for (const [id, oldEntry] of currentDefinitions) {
    const reasons = destructiveReasons(oldEntry, prospectiveDefinitions.get(id));
    if (reasons.length === 0) continue;
    const currentConsumers = current.consumers.filter(consumer => consumer.contract_id === id);
    const prospectiveConsumers = prospective.consumers.filter(consumer => consumer.contract_id === id);
    if (!prospectiveDefinitions.has(id) && prospectiveConsumers.length > 0) {
      stale.push(`${id}: removed Contract still has prospective consumers ${consumerIds(prospective, id).join(', ')}`);
    }
    for (const consumer of currentConsumers) {
      const remove = edgeKey(consumer.design_id, 'constrained_by', id);
      if (!prospectiveDefinitions.has(id) && !removeKeys.has(remove)) {
        stale.push(`${id}: missing REMOVE for ${consumer.design_id} constrained_by ${id}`);
      }
      if (!designModules.has(consumer.module_code)) {
        stale.push(
          `${id}: destructive change (${reasons.join(', ')}) does not update consumer Module ${consumer.module_code} design.md`,
        );
      }
    }
  }
  checks.push({
    check_id: 'contract_reverse_dependencies_aligned',
    description: 'Destructive Contract changes update every formal Trace consumer in the same Work Item',
    passed: stale.length === 0,
    severity: stale.length === 0 ? undefined : 'error',
    details: stale.join('; '),
  });

  const promotions = Array.isArray(manifest.contract_promotions)
    ? manifest.contract_promotions.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
      )
    : [];
  for (const [index, promotion] of promotions.entries()) {
    const from = String(promotion.from_contract_id ?? '').trim();
    const to = String(promotion.to_contract_id ?? '').trim();
    const conclusion = String(promotion.migration_conclusion ?? '').trim();
    const compatibility = String(promotion.compatibility ?? '').trim();
    const oldDefinition = current.contracts.find(contract => contract.id === from);
    const newDefinition = prospective.contracts.find(contract => contract.id === to);
    const promotionErrors: string[] = [];
    if (!from || !to || from === to) promotionErrors.push('from/to Contract IDs must be distinct');
    if (!oldDefinition?.module_internal) promotionErrors.push(`${from} is not a current Module Contract`);
    if (!newDefinition || newDefinition.module_internal) promotionErrors.push(`${to} is not a prospective Project Contract`);
    if (prospective.contracts.some(contract => contract.id === from)) {
      promotionErrors.push(`${from} still exists after promotion`);
    }
    if (!conclusion) promotionErrors.push('migration_conclusion is required');
    if (!compatibility) promotionErrors.push('compatibility is required');
    for (const designId of consumerIds(current, from)) {
      if (!removeKeys.has(edgeKey(designId, 'constrained_by', from))) {
        promotionErrors.push(`missing REMOVE ${designId} constrained_by ${from}`);
      }
      if (!addKeys.has(edgeKey(designId, 'constrained_by', to))) {
        promotionErrors.push(`missing ADD ${designId} constrained_by ${to}`);
      }
    }
    for (const sourceRef of oldDefinition?.source_refs ?? []) {
      if (!removeKeys.has(edgeKey(from, 'enforces', sourceRef))) {
        promotionErrors.push(`missing REMOVE ${from} enforces ${sourceRef}`);
      }
    }
    for (const sourceRef of newDefinition?.source_refs ?? []) {
      if (!addKeys.has(edgeKey(to, 'enforces', sourceRef))) {
        promotionErrors.push(`missing ADD ${to} enforces ${sourceRef}`);
      }
    }
    checks.push({
      check_id: `contract_promotion_${index}`,
      description: `Module-to-Project Contract promotion ${from || '?'} -> ${to || '?'} is atomic and complete`,
      passed: promotionErrors.length === 0,
      severity: promotionErrors.length === 0 ? undefined : 'error',
      details: promotionErrors.join('; '),
    });
  }

  const removedModuleContracts = current.contracts.filter(
    contract =>
      contract.module_internal &&
      !prospective.contracts.some(candidate => candidate.id === contract.id),
  );
  for (const contract of removedModuleContracts) {
    const hasConsumers = consumerModules(current, contract.id).length > 0;
    const declaredPromotion = promotions.some(
      promotion => String(promotion.from_contract_id ?? '').trim() === contract.id,
    );
    checks.push({
      check_id: `module_contract_removal_${contract.id.replace(/[^A-Za-z0-9_-]/g, '_')}`,
      description: `Removed Module Contract ${contract.id} is either unused or has an explicit promotion record`,
      passed: !hasConsumers || declaredPromotion,
      severity: !hasConsumers || declaredPromotion ? undefined : 'error',
      details: `consumers=${consumerIds(current, contract.id).join(', ') || 'none'}`,
    });
  }

  checks.push({
    check_id: 'contract_trace_delta_relevant',
    description: 'Contract integrity is evaluated against the same prospective Trace operations used by merge',
    passed: operationKeys.size === prospective.trace_delta_operations.length,
    severity: operationKeys.size === prospective.trace_delta_operations.length ? undefined : 'error',
  });

  if (!registryTargeted && checks.length === 1 && checks[0]?.check_id === 'contract_trace_projection_valid') {
    checks.unshift({
      check_id: 'contract_registry_not_targeted',
      description: 'No Project Contract candidate; Project Contract registry delta check is not applicable',
      passed: true,
    });
  }

  return {
    registryTargeted,
    inputFiles: unique(inputFiles),
    checks,
  };
}
