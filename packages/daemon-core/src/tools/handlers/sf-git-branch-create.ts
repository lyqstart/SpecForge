import { registerHandler } from '../ToolDispatcher';
import {
  createBranch,
  getCurrentBranch,
  getHeadCommit,
} from '../lib/git-governance-core';
import { readAuthoritativeState } from '../lib/state-coordinator-v11.js';
import {
  verifyLegacyClosedSpecMigrationGitDeliveryRecovery,
} from '../lib/project-governance-v2.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

registerHandler('sf_git_branch_create', async (args, context, deps) => {
  const projectRoot =
    (context?.directory as string) ||
    (context?.worktree as string) ||
    process.cwd();
  const workItemId = String(args['work_item_id'] || '').trim();
  const branchName = String(args['branch_name'] || '').trim();
  const confirmed = args['confirmed'] === true;
  const baseBranch = String(args['base_branch'] || 'main');
  const recoveryMode = String(args['recovery_mode'] || '').trim();

  if (!workItemId) return { success: false, error: 'work_item_id required' };
  if (!branchName) return { success: false, error: 'branch_name required' };
  if (!confirmed) {
    return {
      success: false,
      error: 'BRANCH_NAME_CONFIRMATION_REQUIRED',
      message:
        'branch_create requires confirmed=true after user confirms the semantic branch name',
      branch_name: branchName,
    };
  }

  try {
    let recovery: Awaited<
      ReturnType<typeof verifyLegacyClosedSpecMigrationGitDeliveryRecovery>
    > | null = null;

    if (recoveryMode) {
      if (recoveryMode !== 'closed_spec_migration') {
        throw new Error(`UNSUPPORTED_BRANCH_RECOVERY_MODE: ${recoveryMode}`);
      }
      const state = await readAuthoritativeState({
        deps,
        projectRoot,
        workItemId,
      });
      if (state.current_state !== 'closed') {
        throw new Error(
          `SPEC_MIGRATION_GIT_RECOVERY_REQUIRES_CLOSED: current=${state.current_state ?? 'missing'}`,
        );
      }
      const currentBranch = await getCurrentBranch(projectRoot);
      if (currentBranch !== baseBranch) {
        throw new Error(
          `SPEC_MIGRATION_GIT_RECOVERY_DEFAULT_BRANCH_REQUIRED: current=${currentBranch ?? 'missing'}`,
        );
      }
      const baseCommit = await getHeadCommit(projectRoot);
      if (!baseCommit) {
        throw new Error('SPEC_MIGRATION_GIT_RECOVERY_BASE_COMMIT_REQUIRED');
      }
      const attemptId = String(args['reconcile_attempt_id'] || '').trim();
      if (!attemptId) {
        throw new Error('SPEC_MIGRATION_GIT_RECOVERY_ATTEMPT_REQUIRED');
      }
      recovery = await verifyLegacyClosedSpecMigrationGitDeliveryRecovery({
        projectRoot,
        workItemId,
        attemptId,
        baseCommit,
      });
    }

    const created = await createBranch({
      projectRoot,
      workItemId,
      branchName,
      baseBranch,
      requireClean: recoveryMode ? false : args['require_clean'] !== false,
    });

    if (!recovery) return created;

    const recoveryPath = path.join(
      projectRoot,
      '.specforge',
      'work-items',
      workItemId,
      'git_delivery_recovery.json',
    );
    const evidence = {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_type: 'spec_migration',
      recovery_mode: 'closed_spec_migration',
      attempt_id: recovery.attempt_id,
      branch_name: created.branch_name,
      base_branch: created.base_branch,
      base_commit: created.base_commit,
      project_spec_files: recovery.project_spec_files,
      project_spec_git_diff_fingerprint:
        recovery.project_spec_git_diff_fingerprint,
      verified_at: new Date().toISOString(),
    };
    await fs.writeFile(
      recoveryPath,
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf-8',
    );

    return {
      ...created,
      recovery_mode: 'closed_spec_migration',
      recovery_validation: 'passed',
      recovery_evidence_path: path
        .relative(projectRoot, recoveryPath)
        .replace(/\\/g, '/'),
      project_spec_files: recovery.project_spec_files,
      project_spec_git_diff_fingerprint:
        recovery.project_spec_git_diff_fingerprint,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});
