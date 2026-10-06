/** Code Permission service with frozen governance scope. */
import * as path from 'node:path';
import {
  freezeGovernanceScopeForCodePermission,
  persistGovernanceScope,
} from './project-governance-v2.js';
import { readWorkItemMetadata, writeWorkItemMetadata } from './work-item-metadata.js';
export type WriteOperation = 'create' | 'modify' | 'delete';
export interface PermissionState {
  code_change_allowed: boolean;
  allowed_write_files: Array<{ path: string; operation: WriteOperation }>;
  scope_revision?: Record<string, unknown>;
}
export interface ReleasePermissionInput {
  workItemDir: string;
  workItemId: string;
  allowedWriteFiles: Array<{ path: string; operation: WriteOperation }>;
  revisionReason?: string;
}
export interface ApplyRevokedPermissionFactsOptions {
  now?: string;
  recordRevocationEvent?: boolean;
}
export const DEFAULT_PERMISSION: PermissionState = { code_change_allowed: false, allowed_write_files: [] };
function projectRootFromWorkItemDir(workItemDir: string): string { return path.resolve(workItemDir, '..', '..', '..'); }
function normalizeSlash(value: string): string { return String(value ?? '').replace(/\\/g, '/').replace(/\/+/g, '/'); }
function canonicalPath(projectRoot: string, value: string): { relative: string; absolute: string } {
  const raw = String(value ?? '').trim();
  const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(projectRoot, raw);
  let rel = path.relative(projectRoot, abs);
  if (!rel || rel === '') rel = path.basename(abs);
  return { relative: normalizeSlash(rel), absolute: normalizeSlash(abs) };
}
function normalizeOperation(value: unknown): WriteOperation {
  return value === 'create' || value === 'modify' || value === 'delete' ? value : 'modify';
}
function normalizePermissionEntries(entries: unknown): Array<{ path: string; operation: WriteOperation }> {
  if (!Array.isArray(entries)) return [];
  const result: Array<{ path: string; operation: WriteOperation }> = [];
  for (const entry of entries) {
    if (typeof entry === 'string') {
      const p = entry.trim();
      if (p) result.push({ path: normalizeSlash(p), operation: 'modify' });
      continue;
    }
    const p = String((entry as any)?.path ?? '').trim();
    if (p) result.push({ path: normalizeSlash(p), operation: normalizeOperation((entry as any)?.operation) });
  }
  return result;
}
function dedupePermissionEntries(entries: Array<{ path: string; operation: WriteOperation }>): Array<{ path: string; operation: WriteOperation }> {
  const seen = new Set<string>();
  const result: Array<{ path: string; operation: WriteOperation }> = [];
  for (const entry of entries) {
    const p = normalizeSlash(String(entry.path ?? '').trim());
    if (!p) continue;
    const operation = normalizeOperation(entry.operation);
    const key = `${p.toLowerCase()}\0${operation}`;
    if (!seen.has(key)) { seen.add(key); result.push({ path: p, operation }); }
  }
  return result;
}
export function expandAllowedWriteFiles(workItemDir: string, entries: Array<{ path: string; operation: WriteOperation }>): Array<{ path: string; operation: WriteOperation }> {
  const projectRoot = projectRootFromWorkItemDir(workItemDir);
  const seen = new Set<string>();
  const result: Array<{ path: string; operation: WriteOperation }> = [];
  for (const entry of entries) {
    if (!entry || typeof entry.path !== 'string' || entry.path.trim() === '') continue;
    const op = normalizeOperation(entry.operation);
    const { relative, absolute } = canonicalPath(projectRoot, entry.path);
    const operations: WriteOperation[] = op === 'delete' ? ['delete'] : ['create', 'modify'];
    for (const p of [relative, absolute]) {
      for (const operation of operations) {
        const key = `${p}\0${operation}`;
        if (!seen.has(key)) { seen.add(key); result.push({ path: p, operation }); }
      }
    }
  }
  return result;
}
export function applyRevokedPermissionFacts(
  workItem: Record<string, any>,
  fallbackAllowedWriteFilesSnapshot: Array<{ path: string; operation: string }> = [],
  options: ApplyRevokedPermissionFactsOptions = {},
): Record<string, any> {
  const now = options.now ?? new Date().toISOString();
  const existingSnapshot = Array.isArray(workItem.allowed_write_files_snapshot)
    ? workItem.allowed_write_files_snapshot
    : [];
  const currentAllowed = Array.isArray(workItem.allowed_write_files)
    ? workItem.allowed_write_files
    : [];
  if (existingSnapshot.length === 0) {
    workItem.allowed_write_files_snapshot = currentAllowed.length > 0
      ? currentAllowed
      : fallbackAllowedWriteFilesSnapshot.map(entry => ({
          path: entry.path,
          operation: normalizeOperation(entry.operation),
        }));
  }
  workItem.code_change_allowed = false;
  workItem.allowed_write_files = [];
  workItem.code_permission_revoked = true;
  if (options.recordRevocationEvent !== false || !workItem.code_permission_revoked_at) {
    workItem.code_permission_revoked_at = now;
  }
  workItem.updated_at = now;
  return workItem;
}
export async function releaseCodePermission(input: ReleasePermissionInput): Promise<PermissionState> {
  const projectRoot = projectRootFromWorkItemDir(input.workItemDir);
  const requestedAllowed = normalizePermissionEntries(input.allowedWriteFiles);
  const incomingAllowed = expandAllowedWriteFiles(input.workItemDir, input.allowedWriteFiles);
  try {
    const initial = await readWorkItemMetadata(input.workItemDir, input.workItemId);
    const existingAllowed = initial.code_change_allowed === true && initial.code_permission_revoked !== true
      ? normalizePermissionEntries(initial.allowed_write_files) : [];
    const releaseMode = existingAllowed.length > 0 ? 'extend' : 'release';
    const revisionReason = String(input.revisionReason ?? '').trim();
    if (releaseMode === 'extend' && revisionReason.length < 8) {
      throw new Error('SCOPE_REVISION_REASON_REQUIRED');
    }
    const mergedAllowed = dedupePermissionEntries([...existingAllowed, ...incomingAllowed]);
    const frozen = await freezeGovernanceScopeForCodePermission({
      projectRoot,
      workItemDir: input.workItemDir,
      workItemId: input.workItemId,
      allowedWriteFiles: mergedAllowed,
    });
    if (!frozen.passed) {
      throw new Error(`${frozen.error ?? 'SCOPE_EXPANSION_REQUIRED'}: ${frozen.checks.filter(check => !check.passed).map(check => check.description).join('; ')}`);
    }
    await persistGovernanceScope(input.workItemDir, frozen.snapshot);
    const wi = await readWorkItemMetadata(input.workItemDir, input.workItemId);
    const now = new Date().toISOString();
    wi.code_change_allowed = true;
    wi.code_permission_revoked = false;
    wi.allowed_write_files = mergedAllowed;
    wi.allowed_write_files_snapshot = mergedAllowed;
    wi.code_permission_last_release_mode = releaseMode;
    wi.code_permission_release_count = Number(wi.code_permission_release_count ?? 0) + 1;
    const history: Array<Record<string, unknown>> = Array.isArray(wi.allowed_write_files_history)
      ? wi.allowed_write_files_history.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry),
      )
      : [];
    history.push({
      timestamp: now, mode: releaseMode, incoming_count: incomingAllowed.length,
      previous_count: existingAllowed.length, total_count: mergedAllowed.length,
      incoming_allowed_write_files: incomingAllowed,
      requested_allowed_write_files: requestedAllowed,
      effective_allowed_write_files: mergedAllowed,
      ...(releaseMode === 'extend' ? { revision_reason: revisionReason } : {}),
    });
    wi.allowed_write_files_history = history.length > 20 ? history.slice(-20) : history;
    let scopeRevision: Record<string, unknown> | undefined;
    if (releaseMode === 'extend') {
      const revisions: Array<Record<string, unknown>> = Array.isArray(wi.scope_revision_history)
        ? wi.scope_revision_history.filter(
            (entry): entry is Record<string, unknown> =>
              typeof entry === 'object' && entry !== null && !Array.isArray(entry),
          )
        : [];
      scopeRevision = {
        schema_version: 'planned-scope-revision/v1',
        revision_id: `SR-${input.workItemId}-${String(revisions.length + 1).padStart(4, '0')}`,
        revised_at: now,
        reason: revisionReason,
        producer: 'sf_code_permission',
        previous_allowed_write_files: existingAllowed,
        added_allowed_write_files: requestedAllowed,
        effective_allowed_write_files: mergedAllowed,
        governance_scope: 'governance_scope.json',
      };
      revisions.push(scopeRevision);
      wi.scope_revision_history = revisions;
    }
    wi.updated_at = now;
    await writeWorkItemMetadata(input.workItemDir, input.workItemId, wi);
    return {
      code_change_allowed: true,
      allowed_write_files: mergedAllowed,
      ...(scopeRevision ? { scope_revision: scopeRevision } : {}),
    };
  } catch (err: any) {
    throw new Error(`Failed to release code permission: ${err.message}`);
  }
}
export async function revokeCodePermission(workItemDir: string): Promise<void> {
  const workItemId = path.basename(workItemDir);
  try {
    const wi = await readWorkItemMetadata(workItemDir, workItemId);
    applyRevokedPermissionFacts(wi, [], { recordRevocationEvent: true });
    await writeWorkItemMetadata(workItemDir, workItemId, wi);
  } catch (err: any) {
    throw new Error(`Failed to revoke code permission: ${err.message}`);
  }
}
export async function checkCodePermission(workItemDir: string): Promise<PermissionState> {
  try {
    const wi = await readWorkItemMetadata(workItemDir, path.basename(workItemDir));
    return {
      code_change_allowed: wi.code_change_allowed === true,
      allowed_write_files: normalizePermissionEntries(wi.allowed_write_files),
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('WORK_ITEM_NOT_FOUND:')) {
      return DEFAULT_PERMISSION;
    }
    throw error;
  }
}
