import { registerHandler, getHandler } from '../ToolDispatcher';
import { getCurrentBranch } from '../lib/git-governance-core';

function isReleaseLikeAction(action: string): boolean {
  return action === 'release' || action === 'enable' || action === 'extend' || action === 'append';
}

registerHandler('sf_code_permission', async (args, context, deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const action = String(args['action'] || 'check');
  const defaultBranch = String(args['default_branch'] || 'main');

  if (isReleaseLikeAction(action)) {
    const currentBranch = await getCurrentBranch(projectRoot);
    if (currentBranch === defaultBranch) {
      return {
        success: false,
        hard_stop: true,
        error: 'MAIN_WRITE_GUARD_BLOCKED',
        message: 'code_permission cannot be enabled on the default branch. Create a semantic Work Item branch first.',
        current_branch: currentBranch,
        default_branch: defaultBranch,
      };
    }
  }

  const internal = getHandler('sf_v11_code_permission');
  if (!internal) return { success: false, error: 'sf_v11_code_permission handler not registered' };
  return internal(args, context, deps);
});
