/**
 * sf-v11-code-permission — v1.2.2 hotfix
 *
 * Fix scope:
 * - Keep v1.2.1 governance checks.
 * - Add controlled scope extension actions: extend / append.
 * - release / enable also merge with an existing active permission set instead of
 *   silently replacing earlier phase authorizations.
 */
import { registerHandler } from '../ToolDispatcher';
import { releaseCodePermission, revokeCodePermission, checkCodePermission } from '../lib/code-permission-service-v11';
import { takeSnapshot, saveBaseline } from '../lib/filesystem-diff';
import { readAuthoritativeState, transitionWithEvidence } from '../lib/state-coordinator-v11';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import { guardHardStop, setHardStop } from '../lib/hard-stop-latch';

async function readJsonIfExists(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function parseSuccessfulCount(report: string): number {
  const match = report.match(/^-\s*Successful:\s*(\d+)\s*$/m) || report.match(/^Successful:\s*(\d+)\s*$/m);
  return match ? Number(match[1]) : 0;
}

function workflowTypeFromPath(workflowPath: string | undefined): string {
  switch (workflowPath) {
    case 'requirement_change_path':
      return 'feature_spec';
    case 'design_change_path':
      return 'design_change';
    case 'architecture_change_path':
      return 'architecture_change';
    case 'task_change_path':
      return 'task_change';
    case 'code_only_fast_path':
      return 'quick_change';
    case 'spec_migration_path':
      return 'spec_migration';
    case 'rollback_path':
      return 'rollback';
    default:
      return 'feature_spec';
  }
}

async function assertMergeSucceededBeforeCode(workItemDir: string): Promise<{
  workflowPath: string;
  workflowType: string;
  mergeReportStatus: 'not_applicable' | 'success';
}> {
  const workItem = await readJsonIfExists(path.join(workItemDir, 'work_item.json'));
  const workflowPath = String(workItem?.workflow_path ?? '');
  const workflowType = String(workItem?.workflow_type ?? workflowTypeFromPath(workflowPath));

  if (workflowPath === 'code_only_fast_path') {
    return { workflowPath, workflowType: 'quick_change', mergeReportStatus: 'not_applicable' };
  }

  const mergeReport = await readTextIfExists(path.join(workItemDir, 'merge_report.md'));
  if (!mergeReport) {
    throw new Error('MERGE_REPORT_REQUIRED_BEFORE_CODE_PERMISSION: non-code-only workflow must merge specs before enabling code writes');
  }
  if (!/^Status:\s*success\s*$/m.test(mergeReport)) {
    throw new Error('MERGE_SUCCESS_REQUIRED_BEFORE_CODE_PERMISSION: merge_report.md status is not success');
  }
  if (parseSuccessfulCount(mergeReport) <= 0) {
    throw new Error('MERGE_SUCCESSFUL_ENTRIES_REQUIRED_BEFORE_CODE_PERMISSION: merge_report.md has no successful merged entries');
  }

  return { workflowPath, workflowType, mergeReportStatus: 'success' };
}

async function advanceImplementationStateBeforeCode(input: {
  deps: any;
  context: any;
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  workflowPath: string;
  workflowType: string;
}): Promise<any> {
  const state = await readAuthoritativeState({
    deps: input.deps,
    projectRoot: input.projectRoot,
    workItemId: input.workItemId,
  });
  const current = state.current_state;

  if (
    current === 'implementation_running' ||
    current === 'implementation_done' ||
    current === 'verification_running' ||
    current === 'verification_done' ||
    current === 'closed'
  ) {
    return {
      attempted: true,
      advanced: false,
      reason: 'already_at_or_past_implementation_running',
      current_state: current,
    };
  }

  if (current !== 'merged' && current !== 'post_merge_verified' && current !== 'implementation_ready') {
    throw new Error(
      `POST_MERGE_VERIFIED_REQUIRED_BEFORE_CODE_PERMISSION: authoritative state is ${current ?? 'null'}, expected merged, post_merge_verified, or implementation_ready`,
    );
  }

  const steps: any[] = [];

  if (current === 'merged') {
    steps.push(
      await transitionWithEvidence({
        deps: input.deps,
        context: input.context,
        projectRoot: input.projectRoot,
        workItemId: input.workItemId,
        workItemDir: input.workItemDir,
        fromState: 'merged',
        toState: 'post_merge_verified',
        workflowType: input.workflowType,
        actorRole: 'code_permission_service',
        evidence: 'code_permission_service recovered code_only_fast_path after merge not_applicable before implementation',
        transitionContext: { source: 'sf_v11_code_permission', merge_not_applicable_recovery: true },
      }),
    );
  }

  if (current === 'post_merge_verified' || current === 'merged') {
    steps.push(
      await transitionWithEvidence({
        deps: input.deps,
        context: input.context,
        projectRoot: input.projectRoot,
        workItemId: input.workItemId,
        workItemDir: input.workItemDir,
        fromState: 'post_merge_verified',
        toState: 'implementation_ready',
        workflowType: input.workflowType,
        actorRole: 'code_permission_service',
        evidence: 'code_permission_service prepares implementation after post_merge_gate passed',
        transitionContext: { source: 'sf_v11_code_permission' },
      }),
    );
  }

  steps.push(
    await transitionWithEvidence({
      deps: input.deps,
      context: input.context,
      projectRoot: input.projectRoot,
      workItemId: input.workItemId,
      workItemDir: input.workItemDir,
      fromState: 'implementation_ready',
      toState: 'implementation_running',
      workflowType: input.workflowType,
      actorRole: 'code_permission_service',
      evidence: 'code_permission_service released write permission for implementation',
      transitionContext: { source: 'sf_v11_code_permission' },
    }),
  );

  return {
    attempted: true,
    advanced: true,
    from_state: current,
    to_state: 'implementation_running',
    transition_steps: steps,
  };
}

type NormalizedWriteOperation = 'create' | 'modify' | 'delete';

function normalizeWriteOperation(value: unknown): NormalizedWriteOperation {
  return value === 'create' || value === 'modify' || value === 'delete' ? value : 'modify';
}

function normalizeAllowedForPolicy(
  allowedWriteFiles: any[],
): Array<{ path: string; operation: NormalizedWriteOperation }> {
  return allowedWriteFiles.map((file) => {
    if (typeof file === 'string') return { path: file, operation: 'modify' };
    return { path: String(file?.path ?? ''), operation: normalizeWriteOperation(file?.operation) };
  });
}

function findForbiddenGovernanceTargets(allowedWriteFiles: any[]): string[] {
  return normalizeAllowedForPolicy(allowedWriteFiles)
    .map((file) => file.path.replace(/\\/g, '/'))
    .filter((p) => p === '.specforge' || p.startsWith('.specforge/') || p.includes('/.specforge/'));
}

function isReleaseLikeAction(action: string): boolean {
  return action === 'release' || action === 'enable' || action === 'extend' || action === 'append';
}

function normalizedReturnAction(action: string): string {
  if (action === 'append') return 'extend';
  if (action === 'enable') return 'release';
  return action;
}

registerHandler('sf_v11_code_permission', async (args, context, deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const action = String((args['action'] as string) || 'check');

  const idError = validateWorkItemId(workItemId);
  if (idError) return { success: false, error: idError };

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);

  if (action !== 'check' && action !== 'query') {
    const hardStopGuard = guardHardStop(projectRoot, workItemId, 'sf_v11_code_permission');
    if (!hardStopGuard.allowed) {
      return {
        success: false,
        error: hardStopGuard.error,
        hard_stop: true,
        hard_stop_record: hardStopGuard.hard_stop_record,
      };
    }
  }

  try {
    if (isReleaseLikeAction(action)) {
      const allowedWriteFiles = args['allowed_write_files'] as any[];
      if (!allowedWriteFiles || !Array.isArray(allowedWriteFiles) || allowedWriteFiles.length === 0) {
        setHardStop(projectRoot, workItemId, 'ALLOWED_WRITE_FILES_REQUIRED', 'sf_code_permission');
        return {
          success: false,
          error: 'ALLOWED_WRITE_FILES_REQUIRED',
          hard_stop: true,
          message:
            'sf_code_permission enable/extend requires allowed_write_files[] with at least one file path.\n' +
            'The orchestrator must extract target files from tasks.md before calling enable/extend.',
        };
      }

      const forbiddenGovernanceTargets = findForbiddenGovernanceTargets(allowedWriteFiles);
      if (forbiddenGovernanceTargets.length > 0) {
        return {
          success: false,
          error: 'ALLOWED_WRITE_FILES_MUST_NOT_INCLUDE_SPECFORGE_GOVERNANCE_PATHS',
          hard_stop: false,
          policy_violation: true,
          retry_allowed: true,
          forbidden_paths: forbiddenGovernanceTargets,
          message:
            'Implementation write permission can only include business/code files.\n' +
            '.specforge governance artifacts must be written by controlled workflow tools, not executors.',
        };
      }

      await fs.mkdir(workItemDir, { recursive: true });
      const wiJsonPath = path.join(workItemDir, 'work_item.json');
      try {
        await fs.access(wiJsonPath);
      } catch {
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
        await fs.writeFile(wiJsonPath, JSON.stringify(wiJson, null, 2) + '\n', 'utf-8');
      }

      const workflowFacts = await assertMergeSucceededBeforeCode(workItemDir);
      const stateAutoAdvance = await advanceImplementationStateBeforeCode({
        deps,
        context,
        projectRoot,
        workItemId,
        workItemDir,
        workflowPath: workflowFacts.workflowPath,
        workflowType: workflowFacts.workflowType || workflowTypeFromPath(workflowFacts.workflowPath),
      });

      if ((action === 'extend' || action === 'append') && stateAutoAdvance.current_state !== 'implementation_running') {
        return {
          success: false,
          error: 'CODE_PERMISSION_EXTEND_REQUIRES_IMPLEMENTATION_RUNNING',
          hard_stop: false,
          policy_violation: true,
          retry_allowed: false,
          current_state: stateAutoAdvance.current_state,
        };
      }

      const normalized = normalizeAllowedForPolicy(allowedWriteFiles);
      const state = await releaseCodePermission({ workItemDir, workItemId, allowedWriteFiles: normalized });

      try {
        const baseline = takeSnapshot(projectRoot);
        saveBaseline(workItemDir, baseline);
      } catch {
        // Non-critical: changed_files_audit can still fall back to write_guard_log.
      }

      return {
        success: true,
        action: normalizedReturnAction(action),
        work_item_id: workItemId,
        code_change_allowed: state.code_change_allowed,
        allowed_count: state.allowed_write_files.length,
        state_auto_advance: stateAutoAdvance,
      };
    }

    if (action === 'revoke') {
      await revokeCodePermission(workItemDir);
      return { success: true, action: 'revoke', work_item_id: workItemId, code_change_allowed: false };
    }

    const state = await checkCodePermission(workItemDir);
    return {
      success: true,
      action,
      work_item_id: workItemId,
      code_change_allowed: state.code_change_allowed,
      allowed_write_files: state.allowed_write_files,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
