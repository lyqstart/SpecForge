import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeMerge } from '../src/tools/lib/merge-runner-v11';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

describe('v1.2 merge runner module registry hotfix', () => {
  it('registers module in spec_manifest.modules when project module targets are merged', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'sf-merge-module-registry-'));
    const workItemId = 'WI-0001';
    const workItemDir = join(projectRoot, '.specforge', 'work-items', workItemId);

    await mkdir(join(projectRoot, '.specforge', 'project'), { recursive: true });
    await mkdir(join(workItemDir, 'candidates', 'project', 'modules', 'todos'), { recursive: true });
    await mkdir(join(workItemDir, 'candidates'), { recursive: true });
    await mkdir(join(workItemDir, 'gates'), { recursive: true });

    await writeJson(join(projectRoot, '.specforge', 'project', 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      modules: [],
    });

    await writeFile(join(workItemDir, 'candidates', 'project', 'modules', 'todos', 'requirements.candidate.md'), '# Requirements\n', 'utf8');
    await writeFile(join(workItemDir, 'candidates', 'project', 'modules', 'todos', 'design.candidate.md'), '# Design\n', 'utf8');
    await writeFile(join(workItemDir, 'candidates', 'project', 'modules', 'todos', 'tasks.candidate.md'), '# Tasks\n', 'utf8');
    await writeFile(join(workItemDir, 'candidates', 'trace_delta.md'), '# Trace\n', 'utf8');

    await writeJson(join(workItemDir, 'candidate_manifest.json'), {
      schema_version: '1.1',
      work_item_id: workItemId,
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
      entries: [
        {
          type: 'requirements',
          candidate_path: 'candidates/project/modules/todos/requirements.candidate.md',
          target_path: '.specforge/project/modules/todos/requirements.md',
          operation: 'replace',
        },
        {
          type: 'design',
          candidate_path: 'candidates/project/modules/todos/design.candidate.md',
          target_path: '.specforge/project/modules/todos/design.md',
          operation: 'replace',
        },
        {
          type: 'tasks',
          candidate_path: 'candidates/project/modules/todos/tasks.candidate.md',
          target_path: '.specforge/project/modules/todos/tasks.md',
          operation: 'replace',
        },
        {
          type: 'trace_delta',
          candidate_path: 'candidates/trace_delta.md',
          target_path: '.specforge/project/trace_matrix.md',
          operation: 'replace',
        },
      ],
    });

    await writeJson(join(workItemDir, 'work_item.json'), {
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
      status: 'approval_required',
    });
    await writeJson(join(workItemDir, 'trigger_result.json'), {
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
    });
    await writeJson(join(workItemDir, 'user_decision.json'), {
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
      decision_status: 'approved',
      decision_type: 'user_approved',
      decided_by: 'tls ofn',
      user_response_quote: '批准',
    });

    await writeFile(join(workItemDir, 'gate_summary.md'), 'Overall Status: passed\n', 'utf8');
    for (const gate of ['required_files_gate', 'candidate_manifest_gate', 'path_policy_gate']) {
      await writeJson(join(workItemDir, 'gates', gate + '.json'), { status: 'passed' });
    }

    const result = await executeMerge({
      projectRoot,
      workItemId,
      workItemDir,
      candidateManifestPath: join(workItemDir, 'candidate_manifest.json'),
      userDecisionPath: join(workItemDir, 'user_decision.json'),
    });

    expect(result.success).toBe(true);
    expect(result.project_spec_version).toBe('PSV-0002');

    const specManifest = JSON.parse(await readFile(join(projectRoot, '.specforge', 'project', 'spec_manifest.json'), 'utf8'));
    expect(specManifest.project_spec_version).toBe('PSV-0002');
    expect(specManifest.last_merged_targets).toContain('.specforge/project/modules/todos/requirements.md');
    expect(specManifest.modules).toEqual([
      {
        module_id: 'MOD-TODOS',
        name: 'todos',
        prefix: 'T',
        requirements_file: 'project/modules/todos/requirements.md',
        design_file: 'project/modules/todos/design.md',
        trace_file: 'project/trace_matrix.md',
        tasks_file: 'project/modules/todos/tasks.md',
        status: 'active',
      },
    ]);
  });
});