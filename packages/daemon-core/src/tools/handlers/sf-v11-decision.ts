/**
 * sf-v11-decision — v1.1 User Decision Recorder handler
 *
 * P0 governance hardening:
 * - Do not let an Agent approve from gates_running.
 * - Do not accept workflow_path=unknown.
 * - Do not accept sf-orchestrator as the approval subject.
 * - In chat-driven approval, the tool call may be initiated by sf-orchestrator,
 *   but the recorded approval subject is the user once the workflow is already
 *   in approval_required and all governance preconditions pass.
 * - Bind approval to passed Gate Summary and current candidate_manifest.
 */
import { registerHandler } from '../ToolDispatcher';
import { recordUserDecision, invalidateUserDecision } from '../lib/user-decision-recorder-v11';
import type { UserDecisionStatus } from '../lib/user-decision-recorder-v11';
import { validateDecisionRecordPreconditions } from '../lib/governance-invariants-v11.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

type DecisionType = 'auto_approved' | 'user_approved' | 'waived' | 'rejected';

type DecisionAutoAdvanceResult =
  | { attempted: false; reason: string; current_state?: string | null }
  | {
      attempted: true;
      advanced: true;
      from_state: string;
      to_state: string;
      workflow_type: string;
      evidence: string;
      transition_result: unknown;
    };

function workflowTypeFromPath(workflowPath: string): string {
  switch (workflowPath) {
    case 'requirement_change_path': return 'feature_spec';
    case 'design_change_path': return 'design_change';
    case 'architecture_change_path': return 'architecture_change';
    case 'task_change_path': return 'task_change';
    case 'code_only_fast_path': return 'quick_change';
    case 'spec_migration_path': return 'spec_migration';
    case 'rollback_path': return 'rollback';
    default: return 'quick_change';
  }
}

async function readJsonIfExists(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function readRuntimeCurrentState(projectRoot: string, workItemId: string): Promise<string | null> {
  const statePath = path.join(projectRoot, '.specforge', 'runtime', 'state.json');
  const state = await readJsonIfExists(statePath);
  if (!state) return null;

  if (state.current_work_item_id === workItemId && typeof state.current_state === 'string') {
    return state.current_state;
  }

  if (Array.isArray(state.workItems)) {
    const item = state.workItems.find((wi: any) => wi?.work_item_id === workItemId);
    if (item && typeof item.current_state === 'string') return item.current_state;
    if (item && typeof item.status === 'string') return item.status;
  }

  return typeof state.current_state === 'string' ? state.current_state : null;
}

async function syncWorkItemJsonStatus(input: {
  workItemDir: string;
  toState: string;
}): Promise<void> {
  const workItemPath = path.join(input.workItemDir, 'work_item.json');
  const workItem = await readJsonIfExists(workItemPath);
  if (!workItem || typeof workItem !== 'object') return;

  const now = new Date().toISOString();
  workItem.status = input.toState;
  workItem.updated_at = now;
  workItem.last_user_decision_state_auto_advance_at = now;
  await fs.writeFile(workItemPath, JSON.stringify(workItem, null, 2) + '\n', 'utf-8');
}

async function enrichDecisionAudit(input: {
  workItemDir: string;
  recordedBy: string;
  decidedBy: string;
}): Promise<void> {
  const decisionPath = path.join(input.workItemDir, 'user_decision.json');
  const decision = await readJsonIfExists(decisionPath);
  if (!decision || typeof decision !== 'object') return;

  decision.decided_by = input.decidedBy;
  decision.recorded_by = input.recordedBy;
  decision.recorder_role = 'user_decision_recorder';
  decision.recorded_at = decision.recorded_at ?? new Date().toISOString();
  await fs.writeFile(decisionPath, JSON.stringify(decision, null, 2) + '\n', 'utf-8');
}

async function autoAdvanceDecisionStateAfterRecord(input: {
  deps: any;
  context: any;
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  workflowPath: string;
}): Promise<DecisionAutoAdvanceResult> {
  const currentState = await readRuntimeCurrentState(input.projectRoot, input.workItemId);
  if (currentState !== 'approval_required') {
    return { attempted: false, reason: 'current_state_is_not_approval_required', current_state: currentState };
  }

  if (!input.deps?.workflowEngine) {
    return { attempted: false, reason: 'workflow_engine_not_available', current_state: currentState };
  }
  if (!input.deps?.projectManager) {
    return { attempted: false, reason: 'project_manager_not_available', current_state: currentState };
  }

  const toState = 'approved';
  const workflowType = workflowTypeFromPath(input.workflowPath);
  const evidence = 'user_decision_recorder auto-advance after valid user approval';

  const transitionResult = await input.deps.workflowEngine.transitionFull({
    workItemId: input.workItemId,
    fromState: currentState,
    toState,
    evidence,
    workflowType,
    transitionContext: {
      source: 'sf_v11_decision',
      decision_recorder: 'user_decision_recorder',
    },
    actor: {
      agentRole: 'user_decision_recorder',
      sessionId: input.context?.sessionID ?? 'sf_v11_decision',
    },
    workItemDir: input.workItemDir,
  });

  const projectSm = await input.deps.projectManager.getProjectStateManager(input.projectRoot);
  await projectSm.transition(
    input.workItemId,
    currentState,
    toState,
    'user_decision_recorder',
    workflowType,
    { evidence },
  );

  await syncWorkItemJsonStatus({ workItemDir: input.workItemDir, toState });

  return {
    attempted: true,
    advanced: true,
    from_state: currentState,
    to_state: toState,
    workflow_type: workflowType,
    evidence,
    transition_result: transitionResult,
  };
}

function resolveDecisionStatus(args: Record<string, unknown>): UserDecisionStatus | undefined {
  const explicit = args['decision_status'] as UserDecisionStatus | undefined;
  if (explicit) return explicit;
  if (args['approved'] === true) return 'approved';
  if (args['approved'] === false) return 'rejected';
  return undefined;
}

function resolveDecisionType(args: Record<string, unknown>, decisionStatus: UserDecisionStatus | undefined): DecisionType | undefined {
  const explicit = args['decision_type'] as DecisionType | undefined;
  if (explicit) return explicit;
  if (decisionStatus === 'approved') return 'user_approved';
  if (decisionStatus === 'rejected') return 'rejected';
  return undefined;
}

registerHandler('sf_v11_decision', async (args, context, deps) => {
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

    const decisionStatus = resolveDecisionStatus(args as Record<string, unknown>);
    const decisionType = resolveDecisionType(args as Record<string, unknown>, decisionStatus);

    if (!decisionStatus || !decisionType) {
      return { success: false, error: 'decision_status and decision_type are required' };
    }

    const recordedBy = ((context?.agent as string | undefined) || 'unknown') as string;
    const decidedBy = decisionStatus === 'approved' && decisionType === 'user_approved'
      ? 'user'
      : recordedBy;
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

    await enrichDecisionAudit({ workItemDir, recordedBy, decidedBy });

    const stateAutoAdvance = decisionStatus === 'approved'
      ? await autoAdvanceDecisionStateAfterRecord({
          deps,
          context,
          projectRoot,
          workItemId,
          workItemDir,
          workflowPath,
        })
      : { attempted: false, reason: 'decision_status_is_not_approved' };

    return {
      success: true,
      work_item_id: workItemId,
      decision_id: decision.decision_id,
      decision_status: decision.decision_status,
      decision_type: decision.decision_type,
      decided_by: decidedBy,
      recorded_by: recordedBy,
      decided_at: decision.decided_at,
      state_auto_advance: stateAutoAdvance,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
