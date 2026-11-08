import { registerHandler } from '../ToolDispatcher';
import { checkRequirementsGate, checkBugfixGate } from '../lib/sf_requirements_gate_core';
import type { RequirementsGateMode } from '../lib/sf_requirements_gate_core';

registerHandler('sf_requirements_gate', async (args, context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const mode = args['mode'] as string | undefined;
  const gateMode = args['gate_mode'] as string | undefined;

  try {
    let result;
    if (gateMode) {
      result = await checkRequirementsGate(workItemId, baseDir, { mode: gateMode as RequirementsGateMode });
    } else if (mode === 'bugfix') {
      result = await checkBugfixGate(workItemId, baseDir);
    } else {
      result = await checkRequirementsGate(workItemId, baseDir);
    }
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
