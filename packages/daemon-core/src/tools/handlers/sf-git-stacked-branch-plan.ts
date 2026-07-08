import { registerHandler } from '../ToolDispatcher';
import { gitStackedBranchPlan } from '../lib/git-governance-stage4';

registerHandler('sf_git_stacked_branch_plan', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    return await gitStackedBranchPlan({
      projectRoot,
      parentBranch: String(args['parent_branch'] || ''),
      childBranch: String(args['child_branch'] || ''),
      workItemId: args['work_item_id'] ? String(args['work_item_id']) : undefined,
      childWorkItemId: args['child_work_item_id'] ? String(args['child_work_item_id']) : undefined,
      writePlan: args['write_plan'] !== false,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
