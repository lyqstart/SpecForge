import { registerHandler } from '../ToolDispatcher';
import { gitPostMergeVerify } from '../lib/git-governance-stage2';

registerHandler('sf_git_post_merge_verify', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const commands = Array.isArray(args['commands']) ? args['commands'].map(String) : [];
  return gitPostMergeVerify({ projectRoot, commands });
});
