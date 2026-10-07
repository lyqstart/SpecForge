import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getHandler, type ToolDeps } from '../../src/tools/ToolDispatcher';
import '../../src/tools/index';
import {
  checkFormalVersionEligibility,
  evaluateVersionControlMode,
  resolveVersionControlModeEvidence,
} from '../../src/tools/lib/project-governance-v2';

const execFileAsync = promisify(execFile);

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: root });
  return String(stdout ?? '').trim();
}

function deps(state = 'implementation_done'): ToolDeps {
  return {
    stateManager: {},
    workflowEngine: {},
    projectManager: {
      getProjectStateManager: async () => ({
        getState: async () => ({ current_state: state }),
      }),
    },
    eventLogger: {},
    eventBus: {},
    permissionEngine: {},
    cas: {},
    sessionRegistry: {},
  };
}

describe('legacy filesystem version-control mode recovery', () => {
  let projectRoot: string;
  let workItemDir: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-legacy-fs-mode-'));
    workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');
    await fs.mkdir(path.join(workItemDir, 'gates'), { recursive: true });
    await writeJson(path.join(workItemDir, 'work_item.json'), {
      schema_version: '1.1',
      work_item_id: 'WI-0001',
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
      code_change_allowed: true,
      allowed_write_files: [{ path: 'src/main.js', operation: 'create' }],
      allowed_write_files_snapshot: [{ path: 'src/main.js', operation: 'create' }],
    });
    await writeJson(path.join(workItemDir, 'filesystem_baseline.json'), {
      schema_version: '2.0',
      content_hash_algorithm: 'sha256',
      timestamp: '2026-10-07T00:00:00.000Z',
      root: projectRoot,
      files: [],
    });
    await writeJson(path.join(workItemDir, 'governance_scope.json'), {
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      active: false,
      affected_modules: [],
      allowed_write_files: ['src/main.js'],
      architecture_refs: [],
      data_model_refs: [],
      design_refs: [],
      project_contract_refs: [],
      module_contract_refs: [],
      project_spec_version: 'PSV-0002',
      impact_scope_hash: 'legacy-scope',
      frozen_at: '2026-10-07T00:00:00.000Z',
    });
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'src', 'main.js'), 'export const ready = true;\n');
    await git(projectRoot, ['init', '-b', 'main']);
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('fails closed before a controlled recovery instead of upgrading current Git into the legacy mode', async () => {
    const evidence = await resolveVersionControlModeEvidence({
      projectRoot,
      workItemDir,
      workItemId: 'WI-0001',
    });
    expect(evidence).toMatchObject({
      valid: false,
      mode: '',
      error: 'LEGACY_VERSION_CONTROL_MODE_RECOVERY_REQUIRED',
    });
    expect(
      evaluateVersionControlMode({
        frozenMode: evidence.mode,
        currentRepositoryPresent: true,
        currentRepositoryHead: '',
        workflowPath: 'requirement_change_path',
      }),
    ).toEqual({ mode: 'filesystem', git_required: false, stable: false });
  });

  it('records a hash-bound recovery and lets Formal Version stay on filesystem evidence', async () => {
    const handler = getHandler('sf_code_permission')!;
    const missingConfirmation = await handler(
      {
        work_item_id: 'WI-0001',
        action: 'recover_legacy_filesystem_mode',
        recovery_reason: 'The project was initialized as Git only after implementation completed.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(missingConfirmation).toMatchObject({
      success: false,
      error: 'LEGACY_FILESYSTEM_MODE_RECOVERY_CONFIRMATION_REQUIRED',
    });

    const recovered = await handler(
      {
        work_item_id: 'WI-0001',
        action: 'recover_legacy_filesystem_mode',
        confirm_legacy_filesystem_recovery: true,
        recovery_reason: 'The project was initialized as Git only after implementation completed.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(recovered).toMatchObject({
      success: true,
      recovered_version_control_mode: 'filesystem',
      idempotent: false,
      next_action: 'rerun_verification_gate_without_git_branch_or_checkpoint_commit',
    });

    const evidence = await resolveVersionControlModeEvidence({
      projectRoot,
      workItemDir,
      workItemId: 'WI-0001',
    });
    expect(evidence).toMatchObject({
      valid: true,
      mode: 'filesystem',
      source: 'legacy_filesystem_recovery',
      legacy_filesystem_recovery_applied: true,
    });
    expect(
      evaluateVersionControlMode({
        frozenMode: evidence.mode,
        currentRepositoryPresent: true,
        currentRepositoryHead: '',
        legacyFilesystemRecoveryApplied: evidence.legacy_filesystem_recovery_applied,
        workflowPath: 'requirement_change_path',
      }),
    ).toEqual({ mode: 'filesystem', git_required: false, stable: true });

    await writeJson(path.join(workItemDir, 'gates', 'verification_gate.json'), {
      gate_id: 'verification_gate',
      gate_type: 'hard_gate',
      status: 'passed',
    });
    await fs.writeFile(
      path.join(workItemDir, 'changed_files_audit.md'),
      `# Changed Files Audit

Contract: changed-files-audit/v1
Work Item: WI-0001

## Result: PASS

- Total files: 1
- In scope: 1
- Out of scope: 0
- Violations: 0
- Blocked write attempts: 0
- Unresolved blocked write attempts: 0

## Entries

- [create] src/main.js → in_scope
`,
      'utf8',
    );
    await writeJson(path.join(workItemDir, '.semantic_closure.json'), {
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      status: 'valid',
    });
    const formal = await checkFormalVersionEligibility({
      projectRoot,
      workItemDir,
      workItemId: 'WI-0001',
      workflowPath: 'requirement_change_path',
    });
    expect(
      formal.checks.find(check => check.check_id === 'formal_version_control_mode_evidence'),
    ).toMatchObject({ passed: true });
    expect(
      formal.checks.find(check => check.check_id === 'formal_repository_mode_stable'),
    ).toMatchObject({ passed: true });
    expect(
      formal.checks.find(check => check.check_id === 'formal_git_context'),
    ).toMatchObject({ passed: true });
    expect(formal.passed).toBe(true);

    const replay = await handler(
      {
        work_item_id: 'WI-0001',
        action: 'recover_legacy_filesystem_mode',
        confirm_legacy_filesystem_recovery: true,
        recovery_reason: 'The project was initialized as Git only after implementation completed.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(replay).toMatchObject({ success: true, idempotent: true });
  });

  it('rejects recovery outside implementation_done or after the late repository advances', async () => {
    const handler = getHandler('sf_code_permission')!;
    const wrongState = await handler(
      {
        work_item_id: 'WI-0001',
        action: 'recover_legacy_filesystem_mode',
        confirm_legacy_filesystem_recovery: true,
        recovery_reason: 'The project was initialized as Git only after implementation completed.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps('verification_running'),
    );
    expect(wrongState).toMatchObject({
      success: false,
      error: 'LEGACY_FILESYSTEM_MODE_RECOVERY_REQUIRES_IMPLEMENTATION_DONE',
    });

    await git(projectRoot, ['config', 'user.name', 'SpecForge Test']);
    await git(projectRoot, ['config', 'user.email', 'specforge-test@example.invalid']);
    await git(projectRoot, ['add', '--', 'src/main.js']);
    await git(projectRoot, ['commit', '-m', 'feat: illegitimate late commit']);
    const advanced = await handler(
      {
        work_item_id: 'WI-0001',
        action: 'recover_legacy_filesystem_mode',
        confirm_legacy_filesystem_recovery: true,
        recovery_reason: 'The project was initialized as Git only after implementation completed.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(advanced).toMatchObject({
      success: false,
      error: 'LEGACY_FILESYSTEM_MODE_REQUIRES_UNBORN_UNTRACKED_GIT',
    });
  });

  it('rejects source states that were already frozen, have Git context, or lack timeline proof', async () => {
    const handler = getHandler('sf_code_permission')!;
    const args = {
      work_item_id: 'WI-0001',
      action: 'recover_legacy_filesystem_mode',
      confirm_legacy_filesystem_recovery: true,
      recovery_reason: 'The project was initialized as Git only after implementation completed.',
    };

    const scopePath = path.join(workItemDir, 'governance_scope.json');
    const scope = JSON.parse(await fs.readFile(scopePath, 'utf8'));
    await writeJson(scopePath, { ...scope, version_control_mode: 'filesystem' });
    expect(
      await handler(args, { directory: projectRoot, agent: 'sf-orchestrator' }, deps()),
    ).toMatchObject({ success: false, error: 'VERSION_CONTROL_MODE_ALREADY_FROZEN' });

    await writeJson(scopePath, scope);
    await writeJson(path.join(workItemDir, 'git_context.json'), {
      git_enabled: true,
      branch_name: 'feature/late',
      base_commit: 'not-real',
    });
    expect(
      await handler(args, { directory: projectRoot, agent: 'sf-orchestrator' }, deps()),
    ).toMatchObject({ success: false, error: 'LEGACY_FILESYSTEM_MODE_GIT_CONTEXT_PRESENT' });

    await fs.rm(path.join(workItemDir, 'git_context.json'));
    const baselinePath = path.join(workItemDir, 'filesystem_baseline.json');
    const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
    await writeJson(baselinePath, { ...baseline, timestamp: '2999-01-01T00:00:00.000Z' });
    expect(
      await handler(args, { directory: projectRoot, agent: 'sf-orchestrator' }, deps()),
    ).toMatchObject({
      success: false,
      error: 'LEGACY_FILESYSTEM_MODE_LATE_GIT_TIMELINE_NOT_PROVEN',
    });
  });

  it('invalidates the recovery when its bound governance source drifts', async () => {
    const handler = getHandler('sf_code_permission')!;
    const recovered = await handler(
      {
        work_item_id: 'WI-0001',
        action: 'recover_legacy_filesystem_mode',
        confirm_legacy_filesystem_recovery: true,
        recovery_reason: 'The project was initialized as Git only after implementation completed.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(recovered).toMatchObject({ success: true });

    const scopePath = path.join(workItemDir, 'governance_scope.json');
    const scope = JSON.parse(await fs.readFile(scopePath, 'utf8'));
    await writeJson(scopePath, { ...scope, impact_scope_hash: 'changed-after-recovery' });
    await expect(
      resolveVersionControlModeEvidence({ projectRoot, workItemDir, workItemId: 'WI-0001' }),
    ).resolves.toMatchObject({
      valid: false,
      error: 'LEGACY_FILESYSTEM_MODE_RECOVERY_SOURCE_DRIFT',
    });
  });

  it('invalidates the recovery when the late repository gains tracked files', async () => {
    const handler = getHandler('sf_code_permission')!;
    const recovered = await handler(
      {
        work_item_id: 'WI-0001',
        action: 'recover_legacy_filesystem_mode',
        confirm_legacy_filesystem_recovery: true,
        recovery_reason: 'The project was initialized as Git only after implementation completed.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(recovered).toMatchObject({ success: true });

    await git(projectRoot, ['add', '--', 'src/main.js']);
    await expect(
      resolveVersionControlModeEvidence({ projectRoot, workItemDir, workItemId: 'WI-0001' }),
    ).resolves.toMatchObject({
      valid: false,
      error: 'LEGACY_FILESYSTEM_MODE_RECOVERY_GIT_REPOSITORY_ADVANCED',
    });
  });

  it('invalidates tampered recovery metadata and a replaced late Git identity', async () => {
    const handler = getHandler('sf_code_permission')!;
    const recovered = await handler(
      {
        work_item_id: 'WI-0001',
        action: 'recover_legacy_filesystem_mode',
        confirm_legacy_filesystem_recovery: true,
        recovery_reason: 'The project was initialized as Git only after implementation completed.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(recovered).toMatchObject({ success: true });

    const recoveryPath = path.join(workItemDir, 'version_control_mode_recovery.json');
    const recovery = JSON.parse(await fs.readFile(recoveryPath, 'utf8'));
    await writeJson(recoveryPath, {
      ...recovery,
      source: {
        ...recovery.source,
        governance_scope_frozen_at: '2000-01-01T00:00:00.000Z',
      },
    });
    await expect(
      resolveVersionControlModeEvidence({ projectRoot, workItemDir, workItemId: 'WI-0001' }),
    ).resolves.toMatchObject({
      valid: false,
      error: 'LEGACY_FILESYSTEM_MODE_RECOVERY_SOURCE_METADATA_MISMATCH',
    });

    await writeJson(recoveryPath, recovery);
    const changedGitIdentityTime = new Date(Date.now() + 60_000);
    await fs.utimes(
      path.join(projectRoot, '.git', 'HEAD'),
      changedGitIdentityTime,
      changedGitIdentityTime,
    );
    await expect(
      resolveVersionControlModeEvidence({ projectRoot, workItemDir, workItemId: 'WI-0001' }),
    ).resolves.toMatchObject({
      valid: false,
      error: 'LEGACY_FILESYSTEM_MODE_RECOVERY_GIT_IDENTITY_CHANGED',
    });
  });
});
