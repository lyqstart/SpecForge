import { registerHandler } from '../ToolDispatcher';
import { gitMergeRun } from '../lib/git-governance-stage2';

registerHandler('sf_git_merge_run', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = String(args['work_item_id'] || '').trim();
  if (!workItemId) return { success: false, error: 'work_item_id required' };
  if (args['confirmed'] !== true) return { success: false, error: 'MERGE_REQUIRES_USER_CONFIRMATION' };
  try {
    return await gitMergeRun({
      projectRoot,
      workItemId,
      confirmed: true,
      remoteName: args['remote_name'] ? String(args['remote_name']) : undefined,
      message: args['message'] ? String(args['message']) : undefined,
      pullFirst: args['pull_first'] !== false,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
