import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import '../../src/tools/handlers/sf-v11-close-gate.js';
import { getHandler } from '../../src/tools/ToolDispatcher.js';
import { isValidV11TransitionForWorkflow } from '../../src/tools/lib/state-machine-v11.js';
import { recordUserDecision } from '../../src/tools/lib/user-decision-recorder-v11.js';
import { verifyRecoveryArchive } from '../../src/tools/lib/invalid-merged-spec-closure-recovery.js';

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeText(filePath, JSON.stringify(value, null, 2) + '\n');
}

function createStateDeps(initialState = 'closed', rejectTransition = false) {
  let currentState = initialState;
  const transitions: Array<{ from: string; to: string; payload: any }> = [];
  return {
    transitions,
    projectManager: {
      getProjectStateManager: async () => ({
        rebuildFromEventsFile: async () => undefined,
        getState: async () => ({ current_state: currentState }),
        transition: async (
          _workItemId: string,
          from: string,
          to: string,
          _actor: string,
          _workflowType: string,
          payload: any,
        ) => {
          if (rejectTransition) throw new Error('synthetic transition failure');
          transitions.push({ from, to, payload });
          currentState = to;
          return { timestamp: '2026-10-12T00:00:00.000Z' };
        },
      }),
    },
  };
}

async function createMergedClosedFixture(input: {
  projectRoot: string;
  invalidGovernance?: boolean;
  currentOwner?: string;
  coreVersionDrift?: boolean;
}): Promise<{ workItemId: string; workItemDir: string }> {
  const workItemId = 'WI-0001';
  const workItemDir = path.join(input.projectRoot, '.specforge', 'work-items', workItemId);
  const projectDir = path.join(input.projectRoot, '.specforge', 'project');

  await writeJson(path.join(workItemDir, 'work_item.json'), {
    schema_version: '1.1',
    work_item_id: workItemId,
    workflow_type: 'feature_spec',
    workflow_path: 'requirement_change_path',
    code_change_allowed: false,
    code_permission_revoked: true,
    allowed_write_files: [],
  });
  await writeText(path.join(workItemDir, 'candidates', 'architecture.md'), '# Candidate\n');
  await writeJson(path.join(workItemDir, 'candidate_manifest.json'), {
    schema_version: '1.1',
    work_item_id: workItemId,
    workflow_path: 'requirement_change_path',
    base_spec_version: 'PSV-0001',
    merge_required: true,
    entries: [
      {
        candidate_path: 'candidates/architecture.md',
        target_path: '.specforge/project/architecture.md',
        operation: 'replace',
      },
    ],
  });
  await writeText(path.join(workItemDir, 'gate_summary.md'), '# Gate Summary\n\n- Overall Status: passed\n');
  await recordUserDecision({
    workItemDir,
    workItemId,
    workflowPath: 'requirement_change_path',
    baseSpecVersion: 'PSV-0001',
    candidateManifestPath: 'candidate_manifest.json',
    gateSummaryPath: 'gate_summary.md',
    decisionStatus: 'approved',
    decisionType: 'user_approved',
    decidedBy: 'user',
    decisionScope: 'full',
    recordedBy: 'sf-orchestrator',
    userResponseQuote: '批准该 Candidate',
  });
  await writeText(
    path.join(workItemDir, 'merge_report.md'),
    [
      '# Merge Report',
      '',
      'Contract: merge-report/v1',
      `Work Item: ${workItemId}`,
      'Status: success',
      '',
      '## Summary',
      '- Total entries: 1',
      '- Successful: 1',
      '- Failed: 0',
      '- Spec Manifest Updated: true',
      '- Project Spec Version: PSV-0002',
      '',
      '## Merged Files',
      '| Status | Operation | Candidate | Target | Hash Match |',
      '|---|---|---|---|---|',
      '| success | replace | candidates/architecture.md | .specforge/project/architecture.md | true |',
      '',
    ].join('\n'),
  );
  await writeJson(path.join(workItemDir, 'gates', 'close_gate.json'), {
    gate_id: 'close_gate',
    status: 'passed',
  });
  await writeJson(path.join(workItemDir, 'gates', 'formal_version_gate.json'), {
    gate_id: 'formal_version_gate',
    status: 'passed',
  });
  await writeText(path.join(workItemDir, 'verification_report.md'), '# Verification\nPassed\n');
  await writeText(path.join(workItemDir, 'close_gate.md'), '# Close Gate Evidence\nPassed\n');

  await writeJson(path.join(projectDir, 'spec_manifest.json'), {
    schema_version: '1.0',
    project_spec_version: 'PSV-0002',
    last_merged_work_item: input.currentOwner ?? workItemId,
    ...(input.invalidGovernance === false
      ? { project: {}, modules: [] }
      : {
          default_module: 'CORE',
          project: {
            architecture: '.specforge/project/architecture.md',
            data_model: '.specforge/project/data_model.md',
            extension_registry: '.specforge/project/extension_registry.json',
            trace_matrix: '.specforge/project/trace_matrix.md',
          },
          modules: [
            {
              module_code: 'CORE',
              module_file: '.specforge/project/modules/CORE/module.json',
              design: '.specforge/project/modules/CORE/design.md',
              contracts: '.specforge/project/modules/CORE/contracts.json',
              trace: '.specforge/project/modules/CORE/trace.md',
              code_paths: ['src/**'],
            },
          ],
        }),
  });
  await writeJson(path.join(projectDir, 'extension_registry.json'), {
    schema_version: '1.0',
    project_spec_version: input.coreVersionDrift ? 'PSV-0001' : 'PSV-0002',
  });
  await writeText(
    path.join(projectDir, 'architecture.md'),
    input.invalidGovernance === false ? '# Architecture\n' : '# Architecture\nARCH-WEB-BOARD-001\n',
  );
  await writeText(
    path.join(projectDir, 'data_model.md'),
    input.invalidGovernance === false ? '# Data\n' : '# Data\nDATA-GAME-001\n',
  );
  await writeText(path.join(projectDir, 'trace_matrix.md'), '');
  if (input.invalidGovernance !== false) {
    await writeJson(path.join(projectDir, 'modules', 'CORE', 'module.json'), {
      module_code: 'CORE',
      code_paths: ['src/**'],
      contracts: '.specforge/project/modules/CORE/contracts.json',
    });
    await writeText(path.join(projectDir, 'modules', 'CORE', 'design.md'), '# Design\nDD-CORE-001\n');
    await writeJson(path.join(projectDir, 'modules', 'CORE', 'contracts.json'), {
      schema_version: '1.0',
      owner_module: 'CORE',
      contracts: {
        shared_enums: [],
        invariants: [],
        public_interfaces: [],
        extension_points: [],
        internal_contracts: [],
      },
    });
    await writeText(path.join(projectDir, 'modules', 'CORE', 'trace.md'), '');
  }
  return { workItemId, workItemDir };
}

