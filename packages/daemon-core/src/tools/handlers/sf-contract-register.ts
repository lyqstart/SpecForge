/**
 * sf-contract-register — author a governed Project Contract Candidate.
 *
 * Public name: sf_contract_register.
 *
 * add/update/promote/reset only mutate the current Work Item Candidate. The live
 * Project/Module Contract truth sources remain unchanged until governed merge.
 */
import { registerHandler } from '../ToolDispatcher';
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

registerHandler('sf_contract_register', async (args, context) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const action = (args['action'] as ContractCandidateAction | undefined) ?? 'add';
  const kind = args['kind'] as RegistrationKind | undefined;
  const entry = args['entry'] as Record<string, unknown> | undefined;
  const workflowPath = args['workflow_path'] as string | undefined;
  const sourceModule = args['source_module'] as string | undefined;
  const fromContractId = args['from_contract_id'] as string | undefined;
  const migrationConclusion = args['migration_conclusion'] as string | undefined;
  const compatibility = args['compatibility'] as string | undefined;

  if (!workItemId) return { success: false, error: 'work_item_id is required' };
  if (!['add', 'update', 'promote', 'reset'].includes(action)) {
    return { success: false, error: 'action must be one of: add, update, promote, reset' };
  }
  if (action === 'reset') {
    return authorContractCandidate({ projectRoot, workItemId, action, workflowPath });
  }
  if (!kind || !VALID_KINDS.includes(kind)) {
    return {
      success: false,
      error: `kind is required and must be one of: ${VALID_KINDS.join(', ')}`,
    };
  }
  if ((action === 'update' || action === 'promote') && kind === 'namespace_type') {
    return {
      success: false,
      error: `action=${action} only supports Project Contract kinds; namespace_type is not allowed`,
    };
  }
  if (!entry || typeof entry !== 'object') {
    return { success: false, error: 'entry (contract entry object) is required' };
  }

  return authorContractCandidate({
    projectRoot,
    workItemId,
    action,
    kind,
    entry,
    workflowPath,
    sourceModule,
    fromContractId,
    migrationConclusion,
    compatibility,
  });
});
