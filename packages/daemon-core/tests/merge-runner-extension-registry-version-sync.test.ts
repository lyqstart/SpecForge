/**
 * Regression: extension_registry.json must have its duplicated
 * project_spec_version synced on every Project Spec version increment, even
 * when the registry itself is not a Candidate target.
 *
 * Before the fix, the merge runner only synchronized the registry when it was
 * one of the merged entries, so an unrelated Core change advanced
 * spec_manifest while leaving the registry behind.
 */
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeMerge } from '../src/tools/lib/merge-runner-v11';
import { runGate } from '../src/tools/lib/gate-report';
import '../src/tools/lib/gate-runner-v11';
import { approveSealedCandidateFixture } from './helpers/candidate-generation-fixture';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

describe('merge runner — extension_registry.json version sync', () => {
  it('syncs extension_registry.json when another Project Spec Core file is merged', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'sf-merge-registry-version-'));
    const workItemId = 'WI-0001';
    const workItemDir = join(projectRoot, '.specforge', 'work-items', workItemId);

    await mkdir(join(projectRoot, '.specforge', 'project'), { recursive: true });
    await mkdir(join(workItemDir, 'candidates', 'project'), { recursive: true });
    await mkdir(join(workItemDir, 'gates'), { recursive: true });

    // Authoritative version lives in spec_manifest (start at PSV-0005).
    await writeJson(join(projectRoot, '.specforge', 'project', 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0005',
      project: {
        extension_registry: '.specforge/project/extension_registry.json',
        requirements_index: '.specforge/project/requirements_index.md',
        design_index: '.specforge/project/design_index.md',
        architecture: '.specforge/project/architecture.md',
        glossary: '.specforge/project/glossary.md',
        decisions: '.specforge/project/decisions.md',
        trace_matrix: '.specforge/project/trace_matrix.md',
      },
      modules: [],
    });

    // Existing truth-source registry (also behind).
    await writeJson(join(projectRoot, '.specforge', 'project', 'extension_registry.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      namespaces: {
        requirement_types: [],
        design_types: [],
        task_types: [],
        verification_types: [],
        gate_types: [],
      },
      updated_by_work_item: null,
      updated_at: null,
      contracts: { shared_enums: [], invariants: [], public_interfaces: [], extension_points: [] },
    });

    await writeFile(
      join(workItemDir, 'candidates', 'project', 'requirements_index.md'),
      '# Requirements Index\n\n- REQ-CORE-001\n',
      'utf8',
    );

    await writeJson(join(workItemDir, 'candidate_manifest.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      entries: [
        {
          candidate_path: 'candidates/project/requirements_index.md',
          target_path: '.specforge/project/requirements_index.md',
          operation: 'replace',
          type: 'requirements_index',
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
    await approveSealedCandidateFixture({
      projectRoot,
      workItemDir,
      workItemId,
      workflowPath: 'requirement_change_path',
    });

    const result = await executeMerge({
      projectRoot,
      workItemId,
      workItemDir,
      candidateManifestPath: join(workItemDir, 'candidate_manifest.json'),
      userDecisionPath: join(workItemDir, 'user_decision.json'),
    });

    expect(result.success).toBe(true);
    expect(result.project_spec_version).toBe('PSV-0006');

    const specManifest = JSON.parse(
      await readFile(join(projectRoot, '.specforge', 'project', 'spec_manifest.json'), 'utf8')
    );
    const registry = JSON.parse(
      await readFile(join(projectRoot, '.specforge', 'project', 'extension_registry.json'), 'utf8')
    );

    expect(specManifest.project_spec_version).toBe('PSV-0006');
    // The core assertion: registry version no longer drifts behind the manifest.
    expect(registry.project_spec_version).toBe('PSV-0006');
    expect(registry.contracts.shared_enums).toEqual([]);

    const postMerge = await runGate('post_merge_gate', {
      projectRoot,
      workItemDir,
      workItemId,
      workflowPath: 'requirement_change_path',
    });
    expect(postMerge.status).toBe('passed');

    registry.project_spec_version = 'PSV-0005';
    await writeJson(join(projectRoot, '.specforge', 'project', 'extension_registry.json'), registry);
    const driftedPostMerge = await runGate('post_merge_gate', {
      projectRoot,
      workItemDir,
      workItemId,
      workflowPath: 'requirement_change_path',
    });
    expect(driftedPostMerge.status).toBe('failed');
    expect(
      driftedPostMerge.checks.find(
        check => check.check_id === 'post_merge_project_spec_core_version_coherent',
      ),
    ).toMatchObject({ passed: false });
  });
});
