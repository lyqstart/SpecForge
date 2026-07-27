import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeMerge } from '../src/tools/lib/merge-runner-v11';

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

    await writeJson(join(projectRoot, '.specforge', 'project', 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      modules: [],
    });

    await writeJson(
      join(workItemDir, 'candidates', 'project', 'modules', 'TODOS', 'module.candidate.json'),
      {
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
      schema_version: '1.1',
      work_item_id: workItemId,
      workflow_type: 'feature_spec',
      workflow_path: 'architecture_change_path',
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
    await writeJson(join(workItemDir, 'user_decision.json'), {
      work_item_id: workItemId,
      workflow_path: 'architecture_change_path',
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
