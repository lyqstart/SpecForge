/**
 * Regression: a merged extension_registry.json must have its (duplicated)
 * project_spec_version synced to the authoritative spec_manifest version.
 *
 * Before the fix, the entry merge copied the candidate verbatim (operation:
 * replace) and candidates carry the stale version they were authored from, so
 * spec_manifest advanced (e.g. PSV-0006) while the registry's own version field
 * stayed behind (e.g. PSV-0001) — a silent truth-source desync.
 */
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeMerge } from '../src/tools/lib/merge-runner-v11';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

describe('merge runner — extension_registry.json version sync', () => {
  it('syncs merged extension_registry.json project_spec_version to the new spec_manifest version', async () => {
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

    // Candidate carries a STALE version (PSV-0001) + one new contract.
    await writeJson(join(workItemDir, 'candidates', 'project', 'extension_registry.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      namespaces: {
        requirement_types: [],
        design_types: [],
        task_types: [],
        verification_types: [],
        gate_types: [],
      },
      updated_by_work_item: workItemId,
      updated_at: new Date().toISOString(),
      contracts: {
        shared_enums: [
          { id: 'GpsStatus', owner_module: 'CORE', values: ['success', 'denied'], description: 'x' },
        ],
        invariants: [],
        public_interfaces: [],
        extension_points: [],
      },
    });

    await writeJson(join(workItemDir, 'candidate_manifest.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      entries: [
        {
          candidate_path: 'candidates/project/extension_registry.json',
          target_path: '.specforge/project/extension_registry.json',
          operation: 'replace',
          type: 'extension_registry',
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
      decided_by: 'human user',
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
    // And the merged contract content is intact.
    expect(registry.contracts.shared_enums[0].id).toBe('GpsStatus');
  });
});
