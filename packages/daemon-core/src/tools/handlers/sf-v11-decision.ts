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
import * as crypto from 'node:crypto';
import { ACTOR_ROLES } from '@specforge/types/actor-roles';

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

async function writeJsonAtomic(filePath: string, value: any): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  await fs.rename(tempPath, filePath);
}

async function fileSha256(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

async function collectGateEvidence(workItemDir: string): Promise<Array<{ path: string; sha256: string }>> {
  const result: Array<{ path: string; sha256: string }> = [];
  const gatesDir = path.join(workItemDir, 'gates');
  try {
    const entries = await fs.readdir(gatesDir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile()) continue;
      const filePath = path.join(gatesDir, entry.name);
      result.push({ path: `gates/${entry.name}`, sha256: await fileSha256(filePath) });
    }
  } catch {
    // A missing gates directory is captured by the empty evidence list.
  }
  const summaryPath = path.join(workItemDir, 'gate_summary.md');
  try {
    result.push({ path: 'gate_summary.md', sha256: await fileSha256(summaryPath) });
  } catch {
    // A missing summary is captured by the absent entry.
  }
  return result;
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
      const authoritativeState = await readAuthoritativeState({ deps, projectRoot, workItemId });
      if (authoritativeState.current_state !== 'approved') {
        return {
          success: false,
          error: 'USER_DECISION_INVALIDATION_REQUIRES_APPROVED_STATE',
          current_state: authoritativeState.current_state,
          state_authority: authoritativeState.source,
        };
      }

      const mergeGuard = await readMergeReportSuccess(workItemDir);
      if (mergeGuard.success) {
        return {
          success: false,
          error: 'USER_DECISION_INVALIDATE_FORBIDDEN_AFTER_MERGE_SUCCESS',
          message: 'merge_report.md is already success; user_decision cannot be invalidated after successful merge. Start a new Work Item for further changes.',
          merge_report: mergeGuard,
        };
      }

      const reason = String(args['reason'] ?? '').trim();
      if (!reason) {
        return {
          success: false,
          error: 'USER_DECISION_INVALIDATION_REASON_REQUIRED',
          retry_allowed: true,
        };
      }

      const decisionPath = path.join(workItemDir, 'user_decision.json');
      const invalidationPath = path.join(workItemDir, 'approval_invalidation.json');
      const originalDecisionText = await fs.readFile(decisionPath, 'utf-8');
      const originalDecision = JSON.parse(originalDecisionText);
      let previousInvalidationText: string | null = null;
      try {
        previousInvalidationText = await fs.readFile(invalidationPath, 'utf-8');
      } catch {
        previousInvalidationText = null;
      }
      const workflowFacts = await readWorkflowFacts(workItemDir);
      const workflowType = workflowTypeForDecision(
        workflowFacts.workflowPath,
        workflowFacts.workflowType,
      );
      const gateEvidence = await collectGateEvidence(workItemDir);
      const invalidation = {
        schema_version: '1.0',
        work_item_id: workItemId,
        invalidated_at: new Date().toISOString(),
        invalidated_by: ACTOR_ROLES.userDecisionRecorder,
        reason,
        prior_state: authoritativeState.current_state,
        recovery_state: 'blocked',
        decision_id: originalDecision.decision_id,
        approved_manifest_hash: originalDecision.manifest_hash,
        approved_candidate_hash: originalDecision.candidate_hash,
        approved_gate_summary_hash: originalDecision.gate_summary_hash,
        gate_evidence_status: 'invalidated',
        invalidated_gate_evidence: gateEvidence,
      };

      if (previousInvalidationText !== null) {
        const previousInvalidation = JSON.parse(previousInvalidationText);
        const archiveName = String(previousInvalidation.decision_id ?? 'unknown-decision')
          .replace(/[^A-Za-z0-9._-]/g, '_');
        await writeJsonAtomic(
          path.join(workItemDir, 'approval_invalidations', `${archiveName}.json`),
          previousInvalidation,
        );
      }
      await writeJsonAtomic(invalidationPath, invalidation);
      try {
        await invalidateUserDecision(workItemDir, reason);
        await transitionWithEvidence({
          deps,
          context,
          projectRoot,
          workItemId,
          workItemDir,
          fromState: 'approved',
          toState: 'blocked',
          workflowType,
          actorRole: ACTOR_ROLES.userDecisionRecorder,
          evidence: 'approval_invalidation.json',
          transitionContext: {
            source: 'approval_invalidation',
            decision_id: originalDecision.decision_id,
          },
        });
      } catch (error) {
        await fs.writeFile(decisionPath, originalDecisionText, 'utf-8');
        if (previousInvalidationText === null) {
          await fs.rm(invalidationPath, { force: true });
        } else {
          await fs.writeFile(invalidationPath, previousInvalidationText, 'utf-8');
        }
        throw error;
      }

      return {
        success: true,
        work_item_id: workItemId,
        decision_status: 'invalidated',
        current_state: 'blocked',
        invalidation_record: 'approval_invalidation.json',
      };
    }

    if (action === 'recover_after_invalidation') {
      if (context?.agent !== ACTOR_ROLES.orchestrator) {
        return {
          success: false,
          error: 'APPROVAL_INVALIDATION_RECOVERY_REQUIRES_ORCHESTRATOR',
          required_actor: ACTOR_ROLES.orchestrator,
          actual_actor: context?.agent ?? null,
        };
      }
      const authoritativeState = await readAuthoritativeState({ deps, projectRoot, workItemId });
      if (authoritativeState.current_state !== 'blocked') {
        return {
          success: false,
          error: 'APPROVAL_INVALIDATION_RECOVERY_REQUIRES_BLOCKED_STATE',
          current_state: authoritativeState.current_state,
        };
      }
      const invalidation = await readJsonIfExists(
        path.join(workItemDir, 'approval_invalidation.json'),
      );
      const decision = await readJsonIfExists(path.join(workItemDir, 'user_decision.json'));
      if (
        !invalidation ||
        invalidation.work_item_id !== workItemId ||
        invalidation.gate_evidence_status !== 'invalidated' ||
        decision?.decision_status !== 'invalidated' ||
        decision?.decision_id !== invalidation.decision_id
      ) {
        return {
          success: false,
          error: 'APPROVAL_INVALIDATION_RECOVERY_EVIDENCE_INVALID',
        };
      }
      const workflowFacts = await readWorkflowFacts(workItemDir);
      const workflowType = workflowTypeForDecision(
        workflowFacts.workflowPath,
        workflowFacts.workflowType,
      );
      const transition = await transitionWithEvidence({
        deps,
        context,
        projectRoot,
        workItemId,
        workItemDir,
        fromState: 'blocked',
        toState: 'candidate_preparing',
        workflowType,
        actorRole: ACTOR_ROLES.orchestrator,
        evidence: 'approval_invalidation.json',
        transitionContext: {
          source: 'approval_invalidation_recovery',
          decision_id: invalidation.decision_id,
        },
      });
      return {
        success: true,
        work_item_id: workItemId,
        decision_status: 'invalidated',
        current_state: 'candidate_preparing',
        transition_result: transition.transition_result,
      };
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
