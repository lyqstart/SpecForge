import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inspectProjectSpecRepair,
  prepareProjectSpecRepairCandidates,
} from '../src/tools/lib/spec-migration-v11';
import { runGate } from '../src/tools/lib/gate-runner-v11';
import { executeMerge } from '../src/tools/lib/merge-runner-v11';
import { checkProjectGovernanceConsistency } from '../src/tools/lib/project-governance-v2';

async function writeJson(target: string, value: unknown): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256Hex(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function immutableSnapshotFile(path: string, historicalBytes?: Buffer): Promise<Record<string, unknown>> {
  const raw = historicalBytes ?? await readFile(path);
  return {
    path,
    exists: true,
    kind: 'file',
    sha256: sha256Hex(raw),
    size: raw.length,
    mtime_ms: 1,
  };
}

async function createImmutableRepairFixture(): Promise<{
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  sourceCandidatePath: string;
  preparation: {
    expected_manifest_sha256: string;
    expected_project_spec_version: string;
    evidence_paths: string[];
    immutable_source_binding: {
      source_work_item_id: string;
      gate_attempt_id: string;
    };
    modules: Array<{
      module_code: string;
      module_definition_source: string;
      requirements_source: string;
      design_source: string;
      trace_source: string;
    }>;
  };
}> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'sf-project-spec-immutable-repair-'));
  const workItemId = 'WI-0011';
  const sourceWorkItemId = 'WI-0001';
  const gateAttemptId = 'attempt-0010';
  const workItemDir = join(projectRoot, '.specforge', 'work-items', workItemId);
  const sourceWorkItemDir = join(projectRoot, '.specforge', 'work-items', sourceWorkItemId);
  const manifestPath = join(projectRoot, '.specforge', 'project', 'spec_manifest.json');

  await writeJson(manifestPath, {
    schema_version: '1.0',
    project_spec_version: 'PSV-0002',
    modules: [],
  });
  await writeFile(
    join(projectRoot, '.specforge', 'project', 'architecture.md'),
    '# Architecture\n\nARCH-CORE-001\n',
    'utf8',
  );
  await writeFile(
    join(projectRoot, '.specforge', 'project', 'data_model.md'),
    '# Data Model\n\nDATA_MODEL_NOT_APPLICABLE\n',
    'utf8',
  );
  await mkdir(join(projectRoot, '.specforge', 'project', 'modules', 'CORE'), { recursive: true });
  await writeFile(
    join(projectRoot, '.specforge', 'project', 'modules', 'CORE', 'requirements.md'),
    '# Requirements\n',
    'utf8',
  );
  await writeFile(
    join(projectRoot, '.specforge', 'project', 'modules', 'CORE', 'design.md'),
    '# Design\n\nDD-CORE-001\n',
    'utf8',
  );
  await writeFile(
    join(projectRoot, '.specforge', 'project', 'modules', 'CORE', 'trace.md'),
    '# Trace\n',
    'utf8',
  );
  await writeJson(
    join(projectRoot, '.specforge', 'project', 'modules', 'CORE', 'contracts.json'),
    {
      schema_version: '1.0',
      owner_module: 'CORE',
      contracts: [],
    },
  );
  const formalTargetPath = join(
    projectRoot,
    '.specforge',
    'project',
    'modules',
    'CORE',
    'module.json',
  );
  await writeJson(formalTargetPath, { module_code: 'CORE', status: 'active' });

  await writeJson(join(workItemDir, 'work_item.json'), {
    work_item_id: workItemId,
    workflow_path: 'spec_migration_path',
    workflow_type: 'spec_migration',
    status: 'candidate_preparing',
  });
  await writeJson(join(workItemDir, 'trigger_result.json'), {
    schema_version: '1.0',
    work_item_id: workItemId,
    workflow_type: 'spec_migration',
    workflow_path: 'spec_migration_path',
    classification: {
      architecture_changed: false,
      data_model_changed: false,
      design_changed: false,
      module_contract_changed: false,
    },
    impact_scope: {
      affected_modules: ['CORE'],
      architecture_refs: [],
      data_model_refs: [],
      design_refs: [],
      project_contract_refs: [],
      module_contract_refs: [],
      planned_code_paths: [],
    },
  });

  const sourceCandidatePath = join(
    sourceWorkItemDir,
    'candidates',
    'project',
    'modules',
    'CORE',
    'module.candidate.json',
  );
  const governedModule = {
    schema_version: '1.0',
    project_spec_version: 'PSV-0001',
    module_code: 'CORE',
    status: 'active',
    code_paths: ['src/index.ts'],
  };
  await writeJson(sourceCandidatePath, governedModule);
  const governedBytes = await readFile(sourceCandidatePath);

  const sourceCandidateManifestPath = join(sourceWorkItemDir, 'candidate_manifest.json');
  await writeJson(sourceCandidateManifestPath, {
    schema_version: '1.1',
    work_item_id: sourceWorkItemId,
    workflow_path: 'requirement_change_path',
    base_spec_version: 'PSV-0001',
    merge_required: true,
    entries: [
      {
        type: 'module_definition',
        module_id: 'CORE',
        candidate_path: 'candidates/project/modules/CORE/module.candidate.json',
        target_path: '.specforge/project/modules/CORE/module.json',
        operation: 'replace',
      },
    ],
  });
  const sourceCandidateManifestBytes = await readFile(sourceCandidateManifestPath);

  const userDecisionPath = join(sourceWorkItemDir, 'user_decision.json');
  await writeJson(userDecisionPath, {
    schema_version: '1.0',
    work_item_id: sourceWorkItemId,
    workflow_path: 'requirement_change_path',
    manifest_hash: `sha256:${sha256Hex(sourceCandidateManifestBytes)}`,
    decision_status: 'approved',
    decision_type: 'user_approved',
    decided_by: 'user',
  });
  const mergeReportPath = join(sourceWorkItemDir, 'merge_report.md');
  await mkdir(dirname(mergeReportPath), { recursive: true });
  await writeFile(
    mergeReportPath,
    'Status: success\n- Project Spec Version: PSV-0002\n',
    'utf8',
  );

  const attemptDir = join(sourceWorkItemDir, 'gate_attempts', gateAttemptId);
  await mkdir(attemptDir, { recursive: true });
  await writeJson(join(attemptDir, 'input-snapshot.json'), {
    schema_version: '1.0',
    attempt_id: gateAttemptId,
    work_item_id: sourceWorkItemId,
    inputs: [
      await immutableSnapshotFile(sourceCandidateManifestPath),
      await immutableSnapshotFile(userDecisionPath),
      await immutableSnapshotFile(mergeReportPath),
      await immutableSnapshotFile(sourceCandidatePath),
      await immutableSnapshotFile(formalTargetPath, governedBytes),
    ],
  });
  await writeJson(join(attemptDir, 'attempt-result.json'), {
    schema_version: '1.0',
    attempt_id: gateAttemptId,
    work_item_id: sourceWorkItemId,
    source: 'gate_run',
    summary_status: 'passed',
    input_snapshot: 'input-snapshot.json',
  });

  const inspection = await inspectProjectSpecRepair(projectRoot, workItemId);
  return {
    projectRoot,
    workItemId,
    workItemDir,
    sourceCandidatePath,
    preparation: {
      expected_manifest_sha256: inspection.manifest_sha256 as string,
      expected_project_spec_version: 'PSV-0002',
      evidence_paths: ['.specforge/project/architecture.md'],
      immutable_source_binding: {
        source_work_item_id: sourceWorkItemId,
        gate_attempt_id: gateAttemptId,
      },
      modules: [
        {
          module_code: 'CORE',
          module_definition_source:
            '.specforge/work-items/WI-0001/candidates/project/modules/CORE/module.candidate.json',
          requirements_source: '.specforge/project/modules/CORE/requirements.md',
          design_source: '.specforge/project/modules/CORE/design.md',
          trace_source: '.specforge/project/modules/CORE/trace.md',
        },
      ],
    },
  };
}


