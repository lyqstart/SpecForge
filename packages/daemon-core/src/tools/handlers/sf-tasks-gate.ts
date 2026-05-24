import { registerHandler } from '../ToolDispatcher';
import { checkTasksGate } from '../lib/sf_tasks_gate_core';

registerHandler('sf_tasks_gate', async (args, context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  try {
    const result = await checkTasksGate(workItemId, baseDir);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
