/**
 * hard-stop-latch.ts — scoped Hard Stop latch implementation
 *
 * A hard_stop is a governance latch with an explicit scope.
 * Default scope is work_item: a hard_stop for WI-A must not block WI-B.
 * Project scope is reserved for true project-level runtime corruption.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  HARD_STOP_SCHEMA_VERSION,
  SPEC_DIR_NAME,
  type HardStopRecord,
  type HardStopScope,
} from '@specforge/types';
import { createHardStopLatchSchemaDescriptor } from '@specforge/types/schema-contract';
import { isValidWorkItemId as isCanonicalWorkItemId } from './work-item-id-validator';

export type { HardStopRecord, HardStopScope } from '@specforge/types';

export interface HardStopMetadata {
  triggering_agent?: string;
  blocked_action?: string;
  blocked_target?: string;
  policy_code?: string;
  last_successful_step?: string;
  blocked_step?: string;
  resume_step?: string;
  retry_original_action?: boolean;
  safe_alternative_tool?: string;
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
const ALLOWED_TOOLS_WHEN_BLOCKED = new Set([
  'sf_state_read',
  'sf_doctor',
  'sf_knowledge_base',
  'sf_batch_verify',
  'sf_doc_lint',
  'sf_trace_matrix',
  'sf_hard_stop_resolve',
]);

function normalizeToolName(toolName: string): string {
  return String(toolName ?? '')
    .toLowerCase()
    .replace(/-/g, '_');
}

function isValidWorkItemId(value: unknown): value is string {
  return typeof value === 'string' && isCanonicalWorkItemId(value);
}

function workItemHardStopPath(projectRoot: string, workItemId: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId, HARD_STOP_FILENAME);
}

function projectHardStopPath(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, 'runtime', HARD_STOP_FILENAME);
}

function readHardStopFile(
  filePath: string,
  expectedWorkItemId: string,
  expectedScope: HardStopScope,
): HardStopRecord | null {
  if (!fs.existsSync(filePath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  } catch (error) {
    throw new Error(
      `HARD_STOP_CONTRACT_INVALID: FILE_PARSE_FAILED: ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const descriptor = createHardStopLatchSchemaDescriptor(expectedWorkItemId, expectedScope);
  if (!descriptor.validateCurrent(parsed)) {
    const observed = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).schema_version
      : undefined;
    const code = observed === HARD_STOP_SCHEMA_VERSION ? 'VALIDATION_FAILED' : 'SCHEMA_VERSION_MISMATCH';
    throw new Error(`HARD_STOP_CONTRACT_INVALID: ${code}: ${filePath}`);
  }
  return parsed as HardStopRecord;
}

export function setHardStop(
  projectRoot: string,
  workItemId: string,
  reason: string,
  sourceTool: string,
  scope: HardStopScope = 'work_item',
  metadata: HardStopMetadata = {}
): HardStopRecord {
  if (scope !== 'project' && !isValidWorkItemId(workItemId)) {
    throw new Error(
      'INVALID_WORK_ITEM_ID_FOR_HARD_STOP: hard_stop must not be persisted for empty or invalid work_item_id'
    );
  }

  const recordWorkItemId = scope === 'project' ? 'PROJECT' : workItemId;
  const hardStopPath =
    scope === 'project'
      ? projectHardStopPath(projectRoot)
      : workItemHardStopPath(projectRoot, workItemId);
  const existing = readHardStopFile(hardStopPath, recordWorkItemId, scope);
  if (existing) return existing;

  const record: HardStopRecord = {
    schema_version: HARD_STOP_SCHEMA_VERSION,
    hard_stop_id: `HS-${Date.now()}`,
    scope,
    work_item_id: recordWorkItemId,
    blocked: true,
    reason,
    source_tool: sourceTool,
    created_at: new Date().toISOString(),
    resolved: false,
    recovery_status: 'pending',
    ...metadata,
  };
  const descriptor = createHardStopLatchSchemaDescriptor(recordWorkItemId, scope);
  if (!descriptor.validateCurrent(record)) {
    throw new Error('HARD_STOP_CONTRACT_INVALID: GENERATED_RECORD_VALIDATION_FAILED');
  }

  fs.mkdirSync(path.dirname(hardStopPath), { recursive: true });
  try {
    fs.writeFileSync(hardStopPath, JSON.stringify(record, null, 2) + '\n', {
      encoding: 'utf-8',
      flag: 'wx',
    });
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      const concurrent = readHardStopFile(hardStopPath, recordWorkItemId, scope);
      if (concurrent) return concurrent;
    }
    throw error;
  }
}

export function readWorkItemHardStop(
  projectRoot: string,
  workItemId: string,
): HardStopRecord | null {
  if (!isValidWorkItemId(workItemId)) return null;
  return readHardStopFile(workItemHardStopPath(projectRoot, workItemId), workItemId, 'work_item');
}

export function checkHardStop(projectRoot: string, workItemId: string): HardStopCheckResult {
  const projectRecord = readHardStopFile(projectHardStopPath(projectRoot), 'PROJECT', 'project');
  if (projectRecord) {
    return { blocked: true, record: projectRecord };
  }

  if (!isValidWorkItemId(workItemId)) {
    return { blocked: false, record: null };
  }

  const wiRecord = readWorkItemHardStop(projectRoot, workItemId);
  if (!wiRecord) return { blocked: false, record: null };

  return { blocked: true, record: wiRecord };
}

export function guardHardStop(
  projectRoot: string,
  workItemId: string,
  toolName: string
): HardStopGuardResult {
  const normalizedTool = normalizeToolName(toolName);
  if (ALLOWED_TOOLS_WHEN_BLOCKED.has(normalizedTool) || ALLOWED_TOOLS_WHEN_BLOCKED.has(toolName)) {
    return { allowed: true };
  }

  // Project-scoped HardStop must also be enforced when a call has no WI context.
  // checkHardStop checks project scope before validating workItemId.
  const { blocked, record } = checkHardStop(projectRoot, workItemId);
  if (!blocked || !record) return { allowed: true };

  const projectScoped = record.scope === 'project';
  return {
    allowed: false,
    error: projectScoped
      ? `HARD_STOP_ACTIVE: Project is blocked.\n` +
        `Scope: project.\n` +
        `Reason: ${record.reason}. Source: ${record.source_tool}.\n` +
        `Only read/debug/recovery tools are allowed for this project. Tool ${toolName} is blocked.`
      : `HARD_STOP_ACTIVE: Work item ${workItemId} is blocked.\n` +
        `Scope: ${record.scope}.\n` +
        `Reason: ${record.reason}. Source: ${record.source_tool}.\n` +
        `Only read/debug/recovery tools are allowed for this work item. ` +
        `Tool ${toolName} is blocked for ${workItemId}.`,
    hard_stop_record: record,
  };
}

export function resetHardStop(projectRoot: string, workItemId: string): boolean {
  if (!isValidWorkItemId(workItemId)) return false;
  if (!readWorkItemHardStop(projectRoot, workItemId)) return false;
  try {
    fs.unlinkSync(workItemHardStopPath(projectRoot, workItemId));
    return true;
  } catch {
    return false;
  }
}

export function resetProjectHardStop(projectRoot: string): boolean {
  if (!readHardStopFile(projectHardStopPath(projectRoot), 'PROJECT', 'project')) return false;
  try {
    fs.unlinkSync(projectHardStopPath(projectRoot));
    return true;
  } catch {
    return false;
  }
}
