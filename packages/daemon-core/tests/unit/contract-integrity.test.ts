import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkContractIntegrity } from '../../src/tools/lib/contract-integrity';

describe('contract integrity reverse dependencies', () => {
  let root: string;
  let wiDir: string;

  beforeEach(async () => {
    root = path.join(os.tmpdir(), `sf-contract-integrity-${Date.now()}-${Math.random()}`);
    wiDir = path.join(root, '.specforge', 'work-items', 'WI-0001');
    await fs.mkdir(path.join(root, '.specforge', 'project', 'modules', 'PHOTO'), {
      recursive: true,
    });
    await fs.mkdir(path.join(wiDir, 'candidates', 'project'), { recursive: true });
    await fs.writeFile(
      path.join(root, '.specforge', 'project', 'extension_registry.json'),
      JSON.stringify({
        contracts: {
          shared_enums: [
            { id: 'PhotoStatus', owner_module: 'PHOTO', values: ['pending', 'ready'] },
          ],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      })
    );
    await fs.writeFile(
      path.join(root, '.specforge', 'project', 'modules', 'PHOTO', 'design.md'),
      '[contract:shared_enum:PhotoStatus owner=PHOTO]\nstatus may be `pending` or `ready`.\n'
    );
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function writeCandidate(includeConsumerUpdate: boolean): Promise<void> {
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'extension_registry.json'),
      JSON.stringify({
        contracts: {
          shared_enums: [{ id: 'PhotoStatus', owner_module: 'PHOTO', values: ['ready'] }],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      })
    );
    const entries: Array<Record<string, string>> = [
      {
        candidate_path: 'candidates/project/extension_registry.json',
        target_path: '.specforge/project/extension_registry.json',
        operation: 'replace',
      },
    ];
    if (includeConsumerUpdate) {
      const candidateDesign = path.join(wiDir, 'candidates', 'project', 'design.md');
      await fs.writeFile(
        candidateDesign,
        '[contract:shared_enum:PhotoStatus owner=PHOTO]\nstatus is `ready`.\n'
      );
      entries.push({
        candidate_path: 'candidates/project/design.md',
        target_path: '.specforge/project/modules/PHOTO/design.md',
        operation: 'replace',
      });
    }
    await fs.writeFile(path.join(wiDir, 'candidate_manifest.json'), JSON.stringify({ entries }));
  }

  it('blocks a removed enum value while a marked consumer still uses it', async () => {
    await writeCandidate(false);
    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    expect(result.checks.some(check => check.passed === false)).toBe(true);
    expect(result.checks.at(-1)?.details).toContain('pending');
  });

  it('passes when the same candidate aligns the consumer', async () => {
    await writeCandidate(true);
    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    expect(result.checks.every(check => check.passed)).toBe(true);
  });

  it('accepts a numeric shared enum with explicit value_type=number', async () => {
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'extension_registry.json'),
      JSON.stringify({
        contracts: {
          shared_enums: [
            { id: 'PhotoStatus', owner_module: 'PHOTO', values: ['pending', 'ready'] },
            {
              id: 'SyncErrorCode',
              owner_module: 'SYNC',
              value_type: 'number',
              values: [4004, 4006, 4007, 4008],
            },
          ],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      })
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
      })
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
              owner_module: 'SYNC',
              value_type: 'number',
              values: ['4004', '4006'],
            },
          ],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      })
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
      })
    );

    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].details).toContain('unique finite numbers');
  });

  it('is not applicable when the registry is not targeted', async () => {
    await fs.writeFile(
      path.join(wiDir, 'candidate_manifest.json'),
      JSON.stringify({ entries: [] })
    );
    const result = await checkContractIntegrity({ projectRoot: root, workItemDir: wiDir });
    expect(result.registryTargeted).toBe(false);
    expect(result.checks.every(check => check.passed)).toBe(true);
  });
});
