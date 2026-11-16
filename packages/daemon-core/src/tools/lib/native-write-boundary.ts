import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getHandler } from '../ToolDispatcher';
import { readAuthoritativeWorkItems } from './authoritative-work-items';
import { readWorkItemMetadata } from './work-item-metadata';
import { checkWrite } from './write-guard-v11';
import { isCandidateFrozenState } from './candidate-freeze-v11';
import { checkHardStop, isHardStopRecoveryTool } from './hard-stop-latch';
import { appendWriteGuardLog } from './write-guard-log';
import { isControlledHttpTool } from './controlled-http-tools';
import {
  RequiredVerificationOwner,
  type RequiredVerificationOwnerDependencies,
} from './required-verification-owner';
import { withGateOperationBarrier } from './gate-operation-barrier';
import { isRequiredVerificationReadOnlyCall } from './required-verification-consumer';
import {
  checkGovernanceRefusalStop,
  type GovernanceStopDependencies,
} from './governance-refusal-stop';

const NON_WRITING_TOOLS = new Set([
  'read',
  'glob',
  'grep',
  'list',
  'webfetch',
  'websearch',
  'codesearch',
  'todowrite',
  'todoread',
  'question',
  'task',
  'skill',
  'lsp',
]);

/** Native transport boundary. All file permission decisions stay with Permission Engine. */
export async function checkNativeTool(
  deps: any,
  projectRoot: string,
  tool: string,
  args: Record<string, unknown>,
  invocation?: { sessionID?: string; callID?: string }
) {
  const terminalStop = await checkGovernanceRefusalStop(
    deps as GovernanceStopDependencies,
    projectRoot,
    tool,
    args,
    invocation
  );
  if (!terminalStop.allowed) return terminalStop;
  if (
    !isHardStopRecoveryTool(tool) &&
    !isRequiredVerificationReadOnlyCall(tool, args) &&
    (tool === 'task' || tool.startsWith('sf_') || tool === 'edit' || tool === 'write')
  ) {
    if (typeof invocation?.sessionID !== 'string' || typeof invocation?.callID !== 'string')
      return { allowed: false, reason: 'REQUIRED_VERIFICATION_SOURCE_IDENTITY_REQUIRED' };
    const input = {
      sessionId: invocation.sessionID,
      callId: invocation.callID,
      directory: projectRoot,
      tool,
      args,
    };
    try {
      const capture = () =>
        new RequiredVerificationOwner(deps as RequiredVerificationOwnerDependencies).captureSource(
          projectRoot,
          input
        );
      const result = await withGateOperationBarrier(
        projectRoot,
        'sf_required_verification_capture',
        false,
        () =>
          deps.projectManager?.withProjectOperation
            ? deps.projectManager.withProjectOperation(projectRoot, capture)
            : capture()
      );
      if (result && typeof result === 'object' && 'success' in result && result.success === false)
        return {
          allowed: false,
          reason:
            'error' in result && typeof result.error === 'string'
              ? result.error
              : 'REQUIRED_VERIFICATION_CAPTURE_UNAVAILABLE',
        };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return {
        allowed: false,
        reason: /^[A-Z0-9_]{1,128}$/.test(message)
          ? message
          : 'REQUIRED_VERIFICATION_SOURCE_UNAVAILABLE',
      };
    }
  }
  if (
    NON_WRITING_TOOLS.has(tool) ||
    isControlledHttpTool(tool) ||
    (tool.startsWith('sf_') && getHandler(tool))
  )
    return { allowed: true };
  // An arbitrary program can write anywhere; a declared file list is not proof.
  // Route shells/patches/unknown tools through controlled execution, never guess.
  if (!['edit', 'write'].includes(tool)) {
    return {
      allowed: false,
      reason:
        'NATIVE_TOOL_REQUIRES_CONTROLLED_EXECUTION: sf_safe_bash supports internal reads only; verification requires the approved sf_verification_plan / sf_verification_run path and platform/profile. Scripts, builds and tests were not executed; do not retry through a shell or helper.',
    };
  }
  return checkNativeWritePermission(deps, projectRoot, tool, args);
}

/** Permission query only: it cannot authorize or execute a host invocation.
 * The real before-tool boundary must independently capture its source first. */
export async function checkNativeWritePermission(
  deps: any,
  projectRoot: string,
  tool: string,
  args: Record<string, unknown>
) {
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
    try {
      if ((await fs.lstat(cursor)).isSymbolicLink())
        return { allowed: false, reason: 'WRITE_SYMLINK_FORBIDDEN' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const active = (await readAuthoritativeWorkItems(deps, projectRoot)).filter(
    item => !['closed', 'rejected', 'superseded'].includes(item.current_state)
  );
  if (active.length !== 1)
    return { allowed: false, reason: 'UNAMBIGUOUS_ACTIVE_WORK_ITEM_REQUIRED' };
  const state = active[0];
  const wiDir = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', state.work_item_id);
  if (checkHardStop(projectRoot, state.work_item_id).blocked)
    return { allowed: false, reason: 'HARD_STOP_ACTIVE' };
  const wi = await readWorkItemMetadata(wiDir, state.work_item_id);
  const targetStat = await fs.lstat(absolute).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const operation = targetStat ? 'modify' : 'create';
  // A permitted pathname does not authorize other names for the same inode.
  // Do not inspect or edit those aliases: reject before the host can write.
  const result =
    targetStat?.isFile() && targetStat.nlink !== 1
      ? { allowed: false, violations: ['WRITE_HARDLINK_FORBIDDEN'] }
      : checkWrite(
          {
            hasActiveWI: true,
            callerRole: 'agent',
            isFrozen: isCandidateFrozenState(state.current_state),
            workItem: {
              work_item_id: state.work_item_id,
              status: state.current_state,
              code_change_allowed: wi.code_change_allowed === true,
              code_permission_revoked: wi.code_permission_revoked === true,
              allowed_write_files: Array.isArray(wi.allowed_write_files)
                ? (wi.allowed_write_files as any)
                : [],
              workflow_path: typeof wi.workflow_path === 'string' ? wi.workflow_path : null,
            },
          },
          relative,
          operation
        );
  appendWriteGuardLog(wiDir, {
    timestamp: new Date().toISOString(),
    path: relative,
    operation,
    actor: 'agent',
    allowed: result.allowed,
    violations: result.violations,
    tool,
  });
  return { ...result, reason: result.violations.join('; ') };
}
