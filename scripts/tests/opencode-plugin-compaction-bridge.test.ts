/**
 * Verifies the OpenCode compaction bridge is bounded, observable, and uses
 * the daemon-issued project-bound session identity.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginPath = path.join(
  repoRoot,
  'setup',
  'userlevel-opencode',
  'plugins',
  'sf_specforge.ts',
);
const clientPath = path.join(
  repoRoot,
  'setup',
  'userlevel-opencode',
  'scripts',
  'lib',
  'sf_plugin_client.ts',
);

function source(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('OpenCode compaction checkpoint bridge', () => {
  it('subscribes to the official pre-compaction hook', () => {
    expect(source(pluginPath)).toContain('"experimental.session.compacting"');
  });

  it('waits for a bounded daemon acknowledgement instead of fire-and-forget', () => {
    const plugin = source(pluginPath);
    expect(plugin).toContain('await awaitWithTimeout(');
    expect(plugin).toContain('forwardCompactionCheckpoint(projectDir, opencodeSessionId)');
    expect(plugin).not.toContain('void forwardCompactionCheckpoint(projectDir, opencodeSessionId)');
    expect(plugin).toContain('COMPACTION_BRIDGE_TIMEOUT_MS');
  });

  it('re-registers the project and uses the daemon session identity', () => {
    const plugin = source(pluginPath);
    const registration = plugin.indexOf('const registration = await daemonClient.register(projectDir)');
    const post = plugin.indexOf('daemonClient.postEvent(', registration);

    expect(registration).toBeGreaterThanOrEqual(0);
    expect(post).toBeGreaterThan(registration);
    expect(plugin).toContain('registration.sessionId');
    expect(plugin).toContain('"session.compacting"');
    expect(plugin).toContain('opencodeSessionId');
  });

  it('writes durable bridge diagnostics under sf-user/runtime', () => {
    const plugin = source(pluginPath);
    expect(plugin).toContain('"compaction-bridge.jsonl"');
    expect(plugin).toContain('"compaction.hook.received"');
    expect(plugin).toContain('"checkpoint.project.registered"');
    expect(plugin).toContain('"checkpoint.event.result"');
    expect(plugin).toContain('"compaction.hook.failed"');
  });

  it('refreshes the cached handshake after project registration', () => {
    const client = source(clientPath);
    const registrationResponse = client.indexOf('return body.data as RegisterResponse');
    const cacheRefresh = client.lastIndexOf('this.cachedHandshake = handshake', registrationResponse);
    expect(cacheRefresh).toBeGreaterThanOrEqual(0);
    expect(cacheRefresh).toBeLessThan(registrationResponse);
  });

  it('does not propagate checkpoint failure into OpenCode compaction', () => {
    const plugin = source(pluginPath);
    expect(plugin).toContain('Checkpoint persistence must never fail OpenCode compaction');
    expect(plugin).toContain('compaction.hook.failed');
  });
});