describe('spec_migration_path Project Spec repair', () => {
  it('inspects an empty registry and prepares canonical candidates only from explicit evidence mapping', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'sf-project-spec-repair-'));
    const workItemId = 'WI-0009';
    const workItemDir = join(projectRoot, '.specforge', 'work-items', workItemId);
    const manifestPath = join(projectRoot, '.specforge', 'project', 'spec_manifest.json');

    await writeJson(manifestPath, {
      schema_version: '1.0',
      project_spec_version: 'PSV-0003',
      project_name: 'fixture',
      project: {},
      modules: [
        {
          module_id: 'MOD-CORE',
          name: 'core',
          requirements_file: 'project/modules/core/requirements.md',
          design_file: 'project/modules/core/design.md',
          trace_file: 'project/trace_matrix.md',
        },
      ],
    });
    await writeFile(
      join(projectRoot, '.specforge', 'project', 'architecture.md'),
      '# Architecture\n\nThe governed module is CORE.\n',
      'utf8'
    );
    await mkdir(join(projectRoot, '.specforge', 'project', 'modules', 'core'), { recursive: true });
    await writeFile(
      join(projectRoot, '.specforge', 'project', 'modules', 'core', 'requirements.md'),
      '# Core Requirements\n',
      'utf8'
    );
    await writeFile(
      join(projectRoot, '.specforge', 'project', 'modules', 'core', 'design.md'),
      '# Core Design\n',
      'utf8'
    );
    await writeFile(
      join(projectRoot, '.specforge', 'project', 'trace_matrix.md'),
      '# Trace\n',
      'utf8'
    );
    await writeJson(join(workItemDir, 'work_item.json'), {
      work_item_id: workItemId,
      workflow_path: 'spec_migration_path',
      status: 'candidate_preparing',
    });

    const inspection = await inspectProjectSpecRepair(projectRoot, workItemId);
    expect(inspection.project_spec_version).toBe('PSV-0003');
    expect(inspection.issues).toContain('MODULE_REGISTRY_ENTRY_0_LEGACY');
    expect(inspection.module_directories).toContainEqual({
      path: '.specforge/project/modules/core',
      files: ['design.md', 'requirements.md'],
    });

    const prepared = await prepareProjectSpecRepairCandidates({
      projectRoot,
      workItemId,
      workItemDir,
      preparation: {
        expected_manifest_sha256: inspection.manifest_sha256 as string,
        expected_project_spec_version: 'PSV-0003',
        evidence_paths: ['.specforge/project/architecture.md'],
        modules: [
          {
            module_code: 'CORE',
            requirements_source: '.specforge/project/modules/core/requirements.md',
            design_source: '.specforge/project/modules/core/design.md',
            trace_source: '.specforge/project/trace_matrix.md',
          },
        ],
      },
    });

    const candidateManifest = JSON.parse(await readFile(prepared.candidate_manifest_path, 'utf8'));
    expect(candidateManifest.workflow_path).toBe('spec_migration_path');
    expect(candidateManifest.base_spec_version).toBe('PSV-0003');
    expect(candidateManifest.project_spec_precondition_sha256).toBe(inspection.manifest_sha256);
    expect(candidateManifest.entries).toHaveLength(4);
    expect(candidateManifest.entries.map((entry: any) => entry.target_path)).toEqual([
      '.specforge/project/modules/CORE/module.json',
      '.specforge/project/modules/CORE/requirements.md',
      '.specforge/project/modules/CORE/design.md',
      '.specforge/project/modules/CORE/trace.md',
    ]);
    expect(
      JSON.parse(
        await readFile(
          join(workItemDir, 'candidates', 'project', 'modules', 'CORE', 'module.candidate.json'),
          'utf8'
        )
      )
    ).toMatchObject({ module_code: 'CORE', status: 'active' });

    // required_files_gate still requires the normal Work Item base artifacts.
    // This fixture is specifically testing the additional trace_delta condition,
    // so keep the pre-existing base-file contract satisfied.
    await writeFile(join(workItemDir, 'intake.md'), '# Intake\nProject Spec repair fixture.\n', 'utf8');
    await writeFile(
      join(workItemDir, 'change_classification.md'),
      '# Change Classification\nworkflow_type=spec_migration\n',
      'utf8',
    );
    await writeFile(
      join(workItemDir, 'impact_analysis.md'),
      '# Impact Analysis\nAffected module: CORE\n',
      'utf8',
    );
    await writeJson(join(workItemDir, 'trigger_result.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_type: 'spec_migration',
      workflow_path: 'spec_migration_path',
      classification: {
        architecture_changed: false,
        data_model_changed: false,
        design_changed: false,
        module_contract_changed: false,
      },
      impact_scope: {
        affected_modules: ['CORE'],
        architecture_refs: [],
        data_model_refs: [],
        design_refs: [],
        project_contract_refs: [],
        module_contract_refs: [],
        planned_code_paths: [],
      },
    });

    const gateContext = {
      projectRoot,
      workItemId,
      workItemDir,
      workflowPath: 'spec_migration_path',
      workflowType: 'spec_migration',
      candidatePhase: 'full' as const,
    };

    const missingTraceDeltaReport = await runGate('required_files_gate', gateContext);
    expect(missingTraceDeltaReport.status).toBe('failed');
    expect(
      missingTraceDeltaReport.checks.find(
        check => check.check_id === 'project_spec_repair_trace_delta_authoritative',
      ),
    ).toMatchObject({ passed: false, severity: 'error' });

    await writeFile(
      join(workItemDir, 'candidates', 'trace_delta.md'),
      '# Trace Delta\n\nADD_EDGES=0\nREMOVE_EDGES=0\n',
      'utf8',
    );
    const traceDeltaReadyReport = await runGate('required_files_gate', gateContext);
    expect(traceDeltaReadyReport.status).toBe('passed');
    expect(
      traceDeltaReadyReport.checks.find(
        check => check.check_id === 'project_spec_repair_trace_delta_authoritative',
      ),
    ).toMatchObject({ passed: true });

    for (const gateId of [
      'candidate_manifest_gate',
      'trace_gate',
      'workflow_specific_gate',
    ] as const) {
      const report = await runGate(gateId, gateContext);
      expect(report.status, `${gateId}: ${report.blocking_issues.join('; ')}`).toBe('passed');
    }

    await writeJson(join(workItemDir, 'user_decision.json'), {
      work_item_id: workItemId,
      workflow_path: 'spec_migration_path',
      decision_status: 'approved',
      decision_type: 'user_approved',
      decided_by: 'test-user',
      user_response_quote: 'approve repair plan',
    });
    await writeFile(join(workItemDir, 'gate_summary.md'), 'Overall Status: passed\n', 'utf8');
    await mkdir(join(workItemDir, 'gates'), { recursive: true });
    for (const gateId of ['required_files_gate', 'candidate_manifest_gate', 'path_policy_gate']) {
      await writeJson(join(workItemDir, 'gates', `${gateId}.json`), { status: 'passed' });
    }

    const mergeResult = await executeMerge({
      projectRoot,
      workItemId,
      workItemDir,
      candidateManifestPath: prepared.candidate_manifest_path,
      userDecisionPath: join(workItemDir, 'user_decision.json'),
    });
    expect(mergeResult.success).toBe(true);
    expect(mergeResult.project_spec_version).toBe('PSV-0004');
    const repairedManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(repairedManifest.modules).toEqual([
      {
        module_code: 'CORE',
        path: '.specforge/project/modules/CORE',
        module_file: '.specforge/project/modules/CORE/module.json',
        requirements: '.specforge/project/modules/CORE/requirements.md',
        design: '.specforge/project/modules/CORE/design.md',
        trace: '.specforge/project/modules/CORE/trace.md',
      },
    ]);
  });


  it('accepts historical Candidate content only when a passed immutable Gate Attempt binds it to the same former formal target', async () => {
    const fixture = await createImmutableRepairFixture();
    const prepared = await prepareProjectSpecRepairCandidates({
      projectRoot: fixture.projectRoot,
      workItemId: fixture.workItemId,
      workItemDir: fixture.workItemDir,
      preparation: fixture.preparation,
    });

    const sourceBytes = await readFile(fixture.sourceCandidatePath);
    const repairedCandidateBytes = await readFile(
      join(
        fixture.workItemDir,
        'candidates',
        'project',
        'modules',
        'CORE',
        'module.candidate.json',
      ),
    );
    expect(repairedCandidateBytes.equals(sourceBytes)).toBe(true);

    const repairPlan = JSON.parse(await readFile(prepared.repair_plan_path, 'utf8'));
    expect(repairPlan.immutable_source_binding).toEqual({
      source_work_item_id: 'WI-0001',
      gate_attempt_id: 'attempt-0010',
    });
    const prospectiveConsistency = await checkProjectGovernanceConsistency({
      projectRoot: fixture.projectRoot,
      workItemDir: fixture.workItemDir,
      workItemId: fixture.workItemId,
    });
    expect(prospectiveConsistency.active).toBe(true);
    expect(
      prospectiveConsistency.checks.find(check => check.check_id === 'module_CORE_code_paths'),
    ).toMatchObject({ passed: true });
    expect(
      prospectiveConsistency.checks.find(check => check.check_id === 'module_CORE_contracts_path'),
    ).toMatchObject({ passed: true });
    expect(
      prospectiveConsistency.checks.filter(check => !check.passed),
    ).toEqual([]);

    await writeJson(join(fixture.workItemDir, 'user_decision.json'), {
      work_item_id: fixture.workItemId,
      workflow_path: 'spec_migration_path',
      decision_status: 'approved',
      decision_type: 'user_approved',
      decided_by: 'test-user',
      user_response_quote: 'approve immutable repair',
    });
    await writeFile(join(fixture.workItemDir, 'gate_summary.md'), 'Overall Status: passed\n', 'utf8');
    await mkdir(join(fixture.workItemDir, 'gates'), { recursive: true });
    for (const gateId of ['required_files_gate', 'candidate_manifest_gate', 'path_policy_gate']) {
      await writeJson(join(fixture.workItemDir, 'gates', `${gateId}.json`), { status: 'passed' });
    }
    const mergeResult = await executeMerge({
      projectRoot: fixture.projectRoot,
      workItemId: fixture.workItemId,
      workItemDir: fixture.workItemDir,
      candidateManifestPath: prepared.candidate_manifest_path,
      userDecisionPath: join(fixture.workItemDir, 'user_decision.json'),
    });
    expect(mergeResult.success).toBe(true);
    expect(mergeResult.project_spec_version).toBe('PSV-0003');

    const repairedManifest = JSON.parse(
      await readFile(join(fixture.projectRoot, '.specforge', 'project', 'spec_manifest.json'), 'utf8'),
    );
    expect(repairedManifest.modules).toContainEqual(
      expect.objectContaining({
        module_code: 'CORE',
        contracts: '.specforge/project/modules/CORE/contracts.json',
        code_paths: ['src/index.ts'],
      }),
    );
  });

  it('fails closed when a repair module Candidate has no contracts.json to canonically register', async () => {
    const fixture = await createImmutableRepairFixture();
    await prepareProjectSpecRepairCandidates({
      projectRoot: fixture.projectRoot,
      workItemId: fixture.workItemId,
      workItemDir: fixture.workItemDir,
      preparation: fixture.preparation,
    });
    await rm(
      join(fixture.projectRoot, '.specforge', 'project', 'modules', 'CORE', 'contracts.json'),
    );
    const prospectiveConsistency = await checkProjectGovernanceConsistency({
      projectRoot: fixture.projectRoot,
      workItemDir: fixture.workItemDir,
      workItemId: fixture.workItemId,
    });
    expect(
      prospectiveConsistency.checks.find(check => check.check_id === 'module_CORE_code_paths'),
    ).toMatchObject({ passed: true });
    expect(
      prospectiveConsistency.checks.find(check => check.check_id === 'module_CORE_contracts_path'),
    ).toMatchObject({ passed: false });
    expect(prospectiveConsistency.passed).toBe(false);
  });

  it('fails closed when historical Candidate bytes drift after the immutable Gate Attempt', async () => {
    const fixture = await createImmutableRepairFixture();
    await writeJson(fixture.sourceCandidatePath, {
      module_code: 'CORE',
      status: 'active',
      code_paths: ['src/tampered.ts'],
    });

    await expect(
      prepareProjectSpecRepairCandidates({
        projectRoot: fixture.projectRoot,
        workItemId: fixture.workItemId,
        workItemDir: fixture.workItemDir,
        preparation: fixture.preparation,
      }),
    ).rejects.toThrow('PROJECT_SPEC_REPAIR_IMMUTABLE_SOURCE_HASH_MISMATCH');
  });


  it('refuses repair preparation when the manifest hash is stale', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'sf-project-spec-repair-stale-'));
    const workItemId = 'WI-0010';
    const workItemDir = join(projectRoot, '.specforge', 'work-items', workItemId);
    await writeJson(join(projectRoot, '.specforge', 'project', 'spec_manifest.json'), {
      project_spec_version: 'PSV-0001',
      modules: [],
    });
    await writeJson(join(workItemDir, 'work_item.json'), {
      workflow_path: 'spec_migration_path',
      status: 'candidate_preparing',
    });
    await writeFile(
      join(projectRoot, '.specforge', 'project', 'architecture.md'),
      '# Architecture\n',
      'utf8'
    );
    await expect(
      prepareProjectSpecRepairCandidates({
        projectRoot,
        workItemId,
        workItemDir,
        preparation: {
          expected_manifest_sha256: 'sha256:stale',
          expected_project_spec_version: 'PSV-0001',
          evidence_paths: ['.specforge/project/architecture.md'],
          modules: [],
        },
      })
    ).rejects.toThrow('PROJECT_SPEC_REPAIR_MANIFEST_HASH_STALE');
  });
});
