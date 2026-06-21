/**
 * hard-stop-latch.ts — scoped Hard Stop latch implementation
 *
 * A hard_stop is a governance latch with an explicit scope.
 * Default scope is work_item: a hard_stop for WI-A must not block WI-B.
 * Project scope is reserved for true project-level runtime corruption.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

export type HardStopScope = 'work_item' | 'project';

export interface HardStopRecord {
  schema_version?: string;
  hard_stop_id?: string;
  scope?: HardStopScope;
  work_item_id: string;
  blocked: true;
  reason: string;
  source_tool: string;
  created_at: string;
  resolved?: boolean;
  resolved_at?: string;
  resolution_reason?: string;
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

const HARD_STOP_FILENAME = 'hard_stop.json';
const VALID_WI_ID = /^WI-(\d{3,4}|\d{8}-\d{4})$/;

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
  'sf_hard_stop_resolve',
]);

function normalizeToolName(toolName: string): string {
  return String(toolName ?? '').toLowerCase().replace(/-/g, '_');
}

function isValidWorkItemId(value: unknown): value is string {
  return typeof value === 'string' && VALID_WI_ID.test(value);
}

function workItemHardStopPath(projectRoot: string, workItemId: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId, HARD_STOP_FILENAME);
}

function projectHardStopPath(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, 'runtime', HARD_STOP_FILENAME);
}

function readHardStopFile(filePath: string): HardStopRecord | null {
  try {
    const record = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as HardStopRecord;
    if (record.blocked !== true) return null;
    if (record.resolved === true) return null;
    if (!isValidWorkItemId(record.work_item_id) && record.scope !== 'project') return null;
    return record;
  } catch {
    return null;
  }
}

export function setHardStop(
  projectRoot: string,
  workItemId: string,
  reason: string,
  sourceTool: string,
  scope: HardStopScope = 'work_item',
): HardStopRecord {
  if (scope !== 'project' && !isValidWorkItemId(workItemId)) {
    throw new Error('INVALID_WORK_ITEM_ID_FOR_HARD_STOP: hard_stop must not be persisted for empty or invalid work_item_id');
  }

  const record: HardStopRecord = {
    schema_version: '1.2',
    hard_stop_id: `HS-${Date.now()}`,
    scope,
    work_item_id: isValidWorkItemId(workItemId) ? workItemId : 'PROJECT',
    blocked: true,
    reason,
    source_tool: sourceTool,
    created_at: new Date().toISOString(),
    resolved: false,
  };

  const hardStopPath = scope === 'project'
    ? projectHardStopPath(projectRoot)
    : workItemHardStopPath(projectRoot, workItemId);

  fs.mkdirSync(path.dirname(hardStopPath), { recursive: true });
  fs.writeFileSync(hardStopPath, JSON.stringify(record, null, 2) + '\n', 'utf-8');
  return record;
}

export function checkHardStop(projectRoot: string, workItemId: string): HardStopCheckResult {
  const projectRecord = readHardStopFile(projectHardStopPath(projectRoot));
  if (projectRecord?.scope === 'project') {
    return { blocked: true, record: projectRecord };
  }

  if (!isValidWorkItemId(workItemId)) {
    return { blocked: false, record: null };
  }

  const wiRecord = readHardStopFile(workItemHardStopPath(projectRoot, workItemId));
  if (!wiRecord) return { blocked: false, record: null };

  const scope = wiRecord.scope ?? 'work_item';
  if (scope !== 'work_item') return { blocked: false, record: null };
  if (wiRecord.work_item_id !== workItemId) return { blocked: false, record: null };
  return { blocked: true, record: wiRecord };
}

export function guardHardStop(projectRoot: string, workItemId: string, toolName: string): HardStopGuardResult {
  const normalizedTool = normalizeToolName(toolName);
  if (ALLOWED_TOOLS_WHEN_BLOCKED.has(normalizedTool) || ALLOWED_TOOLS_WHEN_BLOCKED.has(toolName)) {
    return { allowed: true };
  }

  if (!isValidWorkItemId(workItemId)) {
    return { allowed: true };
  }

  const { blocked, record } = checkHardStop(projectRoot, workItemId);
  if (!blocked || !record) return { allowed: true };

  return {
    allowed: false,
    error:
      `HARD_STOP_ACTIVE: Work item ${workItemId} is blocked.\n` +
      `Scope: ${record.scope ?? 'work_item'}.\n` +
      `Reason: ${record.reason}. Source: ${record.source_tool}.\n` +
      `Only read/debug/recovery tools are allowed for this work item. Tool ${toolName} is blocked for ${workItemId}.`,
    hard_stop_record: record,
  };
}

export function resetHardStop(projectRoot: string, workItemId: string): boolean {
  if (!isValidWorkItemId(workItemId)) return false;
  try {
    fs.unlinkSync(workItemHardStopPath(projectRoot, workItemId));
    return true;
  } catch {
    return false;
  }
}

export function resetProjectHardStop(projectRoot: string): boolean {
  try {
    fs.unlinkSync(projectHardStopPath(projectRoot));
    return true;
  } catch {
    return false;
  }
}
