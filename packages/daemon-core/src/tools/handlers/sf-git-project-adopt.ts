import { registerHandler } from '../ToolDispatcher';
import { gitProjectAdopt } from '../lib/git-governance-stage3';

registerHandler('sf_git_project_adopt', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    return await gitProjectAdopt({
      projectRoot,
      defaultBranch: args['default_branch'] ? String(args['default_branch']) : undefined,
      confirmed: args['confirmed'] === true,
      writeReport: args['write_report'] !== false,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
