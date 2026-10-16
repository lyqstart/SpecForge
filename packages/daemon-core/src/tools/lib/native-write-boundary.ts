import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getHandler } from '../ToolDispatcher';
import { readAuthoritativeWorkItems } from './authoritative-work-items';
import { readWorkItemMetadata } from './work-item-metadata';
import { checkWrite } from './write-guard-v11';
import { isCandidateFrozenState } from './candidate-freeze-v11';
import { checkHardStop } from './hard-stop-latch';
import { appendWriteGuardLog } from './write-guard-log';

const NON_WRITING_TOOLS = new Set(['read', 'glob', 'grep', 'list', 'webfetch', 'websearch', 'codesearch', 'todowrite', 'todoread', 'question', 'task', 'skill', 'lsp']);

/** Native transport boundary. All file permission decisions stay with Permission Engine. */
export async function checkNativeTool(deps: any, projectRoot: string, tool: string, args: Record<string, unknown>) {
  if (NON_WRITING_TOOLS.has(tool) || (tool.startsWith('sf_') && getHandler(tool))) return { allowed: true };
  // An arbitrary program can write anywhere; a declared file list is not proof.
  // Route shells/patches/unknown tools through controlled execution, never guess.
  if (!['edit', 'write'].includes(tool)) {
    return { allowed: false, reason: 'NATIVE_TOOL_REQUIRES_CONTROLLED_EXECUTION: use sf_safe_bash or an approved SpecForge tool' };
  }
  if (!path.isAbsolute(projectRoot) || typeof args.filePath !== 'string' || !args.filePath) {
    return { allowed: false, reason: 'WRITE_TARGET_REQUIRED' };
  }
  const root = await fs.realpath(projectRoot);
  await deps.projectManager?.getProjectConfiguration?.(projectRoot);
  const absolute = path.resolve(root, args.filePath);
  const relative = path.relative(root, absolute).replace(/\\/g, '/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    return { allowed: false, reason: 'WRITE_OUTSIDE_PROJECT' };
  }
  // Reject symlink/junction ancestors, including the target itself.
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) return { allowed: false, reason: 'WRITE_SYMLINK_FORBIDDEN' }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const active = (await readAuthoritativeWorkItems(deps, projectRoot))
    .filter(item => !['closed', 'rejected', 'superseded'].includes(item.current_state));
  if (active.length !== 1) return { allowed: false, reason: 'UNAMBIGUOUS_ACTIVE_WORK_ITEM_REQUIRED' };
  const state = active[0];
  const wiDir = path.join(projectRoot, '.specforge', 'work-items', state.work_item_id);
  if (checkHardStop(projectRoot, state.work_item_id).blocked) return { allowed: false, reason: 'HARD_STOP_ACTIVE' };
  const wi = await readWorkItemMetadata(wiDir, state.work_item_id);
  const exists = await fs.lstat(absolute).then(() => true, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  const operation = exists ? 'modify' : 'create';
  const result = checkWrite({
    hasActiveWI: true, callerRole: 'agent', isFrozen: isCandidateFrozenState(state.current_state),
    workItem: { work_item_id: state.work_item_id, status: state.current_state,
      code_change_allowed: wi.code_change_allowed === true, code_permission_revoked: wi.code_permission_revoked === true,
      allowed_write_files: Array.isArray(wi.allowed_write_files) ? wi.allowed_write_files as any : [],
      workflow_path: typeof wi.workflow_path === 'string' ? wi.workflow_path : null },
  }, relative, operation);
  appendWriteGuardLog(wiDir, { timestamp: new Date().toISOString(), path: relative, operation,
    actor: 'agent', allowed: result.allowed, violations: result.violations, tool });
  return { ...result, reason: result.violations.join('; ') };
}
