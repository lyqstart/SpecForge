import { scalarText } from '@specforge/types';
import { registerHandler } from '../ToolDispatcher';
import { gitRemoteConfig } from '../lib/git-governance-stage3';

registerHandler('sf_git_remote_config', async (args, context) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    return await gitRemoteConfig({
      projectRoot,
      remoteName: args['remote_name'] ? scalarText(args['remote_name']) : undefined,
      fetchUrl: args['fetch_url'] ? scalarText(args['fetch_url']) : undefined,
      pushUrl: args['push_url'] ? scalarText(args['push_url']) : undefined,
      authProfile: args['auth_profile'] ? scalarText(args['auth_profile']) : undefined,
      applyRemote: args['apply_remote'] === true,
      confirmed: args['confirmed'] === true,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
