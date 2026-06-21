import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setHardStop, guardHardStop, checkHardStop } from '../src/tools/lib/hard-stop-latch';
import { findActiveWorkItemIdForWrite } from '../src/tools/handlers/sf-safe-bash';

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-hardstop-scope-'));
  fs.mkdirSync(path.join(root, '.specforge', 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(root, '.specforge', 'work-items', 'WI-0001'), { recursive: true });
  fs.mkdirSync(path.join(root, '.specforge', 'work-items', 'WI-0002'), { recursive: true });
  fs.writeFileSync(path.join(root, '.specforge', 'runtime', 'state.json'), JSON.stringify({
    workItems: [
      { work_item_id: 'WI-0001', current_state: 'created', updated_at: '2026-06-21T00:00:00.000Z' },
      { work_item_id: 'WI-0002', current_state: 'implementation_running', updated_at: '2026-06-21T00:10:00.000Z' },
    ],
  }, null, 2));
  fs.writeFileSync(path.join(root, '.specforge', 'work-items', 'WI-0001', 'work_item.json'), JSON.stringify({
    work_item_id: 'WI-0001',
    status: 'created',
    code_change_allowed: false,
    allowed_write_files: [],
  }, null, 2));
  fs.writeFileSync(path.join(root, '.specforge', 'work-items', 'WI-0002', 'work_item.json'), JSON.stringify({
    work_item_id: 'WI-0002',
    status: 'implementation_running',
    code_change_allowed: true,
    code_permission_revoked: false,
    allowed_write_files: [{ path: 'src/todos/allowed.md', operation: 'create' }],
  }, null, 2));
  return root;
}

describe('v1.2 hard_stop scope regression', () => {
  it('keeps WI-A hard_stop scoped and does not block WI-B', () => {
    const root = makeProject();
    setHardStop(root, 'WI-0001', 'unauthorized write in WI-A', 'sf_safe_bash');

    expect(checkHardStop(root, 'WI-0001').blocked).toBe(true);
    expect(checkHardStop(root, 'WI-0002').blocked).toBe(false);

    expect(guardHardStop(root, 'WI-0001', 'sf_safe_bash').allowed).toBe(false);
    expect(guardHardStop(root, 'WI-0002', 'sf_safe_bash').allowed).toBe(true);
  });

  it('selects implementation_running WI instead of stale hard-stopped WI', () => {
    const root = makeProject();
    setHardStop(root, 'WI-0001', 'unauthorized write in WI-A', 'sf_safe_bash');

    const selected = findActiveWorkItemIdForWrite(
      root,
      {},
      'powershell -Command "Set-Content -Path \'src/todos/allowed.md\' -Value \'ok\'"',
    );

    expect(selected).toBe('WI-0002');
  });
});
