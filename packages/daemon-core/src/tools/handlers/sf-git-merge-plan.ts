import { registerHandler } from '../ToolDispatcher';
import { gitMergePlan } from '../lib/git-governance-stage2';
import { readAuthoritativeState } from '../lib/state-coordinator-v11.js';

registerHandler('sf_git_merge_plan', async (args, context, deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = String(args['work_item_id'] || '').trim();
  if (!workItemId) return { success: false, error: 'work_item_id required' };
  try {
    const authoritativeState = await readAuthoritativeState({
      deps,
      projectRoot,
      workItemId,
    });
    return await gitMergePlan({
      projectRoot,
      workItemId,
      defaultBranch: args['default_branch'] ? String(args['default_branch']) : undefined,
      authoritativeState: authoritativeState.current_state,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
