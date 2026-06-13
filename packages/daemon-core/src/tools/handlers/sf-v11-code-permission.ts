/**
 * sf-v11-code-permission — v1.1 code_permission_service handler
 *
 * 释放或撤销代码写入权限。
 */
import { registerHandler } from '../ToolDispatcher';
import { releaseCodePermission, revokeCodePermission, checkCodePermission } from '../lib/code-permission-service-v11';
import { takeSnapshot, saveBaseline } from '../lib/filesystem-diff';
import * as path from 'node:path';
import { validateWorkItemId } from '../lib/work-item-id-validator';

registerHandler('sf_v11_code_permission', async (args, context, deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const action = (args['action'] as string) || 'check';

  const idError = validateWorkItemId(workItemId);
  if (idError) {
    return { success: false, error: idError };
  }

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);

  try {
    if (action === 'release' || action === 'enable') {
      let allowedWriteFiles = args['allowed_write_files'] as Array<string | { path: string; operation: 'create' | 'modify' | 'delete' }>;
      if (!allowedWriteFiles || !Array.isArray(allowedWriteFiles) || allowedWriteFiles.length === 0) {
        return {
          success: false,
          error: 'ALLOWED_WRITE_FILES_REQUIRED',
          hard_stop: true,
          message: 'sf_code_permission enable requires allowed_write_files[] with at least one file path. The orchestrator must extract target files from tasks.md before calling enable.',
        };
      }

      // Normalize: accept both string[] and {path,operation}[]
      const normalized = allowedWriteFiles.map(f =>
        typeof f === 'string' ? { path: f, operation: 'modify' as const } : f
      );

      // Ensure WI directory and work_item.json exist
      const fsModule = await import('node:fs/promises');
      await fsModule.mkdir(workItemDir, { recursive: true });
      const wiJsonPath = path.join(workItemDir, 'work_item.json');
      try {
        await fsModule.access(wiJsonPath);
      } catch {
        // work_item.json doesn't exist — create it (orchestrator may have only used sf_state_transition)
        const wiJson = {
          schema_version: '1.0',
          work_item_id: workItemId,
          status: 'implementation_running',
          workflow_path: 'code_only_fast_path',
          code_change_allowed: false,
          allowed_write_files: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: 'sf-orchestrator',
        };
        await fsModule.writeFile(wiJsonPath, JSON.stringify(wiJson, null, 2) + '\n', 'utf-8');
      }

      const state = await releaseCodePermission({
        workItemDir,
        workItemId,
        allowedWriteFiles: normalized,
      });

      // Take filesystem baseline snapshot for close_gate audit
      try {
        const baseline = takeSnapshot(projectRoot);
        saveBaseline(workItemDir, baseline);
      } catch { /* non-critical — audit will fall back to write_guard_log only */ }

      return {
        success: true,
        action: 'release',
        work_item_id: workItemId,
        code_change_allowed: state.code_change_allowed,
        allowed_count: state.allowed_write_files.length,
      };
    }

    if (action === 'revoke') {
      await revokeCodePermission(workItemDir);
      return {
        success: true,
        action: 'revoke',
        work_item_id: workItemId,
        code_change_allowed: false,
      };
    }

    // action === 'check' or 'query'
    const state = await checkCodePermission(workItemDir);
    return {
      success: true,
      action: action,
      work_item_id: workItemId,
      code_change_allowed: state.code_change_allowed,
      allowed_write_files: state.allowed_write_files,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
