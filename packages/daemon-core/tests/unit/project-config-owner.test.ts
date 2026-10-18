import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { ProjectManager } from '../../src/project/ProjectManager';
import { EventBus } from '../../src/event-bus/EventBus';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { getHandler } from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-project-config';
import { recordDaemonObservation } from '../../src/observability/observability-recorder';
import { recordSfObservation } from '../../../../setup/userlevel-opencode/tools/lib/sf-observability';
const roots: string[] = [];
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
afterEach(() => { vi.unstubAllEnvs(); roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });
function fixture() {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'sf-config-owner-')); roots.push(root);
  vi.stubEnv('OPENCODE_CONFIG_DIR', path.join(root, 'user')); vi.stubEnv('SPECFORGE_CONFIG_OVERRIDES', '');
  const file = path.join(root, '.specforge/config/project.json'); fs.mkdirSync(path.dirname(file), { recursive: true });
  const original = '{"schema_version":"1.0","timeoutMs":2000}\n'; fs.writeFileSync(file, original);
  const create = () => new ProjectManager(new EventBus(), new PersonalPathResolver(), undefined as any);
  const manager = create();
  const invoke = (args: Record<string, unknown>) => manager.manageProjectConfiguration(root, args);
  return { root, file, original, create, manager, invoke };
}
describe('controlled runtime project configuration owner', () => {
  it('validates without writing, updates with CAS, and restores exact prior bytes', async () => {
    const f = fixture(); const content = '{"schema_version":"1.0","timeoutMs":10000}';
    await f.invoke({ action: 'validate', content }); expect(fs.readFileSync(f.file, 'utf8')).toBe(f.original);
    const read = await f.invoke({ action: 'read' }); expect(read.document_sha256).toBe(sha(f.original)); expect(read).not.toHaveProperty('content');
    await f.invoke({ action: 'update', content, expected_sha256: read.document_sha256 });
    expect((await f.manager.getProjectConfiguration(f.root)).merged.timeoutMs).toBe(10000);
    await expect(f.invoke({ action: 'update', content: f.original, expected_sha256: read.document_sha256 })).rejects.toThrow('CONFIGURATION_BASELINE_CHANGED');
    await f.invoke({ action: 'restore', restore_sha256: read.document_sha256, expected_sha256: sha(content) });
    expect(fs.readFileSync(f.file, 'utf8')).toBe(f.original);
    expect((await f.manager.getProjectConfiguration(f.root)).merged.timeoutMs).toBe(2000);
  });
  it('rejects active changes across recreation; permits exact accepted repair after corrupt input', async () => {
    const f = fixture(); await f.manager.getProjectConfiguration(f.root);
    const state = await f.manager.getProjectStateManager(f.root); await state.transition('WI-0001', '', 'created');
    await expect(f.create().manageProjectConfiguration(f.root, { action: 'update', content: '{"timeoutMs":10000}', expected_sha256: sha(f.original) })).rejects.toThrow('CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK');
    expect(fs.readFileSync(f.file, 'utf8')).toBe(f.original);
    // Fault injection in an isolated product fixture, never a business project write.
    fs.writeFileSync(f.file, '{broken');
    const restarted = f.create();
    await restarted.manageProjectConfiguration(f.root, { action: 'update', content: f.original, expected_sha256: sha('{broken') });
    expect((await restarted.getProjectConfiguration(f.root)).merged.timeoutMs).toBe(2000);
  });
  it.each(['{bad', '[]', '{"timeoutMs":-1}', '{"apiKey":"fake"}', '{"provider":{"api_key":"fake"}}', '{"providers":[{"accessToken":"fake"}]}', '{"schema_version":"fake"}'])('rejects invalid candidate without document changes: %s', async content => {
    const f = fixture(); await expect(f.invoke({ action: 'update', content, expected_sha256: sha(f.original) })).rejects.toThrow('CONFIGURATION_');
    expect(fs.readFileSync(f.file, 'utf8')).toBe(f.original);
  });
  it('serializes competing updates so only one stale-baseline writer succeeds', async () => {
    const f = fixture(); const results = await Promise.allSettled([3000, 4000].map(timeoutMs => f.invoke({ action: 'update', content: JSON.stringify({ timeoutMs }), expected_sha256: sha(f.original) })));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  });
  it('rejects tampered history and missing activation during active work', async () => {
    const f = fixture();
    await f.invoke({ action: 'update', content: '{"timeoutMs":10000}', expected_sha256: sha(f.original) });
    const history = path.join(f.root, '.specforge/runtime/configuration-history', `${sha(f.original)}.json`);
    fs.writeFileSync(history, '{}');
    await expect(f.invoke({ action: 'restore', restore_sha256: sha(f.original), expected_sha256: sha('{"timeoutMs":10000}') })).rejects.toThrow('CONFIGURATION_HISTORY_CORRUPT');
    const state = await f.manager.getProjectStateManager(f.root); await state.transition('WI-0001', '', 'created');
    await expect(f.invoke({ action: 'update', content: f.original, expected_sha256: sha('{"timeoutMs":10000}') })).rejects.toThrow('CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK');
    expect(fs.readFileSync(f.file, 'utf8')).toBe('{"timeoutMs":10000}');
  });
  it('enforces owner and returns only fixed error codes', async () => {
    const f = fixture(); const handler = getHandler('sf_project_config')!;
    expect(await handler({ action: 'read' }, { directory: f.root, agent: 'sf-executor' }, { projectManager: f.manager } as any)).toMatchObject({ success: false, error: 'CONFIGURATION_ORCHESTRATOR_ONLY' });
    expect(await handler({ action: 'validate', content: 'FAKE_PARSE_FRAGMENT' }, { directory: f.root, agent: 'sf-orchestrator' }, { projectManager: f.manager } as any)).toEqual({ success: false, error: 'CONFIGURATION_INVALID_OBJECT' });
  });
  it('records real nonempty userlevel and daemon logs without config values, keys or parse fragments', () => {
    const f = fixture(); const marker = 'SF_FAKE_PRIVATE_INPUT_987654';
    const payload = { args: { content: `{"${marker}":"${marker}","schema_version":"${marker}"` } };
    recordDaemonObservation({ projectRoot: f.root, category: 'dispatcher', phase: 'dispatch.received', tool_name: 'sf_project_config', payload, error: marker, force: true });
    recordSfObservation({ projectRoot: f.root, category: 'rpc', phase: 'request', tool_name: 'sf_project_config', payload, error: marker, force: true });
    const files: string[] = [];
    function walk(dir: string) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, e.name); if (e.isDirectory()) walk(full); else files.push(full); } }
    walk(path.join(f.root, '.specforge/logs'));
    expect(files.some(file => file.includes('userlevel'))).toBe(true); expect(files.some(file => file.includes('daemon'))).toBe(true);
    for (const file of files) expect(fs.readFileSync(file, 'utf8')).not.toContain(marker);
  });
});
