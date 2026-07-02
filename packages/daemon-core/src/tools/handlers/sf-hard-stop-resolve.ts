/**
 * sf-hard-stop-resolve.ts
 *
 * Structured user-visible hard_stop resolution tool.
 * It does not delete evidence silently: it records a resolution entry under
 * .specforge/work-items/<WI>/hard_stop_resolution.jsonl before clearing the
 * active hard_stop latch.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { registerHandler } from '../ToolDispatcher';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { resetHardStop } from '../lib/hard-stop-latch';
import { validateWorkItemId } from '../lib/work-item-id-validator';

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

registerHandler('sf_hard_stop_resolve', async (args, context, _deps) => {
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
    return { success: false, error: 'NO_ACTIVE_HARD_STOP', work_item_id: workItemId, retry_allowed: true };
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
    schema_version: '1.2.5',
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
    resolved_by: String((context as any)?.agent ?? 'unknown'),
  };

  fs.mkdirSync(wiDir, { recursive: true });
  fs.appendFileSync(path.join(wiDir, 'hard_stop_resolution.jsonl'), JSON.stringify(entry) + '\n', 'utf-8');

  const cleared = resetHardStop(baseDir, workItemId);
  return {
    success: cleared,
    work_item_id: workItemId,
    hard_stop_id: active.hard_stop_id ?? null,
    resolution_type: resolutionType,
    cleared,
    resolution_log: path.relative(baseDir, path.join(wiDir, 'hard_stop_resolution.jsonl')).replace(/\\/g, '/'),
    message: cleared
      ? 'hard_stop resolved with structured user decision; original record preserved in hard_stop_resolution.jsonl'
      : 'resolution record written, but active hard_stop latch could not be cleared',
  };
});
