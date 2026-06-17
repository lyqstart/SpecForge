/**
 * hard-stop-latch.ts — v1.1 Hard Stop Latch Implementation
 *
 * When any SpecForge tool returns hard_stop=true, this module:
 * 1. Persists the blocked state to .specforge/work-items/<WI>/hard_stop.json
 * 2. Provides a query function to check blocked state
 * 3. Provides a guard function that rejects tool calls when WI is blocked
 *
 * The latch is one-way: once blocked, only explicit reset (admin action) can clear it.
 * This prevents Agent from ignoring hard_stop and continuing with subsequent tools.
 *
 * Persistence file: .specforge/work-items/<WI-ID>/hard_stop.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HardStopRecord {
  work_item_id: string;
  blocked: true;
  reason: string;
  source_tool: string;
  created_at: string;
}

export interface HardStopCheckResult {
  blocked: boolean;
  record: HardStopRecord | null;
}

export interface HardStopGuardResult {
  allowed: boolean;
  error?: string;
  hard_stop_record?: HardStopRecord;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HARD_STOP_FILENAME = 'hard_stop.json';

/**
 * Tools that are ALLOWED even when a WI is hard-stopped.
 * Only read/debug/reset tools — no write, no state progression, no audit, no close.
 */
const ALLOWED_TOOLS_WHEN_BLOCKED = new Set([
  'sf_state_read',
  'sf_context_build',
  'sf_continuity',
  'sf_cost_report',
  'sf_doctor',
  'sf_knowledge_base',
  'sf_knowledge_graph',
  'sf_knowledge_query',
  'sf_batch_verify',
  'sf_doc_lint',
  'sf_trace_matrix',
  // Allow querying code_permission status (read-only check action)
  // But NOT enable/release/revoke
]);

/**
 * Tools that MUST be blocked when a WI is hard-stopped.
 * This is the explicit deny list for write/progression/audit/close tools.
 */
const BLOCKED_TOOLS_WHEN_HARD_STOPPED = new Set([
  'sf_state_transition',
  'sf_artifact_write',
  'sf_safe_bash',
  'sf_changed_files_audit',
  'sf_close_gate',
  'sf_v11_code_permission',
  'sf_code_permission',
  'sf_v11_gate_run',
  'sf_gate_run',
  'sf_v11_merge',
  'sf_merge_run',
  'sf_v11_decision',
  'sf_user_decision_record',
  'sf_v11_handoff',
  'sf_v11_verification',
  'sf_v11_work_item_create',
  'sf_v11_extension',
  'sf_v11_rollback',
  'sf_v11_spec_migration',
]);

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Persist a hard_stop latch for a work item.
 * Once written, the WI is blocked until explicit admin reset.
 */
export function setHardStop(
  projectRoot: string,
  workItemId: string,
  reason: string,
  sourceTool: string,
): HardStopRecord {
  const wiDir = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);
  const hardStopPath = path.join(wiDir, HARD_STOP_FILENAME);

  const record: HardStopRecord = {
    work_item_id: workItemId,
    blocked: true,
    reason,
    source_tool: sourceTool,
    created_at: new Date().toISOString(),
  };

  // Ensure directory exists
  try {
    fs.mkdirSync(wiDir, { recursive: true });
  } catch { /* already exists */ }

  fs.writeFileSync(hardStopPath, JSON.stringify(record, null, 2) + '\n', 'utf-8');
  return record;
}

/**
 * Check if a work item is currently hard-stopped.
 */
export function checkHardStop(
  projectRoot: string,
  workItemId: string,
): HardStopCheckResult {
  const wiDir = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);
  const hardStopPath = path.join(wiDir, HARD_STOP_FILENAME);

  try {
    const content = fs.readFileSync(hardStopPath, 'utf-8');
    const record = JSON.parse(content) as HardStopRecord;
    if (record.blocked === true) {
      return { blocked: true, record };
    }
    return { blocked: false, record: null };
  } catch {
    return { blocked: false, record: null };
  }
}

/**
 * Guard function: check if a tool call should be blocked due to hard_stop.
 * Returns allowed=true if the tool can proceed, allowed=false if blocked.
 *
 * @param projectRoot - Project root directory
 * @param workItemId - Work item ID to check
 * @param toolName - The tool being invoked
 * @returns Guard result indicating whether the tool call is allowed
 */
export function guardHardStop(
  projectRoot: string,
  workItemId: string,
  toolName: string,
): HardStopGuardResult {
  // Normalize tool name for matching
  const normalizedTool = toolName.toLowerCase().replace(/-/g, '_');

  // Always allow safe read/debug tools regardless of state
  if (ALLOWED_TOOLS_WHEN_BLOCKED.has(normalizedTool) || ALLOWED_TOOLS_WHEN_BLOCKED.has(toolName)) {
    return { allowed: true };
  }

  // Check if WI is hard-stopped
  const { blocked, record } = checkHardStop(projectRoot, workItemId);

  if (!blocked) {
    return { allowed: true };
  }

  // WI is blocked — check if tool is in the explicitly blocked set
  // For safety, if a tool is NOT in allowed list and the WI is blocked, block it
  return {
    allowed: false,
    error: `HARD_STOP_ACTIVE: Work item ${workItemId} is blocked. ` +
      `Reason: ${record!.reason}. Source: ${record!.source_tool}. ` +
      `Only read/debug tools are allowed. This tool (${toolName}) is blocked.`,
    hard_stop_record: record!,
  };
}

/**
 * Reset a hard_stop latch (admin-only action).
 * This removes the hard_stop.json file.
 */
export function resetHardStop(
  projectRoot: string,
  workItemId: string,
): boolean {
  const wiDir = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);
  const hardStopPath = path.join(wiDir, HARD_STOP_FILENAME);

  try {
    fs.unlinkSync(hardStopPath);
    return true;
  } catch {
    return false;
  }
}
