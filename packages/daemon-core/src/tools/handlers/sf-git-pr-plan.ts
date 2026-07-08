import { registerHandler } from '../ToolDispatcher';
import { gitPrPlan } from '../lib/git-governance-stage4';

registerHandler('sf_git_pr_plan', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    return await gitPrPlan({
      projectRoot,
      sourceBranch: args['source_branch'] ? String(args['source_branch']) : undefined,
      targetBranch: args['target_branch'] ? String(args['target_branch']) : undefined,
      remoteName: args['remote_name'] ? String(args['remote_name']) : undefined,
      provider: args['provider'] ? String(args['provider']) : undefined,
      title: args['title'] ? String(args['title']) : undefined,
      body: args['body'] ? String(args['body']) : undefined,
      writePlan: args['write_plan'] !== false,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
