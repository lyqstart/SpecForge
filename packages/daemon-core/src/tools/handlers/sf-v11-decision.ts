/**
 * sf-v11-decision — v1.1 User Decision Recorder handler
 *
 * 记录结构化审批决策。
 */
import { registerHandler } from '../ToolDispatcher';
import { recordUserDecision, invalidateUserDecision } from '../lib/user-decision-recorder-v11';
import type { UserDecisionStatus } from '../lib/user-decision-recorder-v11';
import * as path from 'node:path';

registerHandler('sf_v11_decision', async (args, context, deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const action = (args['action'] as string) || 'record';

  if (!workItemId) {
    return { success: false, error: 'work_item_id is required' };
  }

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);

  try {
    if (action === 'invalidate') {
      const reason = (args['reason'] as string) || 'base_spec_version changed';
      await invalidateUserDecision(workItemDir, reason);
      return { success: true, work_item_id: workItemId, decision_status: 'invalidated' };
    }

    // action === 'record'
    const decisionStatus = args['decision_status'] as UserDecisionStatus;
    const decisionType = args['decision_type'] as 'auto_approved' | 'user_approved' | 'waived' | 'rejected';

    if (!decisionStatus || !decisionType) {
      return { success: false, error: 'decision_status and decision_type are required' };
    }

    const decision = await recordUserDecision({
      workItemDir,
      workItemId,
      workflowPath: (args['workflow_path'] as string) || 'unknown',
      baseSpecVersion: (args['base_spec_version'] as string) || 'PSV-0001',
      candidateManifestPath: 'candidate_manifest.json',
      gateSummaryPath: 'gate_summary.md',
      decisionStatus,
      decisionType,
      decidedBy: ((context?.agent as string | undefined) || 'user') as string,
      decisionScope: (args['decision_scope'] as string) || 'full',
      waivers: args['waivers'] as any[],
    });

    return {
      success: true,
      work_item_id: workItemId,
      decision_id: decision.decision_id,
      decision_status: decision.decision_status,
      decided_at: decision.decided_at,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
