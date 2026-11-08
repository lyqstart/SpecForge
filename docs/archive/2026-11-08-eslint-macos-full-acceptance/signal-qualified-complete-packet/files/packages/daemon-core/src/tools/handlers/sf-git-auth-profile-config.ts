import { scalarText } from '@specforge/types';
import { registerHandler } from '../ToolDispatcher';
import { gitAuthProfileConfig } from '../lib/git-governance-stage3';

registerHandler('sf_git_auth_profile_config', async args => {
  const method = scalarText(args['method'] || 'none') as 'ssh' | 'token_env' | 'none';
  try {
    return await gitAuthProfileConfig({
      profileName: scalarText(args['profile_name'] || '').trim(),
      provider: args['provider'] ? scalarText(args['provider']) : undefined,
      method,
      sshKeyPath: args['ssh_key_path'] ? scalarText(args['ssh_key_path']) : undefined,
      sshHostAlias: args['ssh_host_alias'] ? scalarText(args['ssh_host_alias']) : undefined,
      tokenEnvVar: args['token_env_var'] ? scalarText(args['token_env_var']) : undefined,
      gitUserName: args['git_user_name'] ? scalarText(args['git_user_name']) : undefined,
      gitUserEmail: args['git_user_email'] ? scalarText(args['git_user_email']) : undefined,
      confirmed: args['confirmed'] === true,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
