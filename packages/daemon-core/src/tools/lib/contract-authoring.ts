/**
 * contract-authoring.ts — author a governed contract-registration candidate.
 *
 * This is the "proposal-form filler" for the cross-module contract model. It
 * does NOT write the project truth source. It only:
 *   1. reads the current project extension_registry.json (or an empty template),
 *   2. adds one contract entry to the `contracts` block (dedup-guarded),
 *   3. writes the proposed full registry to
 *      `candidates/project/extension_registry.json` (a WI candidate), and
 *   4. registers an explicit entry in `candidate_manifest.json` targeting
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

export type ContractKind =
  | 'shared_enum'
  | 'invariant'
  | 'public_interface'
  | 'extension_point';

const KIND_TO_FIELD: Record<ContractKind, string> = {
  shared_enum: 'shared_enums',
  invariant: 'invariants',
  public_interface: 'public_interfaces',
  extension_point: 'extension_points',
};

const CONTRACT_FIELDS = ['shared_enums', 'invariants', 'public_interfaces', 'extension_points'];

const CANDIDATE_REL = 'candidates/project/extension_registry.json';
const TARGET_REL = '.specforge/project/extension_registry.json';

export interface AuthorContractResult {
  success: boolean;
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
  kind: ContractKind;
  entry: Record<string, unknown>;
  workflowPath?: string;
}): Promise<AuthorContractResult> {
  const { projectRoot, workItemId, kind, entry } = params;

  const field = KIND_TO_FIELD[kind];
  if (!field) return { success: false, error: `invalid contract kind: ${kind}` };

  const id = String((entry as any)?.id ?? '').trim();
  const owner = String((entry as any)?.owner_module ?? '').trim();
  if (!id) return { success: false, error: 'contract entry requires "id"' };
  if (!owner) return { success: false, error: 'contract entry requires "owner_module"' };

  // 1. Read current project registry (or start from an empty template).
  const registryPath = path.join(projectRoot, SPEC_DIR_NAME, 'project', 'extension_registry.json');
  let registry: Record<string, any>;
  try {
    registry = JSON.parse(await fs.readFile(registryPath, 'utf-8'));
    if (!registry || typeof registry !== 'object') registry = emptyRegistry();
  } catch {
    registry = emptyRegistry();
  }

  // 2. Clone + add the contract entry to the contracts block (dedup-guarded).
  const next: Record<string, any> = JSON.parse(JSON.stringify(registry));
  if (!next.contracts || typeof next.contracts !== 'object') {
    next.contracts = { shared_enums: [], invariants: [], public_interfaces: [], extension_points: [] };
  }
  for (const f of CONTRACT_FIELDS) {
    if (!Array.isArray(next.contracts[f])) next.contracts[f] = [];
  }
  if (next.contracts[field].some((e: any) => e?.id === id)) {
    return { success: false, error: `contract already registered: ${kind}:${id}` };
  }
  next.contracts[field].push(entry);
  next.updated_by_work_item = workItemId;
  next.updated_at = new Date().toISOString();

  // 3. Write the proposed registry as a WI candidate (not the truth source).
  const wiDir = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);
  const candidateAbs = path.join(wiDir, 'candidates', 'project', 'extension_registry.json');
  await fs.mkdir(path.dirname(candidateAbs), { recursive: true });
  await fs.writeFile(candidateAbs, JSON.stringify(next, null, 2) + '\n', 'utf-8');

  // 4. Register the explicit merge entry in candidate_manifest.json.
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
      work_item_id: workItemId,
      workflow_path: params.workflowPath ?? 'change_request',
      base_spec_version: registry.project_spec_version ?? 'PSV-0001',
      merge_required: true,
      entries: [],
    };
  }
  if (!Array.isArray(manifest.entries)) manifest.entries = [];
  manifest.work_item_id = workItemId;
  if (!manifest.schema_version) manifest.schema_version = '1.0';

  const alreadyListed = manifest.entries.some(
    (e: any) => e?.candidate_path === CANDIDATE_REL && e?.target_path === TARGET_REL,
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
    candidate_path: CANDIDATE_REL,
    target_path: TARGET_REL,
    manifest_path: manifestPath,
    contract_ref: `[contract:${kind}:${id} owner=${owner}]`,
    registry_after: next,
  };
}
