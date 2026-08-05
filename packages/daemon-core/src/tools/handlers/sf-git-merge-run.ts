import { registerHandler } from '../ToolDispatcher';
import { gitMergeRun } from '../lib/git-governance-stage2';
import { readAuthoritativeState } from '../lib/state-coordinator-v11.js';

registerHandler('sf_git_merge_run', async (args, context, deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = String(args['work_item_id'] || '').trim();
  if (!workItemId) return { success: false, error: 'work_item_id required' };
  if (args['confirmed'] !== true) return { success: false, error: 'MERGE_REQUIRES_USER_CONFIRMATION' };
  try {
    const authoritativeState = await readAuthoritativeState({
      deps,
      projectRoot,
      workItemId,
    });
    return await gitMergeRun({
      projectRoot,
      workItemId,
      confirmed: true,
      authoritativeState: authoritativeState.current_state,
      remoteName: args['remote_name'] ? String(args['remote_name']) : undefined,
      message: args['message'] ? String(args['message']) : undefined,
      pullFirst: args['pull_first'] !== false,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
