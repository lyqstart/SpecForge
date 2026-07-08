import { registerHandler } from '../ToolDispatcher';
import { gitRemoteProbe } from '../lib/git-governance-stage3';

registerHandler('sf_git_remote_probe', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    return await gitRemoteProbe({ projectRoot, remoteName: args['remote_name'] ? String(args['remote_name']) : undefined });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
