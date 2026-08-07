import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkContractIntegrity } from '../../src/tools/lib/contract-integrity';

describe('contract integrity formal Trace consumers', () => {
  let root: string;
  let wiDir: string;

  beforeEach(async () => {
    root = path.join(os.tmpdir(), `sf-contract-integrity-${Date.now()}-${Math.random()}`);
    wiDir = path.join(root, '.specforge', 'work-items', 'WI-0001');
    const project = path.join(root, '.specforge', 'project');
    const moduleRoot = path.join(project, 'modules', 'PHOTO');
    await fs.mkdir(moduleRoot, { recursive: true });
    await fs.mkdir(path.join(wiDir, 'candidates', 'project', 'modules', 'PHOTO'), {
      recursive: true,
    });
    await fs.writeFile(path.join(project, 'architecture.md'), '# Architecture\nARCH-CORE-001\n');
    await fs.writeFile(path.join(project, 'data_model.md'), '# Data\nDATA-CORE-001\n');
    await fs.writeFile(
      path.join(project, 'spec_manifest.json'),
      JSON.stringify({
        project_spec_version: 'PSV-0001',
        project: {
          architecture: '.specforge/project/architecture.md',
          data_model: '.specforge/project/data_model.md',
          extension_registry: '.specforge/project/extension_registry.json',
          trace_matrix: '.specforge/project/trace_matrix.md',
        },
        modules: [
          {
            module_code: 'PHOTO',
            module_file: '.specforge/project/modules/PHOTO/module.json',
            design: '.specforge/project/modules/PHOTO/design.md',
            contracts: '.specforge/project/modules/PHOTO/contracts.json',
            trace: '.specforge/project/modules/PHOTO/trace.md',
            code_paths: ['src/photo/**'],
          },
        ],
      }),
    );
    await fs.writeFile(
      path.join(project, 'extension_registry.json'),
      JSON.stringify({
        contracts: {
          shared_enums: [
            {
              id: 'PhotoStatus',
              owner_module: 'PHOTO',
              source_refs: ['DATA-CORE-001'],
              enforcement: 'static',
              values: ['pending', 'ready'],
            },
          ],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      }),
    );
    await fs.writeFile(
      path.join(project, 'trace_matrix.md'),
      [
        '| From | Relation | To |',
        '|---|---|---|',
        '| DATA-CORE-001 | constrained_by | ARCH-CORE-001 |',
        '| DD-PHOTO-001 | constrained_by | PhotoStatus |',
        '| PhotoStatus | enforces | DATA-CORE-001 |',
      ].join('\n'),
    );
    await fs.writeFile(
      path.join(moduleRoot, 'module.json'),
      JSON.stringify({ module_code: 'PHOTO', code_paths: ['src/photo/**'] }),
    );
    await fs.writeFile(path.join(moduleRoot, 'design.md'), '# Design\nDD-PHOTO-001\n');
    await fs.writeFile(
      path.join(moduleRoot, 'contracts.json'),
      JSON.stringify({
        schema_version: '1.0',
        owner_module: 'PHOTO',
        contracts: {
          shared_enums: [],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      }),
    );
    await fs.writeFile(
      path.join(moduleRoot, 'trace.md'),
      '<!-- GENERATED_FROM_PROJECT_TRACE: module projection -->\n| From | Relation | To |\n|---|---|---|\n| DD-PHOTO-001 | constrained_by | PhotoStatus |\n',
    );
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function writeProjectRegistryCandidate(options: {
    values?: string[];
    includeConsumerDesign?: boolean;
    removeContract?: boolean;
    traceDelta?: string;
  }): Promise<void> {
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'extension_registry.json'),
      JSON.stringify({
        contracts: {
          shared_enums: options.removeContract
            ? []
            : [
                {
                  id: 'PhotoStatus',
                  owner_module: 'PHOTO',
                  source_refs: ['DATA-CORE-001'],
                  enforcement: 'static',
                  values: options.values ?? ['pending', 'ready'],
                },
              ],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      }),
    );
    const entries: Array<Record<string, string>> = [
      {
        candidate_path: 'candidates/project/extension_registry.json',
        target_path: '.specforge/project/extension_registry.json',
        operation: 'replace',
      },
    ];
    if (options.includeConsumerDesign) {
      await fs.writeFile(
        path.join(wiDir, 'candidates', 'project', 'modules', 'PHOTO', 'design.md'),
        '# Design\nDD-PHOTO-001\nstatus is ready.\n',
      );
      entries.push({
        candidate_path: 'candidates/project/modules/PHOTO/design.md',
        target_path: '.specforge/project/modules/PHOTO/design.md',
        operation: 'replace',
      });
    }
    if (options.traceDelta !== undefined) {
      await fs.writeFile(
        path.join(wiDir, 'candidates', 'trace_delta.md'),
        options.traceDelta,
      );
      entries.push({
        candidate_path: 'candidates/trace_delta.md',
        target_path: '.specforge/project/trace_matrix.md',
        operation: 'replace',
      });
    }
    await fs.writeFile(path.join(wiDir, 'candidate_manifest.json'), JSON.stringify({ entries }));
  }

  it('blocks a destructive Project Contract change when a formal consumer design is omitted', async () => {
    await writeProjectRegistryCandidate({ values: ['ready'] });
    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    const check = result.checks.find(item => item.check_id === 'contract_reverse_dependencies_aligned');
    expect(check?.passed).toBe(false);
    expect(check?.details).toContain('consumer Module PHOTO design.md');
  });

  it('passes when the same WI updates every formal consumer design', async () => {
    await writeProjectRegistryCandidate({ values: ['ready'], includeConsumerDesign: true });
    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    expect(result.checks.every(check => check.passed)).toBe(true);
  });

  it('blocks Contract deletion without an explicit Trace REMOVE', async () => {
    await writeProjectRegistryCandidate({
      removeContract: true,
      includeConsumerDesign: true,
    });
    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    expect(result.checks.find(check => check.check_id === 'contract_reverse_dependencies_aligned')?.details)
      .toContain('missing REMOVE');
  });

  it('allows Contract deletion only when the same WI removes the formal consumer edge', async () => {
    await writeProjectRegistryCandidate({
      removeContract: true,
      includeConsumerDesign: true,
      traceDelta: 'REMOVE | DD-PHOTO-001 | constrained_by | PhotoStatus\nREMOVE | PhotoStatus | enforces | DATA-CORE-001\n',
    });
    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    expect(result.checks.every(check => check.passed)).toBe(true);
  });

  it('accepts a numeric shared enum with explicit value_type=number', async () => {
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'extension_registry.json'),
      JSON.stringify({
        contracts: {
          shared_enums: [
            {
              id: 'PhotoStatus',
              owner_module: 'PHOTO',
              source_refs: ['DATA-CORE-001'],
              enforcement: 'static',
              values: ['pending', 'ready'],
            },
            {
              id: 'SyncErrorCode',
              owner_module: 'PHOTO',
              source_refs: ['DATA-CORE-001'],
              enforcement: 'static',
              value_type: 'number',
              values: [4004, 4006],
            },
          ],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      }),
    );
    await fs.writeFile(
      path.join(wiDir, 'candidate_manifest.json'),
      JSON.stringify({
        entries: [
          {
            candidate_path: 'candidates/project/extension_registry.json',
            target_path: '.specforge/project/extension_registry.json',
            operation: 'replace',
          },
        ],
      }),
    );
    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    expect(result.checks.every(check => check.passed)).toBe(true);
  });

  it('rejects shared enum values that conflict with value_type', async () => {
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'extension_registry.json'),
      JSON.stringify({
        contracts: {
          shared_enums: [
            {
              id: 'SyncErrorCode',
              owner_module: 'PHOTO',
              value_type: 'number',
              values: ['4004'],
            },
          ],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      }),
    );
    await fs.writeFile(
      path.join(wiDir, 'candidate_manifest.json'),
      JSON.stringify({
        entries: [
          {
            candidate_path: 'candidates/project/extension_registry.json',
            target_path: '.specforge/project/extension_registry.json',
            operation: 'replace',
          },
        ],
      }),
    );
    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    expect(result.checks.find(check => check.check_id === 'contract_candidate_registry_schema')?.passed)
      .toBe(false);
  });

  it('is compatible when the Project Contract registry is not targeted', async () => {
    await fs.writeFile(path.join(wiDir, 'candidate_manifest.json'), JSON.stringify({ entries: [] }));
    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    expect(result.registryTargeted).toBe(false);
    expect(result.checks.every(check => check.passed)).toBe(true);
  });

  it('accepts complete Module-to-Project Contract promotion as one atomic WI', async () => {
    const project = path.join(root, '.specforge', 'project');
    const moduleRoot = path.join(project, 'modules', 'PHOTO');
    await fs.writeFile(
      path.join(moduleRoot, 'contracts.json'),
      JSON.stringify({
        schema_version: '1.0',
        owner_module: 'PHOTO',
        contracts: {
          shared_enums: [],
          invariants: [
            {
              id: 'MCON-PHOTO-STATUS',
              owner_module: 'PHOTO',
              source_refs: ['DD-PHOTO-001'],
              enforcement: 'manual',
              scope: 'module',
              rule: 'photo status remains valid',
            },
          ],
          public_interfaces: [],
          extension_points: [],
        },
      }),
    );
    await fs.writeFile(
      path.join(project, 'trace_matrix.md'),
      [
        '| From | Relation | To |',
        '|---|---|---|',
        '| DATA-CORE-001 | constrained_by | ARCH-CORE-001 |',
        '| DD-PHOTO-001 | constrained_by | MCON-PHOTO-STATUS |',
        '| MCON-PHOTO-STATUS | enforces | DD-PHOTO-001 |',
      ].join('\n'),
    );
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'extension_registry.json'),
      JSON.stringify({
        contracts: {
          shared_enums: [
            {
              id: 'PhotoStatus',
              owner_module: 'PHOTO',
              source_refs: ['DATA-CORE-001'],
              enforcement: 'static',
              values: ['pending', 'ready'],
            },
          ],
          invariants: [
            {
              id: 'PCON-PHOTO-STATUS',
              owner_module: 'PHOTO',
              source_refs: ['DATA-CORE-001'],
              enforcement: 'manual',
              rule: 'photo status remains valid',
            },
          ],
          public_interfaces: [],
          extension_points: [],
        },
      }),
    );
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'modules', 'PHOTO', 'contracts.json'),
      JSON.stringify({
        schema_version: '1.0',
        owner_module: 'PHOTO',
        contracts: {
          shared_enums: [],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      }),
    );
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'modules', 'PHOTO', 'design.md'),
      '# Design\nDD-PHOTO-001\nPromoted to Project Contract.\n',
    );
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'trace_delta.md'),
      [
        'REMOVE | DD-PHOTO-001 | constrained_by | MCON-PHOTO-STATUS',
        'REMOVE | MCON-PHOTO-STATUS | enforces | DD-PHOTO-001',
        'ADD | DD-PHOTO-001 | constrained_by | PCON-PHOTO-STATUS',
        'ADD | PCON-PHOTO-STATUS | enforces | DATA-CORE-001',
      ].join('\n'),
    );
    await fs.writeFile(
      path.join(wiDir, 'candidate_manifest.json'),
      JSON.stringify({
        contract_promotions: [
          {
            from_contract_id: 'MCON-PHOTO-STATUS',
            to_contract_id: 'PCON-PHOTO-STATUS',
            compatibility: 'compatible after atomic relationship migration',
            migration_conclusion: 'all formal consumers migrated',
          },
        ],
        entries: [
          {
            candidate_path: 'candidates/project/extension_registry.json',
            target_path: '.specforge/project/extension_registry.json',
            operation: 'replace',
          },
          {
            candidate_path: 'candidates/project/modules/PHOTO/contracts.json',
            target_path: '.specforge/project/modules/PHOTO/contracts.json',
            operation: 'replace',
          },
          {
            candidate_path: 'candidates/project/modules/PHOTO/design.md',
            target_path: '.specforge/project/modules/PHOTO/design.md',
            operation: 'replace',
          },
          {
            candidate_path: 'candidates/trace_delta.md',
            target_path: '.specforge/project/trace_matrix.md',
            operation: 'replace',
          },
        ],
      }),
    );

    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    expect(result.checks.every(check => check.passed), JSON.stringify(result.checks)).toBe(true);
  });

  it('blocks Module-to-Project promotion when the promotion record is missing', async () => {
    const project = path.join(root, '.specforge', 'project');
    const moduleRoot = path.join(project, 'modules', 'PHOTO');
    await fs.writeFile(
      path.join(moduleRoot, 'contracts.json'),
      JSON.stringify({
        schema_version: '1.0', owner_module: 'PHOTO',
        contracts: {
          shared_enums: [],
          invariants: [{
            id: 'MCON-PHOTO-STATUS', owner_module: 'PHOTO',
            source_refs: ['DD-PHOTO-001'], enforcement: 'manual', scope: 'module', rule: 'valid',
          }],
          public_interfaces: [], extension_points: [],
        },
      }),
    );
    await fs.writeFile(
      path.join(project, 'trace_matrix.md'),
      '| From | Relation | To |\n|---|---|---|\n| DATA-CORE-001 | constrained_by | ARCH-CORE-001 |\n| DD-PHOTO-001 | constrained_by | MCON-PHOTO-STATUS |\n| MCON-PHOTO-STATUS | enforces | DD-PHOTO-001 |\n',
    );
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'modules', 'PHOTO', 'contracts.json'),
      JSON.stringify({
        schema_version: '1.0', owner_module: 'PHOTO',
        contracts: { shared_enums: [], invariants: [], public_interfaces: [], extension_points: [] },
      }),
    );
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'modules', 'PHOTO', 'design.md'),
      '# Design\nDD-PHOTO-001\n',
    );
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'trace_delta.md'),
      'REMOVE | DD-PHOTO-001 | constrained_by | MCON-PHOTO-STATUS\nREMOVE | MCON-PHOTO-STATUS | enforces | DD-PHOTO-001\n',
    );
    await fs.writeFile(
      path.join(wiDir, 'candidate_manifest.json'),
      JSON.stringify({ entries: [
        {
          candidate_path: 'candidates/project/modules/PHOTO/contracts.json',
          target_path: '.specforge/project/modules/PHOTO/contracts.json', operation: 'replace',
        },
        {
          candidate_path: 'candidates/project/modules/PHOTO/design.md',
          target_path: '.specforge/project/modules/PHOTO/design.md', operation: 'replace',
        },
        {
          candidate_path: 'candidates/trace_delta.md',
          target_path: '.specforge/project/trace_matrix.md', operation: 'replace',
        },
      ]}),
    );

    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    expect(
      result.checks.find(check => check.check_id === 'module_contract_removal_MCON-PHOTO-STATUS')?.passed,
    ).toBe(false);
  });


