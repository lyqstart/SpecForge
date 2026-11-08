import { scalarText } from '@specforge/types';
import { registerHandler } from '../ToolDispatcher';
import { branchPlan } from '../lib/git-governance-core';
import { planDetachedGitBootstrap } from '../lib/git-detached-bootstrap';
import { readAuthoritativeState } from '../lib/state-coordinator-v11';

registerHandler('sf_git_branch_plan', async (args, context, deps) => {
  const workItemId = scalarText(args['work_item_id'] || '').trim();
  const title = scalarText(args['title'] || '').trim();
  const workItemType = scalarText(args['work_item_type'] || 'feature').trim();
  if (!workItemId) return { success: false, error: 'work_item_id required' };
  if (!title) return { success: false, error: 'title required' };
  if (args['bootstrap_from_detached'] === true) {
    if (context?.agent !== 'sf-orchestrator')
      return { success: false, error: 'DETACHED_GIT_BOOTSTRAP_OWNER_REQUIRED' };
    const projectRoot = scalarText(context?.directory || context?.worktree || process.cwd());
    try {
      const state = await readAuthoritativeState({ deps, projectRoot, workItemId });
      if (state.current_state !== 'post_merge_verified')
        throw Error('DETACHED_GIT_BOOTSTRAP_POST_MERGE_VERIFIED_REQUIRED');
      return await planDetachedGitBootstrap({
        projectRoot,
        workItemId,
        baseBranch: scalarText(args['base_branch'] || ''),
        branchName: scalarText(args['branch_name'] || ''),
        expectedHead: scalarText(args['expected_head'] || ''),
      });
    } catch (error) {
      return { success: false, error: String((error as Error).message) };
    }
  }
  return branchPlan({ workItemId, title, workItemType });
});
