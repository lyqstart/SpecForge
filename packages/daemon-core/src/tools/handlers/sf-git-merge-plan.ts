import { registerHandler } from '../ToolDispatcher';
import { gitMergePlan } from '../lib/git-governance-stage2';

registerHandler('sf_git_merge_plan', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = String(args['work_item_id'] || '').trim();
  if (!workItemId) return { success: false, error: 'work_item_id required' };
  try {
    return await gitMergePlan({ projectRoot, workItemId, defaultBranch: args['default_branch'] ? String(args['default_branch']) : undefined });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
