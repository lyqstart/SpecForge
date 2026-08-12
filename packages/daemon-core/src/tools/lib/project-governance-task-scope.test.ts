import { afterEach, describe, expect, test } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkProjectGovernanceConsistency } from './project-governance-v2.js';

const roots: string[] = [];

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeText(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function createFixture(plannedCodePaths: string[], taskFiles: string[]): Promise<{
  projectRoot: string;
  workItemDir: string;
}> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-task-scope-'));
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
    modules: [{
      module_code: 'CORE',
      path: '.specforge/project/modules/CORE',
      module_file: '.specforge/project/modules/CORE/module.json',
      requirements: '.specforge/project/modules/CORE/requirements.md',
      design: '.specforge/project/modules/CORE/design.md',
      contracts: '.specforge/project/modules/CORE/contracts.json',
      trace: '.specforge/project/modules/CORE/trace.md',
      code_paths: ['src/**'],
    }],
  });
  await writeText(path.join(projectDir, 'architecture.md'), '# Architecture\n\nARCH-CORE-001\n');
  await writeText(path.join(projectDir, 'data_model.md'), '# Data Model\n\nDATA-CORE-001\n');
  await writeText(
    path.join(projectDir, 'trace_matrix.md'),
    '| From | Relation | To |\n|---|---|---|\n| DATA-CORE-001 | constrained_by | ARCH-CORE-001 |\n| DD-CORE-001 | constrained_by | DATA-CORE-001 |\n',
  );
  await writeJson(path.join(projectDir, 'extension_registry.json'), {
    schema_version: '1.0',
    contracts: { shared_enums: [], invariants: [], public_interfaces: [], extension_points: [] },
  });
  await writeJson(path.join(projectDir, 'modules', 'CORE', 'module.json'), {
    module_code: 'CORE',
    code_paths: ['src/**'],
    contracts: '.specforge/project/modules/CORE/contracts.json',
  });
  await writeText(path.join(projectDir, 'modules', 'CORE', 'requirements.md'), '# Requirements\n');
  await writeText(path.join(projectDir, 'modules', 'CORE', 'design.md'), '# Design\n\nDD-CORE-001\n');
  await writeJson(path.join(projectDir, 'modules', 'CORE', 'contracts.json'), {
    schema_version: '1.0',
    owner_module: 'CORE',
    contracts: { shared_enums: [], invariants: [], public_interfaces: [], extension_points: [], internal_contracts: [] },
  });
  await writeText(path.join(projectDir, 'modules', 'CORE', 'trace.md'), '');

  await writeJson(path.join(workItemDir, 'trigger_result.json'), {
    workflow_path: 'requirement_change_path',
    classification: {
      architecture_changed: false,
      data_model_changed: false,
      design_changed: false,
      module_contract_changed: false,
    },
    impact_scope: {
      affected_modules: ['CORE'],
      architecture_refs: ['ARCH-CORE-001'],
      data_model_refs: ['DATA-CORE-001'],
      design_refs: ['DD-CORE-001'],
      project_contract_refs: [],
      module_contract_refs: [],
      planned_code_paths: plannedCodePaths,
    },
  });
  const renderedFiles = taskFiles.map(file => `  - \`${file}\``).join('\n');
  await writeText(
    path.join(workItemDir, 'candidates', 'tasks.md'),
    [
      '# Tasks',
      '',
      '### TASK-WI-0001-001 scope fixture',
      '- **allowed_write_files**:',
      renderedFiles,
      '',
    ].join('\n'),
  );
  return { projectRoot, workItemDir };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('Candidate Task write scope consistency', () => {
  test('blocks a Task write path outside approved Impact Scope', async () => {
    const { projectRoot, workItemDir } = await createFixture(
      ['src/inside.ts'],
      ['src/inside.ts', 'package.json', 'tsconfig.json'],
    );
    const result = await checkProjectGovernanceConsistency({ projectRoot, workItemDir, workItemId: 'WI-0001' });
    for (const outsidePath of ['package.json', 'tsconfig.json']) {
      const check = result.checks.find(candidate =>
        candidate.description === `Task TASK-WI-0001-001 write path is inside approved Impact Scope: ${outsidePath}`);
      expect(check?.passed, outsidePath).toBe(false);
    }
  });

  test('blocks an approved Task path with zero Module owners', async () => {
    const { projectRoot, workItemDir } = await createFixture(
      ['src/inside.ts', 'package.json'],
      ['src/inside.ts', 'package.json'],
    );
    const result = await checkProjectGovernanceConsistency({ projectRoot, workItemDir, workItemId: 'WI-0001' });
    const check = result.checks.find(candidate =>
      candidate.description === 'Task TASK-WI-0001-001 write path maps to exactly one Module or approved cross-module test harness: package.json');
    expect(check?.passed).toBe(false);
  });

  test('allows Task refinement as a subset and preserves the approved cross-module test exception', async () => {
    const { projectRoot, workItemDir } = await createFixture(
      ['src/inside.ts', 'src/runtime-only.ts', 'tests/cross.test.ts'],
      ['src/inside.ts', 'tests/cross.test.ts'],
    );
    const result = await checkProjectGovernanceConsistency({ projectRoot, workItemDir, workItemId: 'WI-0001' });
    const taskChecks = result.checks.filter(check =>
      check.check_id.startsWith('task_allowed_write_files_') || check.check_id.startsWith('task_write_'));
    expect(taskChecks.length).toBeGreaterThan(0);
    expect(taskChecks.every(check => check.passed), JSON.stringify(taskChecks, null, 2)).toBe(true);
  });
});
