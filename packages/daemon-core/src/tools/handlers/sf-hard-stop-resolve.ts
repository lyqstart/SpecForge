/**
 * sf-hard-stop-resolve.ts
 *
 * Structured HardStop recovery tool.
 *
 * A HardStop protects the current Work Item from unsafe continuation; it is not
 * a terminal workflow result. The resolver preserves the original record,
 * classifies the cause, clears only the active latch, and returns an explicit
 * resume context so the Orchestrator can continue from the interrupted step.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { registerHandler } from '../ToolDispatcher';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { resetHardStop } from '../lib/hard-stop-latch';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import { appendWriteGuardAuthorization } from '../lib/write-guard-authorization-log';

const USER_DECISION_RESOLUTION_TYPES = new Set([
  'scope_expanded',
  'user_authorized_retry',
  'risk_accepted',
]);

const SYSTEM_SAFE_RESOLUTION_TYPES = new Set([
  'operator_error',
  'false_positive',
  'policy_corrected',
  'repaired',
  'prohibited_action_replaced',
  'superseded',
]);

const VALID_RESOLUTION_TYPES = new Set([
  ...USER_DECISION_RESOLUTION_TYPES,
  ...SYSTEM_SAFE_RESOLUTION_TYPES,
]);

const VALID_ACTION_DISPOSITIONS = new Set([
  'abandon',
  'retry_after_repair',
  'retry_after_authorization',
  'supersede',
]);

function readJsonIfExists(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key];
  if (!Array.isArray(value)) return undefined;
  return value.map(item => String(item ?? '').trim()).filter(item => item.length > 0);
}

function shouldInstallAuthorization(args: Record<string, unknown>): boolean {
  return (
    args['install_authorization'] === true ||
    String(args['authorization_type'] ?? '').trim().length > 0
  );
}

function normalizeAgentName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

function currentAuthoritativeProjectionState(baseDir: string, workItemId: string): string | null {
  const state = readJsonIfExists(path.join(baseDir, SPEC_DIR_NAME, 'runtime', 'state.json'));
  const workItems = Array.isArray(state?.workItems) ? state.workItems : [];
  const item = workItems.find((candidate: any) => candidate?.work_item_id === workItemId);
  const value = item?.current_state ?? item?.status;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function strongSystemRecoveryPlan(args: Record<string, unknown>): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  const reason = optionalString(args, 'reason');
  const evidence = optionalStringArray(args, 'evidence') ?? [];
  const allowedNextAction = optionalString(args, 'allowed_next_action');
  const resumeFromStep = optionalString(args, 'resume_from_step');
  const disposition = optionalString(args, 'blocked_action_disposition');

  if (!reason || reason.length < 8) missing.push('reason');
  if (evidence.length === 0) missing.push('evidence');
  if (!allowedNextAction) missing.push('allowed_next_action');
  if (!resumeFromStep) missing.push('resume_from_step');
  if (!disposition || !VALID_ACTION_DISPOSITIONS.has(disposition)) {
    missing.push('blocked_action_disposition');
  }

  return { valid: missing.length === 0, missing };
}

registerHandler('sf_hard_stop_resolve', async (args, context, _deps) => {
  const callerAgent = normalizeAgentName(context?.agent);
  if (callerAgent !== 'sf-orchestrator') {
    return {
      success: false,
      error: 'HARD_STOP_RESOLVE_ORCHESTRATOR_ONLY',
      message:
        'Only sf-orchestrator may resolve a HardStop. Professional agents must return the HardStop evidence and an orchestrator_action_request instead.',
      denied: true,
      caller_agent: callerAgent || 'unknown',
      required_agent: 'sf-orchestrator',
      retry_allowed: false,
    };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = String(args['work_item_id'] ?? '');
  const idError = validateWorkItemId(workItemId);
  if (idError) return { success: false, error: idError, retry_allowed: true };

  const resolutionType = String(args['resolution_type'] ?? '');
  if (!VALID_RESOLUTION_TYPES.has(resolutionType)) {
    return {
      success: false,
      error: 'INVALID_HARD_STOP_RESOLUTION_TYPE',
      allowed_values: Array.from(VALID_RESOLUTION_TYPES),
      retry_allowed: true,
    };
  }

  const userQuote = String(args['user_response_quote'] ?? '').trim();
  const userDecisionRequired =
    USER_DECISION_RESOLUTION_TYPES.has(resolutionType) || shouldInstallAuthorization(args);
  const systemPlan = strongSystemRecoveryPlan(args as Record<string, unknown>);

  if (userDecisionRequired && userQuote.length < 8) {
    return {
      success: false,
      error: 'USER_RESPONSE_QUOTE_REQUIRED',
      message:
        'Permission expansion, retry authorization, risk acceptance, or installed authorization requires an explicit current user quote.',
      retry_allowed: true,
    };
  }

  if (!userDecisionRequired && userQuote.length < 8 && !systemPlan.valid) {
    return {
      success: false,
      error: 'HARD_STOP_RECOVERY_PLAN_REQUIRED',
      message:
        'A system-safe HardStop resolution without user approval must prove a no-expansion recovery plan and an explicit resume point.',
      missing_fields: systemPlan.missing,
      retry_allowed: true,
    };
  }

  const disposition = optionalString(args as Record<string, unknown>, 'blocked_action_disposition');
  const replacesUnsafeAction =
    resolutionType === 'operator_error' || resolutionType === 'prohibited_action_replaced';
  if (replacesUnsafeAction && disposition !== 'abandon') {
    return {
      success: false,
      error: 'ORIGINAL_ACTION_MUST_BE_ABANDONED',
      message: `${resolutionType} must abandon the blocked action and continue through a safe alternative; the unsafe action cannot be retried.`,
      retry_allowed: true,
    };
  }

  if (replacesUnsafeAction && args['retry_original_action'] === true) {
    return {
      success: false,
      error: 'OPERATOR_ERROR_CANNOT_RETRY_ORIGINAL_ACTION',
      message:
        'An operator/tool-selection error must abandon the original action and use a safe alternative.',
      retry_allowed: true,
    };
  }

  if (
    replacesUnsafeAction &&
    !optionalString(args as Record<string, unknown>, 'safe_alternative_tool')
  ) {
    return {
      success: false,
      error: 'SAFE_ALTERNATIVE_TOOL_REQUIRED',
      message:
        'An operator/tool-selection error must name the controlled Tool or read path that replaces the blocked action.',
      retry_allowed: true,
    };
  }

  if (replacesUnsafeAction && shouldInstallAuthorization(args as Record<string, unknown>)) {
    return {
      success: false,
      error: 'OPERATOR_ERROR_CANNOT_EXPAND_AUTHORIZATION',
      message:
        'An operator/tool-selection error must use a safe alternative, not expand authorization.',
      retry_allowed: true,
    };
  }

  const wiDir = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId);
  const activePath = path.join(wiDir, 'hard_stop.json');
  const active = readJsonIfExists(activePath);

  if (!active || active.blocked !== true || active.resolved === true) {
    return {
      success: false,
      error: 'NO_ACTIVE_HARD_STOP',
      work_item_id: workItemId,
      retry_allowed: true,
    };
  }

  const requestedHardStopId = String(args['hard_stop_id'] ?? '').trim();
  if (requestedHardStopId && active.hard_stop_id && requestedHardStopId !== active.hard_stop_id) {
    return {
      success: false,
      error: 'HARD_STOP_ID_MISMATCH',
      requested_hard_stop_id: requestedHardStopId,
      active_hard_stop_id: active.hard_stop_id,
      retry_allowed: true,
    };
  }

  const currentState = currentAuthoritativeProjectionState(baseDir, workItemId);
  const lastSuccessfulStep =
    optionalString(args as Record<string, unknown>, 'last_successful_step') ??
    optionalString(active, 'last_successful_step');
  const resumeFromStep =
    optionalString(args as Record<string, unknown>, 'resume_from_step') ??
    optionalString(active, 'resume_step') ??
    optionalString(args as Record<string, unknown>, 'allowed_next_action');
  const allowedNextAction =
    optionalString(args as Record<string, unknown>, 'allowed_next_action') ?? resumeFromStep;
  const safeAlternativeTool =
    optionalString(args as Record<string, unknown>, 'safe_alternative_tool') ??
    optionalString(active, 'safe_alternative_tool');
  const retryOriginalAction = args['retry_original_action'] === true;

  const entry = {
    schema_version: '1.3.0',
    resolved_at: new Date().toISOString(),
    work_item_id: workItemId,
    hard_stop_id: active.hard_stop_id ?? null,
    resolution_type: resolutionType,
    user_decision_required: userDecisionRequired,
    user_response_quote: userQuote || undefined,
    reason: String(args['reason'] ?? ''),
    scope: String(args['scope'] ?? active.scope ?? 'work_item'),
    blocked_action_disposition: disposition ?? null,
    allowed_next_action: allowedNextAction ?? '',
    last_successful_step: lastSuccessfulStep ?? null,
    resume_from_step: resumeFromStep ?? null,
    retry_original_action: retryOriginalAction,
    safe_alternative_tool: safeAlternativeTool ?? null,
    evidence: Array.isArray(args['evidence']) ? args['evidence'] : [],
    original_hard_stop: active,
    authoritative_state_at_resolution: currentState,
    resolved_by: callerAgent,
    decision_source:
      userDecisionRequired || userQuote.length >= 8
        ? 'sf-orchestrator_user_context'
        : 'sf-orchestrator_system_safe_recovery',
  };

  fs.mkdirSync(wiDir, { recursive: true });
  fs.appendFileSync(
    path.join(wiDir, 'hard_stop_resolution.jsonl'),
    JSON.stringify(entry) + '\n',
    'utf-8'
  );

  let authorization: any = null;
  if (shouldInstallAuthorization(args as Record<string, unknown>)) {
    authorization = appendWriteGuardAuthorization(baseDir, {
      source_hard_stop_id: active.hard_stop_id ?? null,
      work_item_id: workItemId,
      authorization_type:
        optionalString(args as Record<string, unknown>, 'authorization_type') ??
        'user_accepted_external_ops',
      scope: optionalString(args as Record<string, unknown>, 'authorization_scope') ?? 'work_item',
      tool: optionalString(args as Record<string, unknown>, 'authorization_tool') ?? 'sf_safe_bash',
      intent:
        optionalString(args as Record<string, unknown>, 'authorization_intent') ??
        optionalString(args as Record<string, unknown>, 'intent'),
      command_family:
        optionalString(args as Record<string, unknown>, 'authorization_command_family') ??
        optionalString(args as Record<string, unknown>, 'command_family'),
      host_path_prefix:
        optionalString(args as Record<string, unknown>, 'authorization_host_path_prefix') ??
        optionalString(args as Record<string, unknown>, 'host_path_prefix'),
      container_targets:
        optionalStringArray(args as Record<string, unknown>, 'authorization_container_targets') ??
        optionalStringArray(args as Record<string, unknown>, 'container_targets'),
      image:
        optionalString(args as Record<string, unknown>, 'authorization_image') ??
        optionalString(args as Record<string, unknown>, 'image'),
      expires_when:
        optionalString(args as Record<string, unknown>, 'authorization_expires_when') ??
        'work_item_closed',
      user_response_quote: userQuote,
      reason: String(args['authorization_reason'] ?? args['reason'] ?? ''),
      created_by: callerAgent,
    });
  }

  const cleared = resetHardStop(baseDir, workItemId);

  return {
    success: cleared,
    work_item_id: workItemId,
    hard_stop_id: active.hard_stop_id ?? null,
    resolution_type: resolutionType,
    user_decision_required: userDecisionRequired,
    cleared,
    recovery_complete: cleared,
    resolution_log: path
      .relative(baseDir, path.join(wiDir, 'hard_stop_resolution.jsonl'))
      .replace(/\\/g, '/'),
    authorization_installed: authorization !== null,
    authorization,
    authorization_log: authorization
      ? path
          .relative(
            baseDir,
            path.join(
              baseDir,
              SPEC_DIR_NAME,
              'project',
              'policies',
              'write_guard_authorizations.jsonl'
            )
          )
          .replace(/\\/g, '/')
      : undefined,
    resume_context: cleared
      ? {
          authoritative_state: currentState,
          last_successful_step: lastSuccessfulStep ?? null,
          resume_from_step: resumeFromStep ?? null,
          allowed_next_action: allowedNextAction ?? null,
          retry_original_action: retryOriginalAction,
          safe_alternative_tool: safeAlternativeTool ?? null,
          must_revalidate_authoritative_state: true,
          must_recheck_prerequisites: true,
          must_not_repeat_completed_steps: true,
        }
      : undefined,
    message: cleared
      ? authorization
        ? 'HardStop resolved with explicit user authorization; original record preserved and resume context returned.'
        : 'HardStop resolved through a no-expansion recovery plan; original record preserved and resume context returned.'
      : 'Resolution record written, but the active HardStop latch could not be cleared.',
  };
});
