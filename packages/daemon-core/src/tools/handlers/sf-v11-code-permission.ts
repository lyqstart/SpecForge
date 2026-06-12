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
    if (action === 'release') {
      const allowedWriteFiles = args['allowed_write_files'] as Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>;
      if (!allowedWriteFiles || !Array.isArray(allowedWriteFiles)) {
        return { success: false, error: 'allowed_write_files[] is required for release' };
      }

      const state = await releaseCodePermission({
        workItemDir,
        workItemId,
        allowedWriteFiles,
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

    // action === 'check'
    const state = await checkCodePermission(workItemDir);
    return {
      success: true,
      action: 'check',
      work_item_id: workItemId,
      code_change_allowed: state.code_change_allowed,
      allowed_write_files: state.allowed_write_files,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
