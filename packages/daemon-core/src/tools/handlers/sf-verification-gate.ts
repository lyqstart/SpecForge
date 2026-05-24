import { registerHandler } from '../ToolDispatcher';
import { checkVerificationGate } from '../lib/sf_verification_gate_core';
import type { VerificationGateMode } from '../lib/sf_verification_gate_core';

registerHandler('sf_verification_gate', async (args, context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const gateMode = args['gate_mode'] as string | undefined;
  const requiredTypes = args['required_types'] as string[] | undefined;

  try {
    const result = await checkVerificationGate(
      workItemId,
      baseDir,
      {
        mode: gateMode as VerificationGateMode | undefined,
        required_types: requiredTypes as any,
      }
    );
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
