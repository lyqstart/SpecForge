import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_context_build', async (args, _context, _deps) => {
  const workItemId = args['work_item_id'] as string;

  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  return {
    success: true,
    work_item_id: workItemId,
    context: { work_item_id: workItemId, phase: args['phase'], capabilities: [] },
  };
});
