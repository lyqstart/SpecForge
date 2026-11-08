import { registerHandler } from '../ToolDispatcher';
import { gitReleaseTagPlan } from '../lib/git-governance-stage4';

registerHandler('sf_git_release_tag_plan', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    return await gitReleaseTagPlan({
      projectRoot,
      tagName: String(args['tag_name'] || ''),
      targetRef: args['target_ref'] ? String(args['target_ref']) : undefined,
      message: args['message'] ? String(args['message']) : undefined,
      remoteName: args['remote_name'] ? String(args['remote_name']) : undefined,
      writePlan: args['write_plan'] !== false,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
