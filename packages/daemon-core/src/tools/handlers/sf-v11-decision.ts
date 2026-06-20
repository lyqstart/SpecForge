/**
 * sf-v11-decision — v1.1 User Decision Recorder handler
 *
 * Trust boundary:
 * - Approval can only be recorded after daemon-side governance preconditions pass.
 * - user_approved requires explicit user-response evidence.
 * - Orchestrator cannot convert "delegated implementation request" into user approval.
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
import {
  WORKFLOW_TYPE_TO_PATH,
  resolveWorkflowTypeForPath,
  type WorkflowPath,
  type WorkflowType,
} from '../lib/state_machine';
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

async function readJsonIfExists(filePath: string): Promise<any> {
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
  userResponseQuote?: string;
  autoApprovalPolicyId?: string;
}): Promise<void> {
  const decisionPath = path.join(input.workItemDir, 'user_decision.json');
  const decision = await readJsonIfExists(decisionPath);
  if (!decision || typeof decision !== 'object') return;
  decision.decided_by = input.decidedBy;
  decision.recorded_by = input.recordedBy;
  decision.recorder_role = 'user_decision_recorder';
  decision.recorded_at = decision.recorded_at ?? new Date().toISOString();
  if (input.userResponseQuote) {
    decision.user_response_quote = input.userResponseQuote;
  }
  if (input.autoApprovalPolicyId) {
    decision.auto_approval_policy_id = input.autoApprovalPolicyId;
  }
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

async function readWorkflowFacts(workItemDir: string): Promise<{
  workflowPath?: string;
  workflowType?: string;
}> {
  const candidateManifest = await readJsonIfExists(path.join(workItemDir, 'candidate_manifest.json'));
  if (candidateManifest?.workflow_path || candidateManifest?.workflow_type) {
    return {
      workflowPath: candidateManifest.workflow_path,
      workflowType: candidateManifest.workflow_type,
    };
  }
  const triggerResult = await readJsonIfExists(path.join(workItemDir, 'trigger_result.json'));
  if (triggerResult?.workflow_path || triggerResult?.workflow_type) {
    return {
      workflowPath: triggerResult.workflow_path,
      workflowType: triggerResult.workflow_type,
    };
  }
  const workItem = await readJsonIfExists(path.join(workItemDir, 'work_item.json'));
  return {
    workflowPath: workItem?.workflow_path,
    workflowType: workItem?.workflow_type,
  };
}

function isKnownWorkflowType(value: string | undefined): value is WorkflowType {
  return !!value && Object.prototype.hasOwnProperty.call(WORKFLOW_TYPE_TO_PATH, value);
}

function normalizeWorkflowPath(value: string | undefined): WorkflowPath | undefined {
  return value && value.trim() ? (value as WorkflowPath) : undefined;
}

function workflowTypeForDecision(workflowPath: string | undefined, workflowType: string | undefined): string {
  const requestedWorkflowPath = workflowPath && workflowPath.trim() ? workflowPath : undefined;
  const requestedWorkflowType = workflowType && workflowType.trim() ? workflowType : undefined;

  if (requestedWorkflowType) {
    if (!isKnownWorkflowType(requestedWorkflowType)) {
      throw new Error(`UNKNOWN_WORKFLOW_TYPE: ${requestedWorkflowType}`);
    }

    const resolved = resolveWorkflowTypeForPath(
      normalizeWorkflowPath(requestedWorkflowPath),
      requestedWorkflowType,
    );
    if (!resolved) {
      throw new Error(
        `INCOMPATIBLE_WORKFLOW_TYPE_AND_PATH: workflow_type=${requestedWorkflowType}; workflow_path=${requestedWorkflowPath ?? '(none)'}`,
      );
    }
    return resolved;
  }

  const resolved = resolveWorkflowTypeForPath(normalizeWorkflowPath(requestedWorkflowPath));
  if (resolved) return resolved;
  if (requestedWorkflowPath) {
    throw new Error(`UNSUPPORTED_WORKFLOW_PATH_WITHOUT_WORKFLOW_TYPE: ${requestedWorkflowPath}`);
  }
  return 'quick_change';
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

function validateUserApprovalBoundary(args: Record<string, unknown>, input: {
  decisionStatus: UserDecisionStatus;
  decisionType: DecisionType;
}): { ok: true } | { ok: false; error: string; code: string; remediation: string } {
  if (input.decisionStatus !== 'approved') return { ok: true };

  const comments = String(args['comments'] ?? '');
  const userResponseQuote = String(args['user_response_quote'] ?? '').trim();
  const autoApprovalPolicyId = String(args['auto_approval_policy_id'] ?? '').trim();

  if (input.decisionType === 'user_approved') {
    if (!userResponseQuote) {
      return {
        ok: false,
        error: 'USER_APPROVED_REQUIRES_EXPLICIT_USER_RESPONSE_QUOTE',
        code: 'USER_APPROVAL_EVIDENCE_REQUIRED',
        remediation:
          'Ask the user to approve/reject. When recording approval, pass user_response_quote with the exact user reply, e.g. "批准" or "同意".',
      };
    }

    const forbiddenDelegationPattern =
      /(on behalf|authorized representative|delegated|explicitly delegated|代替用户|代表用户|授权代表|用户已委派|默认为批准|自动批准)/i;
    if (forbiddenDelegationPattern.test(comments) || forbiddenDelegationPattern.test(userResponseQuote)) {
      return {
        ok: false,
        error: 'ORCHESTRATOR_CANNOT_CONVERT_DELEGATION_TO_USER_APPROVAL',
        code: 'USER_APPROVAL_TRUST_BOUNDARY',
        remediation:
          'A task request is not an approval of the generated Candidate. Present the Candidate summary and wait for an explicit approval reply.',
      };
    }
  }

  if (input.decisionType === 'auto_approved') {
    if (!autoApprovalPolicyId) {
      return {
        ok: false,
        error: 'AUTO_APPROVED_REQUIRES_POLICY_ID',
        code: 'AUTO_APPROVAL_POLICY_REQUIRED',
        remediation:
          'Use user_approved with explicit user_response_quote, or provide an approved auto_approval_policy_id when a configured policy exists.',
      };
    }
  }

  return { ok: true };
}

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
      const mergeGuard = await readMergeReportSuccess(workItemDir);
      if (mergeGuard.success) {
        return {
          success: false,
          error: 'USER_DECISION_INVALIDATE_FORBIDDEN_AFTER_MERGE_SUCCESS',
          message: 'merge_report.md is already success; user_decision cannot be invalidated after successful merge. Start a new Work Item for further changes.',
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

    const boundary = validateUserApprovalBoundary(args as Record<string, unknown>, {
      decisionStatus,
      decisionType,
    });
    if (!boundary.ok) {
      return {
        success: false,
        error: boundary.error,
        code: boundary.code,
        retry_allowed: true,
        remediation: boundary.remediation,
      };
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

    const workflowFacts = await readWorkflowFacts(workItemDir);
    const workflowPath = String(validation.facts?.workflowPath ?? requestedWorkflowPath ?? workflowFacts.workflowPath ?? '');
    const workflowType = workflowTypeForDecision(workflowPath, workflowFacts.workflowType);

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

    const userResponseQuote = String(args['user_response_quote'] ?? '').trim() || undefined;
    const autoApprovalPolicyId = String(args['auto_approval_policy_id'] ?? '').trim() || undefined;
    await enrichDecisionAudit({
      workItemDir,
      recordedBy,
      decidedBy,
      userResponseQuote,
      autoApprovalPolicyId,
    });

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
          workflowType,
          actorRole: 'user_decision_recorder',
          evidence: 'user_decision_recorder auto-advance after valid user approval',
          transitionContext: {
            decision_status: decisionStatus,
            decision_type: decisionType,
            workflow_type: workflowType,
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
      user_response_quote: userResponseQuote,
      auto_approval_policy_id: autoApprovalPolicyId,
      decided_at: decision.decided_at,
      workflow_type: workflowType,
      workflow_path: workflowPath,
      state_auto_advance: stateAutoAdvance,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
