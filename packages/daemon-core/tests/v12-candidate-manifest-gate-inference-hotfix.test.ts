import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  inferManifestEntries,
  materializeCandidateManifestEntries,
} from '../src/tools/lib/governance-invariants-v11';

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

describe('Runtime Candidate Manifest materialization', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true }))
    );
  });

  async function candidateFile(root: string, relative: string): Promise<void> {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, relative.endsWith('.json') ? '{}\n' : '# Candidate\n', 'utf-8');
  }

  it('merges explicit Project Contract with only Classification-required canonical Candidates', async () => {
    const workItemDir = await mkdtemp(path.join(tmpdir(), 'sf-manifest-materialize-'));
    tempRoots.push(workItemDir);
    await candidateFile(workItemDir, 'candidates/project/extension_registry.json');
    await candidateFile(workItemDir, 'candidates/project/architecture.candidate.md');
    await candidateFile(workItemDir, 'candidates/project/data_model.candidate.md');
    await candidateFile(
      workItemDir,
      'candidates/project/modules/DOMAIN/requirements.candidate.md'
    );
    await candidateFile(workItemDir, 'candidates/project/modules/DOMAIN/design.candidate.md');
    await candidateFile(
      workItemDir,
      'candidates/project/modules/DOMAIN/contracts.candidate.json'
    );
    await candidateFile(workItemDir, 'candidates/trace_delta.md');

    const result = materializeCandidateManifestEntries(
      {
        work_item_id: 'WI-0004',
        workflow_path: 'architecture_change_path',
        entries: [
          {
            candidate_path: 'candidates/project/extension_registry.json',
            target_path: '.specforge/project/extension_registry.json',
            operation: 'replace',
            type: 'extension_registry',
          },
          {
            candidate_path: 'candidates/project/data_model.candidate.md',
            target_path: '.specforge/project/data_model.md',
            operation: 'replace',
            type: 'data_model',
          },
          {
            candidate_path: 'candidates/project/modules/DOMAIN/requirements.candidate.md',
            target_path: '.specforge/project/modules/DOMAIN/requirements.md',
            operation: 'replace',
            type: 'requirements',
          },
        ],
      },
      workItemDir,
      {
        requirement_changed: false,
        acceptance_criteria_changed: false,
        business_rule_changed: false,
        architecture_changed: true,
        data_model_changed: false,
        design_changed: true,
        module_contract_changed: true,
        module_boundary_changed: false,
        api_contract_changed: true,
      }
    );

    expect(result.entries.map(entry => entry.type)).toEqual([
      'extension_registry',
      'architecture',
      'design',
      'module_contract',
      'trace_delta',
    ]);
    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidate_path: 'candidates/project/modules/DOMAIN/contracts.candidate.json',
          target_path: '.specforge/project/modules/DOMAIN/contracts.json',
          type: 'module_contract',
        }),
      ])
    );
    expect(result.ignored_candidate_paths).toEqual(
      expect.arrayContaining([
        'candidates/project/data_model.candidate.md',
        'candidates/project/modules/DOMAIN/requirements.candidate.md',
      ])
    );
  });

  it('requires the Project Contract candidate when API Contract Classification changed', async () => {
    const workItemDir = await mkdtemp(path.join(tmpdir(), 'sf-manifest-project-contract-'));
    tempRoots.push(workItemDir);
    await candidateFile(workItemDir, 'candidates/project/architecture.candidate.md');
    await candidateFile(workItemDir, 'candidates/project/modules/DOMAIN/design.candidate.md');
    await candidateFile(
      workItemDir,
      'candidates/project/modules/DOMAIN/contracts.candidate.json'
    );
    await candidateFile(workItemDir, 'candidates/trace_delta.md');

    expect(() =>
      materializeCandidateManifestEntries(
        {
          workflow_path: 'architecture_change_path',
          entries: [],
        },
        workItemDir,
        {
          requirement_changed: false,
          acceptance_criteria_changed: false,
          business_rule_changed: false,
          architecture_changed: true,
          design_changed: true,
          data_model_changed: false,
          module_contract_changed: true,
          module_boundary_changed: false,
          api_contract_changed: true,
        }
      )
    ).toThrow('CANDIDATE_MANIFEST_REQUIRED_ENTRY_MISSING');
  });

  it('fails closed when a Classification-required Candidate is missing', async () => {
    const workItemDir = await mkdtemp(path.join(tmpdir(), 'sf-manifest-missing-'));
    tempRoots.push(workItemDir);
    await candidateFile(workItemDir, 'candidates/project/architecture.candidate.md');

    expect(() =>
      materializeCandidateManifestEntries(
        {
          workflow_path: 'architecture_change_path',
          entries: [],
        },
        workItemDir,
        {
          architecture_changed: true,
          design_changed: true,
          data_model_changed: false,
          module_contract_changed: false,
          module_boundary_changed: false,
        }
      )
    ).toThrow('CANDIDATE_MANIFEST_REQUIRED_ENTRY_MISSING');
  });

  it('fails closed on two Candidates targeting the same Project Spec file', async () => {
    const workItemDir = await mkdtemp(path.join(tmpdir(), 'sf-manifest-conflict-'));
    tempRoots.push(workItemDir);
    await candidateFile(workItemDir, 'candidates/project/architecture.candidate.md');

    expect(() =>
      materializeCandidateManifestEntries(
        {
          workflow_path: 'architecture_change_path',
          entries: [
            {
              candidate_path: 'candidates/project/alternate-architecture.md',
              target_path: '.specforge/project/architecture.md',
              operation: 'replace',
              type: 'architecture',
            },
          ],
        },
        workItemDir,
        {
          architecture_changed: true,
          design_changed: false,
          data_model_changed: false,
          module_contract_changed: false,
          module_boundary_changed: false,
        }
      )
    ).toThrow('CANDIDATE_MANIFEST_CONFLICT');
  });
});
