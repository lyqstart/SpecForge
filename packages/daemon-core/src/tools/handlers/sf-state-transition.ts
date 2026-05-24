import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_state_transition', async (args, context, deps) => {
  const workItemId = args['work_item_id'] as string;
  const fromState = (args['from_state'] as string) ?? '';
  const toState = args['to_state'] as string;

  if (!workItemId || toState === undefined) {
    return { success: false, error: 'work_item_id and to_state required' };
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
