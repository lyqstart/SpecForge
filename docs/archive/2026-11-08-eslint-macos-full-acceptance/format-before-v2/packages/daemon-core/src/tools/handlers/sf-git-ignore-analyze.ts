import { registerHandler } from '../ToolDispatcher';
import { analyzeIgnore } from '../lib/git-governance-core';

registerHandler('sf_git_ignore_analyze', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const paths = Array.isArray(args['paths']) ? (args['paths'] as unknown[]).map(String) : undefined;
  const writeAssessment = args['write_assessment'] !== false;
  try {
    return await analyzeIgnore(projectRoot, paths, writeAssessment);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
