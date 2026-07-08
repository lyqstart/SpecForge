import { registerHandler } from '../ToolDispatcher';
import { preflight } from '../lib/git-governance-core';

registerHandler('sf_git_preflight', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const defaultBranch = String(args['default_branch'] || 'main');
  return preflight(projectRoot, defaultBranch);
});
