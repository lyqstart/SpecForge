import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { enforceRuntimeWriteGuardForShell } from '../src/tools/lib/write-guard-runtime-v12';
import { setHardStop } from '../src/tools/lib/hard-stop-latch';
import { findActiveWorkItemIdForWrite } from '../src/tools/handlers/sf-safe-bash';

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-stable-final-live-'));
  fs.mkdirSync(path.join(root, '.specforge', 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(root, '.specforge', 'work-items', 'WI-0001'), { recursive: true });
  fs.mkdirSync(path.join(root, '.specforge', 'work-items', 'WI-0002'), { recursive: true });
  fs.writeFileSync(path.join(root, '.specforge', 'runtime', 'state.json'), JSON.stringify({
    workItems: [
      { work_item_id: 'WI-0001', current_state: 'implementation_running', updated_at: 1782075625420 },
      { work_item_id: 'WI-0002', current_state: 'implementation_running', updated_at: 1782075755981 },
    ],
  }, null, 2));
  fs.writeFileSync(path.join(root, '.specforge', 'work-items', 'WI-0001', 'work_item.json'), JSON.stringify({
    work_item_id: 'WI-0001',
    status: 'created',
    code_change_allowed: true,
    code_permission_revoked: false,
    allowed_write_files: [{ path: 'src/todos/stable-native-write-authorized.md', operation: 'create' }],
  }, null, 2));
  fs.writeFileSync(path.join(root, '.specforge', 'work-items', 'WI-0002', 'work_item.json'), JSON.stringify({
    work_item_id: 'WI-0002',
    status: 'created',
    code_change_allowed: true,
    code_permission_revoked: false,
    allowed_write_files: [{ path: 'src/todos/stable-wib-allowed.md', operation: 'create' }],
  }, null, 2));
  return root;
}

describe('v1.2 stable final live acceptance regressions', () => {
  it('uses authoritative runtime state and allows parent directory preparation for an allowed file', () => {
    const root = makeProject();
    const command = 'New-Item -ItemType Directory -Force -Path src\\todos | Out-Null; Set-Content -Path src\\todos\\stable-native-write-authorized.md -Value ok -Encoding UTF8';
    const result = enforceRuntimeWriteGuardForShell({
      projectRoot: root,
      workItemId: 'WI-0001',
      command,
      tool: 'sf_safe_bash',
    });
    expect(result.checked).toBe(true);
    expect(result.allowed).toBe(true);
    expect(fs.existsSync(path.join(root, '.specforge', 'work-items', 'WI-0001', 'hard_stop.json'))).toBe(false);
  });

  it('does not select a hard-stopped WI-A when WI-B owns the write target', () => {
    const root = makeProject();
    setHardStop(root, 'WI-0001', 'WI-A blocked', 'sf_safe_bash');
    const command = 'New-Item -ItemType Directory -Force -Path src\\todos | Out-Null; Set-Content -Path src\\todos\\stable-wib-allowed.md -Value ok -Encoding UTF8';
    const selected = findActiveWorkItemIdForWrite(root, {}, command);
    expect(selected).toBe('WI-0002');
  });
  it('records blocked native writes against the owning WI before throwing', () => {
    const pluginPath = path.resolve(__dirname, '../../../setup/userlevel-opencode/plugins/sf_specforge.ts');
    const source = fs.readFileSync(pluginPath, 'utf-8');

    expect(source).toContain('appendNativeBlockedWriteGuardLog');
    expect(source).toContain('write_guard_log.jsonl');
    expect(source).toContain('allowed: false');
    expect(source).toContain('workItemId: activePermissionWorkItemId');
    expect(source).toContain('target_not_in_allowed_write_files');
    expect(source).toMatch(/appendNativeBlockedWriteGuardLog\([\s\S]*?maybePersistHardStopFromGuardResult/);
  });

  it('allows report output content to mention protected paths while checking only real report targets', () => {
    const pluginPath = path.resolve(__dirname, '../../../setup/userlevel-opencode/plugins/sf_specforge.ts');
    const source = fs.readFileSync(pluginPath, 'utf-8');

    expect(source).toContain('Report content is allowed to mention protected paths');
    expect(source).toContain('.specforge/project/** because it is evidence text, not a write target');
    expect(source).not.toContain('if (isProtectedSpecForgeNonReportPathText(text)) return false;');
  });

});
