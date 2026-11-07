import { registerHandler } from '../ToolDispatcher';
import { checkVerificationGate } from '../lib/sf_verification_gate_core';
import type { VerificationGateMode } from '../lib/sf_verification_gate_core';
import { inspectVerificationEvidenceIntegrity } from '../lib/verification-evidence-integrity';
import path from 'node:path';

registerHandler('sf_verification_gate', async (args, context, deps) => {
  const workItemId = args['work_item_id'] as string;
  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const gateMode = (args['mode'] as string | undefined) || (args['gate_mode'] as string | undefined);
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
    const integrity=await inspectVerificationEvidenceIntegrity({projectRoot:baseDir,workItemDir:path.join(baseDir,'.specforge','work-items',workItemId),workItemId,executionEvidenceConsumer:deps.verificationRuntime});
    if(integrity.invalidity_reasons.length)return {success:true,...result,status:'fail',blocking_issues:[...(result.blocking_issues??[]),...integrity.invalidity_reasons],next_action:'revise'};
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
