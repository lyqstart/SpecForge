import { registerHandler } from '../ToolDispatcher';
import { gitAuthProfileConfig } from '../lib/git-governance-stage3';

registerHandler('sf_git_auth_profile_config', async (args) => {
  const method = String(args['method'] || 'none') as 'ssh' | 'token_env' | 'none';
  try {
    return await gitAuthProfileConfig({
      profileName: String(args['profile_name'] || '').trim(),
      provider: args['provider'] ? String(args['provider']) : undefined,
      method,
      sshKeyPath: args['ssh_key_path'] ? String(args['ssh_key_path']) : undefined,
      sshHostAlias: args['ssh_host_alias'] ? String(args['ssh_host_alias']) : undefined,
      tokenEnvVar: args['token_env_var'] ? String(args['token_env_var']) : undefined,
      gitUserName: args['git_user_name'] ? String(args['git_user_name']) : undefined,
      gitUserEmail: args['git_user_email'] ? String(args['git_user_email']) : undefined,
      confirmed: args['confirmed'] === true,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