describe('invalid merged Project Spec closure recovery', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-invalid-merged-spec-recovery-'));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('keeps ordinary closed transitions forbidden', () => {
    expect(isValidV11TransitionForWorkflow('closed', 'candidate_preparing', 'feature_spec')).toBe(false);
  });

  it('rejects recovery without explicit confirmation and writes no recovery generation', async () => {
    const fixture = await createMergedClosedFixture({ projectRoot });
    const result = await getHandler('sf_close_gate')!(
      {
        work_item_id: fixture.workItemId,
        action: 'recover_invalid_merged_spec_closure',
        recovery_reason: 'The merged formal Project Spec contains invalid governance identifiers.',
      },
      { directory: projectRoot },
      createStateDeps() as any,
    );
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('CONFIRMATION_REQUIRED');
    await expect(fs.access(path.join(fixture.workItemDir, 'recovery_generations'))).rejects.toBeTruthy();
  });

  it('rejects a non-closed authoritative state before writing recovery evidence', async () => {
    const fixture = await createMergedClosedFixture({ projectRoot });
    const result = await getHandler('sf_close_gate')!(
      {
        work_item_id: fixture.workItemId,
        action: 'recover_invalid_merged_spec_closure',
        recovery_reason: 'Only a closed authoritative Work Item may use this compensating action.',
        confirm_invalid_merged_spec_recovery: true,
      },
      { directory: projectRoot },
      createStateDeps('verification_done') as any,
    );
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('STATE_MISMATCH');
    await expect(fs.access(path.join(fixture.workItemDir, 'recovery_generations'))).rejects.toBeTruthy();
  });

  it('rejects missing successful Atomic Spec Merge evidence without changing the decision', async () => {
    const fixture = await createMergedClosedFixture({ projectRoot });
    const decisionBefore = await fs.readFile(path.join(fixture.workItemDir, 'user_decision.json'), 'utf-8');
    await fs.rm(path.join(fixture.workItemDir, 'merge_report.md'));
    const result = await getHandler('sf_close_gate')!(
      {
        work_item_id: fixture.workItemId,
        action: 'recover_invalid_merged_spec_closure',
        recovery_reason: 'Recovery must reject an incomplete prior Atomic Spec Merge proof.',
        confirm_invalid_merged_spec_recovery: true,
      },
      { directory: projectRoot },
      createStateDeps() as any,
    );
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('MERGE_PROOF_MISSING');
    await expect(fs.readFile(path.join(fixture.workItemDir, 'user_decision.json'), 'utf-8'))
      .resolves.toBe(decisionBefore);
  });

  it('fails closed when a declared validator input disappears before archival proof', async () => {
    const fixture = await createMergedClosedFixture({ projectRoot });
    const decisionBefore = await fs.readFile(path.join(fixture.workItemDir, 'user_decision.json'), 'utf-8');
    await fs.rm(path.join(projectRoot, '.specforge', 'project', 'architecture.md'));
    const result = await getHandler('sf_close_gate')!(
      {
        work_item_id: fixture.workItemId,
        action: 'recover_invalid_merged_spec_closure',
        recovery_reason: 'Recovery requires complete formal validator inputs before any state change.',
        confirm_invalid_merged_spec_recovery: true,
      },
      { directory: projectRoot },
      createStateDeps() as any,
    );
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('VALIDATION_INPUT_UNAVAILABLE');
    await expect(fs.readFile(path.join(fixture.workItemDir, 'user_decision.json'), 'utf-8'))
      .resolves.toBe(decisionBefore);
  });

  it('refuses recovery when the old generation lacks mandatory verification evidence', async () => {
    const fixture = await createMergedClosedFixture({ projectRoot });
    const decisionBefore = await fs.readFile(path.join(fixture.workItemDir, 'user_decision.json'), 'utf-8');
    await fs.rm(path.join(fixture.workItemDir, 'verification_report.md'));
    const result = await getHandler('sf_close_gate')!(
      {
        work_item_id: fixture.workItemId,
        action: 'recover_invalid_merged_spec_closure',
        recovery_reason: 'The old generation must be complete before a compensating state event.',
        confirm_invalid_merged_spec_recovery: true,
      },
      { directory: projectRoot },
      createStateDeps() as any,
    );
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('ARCHIVE_REQUIRED_EVIDENCE_MISSING');
    await expect(fs.readFile(path.join(fixture.workItemDir, 'user_decision.json'), 'utf-8'))
      .resolves.toBe(decisionBefore);
  });

  it('rejects when a later Work Item owns the current Project Spec', async () => {
    const fixture = await createMergedClosedFixture({ projectRoot, currentOwner: 'WI-0002' });
    const result = await getHandler('sf_close_gate')!(
      {
        work_item_id: fixture.workItemId,
        action: 'recover_invalid_merged_spec_closure',
        recovery_reason: 'The older merge must not replace a later formal Project Spec owner.',
        confirm_invalid_merged_spec_recovery: true,
      },
      { directory: projectRoot },
      createStateDeps() as any,
    );
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('PROJECT_SPEC_OWNERSHIP_MISMATCH');
  });

  it('rejects a merged Project Spec that passes all shared validators', async () => {
    const fixture = await createMergedClosedFixture({ projectRoot, invalidGovernance: false });
    const result = await getHandler('sf_close_gate')!(
      {
        work_item_id: fixture.workItemId,
        action: 'recover_invalid_merged_spec_closure',
        recovery_reason: 'A valid merged specification must not be reopened by the recovery action.',
        confirm_invalid_merged_spec_recovery: true,
      },
      { directory: projectRoot },
      createStateDeps() as any,
    );
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('NOT_PROVEN');
  });

  it('archives the old generation, invalidates approval, keeps permission revoked, and recovers to candidate_preparing', async () => {
    const fixture = await createMergedClosedFixture({ projectRoot, coreVersionDrift: true });
    const deps = createStateDeps();
    const result = await getHandler('sf_close_gate')!(
      {
        work_item_id: fixture.workItemId,
        action: 'recover_invalid_merged_spec_closure',
        recovery_reason: 'The merged formal Project Spec contains invalid Architecture identifiers.',
        confirm_invalid_merged_spec_recovery: true,
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps as any,
    );

    expect((result as any).success, JSON.stringify(result, null, 2)).toBe(true);
    expect((result as any).state_auto_advance.to_state).toBe('candidate_preparing');
    expect(deps.transitions).toHaveLength(1);
    expect(deps.transitions[0]).toMatchObject({ from: 'closed', to: 'candidate_preparing' });
    expect(deps.transitions[0].payload.transition_context.compensating_transition).toBe(true);

    const recovery = JSON.parse(
      await fs.readFile(
        path.join(fixture.workItemDir, 'invalid_merged_spec_closure_recovery.json'),
        'utf-8',
      ),
    );
    expect(recovery.status).toBe('applied');
    expect(recovery.archive.file_count).toBeGreaterThan(0);
    expect(recovery.proof.invalidity_reasons.join('\n')).toContain('architecture_id_format');
    expect(recovery.proof.invalidity_reasons.join('\n')).toContain('project_spec_core_version');
    await verifyRecoveryArchive({
      workItemDir: fixture.workItemDir,
      manifestRelativePath: recovery.archive.manifest_path,
      manifestSha256: recovery.archive.manifest_sha256,
    });

    const archivedDecision = recovery.archive.manifest_path.replace(
      /manifest\.json$/,
      'snapshot/work-item/user_decision.json',
    );
    expect(
      JSON.parse(await fs.readFile(path.join(fixture.workItemDir, ...archivedDecision.split('/')), 'utf-8'))
        .decision_status,
    ).toBe('approved');
    const activeDecision = JSON.parse(
      await fs.readFile(path.join(fixture.workItemDir, 'user_decision.json'), 'utf-8'),
    );
    expect(activeDecision.decision_status).toBe('invalidated');
    expect(activeDecision.previous_decision_status).toBe('approved');
    const workItem = JSON.parse(
      await fs.readFile(path.join(fixture.workItemDir, 'work_item.json'), 'utf-8'),
    );
    expect(workItem.code_change_allowed).toBe(false);
    expect(workItem.code_permission_revoked).toBe(true);

    const ordinaryLifecycle = [
      'candidate_prepared',
      'gates_running',
      'approval_required',
      'approved',
      'merge_ready',
      'merging',
      'merged',
      'post_merge_verified',
      'implementation_ready',
      'implementation_running',
      'implementation_done',
      'verification_running',
      'verification_done',
      'closed',
    ];
    const projectStateManager = await deps.projectManager.getProjectStateManager(projectRoot);
    let fromState = 'candidate_preparing';
    for (const toState of ordinaryLifecycle) {
      expect(
        isValidV11TransitionForWorkflow(fromState, toState, 'feature_spec'),
        `${fromState} -> ${toState} must remain on the ordinary lifecycle`,
      ).toBe(true);
      await projectStateManager.transition(
        fixture.workItemId,
        fromState,
        toState,
        'test-owner',
        'feature_spec',
        { evidence: `new-generation:${fromState}->${toState}` },
      );
      fromState = toState;
    }
    await expect(projectStateManager.getState(fixture.workItemId))
      .resolves.toMatchObject({ current_state: 'closed' });
  });

  it('rolls back the active decision and keeps authoritative state closed when the compensating event fails', async () => {
    const fixture = await createMergedClosedFixture({ projectRoot });
    const decisionBefore = await fs.readFile(path.join(fixture.workItemDir, 'user_decision.json'), 'utf-8');
    const result = await getHandler('sf_close_gate')!(
      {
        work_item_id: fixture.workItemId,
        action: 'recover_invalid_merged_spec_closure',
        recovery_reason: 'The merged formal Project Spec contains invalid Architecture identifiers.',
        confirm_invalid_merged_spec_recovery: true,
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      createStateDeps('closed', true) as any,
    );
    expect((result as any).success).toBe(false);
    expect((result as any).decision_rolled_back).toBe(true);
    await expect(fs.readFile(path.join(fixture.workItemDir, 'user_decision.json'), 'utf-8'))
      .resolves.toBe(decisionBefore);
    const recovery = JSON.parse(
      await fs.readFile(
        path.join(fixture.workItemDir, 'invalid_merged_spec_closure_recovery.json'),
        'utf-8',
      ),
    );
    expect(recovery.status).toBe('failed');
  });
});
