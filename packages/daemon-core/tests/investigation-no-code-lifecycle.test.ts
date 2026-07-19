import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRequiredGates } from '../src/tools/lib/required-gates.js';
import { transitionWithEvidence } from '../src/tools/lib/state-coordinator-v11.js';

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: '1.1',
    work_item_id: 'WI-0001',
    workflow_type: 'investigation',
    workflow_path: 'requirement_change_path',
    no_project_spec_change: true,
    project_integration_effect: 'evidence_only',
    merge_required: false,
    merge_applicable: false,
    entries: [],
    ...overrides,
  };
}

describe('Investigation no-code lifecycle', () => {
  let projectRoot: string;
  let workItemDir: string;
  let transitions: Array<{ from: string; to: string }>;
  let deps: any;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'sf-investigation-lifecycle-'));
    workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');
    await mkdir(workItemDir, { recursive: true });
    transitions = [];
    deps = {
      projectManager: {
        async getProjectStateManager() {
          return {
            async transition(_workItemId: string, from: string, to: string) {
              transitions.push({ from, to });
            },
          };
        },
      },
    };
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('uses an Investigation-specific candidate gate profile without trace or spec consistency', () => {
    const gates = getRequiredGates('requirement_change_path', 'candidate', 'full', 'investigation');
    expect(gates).toContain('workflow_specific_gate');
    expect(gates).toContain('candidate_manifest_gate');
    expect(gates).not.toContain('trace_gate');
    expect(gates).not.toContain('spec_consistency_gate');
  });

  it('allows post_merge_verified to enter verification only for canonical evidence-only Investigation', async () => {
    await writeFile(
      path.join(workItemDir, 'candidate_manifest.json'),
      JSON.stringify(manifest(), null, 2)
    );

    const result = await transitionWithEvidence({
      deps,
      projectRoot,
      workItemId: 'WI-0001',
      workItemDir,
      fromState: 'post_merge_verified',
      toState: 'verification_running',
      workflowType: 'investigation',
      actorRole: 'sf_gate_run',
      evidence: 'canonical investigation verification transition',
    });

    expect(result.advanced).toBe(true);
    expect(transitions).toEqual([{ from: 'post_merge_verified', to: 'verification_running' }]);
  });

  it('fails closed for other workflows or noncanonical candidate manifests', async () => {
    await writeFile(
      path.join(workItemDir, 'candidate_manifest.json'),
      JSON.stringify(manifest(), null, 2)
    );

    await expect(
      transitionWithEvidence({
        deps,
        projectRoot,
        workItemId: 'WI-0001',
        workItemDir,
        fromState: 'post_merge_verified',
        toState: 'verification_running',
        workflowType: 'feature_spec',
        actorRole: 'sf_gate_run',
        evidence: 'must fail',
      })
    ).rejects.toThrow('reserved for workflow_type=investigation');

    await writeFile(
      path.join(workItemDir, 'candidate_manifest.json'),
      JSON.stringify(manifest({ entries: [{ candidate_path: 'fake.md' }] }), null, 2)
    );

    await expect(
      transitionWithEvidence({
        deps,
        projectRoot,
        workItemId: 'WI-0001',
        workItemDir,
        fromState: 'post_merge_verified',
        toState: 'verification_running',
        workflowType: 'investigation',
        actorRole: 'sf_gate_run',
        evidence: 'must fail',
      })
    ).rejects.toThrow('canonical evidence_only candidate manifest');
  });
});
