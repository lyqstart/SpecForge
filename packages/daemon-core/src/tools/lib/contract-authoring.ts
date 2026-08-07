/**
 * contract-authoring.ts — author a governed contract-registration candidate.
 *
 * This is the "proposal-form filler" for the cross-module contract model. It
 * does NOT write the project truth source. It only:
 *   1. for action=add, reads the existing WI candidate registry when present;
 *      otherwise reads the current project extension_registry.json,
 *   2. for action=update, replaces one existing same-kind, same-ID Project
 *      Contract in the WI Candidate while preserving every other entry,
 *   3. for action=reset, discards the current WI candidate content and rebuilds
 *      it from the current project extension_registry.json,
 *   4. for action=add, adds one contract entry to the `contracts` block
 *      (dedup-guarded),
 *   5. writes the proposed full registry to
 *      `candidates/project/extension_registry.json` (a WI candidate), and
 *   6. registers an explicit entry in `candidate_manifest.json` targeting
 *      `.specforge/project/extension_registry.json`.
 *
 * From there the change flows through the SAME governed path as any project-spec
 * change: candidate gate → user decision → Merge Runner copies the candidate to
 * the truth source (merge_runner is the only authorized writer). No bypass of the
 * merge/normalization ("intake officer"): the explicit entry targets a declared
 * project file, so inferManifestEntries echoes it verbatim.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { inspectProjectGovernanceContractConsumers } from './project-governance-v2.js';

export type ContractKind = 'shared_enum' | 'invariant' | 'public_interface' | 'extension_point';

export type RegistrationKind = ContractKind | 'namespace_type';
export type ContractCandidateAction = 'add' | 'update' | 'promote' | 'repair_relocate_to_module' | 'reset';

type NamespaceName =
  | 'requirement_types'
  | 'design_types'
  | 'task_types'
  | 'verification_types'
  | 'gate_types';

const KIND_TO_FIELD: Record<ContractKind, string> = {
  shared_enum: 'shared_enums',
  invariant: 'invariants',
  public_interface: 'public_interfaces',
  extension_point: 'extension_points',
};

const CONTRACT_FIELDS = ['shared_enums', 'invariants', 'public_interfaces', 'extension_points'];
const NAMESPACE_NAMES = new Set<NamespaceName>([
  'requirement_types',
  'design_types',
  'task_types',
  'verification_types',
  'gate_types',
]);

const CANDIDATE_REL = 'candidates/project/extension_registry.json';
const TARGET_REL = '.specforge/project/extension_registry.json';

export interface AuthorContractResult {
  success: boolean;
  action?: ContractCandidateAction;
  error?: string;
  candidate_path?: string;
  target_path?: string;
  manifest_path?: string;
  contract_ref?: string;
  registry_after?: Record<string, unknown>;
}

function emptyRegistry(): Record<string, any> {
  return {
    schema_version: '1.0',
    project_spec_version: 'PSV-0001',
    namespaces: {
      requirement_types: [],
      design_types: [],
      task_types: [],
      verification_types: [],
      gate_types: [],
    },
    updated_by_work_item: null,
    updated_at: null,
  };
}

export async function authorContractCandidate(params: {
  projectRoot: string;
  workItemId: string;
  action?: ContractCandidateAction;
  kind?: RegistrationKind;
  entry?: Record<string, unknown>;
  workflowPath?: string;
  sourceModule?: string;
  fromContractId?: string;
  migrationConclusion?: string;
  compatibility?: string;
}): Promise<AuthorContractResult> {
  const { projectRoot, workItemId } = params;
  const action = params.action ?? 'add';
  const kind = params.kind;
  const entry = params.entry;

  if (action !== 'add' && action !== 'update' && action !== 'promote' && action !== 'repair_relocate_to_module' && action !== 'reset') {
    return { success: false, error: `invalid contract candidate action: ${action}` };
  }

  const wiDir = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);
  const candidateAbs = path.join(wiDir, 'candidates', 'project', 'extension_registry.json');
  const registryPath = path.join(projectRoot, SPEC_DIR_NAME, 'project', 'extension_registry.json');

  let liveRegistry: Record<string, any>;
  try {
    liveRegistry = JSON.parse(await fs.readFile(registryPath, 'utf-8'));
    if (!liveRegistry || typeof liveRegistry !== 'object') {
      return {
        success: false,
        error: `live extension_registry is invalid: ${registryPath}`,
      };
    }
  } catch (liveError: any) {
    if (liveError?.code === 'ENOENT') {
      liveRegistry = emptyRegistry();
    } else {
      return {
        success: false,
        error: `failed to read live extension_registry: ${liveError?.message ?? String(liveError)}`,
      };
    }
  }

  if (action === 'reset') {
    const next: Record<string, any> = JSON.parse(JSON.stringify(liveRegistry));
    return writeContractCandidate({
      projectRoot,
      workItemId,
      workflowPath: params.workflowPath,
      registry: next,
      action,
      contractRef: undefined,
    });
  }

  if (!kind) {
    return { success: false, error: 'kind is required when action=add, action=update, action=promote, or action=repair_relocate_to_module' };
  }
  if (!entry || typeof entry !== 'object') {
    return {
      success: false,
      error: 'entry (contract entry object) is required when action=add, action=update, action=promote, or action=repair_relocate_to_module',
    };
  }

  const field = kind === 'namespace_type' ? null : KIND_TO_FIELD[kind];
  const namespace = String((entry as any)?.namespace ?? '').trim() as NamespaceName;
  const typeId = String((entry as any)?.type_id ?? '').trim();
  const id = String((entry as any)?.id ?? '').trim();
  const owner = String((entry as any)?.owner_module ?? '').trim();
  if ((action === 'update' || action === 'promote' || action === 'repair_relocate_to_module') && kind === 'namespace_type') {
    return {
      success: false,
      error: `action=${action} only supports Project Contract kinds; namespace_type is not allowed`,
    };
  }
  if (kind === 'namespace_type') {
    if (!NAMESPACE_NAMES.has(namespace)) {
      return {
        success: false,
        error: `namespace_type entry requires "namespace" to be one of: ${Array.from(NAMESPACE_NAMES).join(', ')}`,
      };
    }
    if (!typeId) return { success: false, error: 'namespace_type entry requires "type_id"' };
  } else {
    if (!field) return { success: false, error: `invalid contract kind: ${kind}` };
    if (!id) return { success: false, error: 'contract entry requires "id"' };
    if (!owner) return { success: false, error: 'contract entry requires "owner_module"' };
    if (kind === 'shared_enum') {
      const valueType = (entry as any).value_type;
      const values = (entry as any).values;

      if (valueType !== 'string' && valueType !== 'number') {
        return {
          success: false,
          error: 'shared_enum entry requires "value_type" to be "string" or "number"',
        };
      }

      const validValues =
        Array.isArray(values) &&
        values.length > 0 &&
        (valueType === 'string'
          ? values.every(
              (value: unknown) => typeof value === 'string' && value.trim().length > 0
            )
          : values.every(
              (value: unknown) => typeof value === 'number' && Number.isFinite(value)
            )) &&
        new Set(values).size === values.length;

      if (!validValues) {
        return {
          success: false,
          error:
            valueType === 'string'
              ? 'shared_enum entry requires "values" to contain unique non-empty strings when value_type="string"'
              : 'shared_enum entry requires "values" to contain unique finite numbers when value_type="number"',
        };
      }
    }
  }

  if (action === 'promote') {
    return authorContractPromotionCandidate({
      projectRoot,
      workItemId,
      wiDir,
      liveRegistry,
      field: field!,
      entry,
      id,
      owner,
      sourceModule: params.sourceModule,
      fromContractId: params.fromContractId,
      migrationConclusion: params.migrationConclusion,
      compatibility: params.compatibility,
      workflowPath: params.workflowPath,
    });
  }

  if (action === 'repair_relocate_to_module') {
    return authorContractRepairRelocationCandidate({
      projectRoot,
      workItemId,
      wiDir,
      liveRegistry,
      field: field!,
      entry,
      id,
      owner,
      sourceModule: params.sourceModule,
      fromContractId: params.fromContractId,
      migrationConclusion: params.migrationConclusion,
      compatibility: params.compatibility,
      workflowPath: params.workflowPath,
    });
  }
  // 1. Read the existing WI candidate first so repeated registrations accumulate.
  //    Only the first registration starts from the live project registry.
  let registry: Record<string, any>;
  try {
    registry = JSON.parse(await fs.readFile(candidateAbs, 'utf-8'));
    if (!registry || typeof registry !== 'object') {
      return {
        success: false,
        error: `existing extension_registry candidate is invalid: ${candidateAbs}`,
      };
    }
  } catch (candidateError: any) {
    if (candidateError?.code !== 'ENOENT') {
      return {
        success: false,
        error: `failed to read existing extension_registry candidate: ${candidateError?.message ?? String(candidateError)}`,
      };
    }
    registry = JSON.parse(JSON.stringify(liveRegistry));
  }

  // 2. Clone and perform the requested Candidate-only mutation.
  const next: Record<string, any> = JSON.parse(JSON.stringify(registry));
  if (kind === 'namespace_type') {
    if (!next.namespaces || typeof next.namespaces !== 'object') next.namespaces = {};
    if (!Array.isArray(next.namespaces[namespace])) next.namespaces[namespace] = [];
    if (next.namespaces[namespace].includes(typeId)) {
      return {
        success: false,
        error: `namespace type already registered: ${namespace}:${typeId}`,
      };
    }
    next.namespaces[namespace].push(typeId);
  } else {
    if (!next.contracts || typeof next.contracts !== 'object') {
      next.contracts = {
        shared_enums: [],
        invariants: [],
        public_interfaces: [],
        extension_points: [],
      };
    }
    for (const f of CONTRACT_FIELDS) {
      if (!Array.isArray(next.contracts[f])) next.contracts[f] = [];
    }
    if (action === 'update') {
      let liveField: string | null = null;
      for (const candidateField of CONTRACT_FIELDS) {
        const entries = Array.isArray((liveRegistry.contracts as any)?.[candidateField])
          ? (liveRegistry.contracts as any)[candidateField]
          : [];
        if (entries.some((candidate: any) => String(candidate?.id ?? '').trim() === id)) {
          liveField = candidateField;
          break;
        }
      }
      if (!liveField) {
        return { success: false, error: `contract does not exist in live registry: ${kind}:${id}` };
      }
      if (liveField !== field) {
        return {
          success: false,
          error: `contract kind mismatch for ${id}: live=${liveField}; requested=${field}`,
        };
      }
      const candidateIndex = next.contracts[field!].findIndex(
        (candidate: any) => String(candidate?.id ?? '').trim() === id,
      );
      if (candidateIndex < 0) {
        return {
          success: false,
          error: `contract ${id} is missing from the current WI Candidate; reset or repair the Candidate before update`,
        };
      }
      next.contracts[field!][candidateIndex] = entry;
    } else {
      if (next.contracts[field!].some((e: any) => e?.id === id)) {
        return { success: false, error: `contract already registered: ${kind}:${id}` };
      }
      next.contracts[field!].push(entry);
    }
  }
  next.updated_by_work_item = workItemId;
  next.updated_at = new Date().toISOString();

  return writeContractCandidate({
    projectRoot,
    workItemId,
    workflowPath: params.workflowPath,
    registry: next,
    action,
    contractRef:
      kind === 'namespace_type'
        ? `[extension:${namespace}:${typeId}]`
        : `[contract:${kind}:${id} owner=${owner}]`,
  });
}

type PromotionMetadata = {
  from_contract_id: string;
  to_contract_id: string;
  migration_conclusion: string;
  compatibility: string;
};

type ContractModuleCandidate = {
  moduleCode: string;
  candidatePath: string;
  targetPath: string;
  registry: Record<string, any>;
};

async function readJsonObjectForPromotion(
  filePath: string,
  label: string,
): Promise<{ value?: Record<string, any>; error?: string }> {
  try {
    const value = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { error: `${label} is not a JSON object: ${filePath}` };
    }
    return { value };
  } catch (error: any) {
    return { error: `failed to read ${label}: ${error?.message ?? String(error)}` };
  }
}

function governanceProjectSourceIds(content: string): Set<string> {
  return new Set(content.match(/\b(?:ARCH|DATA)-[A-Z][A-Z0-9]{1,11}-[0-9]{3}\b/g) ?? []);
}

async function readProspectiveProjectSourceIds(
  projectRoot: string,
  wiDir: string,
): Promise<Set<string>> {
  const pairs = [
    [
      path.join(wiDir, 'candidates', 'project', 'architecture.candidate.md'),
      path.join(projectRoot, SPEC_DIR_NAME, 'project', 'architecture.md'),
    ],
    [
      path.join(wiDir, 'candidates', 'project', 'data_model.candidate.md'),
      path.join(projectRoot, SPEC_DIR_NAME, 'project', 'data_model.md'),
    ],
  ] as const;
  const ids = new Set<string>();
  for (const [candidatePath, formalPath] of pairs) {
    let content = '';
    try {
      content = await fs.readFile(candidatePath, 'utf-8');
    } catch {
      try {
        content = await fs.readFile(formalPath, 'utf-8');
      } catch {
        content = '';
      }
    }
    for (const id of governanceProjectSourceIds(content)) ids.add(id);
  }
  return ids;
}

async function currentOrCandidateModuleContractIds(
  projectRoot: string,
  wiDir: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const formalModulesRoot = path.join(projectRoot, SPEC_DIR_NAME, 'project', 'modules');
  let moduleCodes: string[] = [];
  try {
    moduleCodes = (await fs.readdir(formalModulesRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
  } catch {
    moduleCodes = [];
  }
  for (const moduleCode of moduleCodes) {
    const candidatePath = path.join(
      wiDir,
      'candidates',
      'project',
      'modules',
      moduleCode,
      'contracts.candidate.json',
    );
    const formalPath = path.join(formalModulesRoot, moduleCode, 'contracts.json');
    let registry: any = null;
    try {
      registry = JSON.parse(await fs.readFile(candidatePath, 'utf-8'));
    } catch {
      try {
        registry = JSON.parse(await fs.readFile(formalPath, 'utf-8'));
      } catch {
        registry = null;
      }
    }
    if (!registry?.contracts || typeof registry.contracts !== 'object') continue;
    for (const field of CONTRACT_FIELDS) {
      for (const contract of Array.isArray(registry.contracts[field]) ? registry.contracts[field] : []) {
        const id = String(contract?.id ?? '').trim();
        if (id) ids.add(id);
      }
    }
  }
  return ids;
}

function governanceModuleDesignIds(content: string): Set<string> {
  return new Set(content.match(/\bDD-[A-Z][A-Z0-9]{1,11}-[0-9]{3}\b/g) ?? []);
}

async function readProspectiveModuleDesignIds(
  projectRoot: string,
  wiDir: string,
  sourceModule: string,
): Promise<Set<string>> {
  const candidatePath = path.join(
    wiDir, 'candidates', 'project', 'modules', sourceModule, 'design.candidate.md',
  );
  const formalPath = path.join(
    projectRoot, SPEC_DIR_NAME, 'project', 'modules', sourceModule, 'design.md',
  );
  let content = '';
  try {
    content = await fs.readFile(candidatePath, 'utf-8');
  } catch {
    try {
      content = await fs.readFile(formalPath, 'utf-8');
    } catch {
      content = '';
    }
  }
  return governanceModuleDesignIds(content);
}

async function authorContractRepairRelocationCandidate(params: {
  projectRoot: string;
  workItemId: string;
  wiDir: string;
  liveRegistry: Record<string, any>;
  field: string;
  entry: Record<string, unknown>;
  id: string;
  owner: string;
  sourceModule?: string;
  fromContractId?: string;
  migrationConclusion?: string;
  compatibility?: string;
  workflowPath?: string;
}): Promise<AuthorContractResult> {
  if (params.workflowPath !== 'spec_migration_path') {
    return { success: false, error: 'action=repair_relocate_to_module requires workflow_path=spec_migration_path' };
  }

  const sourceModule = String(params.sourceModule ?? '').trim();
  const fromContractId = String(params.fromContractId ?? '').trim();
  const migrationConclusion = String(params.migrationConclusion ?? '').trim();
  const compatibility = String(params.compatibility ?? '').trim();

  if (!sourceModule || !/^[A-Z][A-Z0-9_-]*$/.test(sourceModule)) {
    return { success: false, error: 'action=repair_relocate_to_module requires a canonical source_module' };
  }
  if (!fromContractId) {
    return { success: false, error: 'action=repair_relocate_to_module requires from_contract_id' };
  }
  if (params.id !== fromContractId) {
    return { success: false, error: 'Contract repair relocation preserves identity: entry.id must equal from_contract_id' };
  }
  if (params.owner !== sourceModule) {
    return { success: false, error: 'Relocated Module Contract owner_module must equal source_module' };
  }
  if (!migrationConclusion) {
    return { success: false, error: 'action=repair_relocate_to_module requires migration_conclusion' };
  }
  if (!compatibility) {
    return { success: false, error: 'action=repair_relocate_to_module requires compatibility' };
  }
  if (Object.prototype.hasOwnProperty.call(params.entry, 'consumers')) {
    return {
      success: false,
      error: 'Relocated Module Contract must not carry an independent consumers field; consumers belong to formal Trace',
    };
  }

  const sourceRefs = Array.isArray((params.entry as any).source_refs)
    ? (params.entry as any).source_refs
        .map((value: unknown) => String(value ?? '').trim())
        .filter(Boolean)
    : [];
  if (sourceRefs.length === 0) {
    return { success: false, error: 'Relocated Module Contract requires non-empty source_refs' };
  }
  if (sourceRefs.some((sourceRef: string) => !/^DD-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/.test(sourceRef))) {
    return { success: false, error: 'Relocated Module Contract source_refs must contain only DD-* IDs' };
  }
  if (new Set(sourceRefs).size !== sourceRefs.length) {
    return { success: false, error: 'Relocated Module Contract source_refs must be unique' };
  }

  const manifestRead = await readJsonObjectForPromotion(
    path.join(params.wiDir, 'candidate_manifest.json'),
    'candidate_manifest.json',
  );
  if (!manifestRead.value) {
    return {
      success: false,
      error:
        'Contract repair relocation requires an existing spec_migration Candidate; ' +
        'run sf_spec_migration(action=prepare_repair) first',
    };
  }
  const manifest = manifestRead.value;
  if (String(manifest.workflow_path ?? '').trim() !== 'spec_migration_path') {
    return { success: false, error: 'Contract repair relocation requires candidate_manifest.workflow_path=spec_migration_path' };
  }
  if (
    manifest.workflow_type !== undefined &&
    String(manifest.workflow_type ?? '').trim() !== 'spec_migration'
  ) {
    return { success: false, error: 'Contract repair relocation requires candidate_manifest.workflow_type=spec_migration when present' };
  }

  const triggerRead = await readJsonObjectForPromotion(
    path.join(params.wiDir, 'trigger_result.json'),
    'trigger_result.json',
  );
  if (!triggerRead.value) return { success: false, error: triggerRead.error };
  const trigger = triggerRead.value;
  if (String(trigger.workflow_path ?? '').trim() !== 'spec_migration_path') {
    return { success: false, error: 'Contract repair relocation requires trigger_result.workflow_path=spec_migration_path' };
  }
  const classification =
    trigger.classification && typeof trigger.classification === 'object'
      ? (trigger.classification as Record<string, unknown>)
      : {};
  if (classification.module_contract_changed !== true) {
    return {
      success: false,
      error: 'Contract repair relocation requires module_contract_changed=true for Runtime materialization',
    };
  }
  if (classification.project_contract_changed !== true) {
    return {
      success: false,
      error: 'Contract repair relocation requires project_contract_changed=true for Runtime materialization',
    };
  }

  const designIds = await readProspectiveModuleDesignIds(params.projectRoot, params.wiDir, sourceModule);
  const missingSourceRefs = sourceRefs.filter((sourceRef: string) => !designIds.has(sourceRef));
  if (missingSourceRefs.length > 0) {
    return {
      success: false,
      error:
        `Relocated Module Contract source_refs are not real prospective ${sourceModule} DD IDs: ` +
        missingSourceRefs.join(', '),
    };
  }

  if (!params.liveRegistry.contracts || typeof params.liveRegistry.contracts !== 'object') {
    return { success: false, error: 'live extension_registry has no contracts object for repair relocation' };
  }
  const liveHits: Array<{ field: string; entry: Record<string, unknown> }> = [];
  for (const candidateField of CONTRACT_FIELDS) {
    const contracts = Array.isArray(params.liveRegistry.contracts[candidateField])
      ? params.liveRegistry.contracts[candidateField]
      : [];
    for (const candidate of contracts) {
      if (String(candidate?.id ?? '').trim() === fromContractId) {
        liveHits.push({ field: candidateField, entry: candidate });
      }
    }
  }
  if (liveHits.length !== 1) {
    return {
      success: false,
      error: `Contract repair relocation requires exactly one live Project Contract ${fromContractId}; found ${liveHits.length}`,
    };
  }
  if (liveHits[0].field !== params.field) {
    return {
      success: false,
      error: `Contract repair relocation kind mismatch: live=${liveHits[0].field}; requested=${params.field}`,
    };
  }
  if (String((liveHits[0].entry as any).owner_module ?? '').trim() !== sourceModule) {
    return { success: false, error: `live Project Contract owner mismatch: expected ${sourceModule}` };
  }

  const currentSnapshot = await inspectProjectGovernanceContractConsumers({
    projectRoot: params.projectRoot,
    workItemDir: params.wiDir,
    prospective: false,
  });
  if (!currentSnapshot.active) {
    return {
      success: false,
      error: 'Contract repair relocation cannot prove current formal consumers because Project governance is inactive',
    };
  }
  const crossModuleConsumers = currentSnapshot.consumers.filter(
    consumer =>
      consumer.contract_id === fromContractId &&
      consumer.module_code !== sourceModule,
  );
  if (crossModuleConsumers.length > 0) {
    return {
      success: false,
      error:
        'Project-to-Module repair relocation is forbidden while cross-module consumers exist: ' +
        crossModuleConsumers
          .map(consumer => `${consumer.design_id}@${consumer.module_code || 'UNKNOWN'}`)
          .join(', '),
    };
  }

  const projectCandidatePath = path.join(
    params.wiDir, 'candidates', 'project', 'extension_registry.json',
  );
  let projectRegistry: Record<string, any>;
  try {
    projectRegistry = JSON.parse(await fs.readFile(projectCandidatePath, 'utf-8'));
  } catch (candidateError: any) {
    if (candidateError?.code !== 'ENOENT') {
      return {
        success: false,
        error: `failed to read existing extension_registry candidate: ${candidateError?.message ?? String(candidateError)}`,
      };
    }
    projectRegistry = JSON.parse(JSON.stringify(params.liveRegistry));
  }
  if (!projectRegistry.contracts || typeof projectRegistry.contracts !== 'object') {
    return { success: false, error: 'current Project Candidate has no contracts object' };
  }
  for (const contractField of CONTRACT_FIELDS) {
    if (!Array.isArray(projectRegistry.contracts[contractField])) {
      projectRegistry.contracts[contractField] = [];
    }
  }
  const projectMatches = CONTRACT_FIELDS.flatMap(contractField =>
    projectRegistry.contracts[contractField]
      .filter((candidate: any) => String(candidate?.id ?? '').trim() === fromContractId)
      .map((candidate: any) => ({ contractField, candidate })),
  );
  if (projectMatches.length !== 1 || projectMatches[0].contractField !== params.field) {
    return {
      success: false,
      error:
        `current Project Candidate must contain exactly one ${params.field}:${fromContractId} before repair relocation`,
    };
  }

  const allModuleIds = await currentOrCandidateModuleContractIds(params.projectRoot, params.wiDir);
  if (allModuleIds.has(fromContractId)) {
    return {
      success: false,
      error:
        `repair relocation would create duplicate Project/Module Contract truth: ${fromContractId} ` +
        'already exists in a Module Contract registry',
    };
  }

  const formalModulePath = path.join(
    params.projectRoot, SPEC_DIR_NAME, 'project', 'modules', sourceModule, 'contracts.json',
  );
  const moduleCandidatePath = path.join(
    params.wiDir, 'candidates', 'project', 'modules', sourceModule, 'contracts.candidate.json',
  );
  let moduleRegistry: Record<string, any>;
  try {
    moduleRegistry = JSON.parse(await fs.readFile(moduleCandidatePath, 'utf-8'));
  } catch (candidateError: any) {
    if (candidateError?.code !== 'ENOENT') {
      return {
        success: false,
        error: `failed to read existing Module Contract candidate: ${candidateError?.message ?? String(candidateError)}`,
      };
    }
    const formalRead = await readJsonObjectForPromotion(formalModulePath, 'formal Module Contract registry');
    if (!formalRead.value) return { success: false, error: formalRead.error };
    moduleRegistry = formalRead.value;
  }
  if (String(moduleRegistry.owner_module ?? '').trim() !== sourceModule) {
    return { success: false, error: `Module Contract owner mismatch: expected ${sourceModule}` };
  }
  if (!moduleRegistry.contracts || typeof moduleRegistry.contracts !== 'object') {
    return { success: false, error: 'Module Contract registry has no contracts object' };
  }
  for (const contractField of CONTRACT_FIELDS) {
    if (!Array.isArray(moduleRegistry.contracts[contractField])) {
      moduleRegistry.contracts[contractField] = [];
    }
    if (
      moduleRegistry.contracts[contractField].some(
        (candidate: any) => String(candidate?.id ?? '').trim() === fromContractId,
      )
    ) {
      return { success: false, error: `Module Contract already contains repair relocation identity: ${fromContractId}` };
    }
  }

  const nextProjectRegistry = JSON.parse(JSON.stringify(projectRegistry));
  nextProjectRegistry.contracts[params.field] =
    nextProjectRegistry.contracts[params.field].filter(
      (candidate: any) => String(candidate?.id ?? '').trim() !== fromContractId,
    );
  nextProjectRegistry.updated_by_work_item = params.workItemId;
  nextProjectRegistry.updated_at = new Date().toISOString();

  const nextModuleRegistry = JSON.parse(JSON.stringify(moduleRegistry));
  nextModuleRegistry.contracts[params.field].push(params.entry);

  return writeContractCandidate({
    projectRoot: params.projectRoot,
    workItemId: params.workItemId,
    workflowPath: 'spec_migration_path',
    registry: nextProjectRegistry,
    action: 'repair_relocate_to_module',
    contractRef: `[repair-relocation:${fromContractId} project->${sourceModule}]`,
    moduleCandidate: {
      moduleCode: sourceModule,
      candidatePath: `candidates/project/modules/${sourceModule}/contracts.candidate.json`,
      targetPath: `.specforge/project/modules/${sourceModule}/contracts.json`,
      registry: nextModuleRegistry,
    },
  });
}

async function authorContractPromotionCandidate(params: {
  projectRoot: string;
  workItemId: string;
  wiDir: string;
  liveRegistry: Record<string, any>;
  field: string;
  entry: Record<string, unknown>;
  id: string;
  owner: string;
  sourceModule?: string;
  fromContractId?: string;
  migrationConclusion?: string;
  compatibility?: string;
  workflowPath?: string;
}): Promise<AuthorContractResult> {
  if (params.workflowPath !== 'architecture_change_path') {
    return { success: false, error: 'action=promote requires workflow_path=architecture_change_path' };
  }

  const sourceModule = String(params.sourceModule ?? '').trim();
  const fromContractId = String(params.fromContractId ?? '').trim();
  const migrationConclusion = String(params.migrationConclusion ?? '').trim();
  const compatibility = String(params.compatibility ?? '').trim();

  if (!sourceModule || !/^[A-Z][A-Z0-9_-]*$/.test(sourceModule)) {
    return { success: false, error: 'action=promote requires a canonical source_module' };
  }
  if (!fromContractId) {
    return { success: false, error: 'action=promote requires from_contract_id' };
  }
  if (fromContractId === params.id) {
    return { success: false, error: 'Promotion requires distinct old/new Contract IDs' };
  }
  if (params.owner !== sourceModule) {
    return { success: false, error: 'Promotion Project Contract owner_module must equal source_module' };
  }
  if (!migrationConclusion) {
    return { success: false, error: 'action=promote requires migration_conclusion' };
  }
  if (!compatibility) {
    return { success: false, error: 'action=promote requires compatibility' };
  }

  const triggerRead = await readJsonObjectForPromotion(
    path.join(params.wiDir, 'trigger_result.json'),
    'trigger_result.json',
  );
  if (!triggerRead.value) return { success: false, error: triggerRead.error };
  const trigger = triggerRead.value;
  if (String(trigger.workflow_path ?? '').trim() !== 'architecture_change_path') {
    return {
      success: false,
      error: 'Promotion requires trigger_result.workflow_path=architecture_change_path',
    };
  }
  const classification =
    trigger.classification && typeof trigger.classification === 'object'
      ? (trigger.classification as Record<string, unknown>)
      : {};
  if (classification.design_changed !== true) {
    return { success: false, error: 'Promotion requires design_changed=true for Runtime materialization' };
  }
  if (classification.module_contract_changed !== true) {
    return { success: false, error: 'Promotion requires module_contract_changed=true for Runtime materialization' };
  }
  if (
    classification.project_contract_changed !== true &&
    classification.api_contract_changed !== true
  ) {
    return {
      success: false,
      error: 'Promotion requires project_contract_changed=true or api_contract_changed=true',
    };
  }

  const sourceRefs = Array.isArray((params.entry as any).source_refs)
    ? (params.entry as any).source_refs.map((value: unknown) => String(value ?? '').trim()).filter(Boolean)
    : [];
  if (sourceRefs.length === 0) {
    return { success: false, error: 'Promotion Project Contract requires non-empty source_refs' };
  }
  if (
    sourceRefs.some(
      (sourceRef: string) => !/^(?:ARCH|DATA)-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/.test(sourceRef),
    )
  ) {
    return {
      success: false,
      error: 'Promotion Project Contract source_refs must contain only ARCH-/DATA- IDs',
    };
  }
  if (new Set(sourceRefs).size !== sourceRefs.length) {
    return { success: false, error: 'Promotion Project Contract source_refs must be unique' };
  }
  const projectSourceIds = await readProspectiveProjectSourceIds(params.projectRoot, params.wiDir);
  const missingSourceRefs = sourceRefs.filter((sourceRef: string) => !projectSourceIds.has(sourceRef));
  if (missingSourceRefs.length > 0) {
    return {
      success: false,
      error: `Promotion Project Contract source_refs are not real prospective ARCH-/DATA- IDs: ${missingSourceRefs.join(', ')}`,
    };
  }

  const allModuleIds = await currentOrCandidateModuleContractIds(params.projectRoot, params.wiDir);
  if (allModuleIds.has(params.id)) {
    return {
      success: false,
      error: `new Project Contract ID already exists as a Module Contract: ${params.id}`,
    };
  }

  const formalModulePath = path.join(
    params.projectRoot,
    SPEC_DIR_NAME,
    'project',
    'modules',
    sourceModule,
    'contracts.json',
  );
  const moduleCandidatePath = path.join(
    params.wiDir,
    'candidates',
    'project',
    'modules',
    sourceModule,
    'contracts.candidate.json',
  );
  let moduleRegistry: Record<string, any>;
  try {
    moduleRegistry = JSON.parse(await fs.readFile(moduleCandidatePath, 'utf-8'));
  } catch (candidateError: any) {
    if (candidateError?.code !== 'ENOENT') {
      return {
        success: false,
        error: `failed to read existing Module Contract candidate: ${candidateError?.message ?? String(candidateError)}`,
      };
    }
    const formalRead = await readJsonObjectForPromotion(
      formalModulePath,
      'formal Module Contract registry',
    );
    if (!formalRead.value) return { success: false, error: formalRead.error };
    moduleRegistry = formalRead.value;
  }

  if (String(moduleRegistry.owner_module ?? '').trim() !== sourceModule) {
    return { success: false, error: `Module Contract owner mismatch: expected ${sourceModule}` };
  }
  if (!moduleRegistry.contracts || typeof moduleRegistry.contracts !== 'object') {
    return { success: false, error: 'Module Contract registry has no contracts object' };
  }

  let oldField: string | null = null;
  let oldEntry: Record<string, unknown> | null = null;
  for (const candidateField of CONTRACT_FIELDS) {
    const contracts = Array.isArray(moduleRegistry.contracts[candidateField])
      ? moduleRegistry.contracts[candidateField]
      : [];
    const hit = contracts.find(
      (candidate: any) => String(candidate?.id ?? '').trim() === fromContractId,
    );
    if (hit) {
      oldField = candidateField;
      oldEntry = hit;
      break;
    }
  }
  if (!oldField || !oldEntry) {
    return {
      success: false,
      error: `current Module Contract is missing from prospective Module candidate: ${sourceModule}:${fromContractId}`,
    };
  }
  if (oldField !== params.field) {
    return {
      success: false,
      error: `Promotion Contract kind mismatch: old=${oldField}; requested=${params.field}`,
    };
  }

  const projectCandidatePath = path.join(
    params.wiDir,
    'candidates',
    'project',
    'extension_registry.json',
  );
  let projectRegistry: Record<string, any>;
  try {
    projectRegistry = JSON.parse(await fs.readFile(projectCandidatePath, 'utf-8'));
  } catch (candidateError: any) {
    if (candidateError?.code !== 'ENOENT') {
      return {
        success: false,
        error: `failed to read existing extension_registry candidate: ${candidateError?.message ?? String(candidateError)}`,
      };
    }
    projectRegistry = JSON.parse(JSON.stringify(params.liveRegistry));
  }
  if (!projectRegistry.contracts || typeof projectRegistry.contracts !== 'object') {
    projectRegistry.contracts = {
      shared_enums: [],
      invariants: [],
      public_interfaces: [],
      extension_points: [],
    };
  }
  for (const contractField of CONTRACT_FIELDS) {
    if (!Array.isArray(projectRegistry.contracts[contractField])) {
      projectRegistry.contracts[contractField] = [];
    }
    if (
      projectRegistry.contracts[contractField].some(
        (candidate: any) => String(candidate?.id ?? '').trim() === fromContractId,
      )
    ) {
      return {
        success: false,
        error:
          `current Project Candidate already contains old Module Contract ID ${fromContractId}; ` +
          'use the legal Candidate invalidation/reprepare path before Promotion',
      };
    }
    if (
      projectRegistry.contracts[contractField].some(
        (candidate: any) => String(candidate?.id ?? '').trim() === params.id,
      )
    ) {
      return { success: false, error: `new Project Contract ID already exists: ${params.id}` };
    }
  }

  const nextProjectRegistry = JSON.parse(JSON.stringify(projectRegistry));
  nextProjectRegistry.contracts[params.field].push(params.entry);
  nextProjectRegistry.updated_by_work_item = params.workItemId;
  nextProjectRegistry.updated_at = new Date().toISOString();

  const nextModuleRegistry = JSON.parse(JSON.stringify(moduleRegistry));
  nextModuleRegistry.contracts[oldField] = nextModuleRegistry.contracts[oldField].filter(
    (candidate: any) => String(candidate?.id ?? '').trim() !== fromContractId,
  );

  return writeContractCandidate({
    projectRoot: params.projectRoot,
    workItemId: params.workItemId,
    workflowPath: 'architecture_change_path',
    registry: nextProjectRegistry,
    action: 'promote',
    contractRef: `[promotion:${fromContractId}->${params.id} owner=${params.owner}]`,
    promotion: {
      from_contract_id: fromContractId,
      to_contract_id: params.id,
      migration_conclusion: migrationConclusion,
      compatibility,
    },
    moduleCandidate: {
      moduleCode: sourceModule,
      candidatePath: `candidates/project/modules/${sourceModule}/contracts.candidate.json`,
      targetPath: `.specforge/project/modules/${sourceModule}/contracts.json`,
      registry: nextModuleRegistry,
    },
  });
}

async function writeContractCandidate(params: {
  projectRoot: string;
  workItemId: string;
  workflowPath?: string;
  registry: Record<string, any>;
  action: ContractCandidateAction;
  contractRef?: string;
  promotion?: PromotionMetadata;
  moduleCandidate?: ContractModuleCandidate;
}): Promise<AuthorContractResult> {
  const wiDir = path.join(params.projectRoot, SPEC_DIR_NAME, 'work-items', params.workItemId);
  const candidateAbs = path.join(wiDir, 'candidates', 'project', 'extension_registry.json');
  const manifestPath = path.join(wiDir, 'candidate_manifest.json');

  let manifest: Record<string, any> | null = null;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  } catch {
    manifest = null;
  }
  if (!manifest || typeof manifest !== 'object') {
    manifest = {
      schema_version: '1.0',
      work_item_id: params.workItemId,
      workflow_type: params.action === 'promote' ? 'architecture_change' : 'contract_change',
      workflow_path:
        params.action === 'promote'
          ? 'architecture_change_path'
          : params.workflowPath ?? 'contract_change_path',
      candidate_phase: 'full',
      base_spec_version: params.registry.project_spec_version ?? 'PSV-0001',
      merge_required: true,
      entries: [],
    };
  }
  if (
    params.workflowPath &&
    manifest.workflow_path &&
    manifest.workflow_path !== params.workflowPath
  ) {
    return {
      success: false,
      error: `candidate manifest workflow_path mismatch: ${manifest.workflow_path} != ${params.workflowPath}`,
    };
  }

  if (params.action === 'promote') {
    if (!params.promotion || !params.moduleCandidate) {
      return { success: false, error: 'Promotion candidate is missing controlled promotion artifacts' };
    }
    if (manifest.workflow_path && manifest.workflow_path !== 'architecture_change_path') {
      return { success: false, error: `Promotion candidate manifest must use architecture_change_path, got ${manifest.workflow_path}` };
    }
    if (Object.prototype.hasOwnProperty.call(manifest, 'contract_promotions') && !Array.isArray(manifest.contract_promotions)) {
      return { success: false, error: 'candidate manifest contract_promotions must be an array' };
    }
    const existingPromotions = Array.isArray(manifest.contract_promotions) ? manifest.contract_promotions : [];
    const duplicate = existingPromotions.some((item: any) =>
      String(item?.from_contract_id ?? '').trim() === params.promotion!.from_contract_id ||
      String(item?.to_contract_id ?? '').trim() === params.promotion!.to_contract_id);
    if (duplicate) return { success: false, error: `duplicate Contract promotion identity: ${params.promotion.from_contract_id} -> ${params.promotion.to_contract_id}` };
  }

  await fs.mkdir(path.dirname(candidateAbs), { recursive: true });
  await fs.writeFile(candidateAbs, JSON.stringify(params.registry, null, 2) + '\n', 'utf-8');
  if (params.moduleCandidate) {
    const moduleCandidateAbs = path.join(wiDir, params.moduleCandidate.candidatePath);
    await fs.mkdir(path.dirname(moduleCandidateAbs), { recursive: true });
    await fs.writeFile(moduleCandidateAbs, JSON.stringify(params.moduleCandidate.registry, null, 2) + '\n', 'utf-8');
  }

  if (!Array.isArray(manifest.entries)) manifest.entries = [];
  manifest.work_item_id = params.workItemId;
  if (!manifest.schema_version) manifest.schema_version = '1.0';
  if (!manifest.workflow_path)
    manifest.workflow_path = params.workflowPath ?? 'contract_change_path';
  if (manifest.workflow_path === 'contract_change_path') {
    manifest.workflow_type = 'contract_change';
    manifest.candidate_phase = 'full';
    manifest.merge_required = true;
  }

  const alreadyListed = manifest.entries.some(
    (e: any) => e?.candidate_path === CANDIDATE_REL && e?.target_path === TARGET_REL
  );
  if (!alreadyListed) {
    manifest.entries.push({
      candidate_path: CANDIDATE_REL,
      target_path: TARGET_REL,
      operation: 'replace',
      type: 'extension_registry',
    });
  }
  if (params.moduleCandidate) {
    const moduleListed = manifest.entries.some((e: any) =>
      e?.candidate_path === params.moduleCandidate!.candidatePath && e?.target_path === params.moduleCandidate!.targetPath);
    if (!moduleListed) {
      manifest.entries.push({ candidate_path: params.moduleCandidate.candidatePath, target_path: params.moduleCandidate.targetPath, operation: 'replace', type: 'module_contract', module_id: params.moduleCandidate.moduleCode });
    }
  }
  if (params.action === 'promote' && params.promotion && params.moduleCandidate) {
    manifest.workflow_type = 'architecture_change';
    manifest.workflow_path = 'architecture_change_path';
    if (!Array.isArray(manifest.contract_promotions)) manifest.contract_promotions = [];
    manifest.contract_promotions.push(params.promotion);
  }
  if (params.action === 'repair_relocate_to_module' && params.moduleCandidate) {
    manifest.workflow_type = 'spec_migration';
    manifest.workflow_path = 'spec_migration_path';
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  return {
    success: true,
    action: params.action,
    candidate_path: CANDIDATE_REL,
    target_path: TARGET_REL,
    manifest_path: manifestPath,
    contract_ref: params.contractRef,
    registry_after: params.registry,
  };
}
