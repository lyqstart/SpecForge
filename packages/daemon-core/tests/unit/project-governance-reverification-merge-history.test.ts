import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  inspectProjectGovernanceContractConsumers,
  proveProjectSpecVersionAdvancedBySuccessfulMerges,
  readSuccessfulProjectSpecMergeHistoryEvidence,
} from '../../src/tools/lib/project-governance-v2';

const roots: string[] = [];

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeText(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function writeMergedWorkItem(input: {
  projectRoot: string;
  workItemId: string;
  baseVersion: string;
  resultVersion: string;
  targetPath: string;
  decisionStatus?: 'approved' | 'rejected';
}): Promise<string> {
  const workItemDir = path.join(
    input.projectRoot,
    '.specforge',
    'work-items',
    input.workItemId,
  );
  await writeJson(path.join(workItemDir, 'candidate_manifest.json'), {
    schema_version: '1.1',
    work_item_id: input.workItemId,
    workflow_path: 'requirement_change_path',
    base_spec_version: input.baseVersion,
    merge_required: true,
    entries: [
      {
        candidate_path: 'candidates/trace_delta.md',
        target_path: input.targetPath,
        operation: 'replace',
      },
    ],
  });
  await writeJson(path.join(workItemDir, 'user_decision.json'), {
    schema_version: '1.0',
    work_item_id: input.workItemId,
    decision_status: input.decisionStatus ?? 'approved',
  });
  await writeText(
    path.join(workItemDir, 'merge_report.md'),
    [
      '# Merge Report',
      '',
      `Work Item: ${input.workItemId}`,
      'Status: success',
      '',
      '## Summary',
      '',
      '- Spec Manifest Updated: true',
      `- Project Spec Version: ${input.resultVersion}`,
      '',
      '## Merged Files',
      '',
      '| Status | Operation | Candidate | Target | Hash Match |',
      '|--------|-----------|-----------|--------|------------|',
      `| success | replace | candidates/trace_delta.md | ${input.targetPath} | true |`,
      '',
    ].join('\n'),
  );
  return workItemDir;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('Project Governance reverification after later Atomic Spec Merge', () => {
  it('does not replay a historically applied trace_delta after a later WI becomes last_merged_work_item', async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sf-reverification-merge-history-'),
    );
    roots.push(projectRoot);
    const projectDir = path.join(projectRoot, '.specforge', 'project');

    await writeJson(path.join(projectDir, 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0003',
      default_module: 'CORE',
      last_merged_work_item: 'WI-0002',
      project: {
        architecture: '.specforge/project/architecture.md',
        data_model: '.specforge/project/data_model.md',
        extension_registry: '.specforge/project/extension_registry.json',
        trace_matrix: '.specforge/project/trace_matrix.md',
      },
      modules: [
        {
          module_code: 'CORE',
          module_file: '.specforge/project/modules/CORE/module.json',
          design: '.specforge/project/modules/CORE/design.md',
          contracts: '.specforge/project/modules/CORE/contracts.json',
          trace: '.specforge/project/modules/CORE/trace.md',
          code_paths: ['src/**'],
        },
      ],
    });
    await writeText(path.join(projectDir, 'architecture.md'), '# Architecture\nARCH-CORE-001\n');
    await writeText(path.join(projectDir, 'data_model.md'), '# Data\nDATA-CORE-001\n');
    await writeJson(path.join(projectDir, 'extension_registry.json'), {});
    await writeText(
      path.join(projectDir, 'trace_matrix.md'),
      [
        '<!-- SPECFORGE_GOVERNANCE_RELATIONS_START -->',
        '| From | Relation | To |',
        '|---|---|---|',
        '| DD-CORE-001 | constrained_by | DATA-CORE-001 |',
        '<!-- SPECFORGE_GOVERNANCE_RELATIONS_END -->',
        '',
      ].join('\n'),
    );
    await writeJson(path.join(projectDir, 'modules', 'CORE', 'module.json'), {
      module_code: 'CORE',
      code_paths: ['src/**'],
      contracts: '.specforge/project/modules/CORE/contracts.json',
    });
    await writeText(
      path.join(projectDir, 'modules', 'CORE', 'design.md'),
      '# Design\nDD-CORE-001\n',
    );
    await writeJson(path.join(projectDir, 'modules', 'CORE', 'contracts.json'), {
      schema_version: '1.0',
      owner_module: 'CORE',
      contracts: {
        shared_enums: [],
        invariants: [],
        public_interfaces: [],
        extension_points: [],
        internal_contracts: [],
      },
    });
    await writeText(path.join(projectDir, 'modules', 'CORE', 'trace.md'), '');

    const wi1 = await writeMergedWorkItem({
      projectRoot,
      workItemId: 'WI-0001',
      baseVersion: 'PSV-0001',
      resultVersion: 'PSV-0002',
      targetPath: '.specforge/project/trace_matrix.md',
    });
    await writeText(
      path.join(wi1, 'candidates', 'trace_delta.md'),
      [
        '<!-- SPECFORGE_GOVERNANCE_DELTA_START -->',
        '| Operation | From | Relation | To |',
        '|---|---|---|---|',
        '| ADD | DD-CORE-001 | constrained_by | DATA-CORE-001 |',
        '<!-- SPECFORGE_GOVERNANCE_DELTA_END -->',
        '',
      ].join('\n'),
    );
    await writeMergedWorkItem({
      projectRoot,
      workItemId: 'WI-0002',
      baseVersion: 'PSV-0002',
      resultVersion: 'PSV-0003',
      targetPath: '.specforge/project/modules/CORE/module.json',
    });

    const ownMerge = await readSuccessfulProjectSpecMergeHistoryEvidence({
      projectRoot,
      workItemDir: wi1,
      workItemId: 'WI-0001',
    });
    expect(ownMerge).toEqual(
      expect.objectContaining({
        base_spec_version: 'PSV-0001',
        project_spec_version: 'PSV-0002',
      }),
    );

    const model = await inspectProjectGovernanceContractConsumers({
      projectRoot,
      workItemDir: wi1,
      prospective: true,
    });
    expect(model.already_merged).toBe(true);
    expect(model.trace_delta_operations).toEqual([]);
    expect(model.trace_issues).toEqual([]);
    expect(model.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'DD-CORE-001',
          relation: 'constrained_by',
          to: 'DATA-CORE-001',
        }),
      ]),
    );

    const chain = await proveProjectSpecVersionAdvancedBySuccessfulMerges({
      projectRoot,
      fromVersion: 'PSV-0002',
      toVersion: 'PSV-0003',
      finalLastMergedWorkItem: 'WI-0002',
    });
    expect(chain).toEqual({
      passed: true,
      from_version: 'PSV-0002',
      to_version: 'PSV-0003',
      work_items: ['WI-0002'],
      reason: 'current_project_spec_version_is_proven_by_successful_atomic_spec_merge_chain',
    });
  });

  it('fails closed when the later Project Spec version lacks an approved unique merge chain', async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sf-reverification-merge-chain-negative-'),
    );
    roots.push(projectRoot);

    await writeMergedWorkItem({
      projectRoot,
      workItemId: 'WI-0002',
      baseVersion: 'PSV-0002',
      resultVersion: 'PSV-0003',
      targetPath: '.specforge/project/modules/CORE/module.json',
      decisionStatus: 'rejected',
    });

    const chain = await proveProjectSpecVersionAdvancedBySuccessfulMerges({
      projectRoot,
      fromVersion: 'PSV-0002',
      toVersion: 'PSV-0003',
      finalLastMergedWorkItem: 'WI-0002',
    });
    expect(chain.passed).toBe(false);
    expect(chain.reason).toBe('merge_chain_cardinality_2=0');
  });
});
