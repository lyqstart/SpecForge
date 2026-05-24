import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_design_gate', async (args, _context, _deps) => {
  const workItemId = args['work_item_id'] as string;

  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  return { success: true, passed: true, work_item_id: workItemId };
});
