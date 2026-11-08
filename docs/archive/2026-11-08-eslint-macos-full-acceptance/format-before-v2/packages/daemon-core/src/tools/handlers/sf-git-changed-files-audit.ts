import { registerHandler } from '../ToolDispatcher';
import { gitChangedFilesAudit } from '../lib/git-governance-stage2';

registerHandler('sf_git_changed_files_audit', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = String(args['work_item_id'] || '').trim();
  if (!workItemId) return { success: false, error: 'work_item_id required' };
  try {
    return await gitChangedFilesAudit({
      projectRoot,
      workItemId,
      allowAskFiles: args['allow_ask_files'] === true,
      writeReport: args['write_report'] !== false,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
