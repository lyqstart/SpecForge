/** Portable schema/mode checks only. Native controller and LPAC evidence are independently required. */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  FILESYSTEM_SOURCE_CONTRACT,
  validateFilesystemSource,
  verificationSourceMode,
} from '../../src/verification/filesystem-source';
import {
  canonicalVerificationJson as json,
  verificationId as hash,
} from '../../src/verification/owner-store';
import type { VerificationAuthoritySnapshot } from '../../src/verification/verification-plan';

function snapshot() {
  const body = {
    contract: FILESYSTEM_SOURCE_CONTRACT,
    projectRoot: path.resolve('synthetic-filesystem'),
    workItemId: 'WI-9002',
    scopeSha256: 'a'.repeat(64),
    baselineSha256: 'b'.repeat(64),
    inventory: [
      { path: '', type: 'directory', volume: '1', fileId: '1' },
      { path: '.specforge', type: 'directory', volume: '1', fileId: '2' },
      { path: 'test.cjs', type: 'file', volume: '1', fileId: '3' },
    ],
    availablePaths: ['test.cjs'],
    files: [{ path: 'test.cjs', bytes: 1, sha256: hash('x'), device: '1', inode: '3' }],
  };
  return { ...body, identity: hash(json(body)) };
}
function reseal(value: ReturnType<typeof snapshot>) {
  const { identity: _old, ...body } = value;
  value.identity = hash(json(body));
  return value;
}

describe('filesystem source strict persistent boundary', () => {
  it('accepts its explicit shape without fabricated Git fields', () => {
    expect(() => validateFilesystemSource(snapshot())).not.toThrow();
  });
  for (const [label, mutate] of Object.entries<
    Record<string, (value: ReturnType<typeof snapshot>) => void>[string]
  >({
    contract: v => {
      v.contract = 'unknown' as typeof v.contract;
    },
    gitField: v => {
      Object.assign(v, { head: '' });
    },
    missingBaseline: v => {
      v.baselineSha256 = '';
    },
    unboundBytes: v => {
      v.files[0].sha256 = '';
    },
    physicalMismatch: v => {
      v.files[0].inode = '4';
    },
    duplicateFile: v => {
      v.files.push({ ...v.files[0] });
    },
    missingAvailable: v => {
      v.availablePaths = [];
    },
    unboundedBytes: v => {
      v.files[0].bytes = 16777217;
    },
    missingRoot: v => {
      v.inventory.shift();
    },
    missingGovernance: v => {
      v.inventory.splice(1, 1);
    },
    physicalAlias: v => {
      v.inventory[2].fileId = '2';
    },
    pathAlias: v => {
      v.inventory.push({ ...v.inventory[2], path: 'TEST.CJS', fileId: '4' });
    },
    protectedSource: v => {
      v.inventory[2].path = '.git';
    },
    orphan: v => {
      v.inventory[2].path = 'missing/test.cjs';
    },
    governanceInput: v => {
      v.inventory.push({ path: '.specforge/private', type: 'file', volume: '1', fileId: '4' });
    },
  }))
    it('rejects ' + label + ' even with a recomputed identity', () => {
      const v = snapshot();
      mutate(v);
      expect(() => validateFilesystemSource(reseal(v))).toThrow();
    });

  it('rejects changed raw source identity', () => {
    const v = snapshot();
    v.files[0].sha256 = hash('y');
    expect(() => validateFilesystemSource(v)).toThrow();
  });
  for (const name of [
    '.env',
    '.env.local',
    'auth.json',
    'credentials.json',
    'host-profile.json',
    'opencode.json',
    'opencode.jsonc',
  ]) {
    it('retains credential metadata but refuses selected bytes: ' + name, () => {
      const v = snapshot();
      v.inventory[2].path = name;
      v.inventory.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      v.availablePaths = [name];
      v.files[0].path = name;
      expect(() => validateFilesystemSource(reseal(v))).toThrow('CREDENTIAL_INPUT');
      v.files = [];
      expect(() => validateFilesystemSource(reseal(v))).not.toThrow();
    });
  }
  it('uses the frozen mode, keeps legacy Git, and refuses unknown modes or scope drift', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-filesystem-mode-test-'));
    try {
      const relative = '.specforge/work-items/WI-9002/governance_scope.json',
        file = path.join(root, relative);
      await fs.mkdir(path.dirname(file), { recursive: true });
      for (const [scope, expected] of [
        [{}, 'git'],
        [{ version_control_mode: 'git' }, 'git'],
        [{ version_control_mode: 'filesystem' }, 'filesystem'],
      ] as const) {
        const raw = JSON.stringify(scope);
        await fs.writeFile(file, raw);
        const authority = {
          workItemId: 'WI-9002',
          files: { [relative]: hash(raw) },
        } as VerificationAuthoritySnapshot;
        expect(await verificationSourceMode(root, authority)).toBe(expected);
        await fs.appendFile(file, ' ');
        await expect(verificationSourceMode(root, authority)).rejects.toThrow('SCOPE_DRIFT');
      }
      const raw = JSON.stringify({ version_control_mode: 'auto' });
      await fs.writeFile(file, raw);
      await expect(
        verificationSourceMode(root, {
          workItemId: 'WI-9002',
          files: { [relative]: hash(raw) },
        } as VerificationAuthoritySnapshot)
      ).rejects.toThrow('MODE_UNKNOWN');
    } finally {
      if (
        path.dirname(root) !== path.resolve(os.tmpdir()) ||
        !path.basename(root).startsWith('sf-filesystem-mode-test-')
      )
        throw Error('UNSAFE_TEST_CLEANUP');
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
