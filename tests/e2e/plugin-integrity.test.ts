import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const PLUGIN_PATH = path.join(REPO_ROOT, 'setup', 'userlevel-opencode', 'plugins', 'sf_specforge.ts');

describe('Plugin Integrity', () => {
  it('sf_specforge.ts plugin exists in setup/userlevel-opencode/plugins', () => {
    expect(fs.existsSync(PLUGIN_PATH)).toBe(true);
  });

  it('plugin stays within the userlevel OpenCode plugin boundary', () => {
    const content = fs.readFileSync(PLUGIN_PATH, 'utf-8');

    expect(content).toContain('tool.execute.before');
    expect(content).toContain('tool.execute.after');
    expect(content).toContain('createReconnectingDaemonClient');
    expect(content).toContain('sf_plugin_client');
    expect(content).toContain('handshake');

    expect(content).not.toContain('../../.opencode');
    expect(content).not.toContain('sf_specforge_plugin_entry');
    expect(content).not.toContain('sf_state_transition_core');
    expect(content).not.toContain('sf_state_read_core');
  });

  it('plugin contains hard write-guard and hard-stop enforcement hooks', () => {
    const content = fs.readFileSync(PLUGIN_PATH, 'utf-8');

    expect(content).toContain('WriteGuard');
    expect(content).toContain('HardStop');
    expect(content).toContain('checkWrite');
    expect(content).toContain('bashGuard');
    expect(content).toContain('changedFilesAudit');
  });

  it('plugin is not an oversized generated artifact', () => {
    const stat = fs.statSync(PLUGIN_PATH);
    expect(stat.size).toBeGreaterThan(1024);
    expect(stat.size).toBeLessThan(96 * 1024);
  });
});
