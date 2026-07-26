/**
 * contract-authoring.ts — author a governed contract-registration candidate.
 *
 * This is the "proposal-form filler" for the cross-module contract model. It
 * does NOT write the project truth source. It only:
 *   1. for action=add, reads the existing WI candidate registry when present;
 *      otherwise reads the current project extension_registry.json,
 *   2. for action=reset, discards the current WI candidate content and rebuilds
 *      it from the current project extension_registry.json,
 *   3. for action=add, adds one contract entry to the `contracts` block
 *      (dedup-guarded),
 *   4. writes the proposed full registry to
 *      `candidates/project/extension_registry.json` (a WI candidate), and
 *   5. registers an explicit entry in `candidate_manifest.json` targeting
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

export type ContractKind = 'shared_enum' | 'invariant' | 'public_interface' | 'extension_point';

export type RegistrationKind = ContractKind | 'namespace_type';
export type ContractCandidateAction = 'add' | 'reset';

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
}): Promise<AuthorContractResult> {
  const { projectRoot, workItemId } = params;
  const action = params.action ?? 'add';
  const kind = params.kind;
  const entry = params.entry;

  if (action !== 'add' && action !== 'reset') {
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
    return { success: false, error: 'kind is required when action=add' };
  }
  if (!entry || typeof entry !== 'object') {
    return { success: false, error: 'entry (contract entry object) is required when action=add' };
  }

  const field = kind === 'namespace_type' ? null : KIND_TO_FIELD[kind];
  const namespace = String((entry as any)?.namespace ?? '').trim() as NamespaceName;
  const typeId = String((entry as any)?.type_id ?? '').trim();
  const id = String((entry as any)?.id ?? '').trim();
  const owner = String((entry as any)?.owner_module ?? '').trim();
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
      const values = (entry as any).values;
      const validValues =
        Array.isArray(values) &&
        values.length > 0 &&
        values.every((value: unknown) => typeof value === 'string' && value.trim().length > 0) &&
        new Set(values).size === values.length;

      if (!validValues) {
        return {
          success: false,
          error: 'shared_enum entry requires "values" to contain unique non-empty strings',
        };
      }
    }
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

  // 2. Clone + add the contract entry to the contracts block (dedup-guarded).
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
    if (next.contracts[field!].some((e: any) => e?.id === id)) {
      return { success: false, error: `contract already registered: ${kind}:${id}` };
    }
    next.contracts[field!].push(entry);
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

async function writeContractCandidate(params: {
  projectRoot: string;
  workItemId: string;
  workflowPath?: string;
  registry: Record<string, any>;
  action: ContractCandidateAction;
  contractRef?: string;
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
      workflow_type: 'contract_change',
      workflow_path: params.workflowPath ?? 'contract_change_path',
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

  await fs.mkdir(path.dirname(candidateAbs), { recursive: true });
  await fs.writeFile(candidateAbs, JSON.stringify(params.registry, null, 2) + '\n', 'utf-8');

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
