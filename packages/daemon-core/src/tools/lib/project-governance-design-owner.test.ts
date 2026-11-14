import { afterEach, describe, expect, test } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { inspectProjectGovernanceContractConsumers } from './project-governance-v2.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

async function fixture(order: string[]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-design-owner-'));
  roots.push(root);
  const project = path.join(root, '.specforge', 'project');
  async function write(relative: string, content: unknown) {
    const target = path.join(project, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, typeof content === 'string' ? content : JSON.stringify(content));
  }
  await write('spec_manifest.json', {
    schema_version: '1.0',
    project_spec_version: 'PSV-0001',
    default_module: 'AA',
    project: {},
    modules: order.map(module_code => ({ module_code })),
  });
  await write('architecture.md', '# Architecture\nARCH-ROOT-001\n');
  await write('data_model.md', '# Data\nDATA-ROOT-001\n');
  await write('extension_registry.json', { contracts: {} });
  await write(
    'trace_matrix.md',
    '| From | Relation | To |\n|---|---|---|\n| DD-AA-001 | constrained_by | OnlyAA |\n'
  );
  for (const moduleCode of order) {
    await write(`modules/${moduleCode}/module.json`, {
      schema_version: '1.0',
      module_code: moduleCode,
      code_paths: [`src/${moduleCode}/**`],
      status: 'active',
    });
    await write(
      `modules/${moduleCode}/design.md`,
      `# Design\n\n#### DD-${moduleCode}-001 Owned decision\nModule ${moduleCode} design.\n`
    );
    await write(`modules/${moduleCode}/contracts.json`, {
      schema_version: '1.0',
      owner_module: moduleCode,
      contracts: {
        shared_enums: [],
        invariants:
          moduleCode === 'AA'
            ? [
                {
                  id: 'OnlyAA',
                  name: 'AA internal',
                  owner_module: 'AA',
                  rule: 'AA only',
                  scope: 'module',
                  source_refs: ['DD-AA-001'],
                  enforcement: 'unit assertion',
                },
              ]
            : [],
        public_interfaces: [],
        extension_points: [],
      },
    });
    await write(`modules/${moduleCode}/trace.md`, '');
  }
  return {
    write,
    inspect: () =>
      inspectProjectGovernanceContractConsumers({
        projectRoot: root,
        workItemDir: path.join(root, '.specforge', 'work-items', 'WI-0001'),
        prospective: false,
      }),
  };
}

describe('canonical design ownership across references', () => {
  test.each([
    ['AA', 'ZZ'],
    ['ZZ', 'AA'],
  ])('foreign references preserve owner for module order %s, %s', async (first, second) => {
    const f = await fixture([first, second]);
    const baseline = await f.inspect();
    expect(baseline.trace_issues).toEqual([]);
    await f.write('modules/ZZ/design.md', '# Design\n#### DD-ZZ-001\nReference: DD-AA-001.\n');
    const referenced = await f.inspect();
    expect(referenced.trace_issues).toEqual([]);
    expect(referenced.consumers).toEqual(baseline.consumers);
  });

  test('a real foreign consumer still violates the internal contract boundary', async () => {
    const f = await fixture(['AA', 'ZZ']);
    await f.write('modules/ZZ/design.md', '# Design\n#### DD-ZZ-001\nReference: DD-AA-001.\n');
    await f.write(
      'trace_matrix.md',
      '| From | Relation | To |\n|---|---|---|\n| DD-ZZ-001 | constrained_by | OnlyAA |\n'
    );
    const result = await f.inspect();
    expect(
      result.trace_issues.some(issue => issue.code === 'TRACE_INTERNAL_CONTRACT_CROSS_MODULE')
    ).toBe(true);
  });

  test('a foreign reference cannot supply a missing owner design endpoint', async () => {
    const f = await fixture(['AA', 'ZZ']);
    await f.write('modules/AA/design.md', '# Design\nNo owned decision.\n');
    await f.write('modules/ZZ/design.md', '# Design\n#### DD-ZZ-001\nReference: DD-AA-001.\n');
    const result = await f.inspect();
    expect(result.trace_issues.some(issue => issue.code === 'TRACE_DANGLING_ENDPOINT')).toBe(true);
  });

  test('an owner-side reference cannot disguise a real foreign consumer', async () => {
    const f = await fixture(['ZZ', 'AA']);
    await f.write(
      'modules/AA/design.md',
      '# Design\n#### DD-AA-001\nReference only: DD-ZZ-001 remains owned by ZZ.\n'
    );
    await f.write(
      'trace_matrix.md',
      '| From | Relation | To |\n|---|---|---|\n| DD-ZZ-001 | constrained_by | OnlyAA |\n'
    );
    const result = await f.inspect();
    expect(
      result.trace_issues.some(issue => issue.code === 'TRACE_INTERNAL_CONTRACT_CROSS_MODULE')
    ).toBe(true);
  });
});
