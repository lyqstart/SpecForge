/** Code Permission service with frozen governance scope. */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  freezeGovernanceScopeForCodePermission,
  persistGovernanceScope,
} from './project-governance-v2.js';
export type WriteOperation = 'create' | 'modify' | 'delete';
export interface PermissionState {
  code_change_allowed: boolean;
  allowed_write_files: Array<{ path: string; operation: WriteOperation }>;
}
export interface ReleasePermissionInput {
  workItemDir: string;
  workItemId: string;
  allowedWriteFiles: Array<{ path: string; operation: WriteOperation }>;
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
  const workItemJsonPath = path.join(input.workItemDir, 'work_item.json');
  const projectRoot = projectRootFromWorkItemDir(input.workItemDir);
  const incomingAllowed = expandAllowedWriteFiles(input.workItemDir, input.allowedWriteFiles);
  try {
    const initial = JSON.parse(await fs.readFile(workItemJsonPath, 'utf-8'));
    const existingAllowed = initial.code_change_allowed === true && initial.code_permission_revoked !== true
      ? normalizePermissionEntries(initial.allowed_write_files) : [];
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
    const wi = JSON.parse(await fs.readFile(workItemJsonPath, 'utf-8'));
    const releaseMode = existingAllowed.length > 0 ? 'extend' : 'release';
    const now = new Date().toISOString();
    wi.code_change_allowed = true;
    wi.code_permission_revoked = false;
    wi.allowed_write_files = mergedAllowed;
    wi.allowed_write_files_snapshot = mergedAllowed;
    wi.code_permission_last_release_mode = releaseMode;
    wi.code_permission_release_count = Number(wi.code_permission_release_count ?? 0) + 1;
    wi.allowed_write_files_history = Array.isArray(wi.allowed_write_files_history) ? wi.allowed_write_files_history : [];
    wi.allowed_write_files_history.push({
      timestamp: now, mode: releaseMode, incoming_count: incomingAllowed.length,
      previous_count: existingAllowed.length, total_count: mergedAllowed.length,
    });
    if (wi.allowed_write_files_history.length > 20) wi.allowed_write_files_history = wi.allowed_write_files_history.slice(-20);
    wi.updated_at = now;
    await fs.writeFile(workItemJsonPath, JSON.stringify(wi, null, 2) + '\n', 'utf-8');
    return { code_change_allowed: true, allowed_write_files: mergedAllowed };
  } catch (err: any) {
    throw new Error(`Failed to release code permission: ${err.message}`);
  }
}
export async function revokeCodePermission(workItemDir: string): Promise<void> {
  const workItemJsonPath = path.join(workItemDir, 'work_item.json');
  try {
    const wi = JSON.parse(await fs.readFile(workItemJsonPath, 'utf-8'));
    applyRevokedPermissionFacts(wi, [], { recordRevocationEvent: true });
    await fs.writeFile(workItemJsonPath, JSON.stringify(wi, null, 2) + '\n', 'utf-8');
  } catch (err: any) {
    throw new Error(`Failed to revoke code permission: ${err.message}`);
  }
}
export async function checkCodePermission(workItemDir: string): Promise<PermissionState> {
  try {
    const wi = JSON.parse(await fs.readFile(path.join(workItemDir, 'work_item.json'), 'utf-8'));
    return { code_change_allowed: wi.code_change_allowed ?? false, allowed_write_files: Array.isArray(wi.allowed_write_files) ? wi.allowed_write_files : [] };
  } catch {
    return DEFAULT_PERMISSION;
  }
}
