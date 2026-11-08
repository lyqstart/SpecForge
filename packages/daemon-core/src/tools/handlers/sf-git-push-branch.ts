import { scalarText } from '@specforge/types';
import { registerHandler } from '../ToolDispatcher';
import { gitPushBranch } from '../lib/git-governance-stage2';

registerHandler('sf_git_push_branch', async (args, context) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    return await gitPushBranch({
      projectRoot,
      remoteName: args['remote_name'] ? scalarText(args['remote_name']) : undefined,
      branchName: args['branch_name'] ? scalarText(args['branch_name']) : undefined,
      setUpstream: args['set_upstream'] !== false,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
