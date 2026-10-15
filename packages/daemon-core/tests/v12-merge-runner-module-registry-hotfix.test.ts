import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeMerge } from '../src/tools/lib/merge-runner-v11';
import { candidateSealInputPaths } from '../src/tools/lib/candidate-generation-integrity';
import { buildGateAttemptInputSnapshot } from '../src/tools/lib/gate-chain';
import type { GateReportV11 } from '../src/tools/lib/gate-runner-v11';
import { recordUserDecision } from '../src/tools/lib/user-decision-recorder-v11';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

describe('Project Spec governed module admission', () => {
  it('registers a complete canonical module bundle approved through architecture_change_path', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'sf-merge-module-registry-'));
    const workItemId = 'WI-0001';
    const workItemDir = join(projectRoot, '.specforge', 'work-items', workItemId);

    await mkdir(join(projectRoot, '.specforge', 'project'), { recursive: true });
    await mkdir(join(workItemDir, 'candidates', 'project', 'modules', 'TODOS'), { recursive: true });
    await mkdir(join(workItemDir, 'candidates'), { recursive: true });
    await mkdir(join(workItemDir, 'gates'), { recursive: true });

    const specManifestPath = join(projectRoot, '.specforge', 'project', 'spec_manifest.json');
    await writeJson(specManifestPath, {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      modules: [],
    });
    await writeJson(join(projectRoot, '.specforge', 'project', 'extension_registry.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      extensions: [],
    });

    await writeJson(
      join(workItemDir, 'candidates', 'project', 'modules', 'TODOS', 'module.candidate.json'),
      {
        schema_version: '1.0',
        module_code: 'TODOS',
        status: 'active',
        code_paths: ['packages/todos/src/**'],
      }
    );
    await writeFile(
      join(workItemDir, 'candidates', 'project', 'modules', 'TODOS', 'requirements.candidate.md'),
      '# Requirements\n',
      'utf8'
    );
    await writeFile(
      join(workItemDir, 'candidates', 'project', 'modules', 'TODOS', 'design.candidate.md'),
      '# Design\n',
      'utf8'
    );
    await writeJson(
      join(workItemDir, 'candidates', 'project', 'modules', 'TODOS', 'contracts.candidate.json'),
      {
        schema_version: '1.0',
        owner_module: 'TODOS',
        contracts: {
          shared_enums: [],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      }
    );
    await writeFile(
      join(workItemDir, 'candidates', 'project', 'modules', 'TODOS', 'trace.candidate.md'),
      '# Trace\n',
      'utf8'
    );

    await writeJson(join(workItemDir, 'candidate_manifest.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_type: 'feature_spec',
      workflow_path: 'architecture_change_path',
      base_spec_version: 'PSV-0001',
      project_spec_precondition_sha256:
        'sha256:' + createHash('sha256').update(await readFile(specManifestPath)).digest('hex'),
      merge_required: true,
      entries: [
        {
          type: 'module_definition',
          candidate_path: 'candidates/project/modules/TODOS/module.candidate.json',
          target_path: '.specforge/project/modules/TODOS/module.json',
          operation: 'replace',
        },
        {
          type: 'requirements',
          candidate_path: 'candidates/project/modules/TODOS/requirements.candidate.md',
          target_path: '.specforge/project/modules/TODOS/requirements.md',
          operation: 'replace',
        },
        {
          type: 'design',
          candidate_path: 'candidates/project/modules/TODOS/design.candidate.md',
          target_path: '.specforge/project/modules/TODOS/design.md',
          operation: 'replace',
        },
        {
          type: 'module_contract',
          candidate_path: 'candidates/project/modules/TODOS/contracts.candidate.json',
          target_path: '.specforge/project/modules/TODOS/contracts.json',
          operation: 'replace',
        },
        {
          type: 'module_trace',
          candidate_path: 'candidates/project/modules/TODOS/trace.candidate.md',
          target_path: '.specforge/project/modules/TODOS/trace.md',
          operation: 'replace',
        },
      ],
    });

    await writeJson(join(workItemDir, 'work_item.json'), {
      work_item_id: workItemId,
      workflow_path: 'architecture_change_path',
      status: 'approval_required',
    });
    await writeJson(join(workItemDir, 'trigger_result.json'), {
      work_item_id: workItemId,
      workflow_path: 'architecture_change_path',
    });
    await writeFile(join(workItemDir, 'change_classification.md'), '# Classification\n', 'utf8');
    await writeFile(join(workItemDir, 'impact_analysis.md'), '# Impact\n', 'utf8');
    await writeJson(join(workItemDir, 'implementation_baseline.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      captured_at: '2026-10-15T00:00:00.000Z',
      snapshot_id: 'sha256:' + createHash('sha256').update('empty implementation baseline').digest('hex'),
      planned_code_paths: [],
      current_file_count: 0,
      all_planned_paths_missing: true,
      entries: [],
    });

    const gateSummary = 'Overall Status: passed\n';
    await writeFile(join(workItemDir, 'gate_summary.md'), gateSummary, 'utf8');
    for (const gate of ['required_files_gate', 'candidate_manifest_gate', 'path_policy_gate']) {
      await writeJson(join(workItemDir, 'gates', gate + '.json'), { status: 'passed' });
    }

    const attemptId = 'attempt-0001';
    const attemptPath = join(workItemDir, 'gate_attempts', attemptId);
    await mkdir(join(attemptPath, 'gates'), { recursive: true });
    const report: GateReportV11 = {
      schema_version: '1.0',
      work_item_id: workItemId,
      gate_id: 'candidate_manifest_gate',
      gate_type: 'hard_gate',
      required: true,
      status: 'passed',
      input_files: [],
      checks: [{ check_id: 'ok', description: 'ok', passed: true }],
      blocking_issues: [],
      warnings: [],
      waiver_allowed: false,
      waiver_required: false,
      waiver_ids: [],
      started_at: '2026-10-15T00:00:00.000Z',
      finished_at: '2026-10-15T00:00:01.000Z',
      runner: 'gate_runner',
    };
    const snapshot = await buildGateAttemptInputSnapshot(
      projectRoot,
      [report],
      process.platform,
      await candidateSealInputPaths(workItemDir),
    );
    await writeFile(join(attemptPath, 'gate_summary.md'), gateSummary, 'utf8');
    await writeJson(join(attemptPath, 'attempt-result.json'), {
      schema_version: '1.0',
      attempt_id: attemptId,
      work_item_id: workItemId,
      source: 'gate_run',
      started_at: '2026-10-15T00:00:00.000Z',
      completed_at: '2026-10-15T00:00:01.000Z',
      requested_gate_ids: ['candidate_manifest_gate'],
      current_report_gate_ids: ['candidate_manifest_gate'],
      summary_report_gate_ids: ['candidate_manifest_gate'],
      summary_status: 'passed',
      input_snapshot: 'input-snapshot.json',
    });
    await writeJson(join(attemptPath, 'input-snapshot.json'), {
      schema_version: '1.0',
      attempt_id: attemptId,
      work_item_id: workItemId,
      captured_at: '2026-10-15T00:00:01.000Z',
      inputs: snapshot,
    });
    await recordUserDecision({
      workItemDir,
      workItemId,
      workflowPath: 'architecture_change_path',
      baseSpecVersion: 'PSV-0001',
      candidateManifestPath: 'candidate_manifest.json',
      gateSummaryPath: 'gate_summary.md',
      decisionStatus: 'approved',
      decisionType: 'user_approved',
      decidedBy: 'user',
      decisionScope: 'full',
      userResponseQuote: '批准',
    });

    const result = await executeMerge({
      projectRoot,
      workItemId,
      workItemDir,
      candidateManifestPath: join(workItemDir, 'candidate_manifest.json'),
      userDecisionPath: join(workItemDir, 'user_decision.json'),
    });

    expect(result.success).toBe(true);
    expect(result.project_spec_version).toBe('PSV-0002');

    const specManifest = JSON.parse(
      await readFile(join(projectRoot, '.specforge', 'project', 'spec_manifest.json'), 'utf8')
    );
    expect(specManifest.project_spec_version).toBe('PSV-0002');
    expect(specManifest.last_merged_targets).toContain(
      '.specforge/project/modules/TODOS/requirements.md'
    );
    expect(specManifest.last_merged_targets).toContain(
      '.specforge/project/modules/TODOS/contracts.json'
    );
    expect(specManifest.modules).toEqual([
      {
        module_code: 'TODOS',
        path: '.specforge/project/modules/TODOS',
        module_file: '.specforge/project/modules/TODOS/module.json',
        requirements: '.specforge/project/modules/TODOS/requirements.md',
        design: '.specforge/project/modules/TODOS/design.md',
        trace: '.specforge/project/modules/TODOS/trace.md',
        contracts: '.specforge/project/modules/TODOS/contracts.json',
        code_paths: ['packages/todos/src/**'],
      },
    ]);
  });
});
