import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inspectProjectSpecRepair,
  prepareProjectSpecRepairCandidates,
} from '../src/tools/lib/spec-migration-v11';
import { runGate } from '../src/tools/lib/gate-runner-v11';
import { executeMerge } from '../src/tools/lib/merge-runner-v11';

async function writeJson(target: string, value: unknown): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

    const gateContext = {
      projectRoot,
      workItemId,
      workItemDir,
      workflowPath: 'spec_migration_path',
      workflowType: 'spec_migration',
      candidatePhase: 'full' as const,
    };
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
