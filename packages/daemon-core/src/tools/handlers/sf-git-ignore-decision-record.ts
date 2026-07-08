import { registerHandler } from '../ToolDispatcher';
import { gitIgnoreDecisionRecord } from '../lib/git-governance-stage3';

registerHandler('sf_git_ignore_decision_record', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  try {
    const decisions = Array.isArray(args['decisions']) ? args['decisions'] as any[] : [];
    return await gitIgnoreDecisionRecord({ projectRoot, decisions, confirmed: args['confirmed'] === true });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
