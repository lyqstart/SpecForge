/**
 * code-permission-service-v11.ts — v1.1 标准 code_permission_service（§12）
 *
 * 依据：SpecForge 最终融合标准 v1.1
 *
 * code_permission 是控制代码写入的硬开关。
 * 只有 code_permission_service 可以释放和撤销权限。
 * 普通 Agent 不得自行修改 code_change_allowed。
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface PermissionState {
  code_change_allowed: boolean;
  allowed_write_files: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>;
}

export interface ReleasePermissionInput {
  workItemDir: string;
  workItemId: string;
  allowedWriteFiles: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>;
}

// ---------------------------------------------------------------------------
// §12.1 默认状态
// ---------------------------------------------------------------------------

export const DEFAULT_PERMISSION: PermissionState = {
  code_change_allowed: false,
  allowed_write_files: [],
};

// ---------------------------------------------------------------------------
// §12.2 释放主体
// ---------------------------------------------------------------------------

/**
 * 释放代码权限（§12.3）。
 * 调用前必须确保释放条件已满足。
 */
export async function releaseCodePermission(input: ReleasePermissionInput): Promise<PermissionState> {
  const workItemJsonPath = path.join(input.workItemDir, 'work_item.json');

  const newState: PermissionState = {
    code_change_allowed: true,
    allowed_write_files: input.allowedWriteFiles,
  };

  // 更新 work_item.json
  try {
    const content = await fs.readFile(workItemJsonPath, 'utf-8');
    const wi = JSON.parse(content);
    wi.code_change_allowed = true;
    wi.allowed_write_files = input.allowedWriteFiles;
    wi.updated_at = new Date().toISOString();
    await fs.writeFile(workItemJsonPath, JSON.stringify(wi, null, 2) + '\n', 'utf-8');
  } catch (err: any) {
    throw new Error(`Failed to release code permission: ${err.message}`);
  }

  return newState;
}

/**
 * 撤销代码权限（§12.4 — close_gate 前必须撤销）。
 */
export async function revokeCodePermission(workItemDir: string): Promise<void> {
  const workItemJsonPath = path.join(workItemDir, 'work_item.json');

  try {
    const content = await fs.readFile(workItemJsonPath, 'utf-8');
    const wi = JSON.parse(content);
    wi.code_change_allowed = false;
    wi.allowed_write_files = [];
    wi.updated_at = new Date().toISOString();
    await fs.writeFile(workItemJsonPath, JSON.stringify(wi, null, 2) + '\n', 'utf-8');
  } catch (err: any) {
    throw new Error(`Failed to revoke code permission: ${err.message}`);
  }
}

/**
 * 检查代码权限状态。
 */
export async function checkCodePermission(workItemDir: string): Promise<PermissionState> {
  const workItemJsonPath = path.join(workItemDir, 'work_item.json');

  try {
    const content = await fs.readFile(workItemJsonPath, 'utf-8');
    const wi = JSON.parse(content);
    return {
      code_change_allowed: wi.code_change_allowed ?? false,
      allowed_write_files: wi.allowed_write_files ?? [],
    };
  } catch {
    return DEFAULT_PERMISSION;
  }
}
