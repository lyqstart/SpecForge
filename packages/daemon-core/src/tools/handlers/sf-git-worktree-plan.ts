import { registerHandler } from '../ToolDispatcher';
import { gitWorktreePlan } from '../lib/git-governance-stage4';

registerHandler('sf_git_worktree_plan', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    return await gitWorktreePlan({
      projectRoot,
      branchName: String(args['branch_name'] || ''),
      baseRef: args['base_ref'] ? String(args['base_ref']) : undefined,
      worktreePath: args['worktree_path'] ? String(args['worktree_path']) : undefined,
      createBranch: args['create_branch'] !== false,
      writePlan: args['write_plan'] !== false,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
