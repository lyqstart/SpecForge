import { registerHandler } from '../ToolDispatcher';
import { checkDesignGate } from '../lib/sf_design_gate_core';

registerHandler('sf_design_gate', async (args, context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }
  if (args['mode'] !== undefined || args['gate_mode'] !== undefined) {
    return { success: false, error: 'DESIGN_GATE_MODE_NOT_CURRENT' };
  }
  if (args['workflow_type'] !== undefined && args['workflow_type'] !== 'feature_spec') {
    return { success: false, error: 'UNSUPPORTED_CURRENT_RELEASE_WORKFLOW' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workflowType = (args['workflow_type'] as string) || 'feature_spec';

  try {
    const result = await checkDesignGate(
      workItemId,
      baseDir,
      workflowType
    );
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
