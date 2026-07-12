/**
 * sf-hard-stop-resolve.ts
 *
 * Structured user-visible hard_stop resolution tool.
 * It records a resolution entry under .specforge/work-items/<WI>/hard_stop_resolution.jsonl
 * before clearing the active hard_stop latch.
 *
 * v1.2.8: optionally installs a project-level write_guard_authorization when the
 * user chooses "authorize similar operations" instead of "resolve this attempt only".
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { registerHandler } from '../ToolDispatcher';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { resetHardStop } from '../lib/hard-stop-latch';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import { appendWriteGuardAuthorization } from '../lib/write-guard-authorization-log';

const VALID_RESOLUTION_TYPES = new Set([
  'false_positive',
  'scope_expanded',
  'user_authorized_retry',
  'repaired',
  'risk_accepted',
  'superseded',
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
  if (userQuote.length < 8) {
    return {
      success: false,
      error: 'USER_RESPONSE_QUOTE_REQUIRED',
      message: 'Resolving a hard_stop requires an explicit user quote / decision record.',
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

  const entry = {
    schema_version: '1.2.8',
    resolved_at: new Date().toISOString(),
    work_item_id: workItemId,
    hard_stop_id: active.hard_stop_id ?? null,
    resolution_type: resolutionType,
    user_response_quote: userQuote,
    reason: String(args['reason'] ?? ''),
    scope: String(args['scope'] ?? active.scope ?? 'work_item'),
    allowed_next_action: String(args['allowed_next_action'] ?? ''),
    evidence: Array.isArray(args['evidence']) ? args['evidence'] : [],
    original_hard_stop: active,
    resolved_by: callerAgent,
    decision_source: 'sf-orchestrator_user_context',
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
    cleared,
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
    message: cleared
      ? authorization
        ? 'hard_stop resolved and project-level write_guard authorization installed; original record preserved in hard_stop_resolution.jsonl'
        : 'hard_stop resolved by sf-orchestrator with structured decision evidence; original record preserved in hard_stop_resolution.jsonl'
      : 'resolution record written, but active hard_stop latch could not be cleared',
  };
});
