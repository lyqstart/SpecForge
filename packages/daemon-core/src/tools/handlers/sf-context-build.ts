import { registerHandler } from '../ToolDispatcher';
import { buildContext } from '../lib/sf_context_build_core';

registerHandler('sf_context_build', async (args, context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  try {
    const result = await buildContext(
      workItemId,
      args['task_id'] as string | undefined,
      args['phase'] as string | undefined,
      (args['include_capabilities'] as boolean) ?? false,
      baseDir
    );
    return result;
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
