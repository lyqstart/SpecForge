import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_state_read', async (args, context, deps) => {
  const workItemId = args['work_item_id'] as string;

  if (workItemId === 'all') {
    const all = await deps.stateManager?.getAllStates();
    return { success: true, work_items: all ?? {} };
  }

  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  const state = await deps.stateManager?.getState(workItemId);
  if (!state) {
    return { success: false, error: `${workItemId} not found` };
  }
  return { success: true, ...state };
});
