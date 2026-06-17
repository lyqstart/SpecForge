/**
 * code-permission-service-v11.ts — v1.1 code_permission_service（§12）
 *
 * R3:
 * - Normalize allowed_write_files so relative and absolute tool paths both match.
 * - Preserve a deterministic snapshot for audit.
 * - Plain string entries are treated as create_or_modify by materializing both create and modify rules.
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
  // <project>/.specforge/work-items/<WI>
  return path.resolve(workItemDir, '..', '..', '..');
}

function normalizeSlash(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function canonicalPath(projectRoot: string, value: string): { relative: string; absolute: string } {
  const raw = String(value ?? '').trim();
  const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(projectRoot, raw);
  let rel = path.relative(projectRoot, abs);
  if (!rel || rel === '') rel = path.basename(abs);
  rel = normalizeSlash(rel);
  const absNorm = normalizeSlash(abs);
  return { relative: rel, absolute: absNorm };
}

function normalizeOperation(value: unknown): WriteOperation {
  return value === 'create' || value === 'modify' || value === 'delete' ? value : 'modify';
}

function expandAllowedWriteFiles(
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

    // OpenCode write can be reported as either create or modify. If the orchestrator
    // authorizes a normal file write, allow both create and modify for the same path.
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
  const normalizedAllowed = expandAllowedWriteFiles(input.workItemDir, input.allowedWriteFiles);
  const newState: PermissionState = {
    code_change_allowed: true,
    allowed_write_files: normalizedAllowed,
  };

  try {
    const content = await fs.readFile(workItemJsonPath, 'utf-8');
    const wi = JSON.parse(content);
    wi.code_change_allowed = true;
    wi.allowed_write_files = normalizedAllowed;
    wi.allowed_write_files_snapshot = normalizedAllowed;
    wi.updated_at = new Date().toISOString();
    await fs.writeFile(workItemJsonPath, JSON.stringify(wi, null, 2) + '\n', 'utf-8');
  } catch (err: any) {
    throw new Error(`Failed to release code permission: ${err.message}`);
  }

  return newState;
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
