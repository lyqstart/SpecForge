import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { authorContractCandidate } from '../../src/tools/lib/contract-authoring';

describe('authorContractCandidate cumulative registration', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'specforge-contract-authoring-'));

    const projectDir = path.join(projectRoot, '.specforge', 'project');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'extension_registry.json'),
      JSON.stringify(
        {
          schema_version: '1.0',
          project_spec_version: 'PSV-0001',
          namespaces: {
            requirement_types: [],
            design_types: [],
            task_types: [],
            verification_types: [],
            gate_types: [],
          },
          contracts: {
            shared_enums: [],
            invariants: [],
            public_interfaces: [],
            extension_points: [],
          },
          updated_by_work_item: null,
          updated_at: null,
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('keeps the first contract when a second registration uses another contract kind', async () => {
    const first = await authorContractCandidate({
      projectRoot,
      workItemId: 'WI-0009',
      kind: 'invariant',
      entry: {
        id: 'server_seq_global_monotonic',
        owner_module: 'sync',
      },
    });

    expect(first.success).toBe(true);

    const second = await authorContractCandidate({
      projectRoot,
      workItemId: 'WI-0009',
      kind: 'public_interface',
      entry: {
        id: 'sync_pull_request_v1',
        owner_module: 'sync',
      },
    });

    expect(second.success).toBe(true);

    const contracts = second.registry_after?.contracts as {
      invariants: Array<{ id: string }>;
      public_interfaces: Array<{ id: string }>;
    };

    expect(contracts.invariants.map((entry) => entry.id)).toEqual([
      'server_seq_global_monotonic',
    ]);
    expect(contracts.public_interfaces.map((entry) => entry.id)).toEqual([
      'sync_pull_request_v1',
    ]);
  });

  it('accumulates 13 sequential registrations in one WI candidate', async () => {
    const registrations = [
      ['invariant', 'inv-01'],
      ['invariant', 'inv-02'],
      ['invariant', 'inv-03'],
      ['invariant', 'inv-04'],
      ['public_interface', 'api-01'],
      ['public_interface', 'api-02'],
      ['public_interface', 'api-03'],
      ['public_interface', 'api-04'],
      ['shared_enum', 'enum-01'],
      ['shared_enum', 'enum-02'],
      ['shared_enum', 'enum-03'],
      ['extension_point', 'ext-01'],
      ['extension_point', 'ext-02'],
    ] as const;

    let lastResult: Awaited<ReturnType<typeof authorContractCandidate>> | undefined;

    for (const [kind, id] of registrations) {
      lastResult = await authorContractCandidate({
        projectRoot,
        workItemId: 'WI-0009',
        kind,
        entry:
          kind === 'shared_enum'
            ? { id, owner_module: 'sync', values: ['a', 'b'] }
            : { id, owner_module: 'sync' },
      });

      expect(lastResult.success).toBe(true);
    }

    const contracts = lastResult?.registry_after?.contracts as {
      shared_enums: unknown[];
      invariants: unknown[];
      public_interfaces: unknown[];
      extension_points: unknown[];
    };

    expect(contracts.shared_enums).toHaveLength(3);
    expect(contracts.invariants).toHaveLength(4);
    expect(contracts.public_interfaces).toHaveLength(4);
    expect(contracts.extension_points).toHaveLength(2);
  });

  it('accepts shared_enum values only when they are unique non-empty strings', async () => {
    const result = await authorContractCandidate({
      projectRoot,
      workItemId: 'WI-0009',
      kind: 'shared_enum',
      entry: {
        id: 'sync_op_enum',
        owner_module: 'sync',
        values: ['upsert', 'delete'],
      },
    });

    expect(result.success).toBe(true);
    expect(
      (
        result.registry_after?.contracts as {
          shared_enums: Array<{ id: string; values: string[] }>;
        }
      ).shared_enums[0].values,
    ).toEqual(['upsert', 'delete']);
  });

  it('rejects shared_enum object values before writing the candidate', async () => {
    const result = await authorContractCandidate({
      projectRoot,
      workItemId: 'WI-0009',
      kind: 'shared_enum',
      entry: {
        id: 'sync_op_enum',
        owner_module: 'sync',
        values: [
          { value: 'upsert', description: 'create or update' },
          { value: 'delete', description: 'delete record' },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('unique non-empty strings');

    const candidatePath = path.join(
      projectRoot,
      '.specforge',
      'work-items',
      'WI-0009',
      'candidates',
      'project',
      'extension_registry.json',
    );
    await expect(fs.access(candidatePath)).rejects.toThrow();
  });

  it('rejects numeric, blank, and duplicate shared_enum values', async () => {
    const invalidValues = [
      [4004, 4006, 4007, 4008],
      ['ok', '   '],
      ['upsert', 'upsert'],
    ];

    for (const values of invalidValues) {
      const result = await authorContractCandidate({
        projectRoot,
        workItemId: 'WI-0009',
        kind: 'shared_enum',
        entry: {
          id: `enum-${JSON.stringify(values)}`,
          owner_module: 'sync',
          values,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('unique non-empty strings');
    }
  });

  it('does not modify the live registry before merge', async () => {
    await authorContractCandidate({
      projectRoot,
      workItemId: 'WI-0009',
      kind: 'invariant',
      entry: {
        id: 'server_seq_global_monotonic',
        owner_module: 'sync',
      },
    });

    const live = JSON.parse(
      await fs.readFile(
        path.join(projectRoot, '.specforge', 'project', 'extension_registry.json'),
        'utf-8',
      ),
    );

    expect(live.contracts.invariants).toEqual([]);
    expect(live.updated_by_work_item).toBeNull();
  });

  it('reset removes polluted candidate entries and rebuilds from the live registry', async () => {
    await authorContractCandidate({
      projectRoot,
      workItemId: 'WI-0009',
      kind: 'public_interface',
      entry: {
        id: 'sync_pull_request_v1',
        owner_module: 'sync',
        description: 'placeholder - will be rebuilt',
      },
    });

    const reset = await authorContractCandidate({
      projectRoot,
      workItemId: 'WI-0009',
      action: 'reset',
    });

    expect(reset.success).toBe(true);
    expect(reset.action).toBe('reset');

    const resetContracts = reset.registry_after?.contracts as {
      public_interfaces: unknown[];
    };
    expect(resetContracts.public_interfaces).toEqual([]);

    const add = await authorContractCandidate({
      projectRoot,
      workItemId: 'WI-0009',
      kind: 'public_interface',
      entry: {
        id: 'sync_push_request_v1',
        owner_module: 'sync',
      },
    });

    expect(add.success).toBe(true);
    const contracts = add.registry_after?.contracts as {
      public_interfaces: Array<{ id: string }>;
    };
    expect(contracts.public_interfaces.map((entry) => entry.id)).toEqual([
      'sync_push_request_v1',
    ]);
  });

  it('reset can recover from a malformed existing candidate because it intentionally discards it', async () => {
    const candidatePath = path.join(
      projectRoot,
      '.specforge',
      'work-items',
      'WI-0009',
      'candidates',
      'project',
      'extension_registry.json',
    );

    await fs.mkdir(path.dirname(candidatePath), { recursive: true });
    await fs.writeFile(candidatePath, '{invalid-json', 'utf-8');

    const result = await authorContractCandidate({
      projectRoot,
      workItemId: 'WI-0009',
      action: 'reset',
    });

    expect(result.success).toBe(true);
    expect(result.action).toBe('reset');
    expect((result.registry_after?.contracts as { invariants: unknown[] }).invariants).toEqual([]);
  });

  it('fails closed when an existing candidate is malformed', async () => {
    const candidatePath = path.join(
      projectRoot,
      '.specforge',
      'work-items',
      'WI-0009',
      'candidates',
      'project',
      'extension_registry.json',
    );

    await fs.mkdir(path.dirname(candidatePath), { recursive: true });
    await fs.writeFile(candidatePath, '{invalid-json', 'utf-8');

    const result = await authorContractCandidate({
      projectRoot,
      workItemId: 'WI-0009',
      kind: 'invariant',
      entry: {
        id: 'server_seq_global_monotonic',
        owner_module: 'sync',
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('failed to read existing extension_registry candidate');
  });
});
