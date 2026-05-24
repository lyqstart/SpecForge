import { registerHandler } from '../ToolDispatcher';
import { generateCostReport } from '../lib/sf_cost_report_core';

registerHandler('sf_cost_report', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  try {
    const result = await generateCostReport(
      {
        work_item_id: args['work_item_id'] as string | undefined,
        session_id: args['session_id'] as string | undefined,
        group_by: (args['group_by'] as any) ?? 'work_item',
      },
      baseDir
    );
    return result;
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
