import { registerHandler } from '../ToolDispatcher';
import { gitReleaseTagCreate } from '../lib/git-governance-stage4';

registerHandler('sf_git_release_tag_create', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    return await gitReleaseTagCreate({
      projectRoot,
      tagName: String(args['tag_name'] || ''),
      targetRef: args['target_ref'] ? String(args['target_ref']) : undefined,
      message: args['message'] ? String(args['message']) : undefined,
      confirmed: args['confirmed'] === true,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
