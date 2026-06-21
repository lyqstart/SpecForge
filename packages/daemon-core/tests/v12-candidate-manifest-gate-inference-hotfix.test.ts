import { describe, expect, it } from 'vitest';
import { inferManifestEntries } from '../src/tools/lib/governance-invariants-v11';

describe('v1.2 candidate manifest gate inference hotfix', () => {
  it('uses explicit valid manifest entries instead of hidden filesystem inference', () => {
    const manifest = {
      work_item_id: 'WI-0001',
      workflow_path: 'requirement_change_path',
      entries: [
        {
          type: 'requirements',
          candidate_path: 'candidates/project/modules/todos/requirements.candidate.md',
          target_path: '.specforge/project/modules/todos/requirements.md',
          target_module: 'todos',
          lint_note: 'extra fields must not break equivalence',
        },
        {
          type: 'design',
          candidate_path: 'candidates/project/modules/todos/design.candidate.md',
          target_path: '.specforge/project/modules/todos/design.md',
          target_module: 'todos',
        },
      ],
    };

    const entries = inferManifestEntries(manifest as any, 'unused-wi-dir');
    expect(entries).toEqual([
      {
        type: 'requirements',
        candidate_path: 'candidates/project/modules/todos/requirements.candidate.md',
        target_path: '.specforge/project/modules/todos/requirements.md',
        module_id: 'todos',
      },
      {
        type: 'design',
        candidate_path: 'candidates/project/modules/todos/design.candidate.md',
        target_path: '.specforge/project/modules/todos/design.md',
        module_id: 'todos',
      },
    ]);
  });

  it('does not accept explicit entries with missing project target_path', () => {
    const manifest = {
      entries: [
        {
          type: 'trace_delta',
          candidate_path: 'trace_delta.md',
          target_path: null,
        },
      ],
    };

    const entries = inferManifestEntries(manifest as any, 'unused-wi-dir');
    expect(entries).not.toEqual([
      {
        type: 'trace_delta',
        candidate_path: 'trace_delta.md',
        target_path: '',
      },
    ]);
  });
});