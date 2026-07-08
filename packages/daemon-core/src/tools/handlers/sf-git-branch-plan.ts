import { registerHandler } from '../ToolDispatcher';
import { branchPlan } from '../lib/git-governance-core';

registerHandler('sf_git_branch_plan', async (args) => {
  const workItemId = String(args['work_item_id'] || '').trim();
  const title = String(args['title'] || '').trim();
  const workItemType = String(args['work_item_type'] || 'feature').trim();
  if (!workItemId) return { success: false, error: 'work_item_id required' };
  if (!title) return { success: false, error: 'title required' };
  return branchPlan({ workItemId, title, workItemType });
});
