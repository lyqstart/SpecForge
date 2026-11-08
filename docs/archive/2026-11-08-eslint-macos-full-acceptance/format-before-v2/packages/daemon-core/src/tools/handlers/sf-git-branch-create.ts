import { registerHandler } from '../ToolDispatcher';
import { createBranch } from '../lib/git-governance-core';
import { executeDetachedGitBootstrap } from '../lib/git-detached-bootstrap';
import { readAuthoritativeState } from '../lib/state-coordinator-v11';

registerHandler('sf_git_branch_create', async (args, context, deps) => {
  const projectRoot =
    (context?.directory as string) ||
    (context?.worktree as string) ||
    process.cwd();
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
      message:
        'branch_create requires confirmed=true after user confirms the semantic branch name',
      branch_name: branchName,
    };
  }

  try {
    if (args['bootstrap_plan_sha256'] !== undefined) {
      if (context?.agent !== 'sf-orchestrator') throw Error('DETACHED_GIT_BOOTSTRAP_OWNER_REQUIRED');
      const state = await readAuthoritativeState({ deps, projectRoot, workItemId });
      if (state.current_state !== 'post_merge_verified') throw Error('DETACHED_GIT_BOOTSTRAP_POST_MERGE_VERIFIED_REQUIRED');
      return await executeDetachedGitBootstrap({ projectRoot, workItemId, baseBranch, branchName,
        planSha256: String(args['bootstrap_plan_sha256']), confirmationQuote: String(args['bootstrap_confirmation_quote'] || '') });
    }
    if (args['bootstrap_confirmation_quote'] !== undefined) throw Error('DETACHED_GIT_BOOTSTRAP_PLAN_REQUIRED');
    return await createBranch({
      projectRoot,
      workItemId,
      branchName,
      baseBranch,
      requireClean: args['require_clean'] !== false,
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});
