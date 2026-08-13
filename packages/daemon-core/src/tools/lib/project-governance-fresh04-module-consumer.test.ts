import { afterEach, describe, expect, test } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  checkProjectGovernanceConsistency,
  inspectProjectGovernanceContractConsumers,
} from './project-governance-v2.js';

const roots: string[] = [];

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}
async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeText(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function createFresh04Shape(options?: { malformedCandidate?: boolean; wrongModuleId?: boolean }) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-fresh04-consumer-'));
  roots.push(projectRoot);
  const projectDir = path.join(projectRoot, '.specforge', 'project');
  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');
  const moduleDir = path.join(projectDir, 'modules', 'CORE');
  const candidatePath = path.join(
    workItemDir,
    'candidates',
    'project',
    'modules',
    'CORE',
    'module.candidate.json',
  );

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
    modules: [{
      module_code: 'CORE',
      path: '.specforge/project/modules/CORE',
      module_file: '.specforge/project/modules/CORE/module.json',
      requirements: '.specforge/project/modules/CORE/requirements.md',
      design: '.specforge/project/modules/CORE/design.md',
      contracts: '.specforge/project/modules/CORE/contracts.json',
      trace: '.specforge/project/modules/CORE/trace.md',
    }],
  });
  await writeText(path.join(projectDir, 'architecture.md'), '# Architecture\n\nARCH-CORE-001 root.\n');
  await writeText(path.join(projectDir, 'data_model.md'), '# Data\n\nDATA-CORE-001 model.\n');
  await writeText(path.join(projectDir, 'trace_matrix.md'), '');
  await writeJson(path.join(projectDir, 'extension_registry.json'), {});
  await writeJson(path.join(moduleDir, 'module.json'), { module_code: 'CORE', status: 'active' });
  await writeText(path.join(moduleDir, 'requirements.md'), '# Requirements\n');
  await writeText(path.join(moduleDir, 'design.md'), '# Design\n\nDD-CORE-001 decision.\n');
  await writeText(path.join(moduleDir, 'trace.md'), '');
  await writeJson(path.join(moduleDir, 'contracts.json'), {
    schema_version: '1.0',
    owner_module: 'CORE',
    contracts: {
      shared_enums: [], invariants: [], public_interfaces: [], extension_points: [],
    },
  });

  if (options?.malformedCandidate) {
    await writeText(candidatePath, '{bad json');
  } else {
    await writeJson(candidatePath, {
      module_code: 'CORE',
      status: 'active',
      code_paths: [
        'src/domain/**',
        'src/service/**',
        'src/persistence/**',
        'src/api/**',
        'src/cli/**',
        'src/index.ts',
        'package.json',
        'tsconfig.json',
        'vitest.config.ts',
        '.gitignore',
      ],
      contracts: '.specforge/project/modules/CORE/contracts.json',
    });
  }

  await writeJson(path.join(workItemDir, 'candidate_manifest.json'), {
    schema_version: '1.1',
    work_item_id: 'WI-0001',
    workflow_type: 'feature_spec',
    workflow_path: 'requirement_change_path',
    entries: [{
      candidate_path: 'candidates/project/modules/CORE/module.candidate.json',
      target_path: '.specforge/project/modules/CORE/module.json',
      operation: 'replace',
      type: 'module_definition',
      module_id: options?.wrongModuleId ? 'OTHER' : 'CORE',
      inferred: true,
      normalized: true,
    }],
  });
  await writeJson(path.join(workItemDir, 'trigger_result.json'), {
    schema_version: '1.0',
    work_item_id: 'WI-0001',
    workflow_path: 'requirement_change_path',
    classification: {
      requirement_changed: false,
      architecture_changed: false,
      data_model_changed: false,
      design_changed: false,
      module_contract_changed: false,
      module_boundary_changed: false,
    },
    impact_scope: {
      affected_modules: ['CORE'],
      architecture_refs: [],
      data_model_refs: [],
      design_refs: [],
      project_contract_refs: [],
      module_contract_refs: [],
      planned_code_paths: ['src/domain/types.ts', 'src/service/InventoryService.ts', 'package.json'],
    },
  });
  await writeText(
    path.join(workItemDir, 'tasks.md'),
    [
      '# Tasks',
      '',
      '## TASK-WI-0001-001',
      '- allowed_write_files: `src/domain/types.ts`, `src/service/InventoryService.ts`, `package.json`',
      '',
    ].join('\n'),
  );
  return { projectRoot, workItemDir, candidatePath };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('Fresh-04 prospective module_definition consumer', () => {
  test('binds the frozen module_definition candidate by module identity and records the actual candidate input', async () => {
    const { projectRoot, workItemDir, candidatePath } = await createFresh04Shape();
    const snapshot = await inspectProjectGovernanceContractConsumers({
      projectRoot,
      workItemDir,
      prospective: true,
    });

    expect(snapshot.module_code_paths.CORE).toEqual(
      expect.arrayContaining(['src/domain/**', 'src/service/**', 'package.json']),
    );
    expect(snapshot.inputFiles.map(value => path.resolve(value))).toContain(path.resolve(candidatePath));

    const consistency = await checkProjectGovernanceConsistency({
      projectRoot,
      workItemDir,
      workItemId: 'WI-0001',
    });
    expect(
      consistency.checks.find(check => check.check_id === 'module_CORE_code_paths')?.passed,
    ).toBe(true);
    for (const check of consistency.checks.filter(check => check.check_id.startsWith('planned_code_owner_'))) {
      expect(check.passed, JSON.stringify(check)).toBe(true);
      expect(check.details).toContain('owners=CORE');
    }
  });

  test('does not bind a candidate carrying the wrong frozen module_id', async () => {
    const { projectRoot, workItemDir, candidatePath } = await createFresh04Shape({ wrongModuleId: true });
    const snapshot = await inspectProjectGovernanceContractConsumers({
      projectRoot,
      workItemDir,
      prospective: true,
    });
    expect(snapshot.module_code_paths.CORE).toEqual([]);
    expect(snapshot.inputFiles.map(value => path.resolve(value))).not.toContain(path.resolve(candidatePath));
  });

  test('fails closed on malformed candidate JSON instead of silently using formal code_paths', async () => {
    const { projectRoot, workItemDir, candidatePath } = await createFresh04Shape({ malformedCandidate: true });
    const snapshot = await inspectProjectGovernanceContractConsumers({
      projectRoot,
      workItemDir,
      prospective: true,
    });
    expect(snapshot.module_code_paths.CORE).toEqual([]);
    expect(snapshot.inputFiles.map(value => path.resolve(value))).toContain(path.resolve(candidatePath));

    const consistency = await checkProjectGovernanceConsistency({
      projectRoot,
      workItemDir,
      workItemId: 'WI-0001',
    });
    expect(
      consistency.checks.find(check => check.check_id === 'module_CORE_code_paths')?.passed,
    ).toBe(false);
  });
});
