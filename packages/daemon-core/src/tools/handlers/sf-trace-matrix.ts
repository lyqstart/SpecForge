import { registerHandler } from '../ToolDispatcher';
import { checkTraceMatrix } from '../lib/sf_trace_matrix_core';

registerHandler('sf_trace_matrix', async (args, context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  try {
    return await checkTraceMatrix(workItemId, baseDir);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
