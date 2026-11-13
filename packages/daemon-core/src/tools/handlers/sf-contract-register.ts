/**
 * sf-contract-register — author a governed Project Contract Candidate.
 *
 * Public name: sf_contract_register.
 *
 * Current add/update/reset only mutate the current Work Item Candidate. The live
 * Project/Module Contract truth sources remain unchanged until governed merge.
 */
import { registerHandler } from '../ToolDispatcher';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { WORKFLOW_PATHS } from '@specforge/types';
import { precheckSchemaDescriptors } from '@specforge/types/schema-contract';
import { PROJECT_REGISTRATION_SCHEMA_DESCRIPTORS } from '../../project/project-schema-descriptors';
import { readAuthoritativeState } from '../lib/state-coordinator-v11';
import { readWorkItemMetadata } from '../lib/work-item-metadata';
import { isCandidateFrozenState } from '../lib/candidate-freeze-v11';
import { guardHardStop } from '../lib/hard-stop-latch';
import {
  authorContractCandidate,
  type ContractCandidateAction,
  type RegistrationKind,
} from '../lib/contract-authoring';

const VALID_KINDS: RegistrationKind[] = [
  'shared_enum',
  'invariant',
  'public_interface',
  'extension_point',
  'namespace_type',
];

registerHandler('sf_contract_register', async (args, context, deps) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const action = (args['action'] as ContractCandidateAction | undefined) ?? 'add';
  const kind = args['kind'] as RegistrationKind | undefined;
  const entry = args['entry'] as Record<string, unknown> | undefined;
  const workflowPath = args['workflow_path'] as string | undefined;

  // Public current-release owner. Retained historical authoring algorithms below
  // are not authority to activate their unshipped workflows or bypass freeze.
  if (context?.agent !== 'sf-orchestrator')
    return { success: false, error: 'CONTRACT_REGISTER_ORCHESTRATOR_ONLY' };
  if (!path.isAbsolute(projectRoot) || !/^WI-\d{4}$/.test(workItemId ?? ''))
    return { success: false, error: 'CONTRACT_REGISTER_CURRENT_SUBJECT_REQUIRED' };
  if (!['add', 'update', 'reset'].includes(action))
    return { success: false, error: 'UNSUPPORTED_CURRENT_RELEASE_CONTRACT_ACTION' };
  if (
    Object.keys(args).some(
      key => !['work_item_id', 'action', 'kind', 'entry', 'workflow_path'].includes(key)
    )
  )
    return { success: false, error: 'CONTRACT_REGISTER_UNKNOWN_ARGUMENT' };
  const wiDir = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);
  try {
    for (const relative of [
      path.join(SPEC_DIR_NAME, 'project', 'extension_registry.json'),
      path.join(SPEC_DIR_NAME, 'work-items', workItemId, 'work_item.json'),
      path.join(SPEC_DIR_NAME, 'work-items', workItemId, 'candidate_manifest.json'),
      path.join(
        SPEC_DIR_NAME,
        'work-items',
        workItemId,
        'candidates',
        'project',
        'extension_registry.json'
      ),
    ]) {
      let current = projectRoot;
      for (const part of ['.', ...relative.split(path.sep)]) {
        current = path.join(current, part);
        try {
          const stat = await fs.lstat(current);
          if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1))
            return { success: false, error: 'CONTRACT_REGISTER_LINK_REFUSED' };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
    const metadata = await readWorkItemMetadata(wiDir, workItemId);
    if (metadata.workflow_type !== 'feature_spec')
      return { success: false, error: 'UNSUPPORTED_CURRENT_RELEASE_WORKFLOW' };
    const currentPath = metadata.workflow_path;
    if (
      typeof currentPath !== 'string' ||
      !(WORKFLOW_PATHS as readonly string[]).includes(currentPath) ||
      currentPath === 'spec_migration_path' ||
      (workflowPath !== undefined && workflowPath !== currentPath)
    )
      return { success: false, error: 'CONTRACT_REGISTER_WORKFLOW_PATH_MISMATCH' };
    const hardStop = guardHardStop(projectRoot, workItemId, 'sf_contract_register');
    if (!hardStop.allowed) return { success: false, error: hardStop.error, hard_stop: true };
    const state = await readAuthoritativeState({ deps, projectRoot, workItemId });
    if (!state.current_state)
      return { success: false, error: 'CANDIDATE_FREEZE_STATE_UNAVAILABLE' };
    if (isCandidateFrozenState(state.current_state))
      return { success: false, error: 'CANDIDATE_FROZEN', current_state: state.current_state };
    const descriptor = PROJECT_REGISTRATION_SCHEMA_DESCRIPTORS.find(
      item => item.id === 'project-extension-registry'
    )!;
    const live = await precheckSchemaDescriptors(projectRoot, [descriptor]);
    const candidate = await precheckSchemaDescriptors(wiDir, [
      {
        ...descriptor,
        relativePath: 'candidates/project/extension_registry.json',
        required: false,
      },
    ]);
    if (!live.ok || !candidate.ok)
      return { success: false, error: 'CONTRACT_REGISTER_REGISTRY_SCHEMA_BLOCKED' };
    if (
      action !== 'reset' &&
      (!kind ||
        !VALID_KINDS.includes(kind) ||
        !entry ||
        typeof entry !== 'object' ||
        Array.isArray(entry))
    )
      return { success: false, error: 'CONTRACT_REGISTER_KIND_AND_ENTRY_REQUIRED' };
    return await authorContractCandidate({
      projectRoot,
      workItemId,
      action,
      kind,
      entry,
      workflowPath: currentPath,
      currentSubject: { workflow_type: 'feature_spec', workflow_path: currentPath },
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});
