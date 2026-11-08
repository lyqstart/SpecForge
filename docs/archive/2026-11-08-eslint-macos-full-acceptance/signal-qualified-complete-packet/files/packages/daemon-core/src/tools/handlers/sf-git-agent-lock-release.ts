import { scalarText } from '@specforge/types';
import { registerHandler } from '../ToolDispatcher';
import { gitAgentLockRelease } from '../lib/git-governance-stage4';

registerHandler('sf_git_agent_lock_release', async (args, context) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    return await gitAgentLockRelease({
      projectRoot,
      lockName: scalarText(args['lock_name'] || ''),
      owner: args['owner'] ? scalarText(args['owner']) : undefined,
      force: args['force'] === true,
      confirmed: args['confirmed'] === true,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
