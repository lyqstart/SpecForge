import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_doc_lint', async (args, _context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  const docType = args['doc_type'] as string;

  if (!workItemId || !docType) {
    return { success: false, error: 'work_item_id and doc_type required' };
  }

  return { success: true, issues: [], work_item_id: workItemId, doc_type: docType };
});
