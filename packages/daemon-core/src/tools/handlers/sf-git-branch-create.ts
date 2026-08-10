import { registerHandler } from '../ToolDispatcher';
import {
  createBranch,
  getCurrentBranch,
  getHeadCommit,
} from '../lib/git-governance-core';
import {
  assertClosedSpecMigrationExistingBranchRecoveryContext,
  isClosedSpecMigrationGitRecoveryRequired,
  verifyLegacyClosedSpecMigrationGitDeliveryRecovery,
} from '../lib/project-governance-v2.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

async function readJson(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function readAuthoritativeStateWithoutProjectionWrite(input: {
  deps: any;
  projectRoot: string;
  workItemId: string;
}): Promise<{ current_state: string | null }> {
  const projectManager = input.deps?.projectManager;
  if (!projectManager?.getProjectStateManager) {
    return { current_state: null };
  }

  const projectSm = await projectManager.getProjectStateManager(
    input.projectRoot,
  );
  if (typeof projectSm?.rebuildState === 'function') {
    await projectSm.rebuildState();
  }
  if (typeof projectSm?.getState !== 'function') {
    return { current_state: null };
  }

  const state = projectSm.getState(input.workItemId);
  return {
    current_state:
      state && typeof state.current_state === 'string'
        ? state.current_state
        : null,
  };
}

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
    const workItemDir = path.join(
      projectRoot,
      '.specforge',
      'work-items',
      workItemId,
    );
    const [state, workItem] = await Promise.all([
      readAuthoritativeStateWithoutProjectionWrite({ deps, projectRoot, workItemId }),
      readJson(path.join(workItemDir, 'work_item.json')),
    ]);
    const closedSpecMigration = isClosedSpecMigrationGitRecoveryRequired({
      currentState: state.current_state,
      workflowType: workItem?.workflow_type,
      workflowPath: workItem?.workflow_path,
    });

    if (closedSpecMigration && recoveryMode !== 'closed_spec_migration') {
      throw new Error('SPEC_MIGRATION_GIT_RECOVERY_MODE_REQUIRED');
    }

    if (recoveryMode && recoveryMode !== 'closed_spec_migration') {
      throw new Error(`UNSUPPORTED_BRANCH_RECOVERY_MODE: ${recoveryMode}`);
    }

    let recovery: Awaited<
      ReturnType<typeof verifyLegacyClosedSpecMigrationGitDeliveryRecovery>
    > | null = null;
    let reuseExistingContext = false;
    let recoveryBaseCommit = '';

    if (recoveryMode === 'closed_spec_migration') {
      if (!closedSpecMigration) {
        throw new Error(
          `SPEC_MIGRATION_GIT_RECOVERY_REQUIRES_CLOSED_SPEC_MIGRATION: state=${state.current_state ?? 'missing'} workflow=${workItem?.workflow_type ?? 'missing'}/${workItem?.workflow_path ?? 'missing'}`,
        );
      }

      const attemptId = String(args['reconcile_attempt_id'] || '').trim();
      if (!attemptId) {
        throw new Error('SPEC_MIGRATION_GIT_RECOVERY_ATTEMPT_REQUIRED');
      }

      const gitContextPath = path.join(workItemDir, 'git_context.json');
      const gitContext = await readJson(gitContextPath);
      const currentBranch = await getCurrentBranch(projectRoot);
      const headCommit = await getHeadCommit(projectRoot);

      if (gitContext) {
        recoveryBaseCommit =
          assertClosedSpecMigrationExistingBranchRecoveryContext({
            workItemId,
            requestedBranchName: branchName,
            requestedBaseBranch: baseBranch,
            currentBranch,
            headCommit,
            gitContext,
          });
        reuseExistingContext = true;
      } else {
        if (currentBranch !== baseBranch) {
          throw new Error(
            `SPEC_MIGRATION_GIT_RECOVERY_DEFAULT_BRANCH_REQUIRED: current=${currentBranch ?? 'missing'}`,
          );
        }
        if (!headCommit) {
          throw new Error('SPEC_MIGRATION_GIT_RECOVERY_BASE_COMMIT_REQUIRED');
        }
        recoveryBaseCommit = headCommit;
      }

      recovery = await verifyLegacyClosedSpecMigrationGitDeliveryRecovery({
        projectRoot,
        workItemId,
        attemptId,
        baseCommit: recoveryBaseCommit,
      });

      const recoveryPath = path.join(
        workItemDir,
        'git_delivery_recovery.json',
      );
      const existingRecovery = await readJson(recoveryPath);
      if (existingRecovery) {
        throw new Error(
          'SPEC_MIGRATION_GIT_RECOVERY_EVIDENCE_ALREADY_EXISTS',
        );
      }

      let created: any;
      if (reuseExistingContext) {
        created = {
          success: true,
          work_item_id: workItemId,
          branch_name: branchName,
          base_branch: baseBranch,
          base_commit: recoveryBaseCommit,
          git_context_path: path
            .relative(projectRoot, gitContextPath)
            .replace(/\\/g, '/'),
          message: 'existing_branch_and_git_context_reused',
          branch_created: false,
          git_context_reused: true,
        };
      } else {
        created = await createBranch({
          projectRoot,
          workItemId,
          branchName,
          baseBranch,
          requireClean: false,
        });
        created.branch_created = true;
        created.git_context_reused = false;
      }

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
        existing_branch_reused: reuseExistingContext,
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
    }

    return await createBranch({
      projectRoot,
      workItemId,
      branchName,
      baseBranch,
      requireClean: args['require_clean'] !== false,
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});
