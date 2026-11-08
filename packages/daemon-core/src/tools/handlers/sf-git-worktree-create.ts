import { scalarText } from '@specforge/types';
import { registerHandler } from '../ToolDispatcher';
import { gitWorktreeCreate } from '../lib/git-governance-stage4';

registerHandler('sf_git_worktree_create', async (args, context) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    return await gitWorktreeCreate({
      projectRoot,
      branchName: scalarText(args['branch_name'] || ''),
      baseRef: args['base_ref'] ? scalarText(args['base_ref']) : undefined,
      worktreePath: args['worktree_path'] ? scalarText(args['worktree_path']) : undefined,
      createBranch: args['create_branch'] !== false,
      confirmed: args['confirmed'] === true,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
