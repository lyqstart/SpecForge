import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_artifact_write', async (args, _context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  const fileType = args['file_type'] as string;
  const content = args['content'] as string;

  if (!workItemId || !fileType || !content) {
    return { success: false, error: 'work_item_id, file_type, and content required' };
  }

  return { success: true, message: 'artifact written', work_item_id: workItemId, file_type: fileType };
});
