import { registerHandler } from '../ToolDispatcher';
import { checkpointCommit } from '../lib/git-governance-core';

registerHandler('sf_git_checkpoint_commit', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const files = Array.isArray(args['files']) ? (args['files'] as unknown[]).map(String) : undefined;
  const message = String(args['message'] || '').trim();
  try {
    return await checkpointCommit({
      projectRoot,
      workItemId: typeof args['work_item_id'] === 'string' ? args['work_item_id'] : undefined,
      files,
      message,
      defaultBranch: String(args['default_branch'] || 'main'),
      dryRun: args['dry_run'] === true,
      allowAskFiles: args['allow_ask_files'] === true,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
