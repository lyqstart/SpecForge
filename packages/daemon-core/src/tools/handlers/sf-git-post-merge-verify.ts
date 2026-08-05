import { registerHandler } from '../ToolDispatcher';
import { gitPostMergeVerify } from '../lib/git-governance-stage2';
import { readAuthoritativeState } from '../lib/state-coordinator-v11.js';

registerHandler('sf_git_post_merge_verify', async (args, context, deps) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = String(args['work_item_id'] || '').trim();
  if (!workItemId) return { success: false, error: 'work_item_id required' };
  const commands = Array.isArray(args['commands']) ? args['commands'].map(String) : [];
  try {
    const authoritativeState = await readAuthoritativeState({
      deps,
      projectRoot,
      workItemId,
    });
    return await gitPostMergeVerify({
      projectRoot,
      workItemId,
      authoritativeState: authoritativeState.current_state,
      commands,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
