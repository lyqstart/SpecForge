import { afterEach, describe, expect, test } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  checkProjectGovernanceConsistency,
  checkProjectGovernanceTrace,
} from './project-governance-v2.js';

const roots: string[] = [];

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeText(filePath, JSON.stringify(value, null, 2) + '\n');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('greenfield pre-merge Project Governance', () => {
  test('uses prospective module definitions, structured trace declarations, and impact_summary', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-greenfield-premerge-'));
    roots.push(projectRoot);

    const projectDir = path.join(projectRoot, '.specforge', 'project');
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');

    await writeJson(path.join(projectDir, 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      default_module: 'CORE',
      project: {
        architecture: '.specforge/project/architecture.md',
        data_model: '.specforge/project/data_model.md',
        extension_registry: '.specforge/project/extension_registry.json',
        trace_matrix: '.specforge/project/trace_matrix.md',
      },
      modules: [
        {
          module_code: 'CORE',
          path: '.specforge/project/modules/CORE',
          module_file: '.specforge/project/modules/CORE/module.json',
          requirements: '.specforge/project/modules/CORE/requirements.md',
          design: '.specforge/project/modules/CORE/design.md',
          trace: '.specforge/project/modules/CORE/trace.md',
        },
      ],
    });
    await writeText(path.join(projectDir, 'architecture.md'), '> TODO\n');
    await writeText(path.join(projectDir, 'trace_matrix.md'), '> TODO\n');
    await writeJson(path.join(projectDir, 'extension_registry.json'), {});
    await writeJson(path.join(projectDir, 'modules', 'CORE', 'module.json'), {
      module_code: 'CORE',
      status: 'active',
    });
    await writeText(path.join(projectDir, 'modules', 'CORE', 'design.md'), '> TODO\n');
    await writeText(path.join(projectDir, 'modules', 'CORE', 'trace.md'), '> TODO\n');

    const candidates = path.join(workItemDir, 'candidates');
    await writeText(
      path.join(candidates, 'project', 'architecture.candidate.md'),
      '# Architecture\n\nARCH-WD-001 defines the initial boundary.\n'
    );
    await writeText(
      path.join(candidates, 'project', 'data_model.candidate.md'),
      '# Data Model\n\nDATA-WD-001 defines the entity.\n'
    );
    await writeJson(path.join(candidates, 'project', 'modules', 'CORE', 'module.candidate.json'), {
      module_code: 'CORE',
      code_paths: [],
      contracts: '.specforge/project/modules/CORE/contracts.json',
    });
    await writeText(
      path.join(candidates, 'project', 'modules', 'CORE', 'design.candidate.md'),
      '# CORE Governance Design\n\nDD-DOMAIN-001 is governed by the project root.\n'
    );
    await writeJson(
      path.join(candidates, 'project', 'modules', 'CORE', 'contracts.candidate.json'),
      {
        schema_version: '1.0',
        owner_module: 'CORE',
        contracts: {
          shared_enums: [],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
          internal_contracts: [],
        },
      }
    );
    await writeText(path.join(candidates, 'project', 'modules', 'CORE', 'trace.candidate.md'), '');

    await writeJson(
      path.join(candidates, 'project', 'modules', 'DOMAIN', 'module.candidate.json'),
      {
        module_code: 'DOMAIN',
        code_paths: ['src/domain/**'],
        contracts: '.specforge/project/modules/DOMAIN/contracts.json',
      }
    );
    await writeText(
      path.join(candidates, 'project', 'modules', 'DOMAIN', 'design.candidate.md'),
      '# DOMAIN Design\n\nDD-DOMAIN-001 implements DATA-WD-001.\n'
    );
    await writeJson(
      path.join(candidates, 'project', 'modules', 'DOMAIN', 'contracts.candidate.json'),
      {
        schema_version: '1.0',
        owner_module: 'DOMAIN',
        contracts: {
          shared_enums: [],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
          internal_contracts: [],
        },
      }
    );
    await writeText(path.join(candidates, 'project', 'modules', 'DOMAIN', 'trace.candidate.md'), '');

    await writeText(
      path.join(candidates, 'trace_delta.md'),
      [
        '# Trace Delta',
        '',
        '```json',
        JSON.stringify(
          {
            data_designs: [
              { id: 'DATA-WD-001', constrained_by: ['ARCH-WD-001'] },
            ],
            module_designs: [
              { id: 'DD-DOMAIN-001', constrained_by: ['DATA-WD-001'] },
            ],
          },
          null,
          2
        ),
        '```',
        '',
      ].join('\n')
    );

    const entries = [
      ['candidates/project/architecture.candidate.md', '.specforge/project/architecture.md'],
      ['candidates/project/data_model.candidate.md', '.specforge/project/data_model.md'],
      ['candidates/project/modules/CORE/module.candidate.json', '.specforge/project/modules/CORE/module.json'],
      ['candidates/project/modules/CORE/design.candidate.md', '.specforge/project/modules/CORE/design.md'],
      ['candidates/project/modules/CORE/contracts.candidate.json', '.specforge/project/modules/CORE/contracts.json'],
      ['candidates/project/modules/CORE/trace.candidate.md', '.specforge/project/modules/CORE/trace.md'],
      ['candidates/project/modules/DOMAIN/module.candidate.json', '.specforge/project/modules/DOMAIN/module.json'],
      ['candidates/project/modules/DOMAIN/design.candidate.md', '.specforge/project/modules/DOMAIN/design.md'],
      ['candidates/project/modules/DOMAIN/contracts.candidate.json', '.specforge/project/modules/DOMAIN/contracts.json'],
      ['candidates/project/modules/DOMAIN/trace.candidate.md', '.specforge/project/modules/DOMAIN/trace.md'],
      ['candidates/trace_delta.md', '.specforge/project/trace_matrix.md'],
    ].map(([candidate_path, target_path]) => ({ candidate_path, target_path, operation: 'replace' }));

    await writeJson(path.join(workItemDir, 'candidate_manifest.json'), {
      schema_version: '1.1',
      work_item_id: 'WI-0001',
      workflow_path: 'architecture_change_path',
      entries,
    });
    await writeJson(path.join(workItemDir, 'trigger_result.json'), {
      schema_version: '1.1',
      work_item_id: 'WI-0001',
      workflow_path: 'architecture_change_path',
      classification: {
        architecture_changed: true,
        data_model_changed: true,
        design_changed: true,
        module_contract_changed: true,
      },
      impact_summary: {
        existing_modules: ['CORE'],
        new_modules: ['DOMAIN'],
      },
    });

    const input = { projectRoot, workItemDir, workItemId: 'WI-0001' };
    const consistency = await checkProjectGovernanceConsistency(input);
    const trace = await checkProjectGovernanceTrace(input);

    expect(consistency.active).toBe(true);
    expect(consistency.passed, JSON.stringify(consistency.checks, null, 2)).toBe(true);
    expect(trace.active).toBe(true);
    expect(trace.passed, JSON.stringify(trace.checks, null, 2)).toBe(true);
  });
});
