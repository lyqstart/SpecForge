/**
 * sf-contract-register — author a governed contract-registration candidate.
 *
 * Public name: sf_contract_register.
 *
 * Produces a candidate `extension_registry.json` (current registry + one new
 * contract entry in the `contracts` block) and registers an explicit merge
 * entry in candidate_manifest.json. It never writes the project truth source;
 * the change lands only through the normal candidate gate → user decision →
 * Merge Runner path.
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

  if (!workItemId) {
    return { success: false, error: 'work_item_id is required' };
  }
  if (action !== 'add' && action !== 'reset') {
    return { success: false, error: 'action must be one of: add, reset' };
  }
  if (action === 'reset') {
    return authorContractCandidate({
      projectRoot,
      workItemId,
      action,
      workflowPath,
    });
  }
  if (!kind || !VALID_KINDS.includes(kind)) {
    return {
      success: false,
      error: `kind is required and must be one of: ${VALID_KINDS.join(', ')}`,
    };
  }
  if (!entry || typeof entry !== 'object') {
    return { success: false, error: 'entry (contract entry object) is required' };
  }

  return authorContractCandidate({ projectRoot, workItemId, action, kind, entry, workflowPath });
});
