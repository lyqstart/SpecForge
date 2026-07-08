import { registerHandler } from '../ToolDispatcher';
import { gitAgentLockAcquire } from '../lib/git-governance-stage4';

registerHandler('sf_git_agent_lock_acquire', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    return await gitAgentLockAcquire({
      projectRoot,
      lockName: String(args['lock_name'] || ''),
      owner: String(args['owner'] || ''),
      workItemId: args['work_item_id'] ? String(args['work_item_id']) : undefined,
      paths: Array.isArray(args['paths']) ? args['paths'].map(String) : [],
      ttlMinutes: args['ttl_minutes'] ? Number(args['ttl_minutes']) : undefined,
      confirmed: args['confirmed'] === true,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