it('ERR-195 does not require a phantom old-source REMOVE when the edge is absent from current formal Trace', async () => {
  const project = path.join(root, '.specforge', 'project');
  const moduleRoot = path.join(project, 'modules', 'PHOTO');

  await fs.writeFile(
    path.join(moduleRoot, 'contracts.json'),
    JSON.stringify({
      schema_version: '1.0',
      owner_module: 'PHOTO',
      contracts: {
        shared_enums: [],
        invariants: [{
          id: 'MCON-PHOTO-STATUS',
          owner_module: 'PHOTO',
          source_refs: ['DD-PHOTO-001'],
          enforcement: 'manual',
          scope: 'module',
          rule: 'photo status remains valid',
        }],
        public_interfaces: [],
        extension_points: [],
      },
    }),
  );
  await fs.writeFile(
    path.join(project, 'trace_matrix.md'),
    [
      '| From | Relation | To |',
      '|---|---|---|',
      '| DATA-CORE-001 | constrained_by | ARCH-CORE-001 |',
      '| DD-PHOTO-001 | constrained_by | MCON-PHOTO-STATUS |',
    ].join('\n'),
  );
  await fs.writeFile(
    path.join(wiDir, 'candidates', 'project', 'extension_registry.json'),
    JSON.stringify({
      contracts: {
        shared_enums: [{
          id: 'PhotoStatus',
          owner_module: 'PHOTO',
          source_refs: ['DATA-CORE-001'],
          enforcement: 'static',
          values: ['pending', 'ready'],
        }],
        invariants: [{
          id: 'PCON-PHOTO-STATUS',
          owner_module: 'PHOTO',
          source_refs: ['DATA-CORE-001'],
          enforcement: 'manual',
          rule: 'photo status remains valid',
        }],
        public_interfaces: [],
        extension_points: [],
      },
    }),
  );
  await fs.writeFile(
    path.join(wiDir, 'candidates', 'project', 'modules', 'PHOTO', 'contracts.candidate.json'),
    JSON.stringify({
      schema_version: '1.0',
      owner_module: 'PHOTO',
      contracts: {
        shared_enums: [],
        invariants: [],
        public_interfaces: [],
        extension_points: [],
      },
    }),
  );
  await fs.writeFile(
    path.join(wiDir, 'candidates', 'project', 'modules', 'PHOTO', 'design.candidate.md'),
    '# Design\nDD-PHOTO-001\nPromoted to PCON-PHOTO-STATUS.\n',
  );
  await fs.writeFile(
    path.join(wiDir, 'candidates', 'trace_delta.md'),
    [
      'REMOVE | DD-PHOTO-001 | constrained_by | MCON-PHOTO-STATUS',
      'ADD | DD-PHOTO-001 | constrained_by | PCON-PHOTO-STATUS',
      'ADD | PCON-PHOTO-STATUS | enforces | DATA-CORE-001',
    ].join('\n'),
  );
  await fs.writeFile(
    path.join(wiDir, 'candidate_manifest.json'),
    JSON.stringify({
      work_item_id: 'WI-0001',
      workflow_path: 'architecture_change_path',
      contract_promotions: [{
        from_contract_id: 'MCON-PHOTO-STATUS',
        to_contract_id: 'PCON-PHOTO-STATUS',
        compatibility: 'atomic migration',
        migration_conclusion: 'all formal consumers migrated',
      }],
      entries: [
        {
          candidate_path: 'candidates/project/extension_registry.json',
          target_path: '.specforge/project/extension_registry.json',
          operation: 'replace',
          type: 'extension_registry',
        },
        {
          candidate_path: 'candidates/project/modules/PHOTO/contracts.candidate.json',
          target_path: '.specforge/project/modules/PHOTO/contracts.json',
          operation: 'replace',
          type: 'module_contract',
          module_id: 'PHOTO',
        },
        {
          candidate_path: 'candidates/project/modules/PHOTO/design.candidate.md',
          target_path: '.specforge/project/modules/PHOTO/design.md',
          operation: 'replace',
          type: 'design',
          module_id: 'PHOTO',
        },
        {
          candidate_path: 'candidates/trace_delta.md',
          target_path: '.specforge/project/trace_matrix.md',
          operation: 'replace',
          type: 'trace_delta',
        },
      ],
    }),
  );

  const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
  const promotion = result.checks.find(check => check.check_id === 'contract_promotion_0');
  expect(promotion?.passed, JSON.stringify(result.checks)).toBe(true);
  expect(promotion?.details ?? '').not.toContain(
    'missing REMOVE MCON-PHOTO-STATUS enforces DD-PHOTO-001',
  );
  expect(result.checks.every(check => check.passed), JSON.stringify(result.checks)).toBe(true);
});
});
