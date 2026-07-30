import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import {
  auditActualGovernanceScope,
  freezeGovernanceScopeForCodePermission,
  persistGovernanceScope,
} from './project-governance-v2.js';

const roots: string[] = [];

async function write(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function createFixture(): Promise<{ projectRoot: string; workItemDir: string }> {
  const projectRoot = await fs.mkdtemp(path.join(tmpdir(), 'sf-greenfield-permission-'));
  roots.push(projectRoot);
  const projectDir = path.join(projectRoot, '.specforge', 'project');
  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0002');
  await write(
    path.join(projectDir, 'spec_manifest.json'),
    JSON.stringify(
      {
        schema_version: '1.0',
        project_spec_version: 'PSV-0002',
        last_merged_work_item: 'WI-0002',
        project: {
          architecture: '.specforge/project/architecture.md',
          data_model: '.specforge/project/data_model.md',
          trace_matrix: '.specforge/project/trace_matrix.md',
          extension_registry: '.specforge/project/extension_registry.json',
        },
        modules: [
          {
            module_code: 'DOMAIN',
            design: '.specforge/project/modules/DOMAIN/design.md',
            contracts: '.specforge/project/modules/DOMAIN/contracts.json',
            trace: '.specforge/project/modules/DOMAIN/trace.md',
            code_paths: ['src/domain/**'],
          },
        ],
      },
      null,
      2,
    ),
  );
  await write(path.join(projectDir, 'architecture.md'), '# Architecture\n\nARCH-WD-001\n');
  await write(path.join(projectDir, 'data_model.md'), '# Data Model\n\nDATA-WD-001\n');
  await write(
    path.join(projectDir, 'trace_matrix.md'),
    '| From | Relation | To |\n|---|---|---|\n| DATA-WD-001 | constrained_by | ARCH-WD-001 |\n',
  );
  await write(
    path.join(projectDir, 'extension_registry.json'),
    JSON.stringify({ schema_version: '1.0', contracts: {} }),
  );
  await write(
    path.join(projectDir, 'modules', 'DOMAIN', 'design.md'),
    '# Domain Design\n\nDD-DOMAIN-001\n',
  );
  await write(
    path.join(projectDir, 'modules', 'DOMAIN', 'contracts.json'),
    JSON.stringify({
      schema_version: '1.0',
      owner_module: 'DOMAIN',
      contracts: {
        shared_enums: [],
        invariants: [],
        public_interfaces: [],
        extension_points: [],
        internal_contracts: [],
      },
    }),
  );
  await write(
    path.join(projectDir, 'modules', 'DOMAIN', 'trace.md'),
    '| From | Relation | To |\n|---|---|---|\n| DD-DOMAIN-001 | constrained_by | DATA-WD-001 |\n',
  );
  await write(
    path.join(workItemDir, 'trigger_result.json'),
    JSON.stringify({
      workflow_path: 'architecture_change_path',
      classification: { architecture_changed: true },
      impact_summary: {
        existing_modules: ['CORE'],
        new_modules: ['DOMAIN'],
      },
    }),
  );
  await write(
    path.join(workItemDir, 'candidates', 'tasks.md'),
    [
      '# Candidate Tasks',
      '',
      '- **files**: [src/domain/types.ts, tests/workdesk.test.ts]',
      '',
    ].join('\n'),
  );
  await write(
    path.join(workItemDir, 'work_item.json'),
    JSON.stringify({
      work_item_id: 'WI-0002',
      code_change_allowed: false,
      allowed_write_files: [],
    }),
  );
  return { projectRoot, workItemDir };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('greenfield code permission governance scope', () => {
  test('derives merged architecture scope and permits an approved cross-module test harness', async () => {
    const { projectRoot, workItemDir } = await createFixture();
    const result = await freezeGovernanceScopeForCodePermission({
      projectRoot,
      workItemDir,
      workItemId: 'WI-0002',
      allowedWriteFiles: [
        { path: 'src/domain/types.ts', operation: 'create' },
        { path: 'tests/workdesk.test.ts', operation: 'create' },
      ],
    });

    expect(result.passed, JSON.stringify(result.checks.filter(check => !check.passed))).toBe(true);
    expect(result.snapshot.affected_modules).toEqual(['DOMAIN']);
    expect(result.snapshot.design_refs).toEqual(['DD-DOMAIN-001']);
    expect(result.snapshot.data_model_refs).toEqual(['DATA-WD-001']);
    expect(result.snapshot.architecture_refs).toEqual(['ARCH-WD-001']);

    await persistGovernanceScope(workItemDir, result.snapshot);
    const audit = await auditActualGovernanceScope({
      projectRoot,
      workItemDir,
      changedFiles: ['src/domain/types.ts', 'tests/workdesk.test.ts'],
    });
    expect(audit.passed, audit.violations.join('; ')).toBe(true);
  });

  test('rejects an unapproved ownerless test file', async () => {
    const { projectRoot, workItemDir } = await createFixture();
    const result = await freezeGovernanceScopeForCodePermission({
      projectRoot,
      workItemDir,
      workItemId: 'WI-0002',
      allowedWriteFiles: [{ path: 'tests/not-approved.test.ts', operation: 'create' }],
    });
    expect(result.passed).toBe(false);
    expect(result.checks.some(check => !check.passed && check.check_id.startsWith('permission_owner_'))).toBe(true);
  });
});
