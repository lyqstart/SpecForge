import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { verifyChangedCodeContracts } from '../../src/tools/lib/code-contract-verifier';

describe('code contract AST verifier', () => {
  let root: string;
  let wiDir: string;

  beforeEach(async () => {
    root = path.join(os.tmpdir(), `sf-code-contract-${Date.now()}-${Math.random()}`);
    wiDir = path.join(root, '.specforge', 'work-items', 'WI-0001');
    await fs.mkdir(path.join(root, '.specforge', 'project'), { recursive: true });
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.mkdir(wiDir, { recursive: true });
    await fs.writeFile(
      path.join(root, '.specforge', 'project', 'extension_registry.json'),
      JSON.stringify({
        contracts: {
          shared_enums: [{ id: 'PhotoStatus', owner_module: 'PHOTO', values: ['ready'] }],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      })
    );
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('rejects an unregistered literal with an explicit TypeScript binding', async () => {
    await fs.writeFile(
      path.join(root, 'src', 'photo.ts'),
      'const status: PhotoStatus = "pending";\n'
    );
    const result = await verifyChangedCodeContracts({
      projectRoot: root,
      workItemDir: wiDir,
      changedFiles: [{ path: 'src/photo.ts', operation: 'modify' }],
    });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      line: 1,
      contract_id: 'PhotoStatus',
      value: 'pending',
    });
  });

  it('accepts an authoritative literal', async () => {
    await fs.writeFile(path.join(root, 'src', 'photo.ts'), 'let status: PhotoStatus = "ready";\n');
    const result = await verifyChangedCodeContracts({
      projectRoot: root,
      workItemDir: wiDir,
      changedFiles: [{ path: 'src/photo.ts', operation: 'modify' }],
    });
    expect(result.issues).toEqual([]);
    expect(result.checked_files).toEqual(['src/photo.ts']);
  });

  it('reports unsupported languages without pretending they were checked', async () => {
    const result = await verifyChangedCodeContracts({
      projectRoot: root,
      workItemDir: wiDir,
      changedFiles: [{ path: 'src/photo.py', operation: 'modify' }],
    });
    expect(result.issues).toEqual([]);
    expect(result.unsupported_files).toEqual(['src/photo.py']);
  });
});
