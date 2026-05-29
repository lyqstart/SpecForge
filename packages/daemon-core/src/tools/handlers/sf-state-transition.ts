import { access } from "node:fs/promises";
import { join } from "node:path";
import { registerHandler } from '../ToolDispatcher';
import { SPEC_DIR_NAME, resolveProjectPath } from '@specforge/types/directory-layout';

registerHandler('sf_state_transition', async (args, context, deps) => {
  const workItemId = args['work_item_id'] as string;
  const fromState = (args['from_state'] as string) ?? '';
  const toState = args['to_state'] as string;

  if (!workItemId || toState === undefined) {
    return { success: false, error: 'work_item_id and to_state required' };
  }

  // Guard: when creating a new work item (fromState=''), ensure the project is initialized
  if (fromState === '') {
    const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
    const manifestPath = resolveProjectPath(baseDir, 'manifest');
    try {
      await access(manifestPath);
    } catch {
      return {
        success: false,
        error: 'PROJECT_NOT_INITIALIZED',
        hint: `项目尚未初始化，请在项目根目录运行 SpecForge 初始化流程以创建 ${SPEC_DIR_NAME}/manifest.json`,
        recovery_action: 'execute_startup_flow',
      };
    }
  }

  if (!deps.workflowEngine) {
    return { success: false, error: 'WorkflowEngine not available' };
  }

  try {
    const result = await deps.workflowEngine.transitionFull({
      workItemId,
      fromState,
      toState,
      evidence: (args['evidence'] as string) ?? '',
      workflowType: args['workflow_type'] as string,
      transitionContext: args['transition_context'] as Record<string, unknown>,
      actor: context?.agent ? { agentRole: context.agent, sessionId: context?.sessionID } : null,
    });
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
