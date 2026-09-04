import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WI_ID_PATTERN as SHARED_WI_ID_PATTERN } from '@specforge/types';
import {
  WI_ID_PATTERN as DAEMON_WI_ID_PATTERN,
  isValidWorkItemId,
} from '../../src/tools/lib/work-item-id-validator';
import { setHardStop } from '../../src/tools/lib/hard-stop-latch';
import { findActiveWorkItemIdForWrite } from '../../src/tools/handlers/sf-safe-bash';

const tempRoots: string[] = [];

function makeProjectWithRuntimeWorkItem(workItemId: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-wi-id-contract-'));
  tempRoots.push(root);
  const runtimeDir = path.join(root, '.specforge', 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeDir, 'state.json'),
    JSON.stringify({
      workItems: [
        {
          work_item_id: workItemId,
          current_state: 'implementation_running',
          updated_at: '2026-08-26T00:00:00.000Z',
        },
      ],
    }),
    'utf-8',
  );
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe('Work Item ID consumer consistency', () => {
  it('daemon validator delegates to the shared WI-NNNN pattern', () => {
    expect(DAEMON_WI_ID_PATTERN).toBe(SHARED_WI_ID_PATTERN);
    expect(isValidWorkItemId('WI-0001')).toBe(true);
    expect(isValidWorkItemId('WI-001')).toBe(false);
    expect(isValidWorkItemId('WI-20260612-0001')).toBe(false);
  });

  it.each(['WI-001', 'WI-20260612-0001'])(
    'hard-stop persistence rejects legacy ID %s',
    (workItemId) => {
      const root = makeProjectWithRuntimeWorkItem('WI-0001');
      expect(() => setHardStop(root, workItemId, 'test', 'test')).toThrow(
        'INVALID_WORK_ITEM_ID_FOR_HARD_STOP',
      );
    },
  );

  it.each(['WI-001', 'WI-20260612-0001'])(
    'safe-bash ignores legacy runtime ID %s',
    (workItemId) => {
      const root = makeProjectWithRuntimeWorkItem(workItemId);
      expect(findActiveWorkItemIdForWrite(root, {}, 'Set-Content src/file.ts value')).toBeNull();
    },
  );

  it('user-level thin plugin does not own Work Item ID validation', () => {
    const pluginPath = path.resolve(
      __dirname,
      '../../../../setup/userlevel-opencode/plugins/sf_specforge.ts',
    );
    const source = fs.readFileSync(pluginPath, 'utf-8');

    expect(source).toContain('Business state, WriteGuard decisions and filesystem tools remain Daemon-owned.');
    expect(source).not.toContain('const VALID_WI_ID');
    expect(source).not.toContain('findActiveWorkItemId');
  });
});
