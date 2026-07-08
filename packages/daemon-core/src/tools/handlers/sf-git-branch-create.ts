import { registerHandler } from '../ToolDispatcher';
import { createBranch } from '../lib/git-governance-core';

registerHandler('sf_git_branch_create', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = String(args['work_item_id'] || '').trim();
  const branchName = String(args['branch_name'] || '').trim();
  const confirmed = args['confirmed'] === true;
  const baseBranch = String(args['base_branch'] || 'main');
  if (!workItemId) return { success: false, error: 'work_item_id required' };
  if (!branchName) return { success: false, error: 'branch_name required' };
  if (!confirmed) {
    return {
      success: false,
      error: 'BRANCH_NAME_CONFIRMATION_REQUIRED',
      message: 'branch_create requires confirmed=true after user confirms the semantic branch name',
      branch_name: branchName,
    };
  }
  try {
    return await createBranch({ projectRoot, workItemId, branchName, baseBranch, requireClean: args['require_clean'] !== false });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
