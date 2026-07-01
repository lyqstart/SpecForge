/**
 * code-permission-service-v11.ts — v1.2.2 hotfix
 *
 * Fix scope:
 * 1. Keep v1.2/v1.2.1 path normalization semantics.
 * 2. Releasing code permission while an implementation is already active now
 *    extends the existing allowed_write_files instead of overwriting them.
 *
 * This preserves the transaction boundary: only sf_code_permission may expand
 * implementation write scope, and .specforge governance paths are still rejected
 * by the handler before this service is called.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

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

export const DEFAULT_PERMISSION: PermissionState = {
  code_change_allowed: false,
  allowed_write_files: [],
};

function projectRootFromWorkItemDir(workItemDir: string): string {
  // /.specforge/work-items/<WI-ID>
  return path.resolve(workItemDir, '..', '..', '..');
}

function normalizeSlash(value: string): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

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
    if (!p) continue;
    result.push({ path: normalizeSlash(p), operation: normalizeOperation((entry as any)?.operation) });
  }

  return result;
}

function dedupePermissionEntries(
  entries: Array<{ path: string; operation: WriteOperation }>,
): Array<{ path: string; operation: WriteOperation }> {
  const seen = new Set<string>();
  const result: Array<{ path: string; operation: WriteOperation }> = [];

  for (const entry of entries) {
    const p = normalizeSlash(String(entry.path ?? '').trim());
    if (!p) continue;
    const operation = normalizeOperation(entry.operation);
    const key = `${p.toLowerCase()}\0${operation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ path: p, operation });
  }

  return result;
}

export function expandAllowedWriteFiles(
  workItemDir: string,
  entries: Array<{ path: string; operation: WriteOperation }>,
): Array<{ path: string; operation: WriteOperation }> {
  const projectRoot = projectRootFromWorkItemDir(workItemDir);
  const seen = new Set<string>();
  const result: Array<{ path: string; operation: WriteOperation }> = [];

  for (const entry of entries) {
    if (!entry || typeof entry.path !== 'string' || entry.path.trim() === '') continue;

    const op = normalizeOperation(entry.operation);
    const { relative, absolute } = canonicalPath(projectRoot, entry.path);

    // OpenCode write can be reported as either create or modify. If the
    // orchestrator authorizes a normal file write, allow both create and modify
    // for the same path. Delete remains delete-only.
    const operations: WriteOperation[] = op === 'delete' ? ['delete'] : ['create', 'modify'];

    for (const p of [relative, absolute]) {
      for (const operation of operations) {
        const key = `${p}\0${operation}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ path: p, operation });
      }
    }
  }

  return result;
}

export async function releaseCodePermission(input: ReleasePermissionInput): Promise<PermissionState> {
  const workItemJsonPath = path.join(input.workItemDir, 'work_item.json');
  const incomingAllowed = expandAllowedWriteFiles(input.workItemDir, input.allowedWriteFiles);

  try {
    const content = await fs.readFile(workItemJsonPath, 'utf-8');
    const wi = JSON.parse(content);

    const existingAllowed =
      wi.code_change_allowed === true && wi.code_permission_revoked !== true
        ? normalizePermissionEntries(wi.allowed_write_files)
        : [];

    const mergedAllowed = dedupePermissionEntries([...existingAllowed, ...incomingAllowed]);
    const releaseMode = existingAllowed.length > 0 ? 'extend' : 'release';
    const now = new Date().toISOString();

    wi.code_change_allowed = true;
    wi.code_permission_revoked = false;
    wi.allowed_write_files = mergedAllowed;
    wi.allowed_write_files_snapshot = mergedAllowed;
    wi.code_permission_last_release_mode = releaseMode;
    wi.code_permission_release_count = Number(wi.code_permission_release_count ?? 0) + 1;
    wi.allowed_write_files_history = Array.isArray(wi.allowed_write_files_history)
      ? wi.allowed_write_files_history
      : [];
    wi.allowed_write_files_history.push({
      timestamp: now,
      mode: releaseMode,
      incoming_count: incomingAllowed.length,
      previous_count: existingAllowed.length,
      total_count: mergedAllowed.length,
    });
    if (wi.allowed_write_files_history.length > 20) {
      wi.allowed_write_files_history = wi.allowed_write_files_history.slice(-20);
    }
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
    const content = await fs.readFile(workItemJsonPath, 'utf-8');
    const wi = JSON.parse(content);
    if (!Array.isArray(wi.allowed_write_files_snapshot) || wi.allowed_write_files_snapshot.length === 0) {
      wi.allowed_write_files_snapshot = Array.isArray(wi.allowed_write_files) ? wi.allowed_write_files : [];
    }
    wi.code_change_allowed = false;
    wi.allowed_write_files = [];
    wi.code_permission_revoked = true;
    wi.code_permission_revoked_at = wi.code_permission_revoked_at ?? new Date().toISOString();
    wi.updated_at = new Date().toISOString();
    await fs.writeFile(workItemJsonPath, JSON.stringify(wi, null, 2) + '\n', 'utf-8');
  } catch (err: any) {
    throw new Error(`Failed to revoke code permission: ${err.message}`);
  }
}

export async function checkCodePermission(workItemDir: string): Promise<PermissionState> {
  const workItemJsonPath = path.join(workItemDir, 'work_item.json');

  try {
    const content = await fs.readFile(workItemJsonPath, 'utf-8');
    const wi = JSON.parse(content);
    return {
      code_change_allowed: wi.code_change_allowed ?? false,
      allowed_write_files: Array.isArray(wi.allowed_write_files) ? wi.allowed_write_files : [],
    };
  } catch {
    return DEFAULT_PERMISSION;
  }
}
