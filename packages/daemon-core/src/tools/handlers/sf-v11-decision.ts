/**
 * sf-v11-decision — v1.1 User Decision Recorder handler
 *
 * Trust boundary:
 * - Approval can only be recorded after daemon-side governance preconditions pass.
 * - Chat-driven user approval is recorded as decided_by=user and recorded_by=<agent>.
 * - State transitions are requested through state-coordinator-v11.
 */

import { registerHandler } from '../ToolDispatcher';
import {
  recordUserDecision,
  invalidateUserDecision,
} from '../lib/user-decision-recorder-v11';
import type { UserDecisionStatus } from '../lib/user-decision-recorder-v11';
import { validateDecisionRecordPreconditions } from '../lib/governance-invariants-v11.js';
import { readAuthoritativeState, transitionWithEvidence } from '../lib/state-coordinator-v11.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

type DecisionType = 'auto_approved' | 'user_approved' | 'waived' | 'rejected';

type DecisionAutoAdvanceResult =
  | { attempted: false; reason: string; current_state?: string | null }
  | {
      attempted: true;
      advanced: true;
      from_state: string;
      to_state: string;
      evidence: string;
      transition_result?: unknown;
    }
  | {
      attempted: true;
      advanced: false;
      reason: string;
      current_state?: string | null;
      error?: string;
    };

async function readJsonIfExists(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, value: any): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
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
  await writeJson(decisionPath, decision);
}

async function readMergeReportSuccess(workItemDir: string): Promise<{
  success: boolean;
  successful: number;
  status: string;
}> {
  const mergeReportPath = path.join(workItemDir, 'merge_report.md');
  try {
    const text = await fs.readFile(mergeReportPath, 'utf-8');
    const statusMatch = text.match(/Status:\s*([^\r\n]+)/i);
    const successfulMatch = text.match(/Successful:\s*(\d+)/i);
    const status = String(statusMatch?.[1] ?? '').trim().toLowerCase();
    const successful = successfulMatch ? Number(successfulMatch[1]) : 0;
    return { success: status === 'success' && successful > 0, successful, status };
  } catch {
    return { success: false, successful: 0, status: 'missing' };
  }
}

function workflowTypeFromPath(workflowPath: string): string {
  switch (workflowPath) {
    case 'requirement_change_path':
      return 'feature_spec';
    case 'design_change_path':
      return 'design_change';
    case 'architecture_change_path':
      return 'architecture_change';
    case 'task_change_path':
      return 'task_change';
    case 'code_only_fast_path':
      return 'quick_change';
    case 'spec_migration_path':
      return 'spec_migration';
    case 'rollback_path':
      return 'rollback';
    default:
      return 'quick_change';
  }
}

function resolveDecisionStatus(args: Record<string, unknown>): UserDecisionStatus | undefined {
  const explicit = args['decision_status'] as UserDecisionStatus | undefined;
  if (explicit) return explicit;
  if (args['approved'] === true) return 'approved';
  if (args['approved'] === false) return 'rejected';
  return undefined;
}

function resolveDecisionType(
  args: Record<string, unknown>,
  decisionStatus: UserDecisionStatus | undefined,
): DecisionType | undefined {
  const explicit = args['decision_type'] as DecisionType | undefined;
  if (explicit) return explicit;
  if (decisionStatus === 'approved') return 'user_approved';
  if (decisionStatus === 'rejected') return 'rejected';
  return undefined;
}

registerHandler('sf_v11_decision', async (args, context, deps) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const action = (args['action'] as string) || 'record';

  if (!workItemId) {
    return { success: false, error: 'work_item_id is required' };
  }

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);

  try {
    if (action === 'invalidate') {
      const mergeGuard = await readMergeReportSuccess(workItemDir);
      if (mergeGuard.success) {
        return {
          success: false,
          error: 'USER_DECISION_INVALIDATE_FORBIDDEN_AFTER_MERGE_SUCCESS',
          message:
            'merge_report.md is already success; user_decision cannot be invalidated after successful merge. Start a new Work Item for further changes.',
          merge_report: mergeGuard,
        };
      }

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
    const decidedBy =
      decisionStatus === 'approved' && decisionType === 'user_approved'
        ? 'user'
        : recordedBy;

    const requestedWorkflowPath = args['workflow_path'] as string | undefined;
    const authoritativeState = await readAuthoritativeState({ deps, projectRoot, workItemId });

    const validation = await validateDecisionRecordPreconditions({
      projectRoot,
      workItemDir,
      workItemId,
      requestedWorkflowPath,
      decisionStatus,
      decisionType,
      decidedBy,
      currentState: authoritativeState.current_state ?? undefined,
    });

    if (!validation.valid) {
      return {
        success: false,
        error: 'USER_DECISION_GOVERNANCE_REJECTED',
        errors: validation.errors,
        facts: {
          ...validation.facts,
          authoritative_state_source: authoritativeState.source,
          authoritative_state_rebuilt_from_events: authoritativeState.rebuilt_from_events,
        },
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

    let stateAutoAdvance: DecisionAutoAdvanceResult = {
      attempted: false,
      reason: 'decision_status_is_not_approved',
    };

    if (decisionStatus === 'approved') {
      try {
        const stateBeforeApproval = await readAuthoritativeState({
          deps,
          projectRoot,
          workItemId,
        });
        stateAutoAdvance = await transitionWithEvidence({
          deps,
          context,
          projectRoot,
          workItemId,
          workItemDir,
          fromState: stateBeforeApproval.current_state ?? 'approval_required',
          toState: 'approved',
          workflowType: workflowTypeFromPath(workflowPath),
          actorRole: 'user_decision_recorder',
          evidence: 'user_decision_recorder auto-advance after valid user approval',
          transitionContext: {
            decision_status: decisionStatus,
            decision_type: decisionType,
          },
        });
      } catch (err: any) {
        stateAutoAdvance = {
          attempted: true,
          advanced: false,
          reason: 'state_transition_failed_after_decision_recorded',
          error: err?.message ?? String(err),
        };
      }
    }

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
