/**
 * sf-v11-decision — v1.1 User Decision Recorder handler
 *
 * P0 governance hardening:
 * - Do not let an Agent approve from gates_running.
 * - Do not accept workflow_path=unknown.
 * - Do not accept sf-orchestrator as user_approved actor.
 * - Bind approval to passed Gate Summary and current candidate_manifest.
 */
import { registerHandler } from '../ToolDispatcher';
import { recordUserDecision, invalidateUserDecision } from '../lib/user-decision-recorder-v11';
import type { UserDecisionStatus } from '../lib/user-decision-recorder-v11';
import { validateDecisionRecordPreconditions } from '../lib/governance-invariants-v11.js';
import * as path from 'node:path';

registerHandler('sf_v11_decision', async (args, context, _deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const action = (args['action'] as string) || 'record';

  if (!workItemId) return { success: false, error: 'work_item_id is required' };

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);

  try {
    if (action === 'invalidate') {
      const reason = (args['reason'] as string) || 'base_spec_version changed';
      await invalidateUserDecision(workItemDir, reason);
      return { success: true, work_item_id: workItemId, decision_status: 'invalidated' };
    }

    const decisionStatus = args['decision_status'] as UserDecisionStatus;
    const decisionType = args['decision_type'] as 'auto_approved' | 'user_approved' | 'waived' | 'rejected';
    if (!decisionStatus || !decisionType) {
      return { success: false, error: 'decision_status and decision_type are required' };
    }

    const decidedBy = ((context?.agent as string | undefined) || 'unknown') as string;
    const requestedWorkflowPath = args['workflow_path'] as string | undefined;
    const validation = await validateDecisionRecordPreconditions({
      projectRoot,
      workItemDir,
      workItemId,
      requestedWorkflowPath,
      decisionStatus,
      decisionType,
      decidedBy,
    });

    if (!validation.valid) {
      return {
        success: false,
        error: 'USER_DECISION_GOVERNANCE_REJECTED',
        errors: validation.errors,
        facts: validation.facts,
      };
    }

    const workflowPath = String(validation.facts?.workflowPath ?? requestedWorkflowPath);
    const decision = await recordUserDecision({
      workItemDir,
      workItemId,
      workflowPath,
      baseSpecVersion: (args['base_spec_version'] as string) || 'PSV-0001',
      candidateManifestPath: 'candidate_manifest.json',
      gateSummaryPath: 'gate_summary.md',
      decisionStatus,
      decisionType,
      decidedBy,
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
