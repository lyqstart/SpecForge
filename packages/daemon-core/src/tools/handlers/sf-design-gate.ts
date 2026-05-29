import { registerHandler } from '../ToolDispatcher';
import { checkDesignGate } from '../lib/sf_design_gate_core';
import type { DesignGateMode } from '../lib/sf_design_gate_core';

registerHandler('sf_design_gate', async (args, context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workflowType = (args['workflow_type'] as string) || 'feature_spec';
  const gateMode = (args['mode'] as string | undefined) || (args['gate_mode'] as string | undefined);

  try {
    const result = await checkDesignGate(
      workItemId,
      baseDir,
      workflowType,
      gateMode ? { mode: gateMode as DesignGateMode } : undefined
    );
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
