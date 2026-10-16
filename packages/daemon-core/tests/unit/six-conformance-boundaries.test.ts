import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { checkNativeTool } from '../../src/tools/lib/native-write-boundary';
import { enforceRuntimeWriteGuardForShell } from '../../src/tools/lib/write-guard-runtime-v12';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { createSpecForgeThinPlugin } from '../../../../setup/userlevel-opencode/scripts/lib/sf_thin_plugin';
import { ReconnectingDaemonClient } from '../../../../setup/userlevel-opencode/scripts/lib/sf_plugin_client';
import { ReconnectingDaemonClient as PackageDaemonClient } from '../../../service-management/src/plugin/reconnecting-daemon-client';
import { currentHandshake } from '../helpers/current-daemon-test-config';
import { ToolDispatcher, registerHandler } from '../../src/tools/ToolDispatcher';

const roots: string[] = [];
afterEach(() => { roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });
function fixture() {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'sf-six-boundaries-')); roots.push(root);
  const wiDir = path.join(root, '.specforge/work-items/WI-0001'); fs.mkdirSync(wiDir, { recursive: true });
  fs.writeFileSync(path.join(wiDir, 'work_item.json'), JSON.stringify({ schema_version: '1.1', work_item_id: 'WI-0001', workflow_type: 'feature_spec', code_change_allowed: true, code_permission_revoked: false, allowed_write_files: [{ path: 'allowed.txt', operation: 'create' }] }));
  fs.mkdirSync(path.join(root, '.specforge/runtime'), { recursive: true });
  fs.writeFileSync(path.join(root, '.specforge/runtime/state.json'), JSON.stringify({ workItems: [{ work_item_id: 'WI-0001', current_state: 'implementation_running' }] }));
  const manager = { rebuildState: vi.fn(async () => {}), listWorkItems: () => [{ work_item_id: 'WI-0001', current_state: 'implementation_running' }] };
  return { root, manager, deps: { projectManager: { getProjectStateManager: async () => manager } } };
}
describe('native and shell execution boundaries', () => {
  it('blocks dispatch when authoritative state cannot be read', async () => {
    const { root } = fixture();
    const handler = vi.fn(async () => ({ success: true }));
    registerHandler('sf_test_authority_required', handler);
    const result: any = await new ToolDispatcher({} as any).dispatch({ tool: 'sf_test_authority_required', args: {}, context: { directory: root } });
    expect(result.error).toBe('AUTHORITATIVE_STATE_UNAVAILABLE');
    expect(handler).not.toHaveBeenCalled();
  });
  it.each([ReconnectingDaemonClient, PackageDaemonClient])('enforces both clients and the pre-tool hook across a real HTTP connection', async Client => {
    const { root, deps, manager } = fixture();
    const server = new HTTPServer({ config: new DaemonConfig([]), ...deps } as any);
    server.setToken('native-test-token');
    const { port } = await server.start();
    const handshakePath = path.join(root, 'handshake.json');
    fs.writeFileSync(handshakePath, JSON.stringify(currentHandshake(port, 'native-test-token')));
    const client = new Client({ handshakePath });
    // Registration is outside the tested boundary; actual pre-tool transport is not mocked.
    const hooks = await createSpecForgeThinPlugin({ directory: root }, { client: {
      register: async () => ({ sessionId: 's', projectId: 'p', mode: 'personal' }),
      postEvent: async () => ({ ok: true, dropped: false, reason: 'success' }),
      checkNativeTool: client.checkNativeTool.bind(client),
    }, notify: () => {} });
    const executeWrite = async (filePath: string) => {
      await hooks['tool.execute.before']({ tool: 'write' }, { args: { filePath } });
      fs.writeFileSync(path.join(root, filePath), 'approved');
    };
    try {
      await expect(executeWrite('denied.txt')).rejects.toThrow();
      expect(fs.existsSync(path.join(root, 'denied.txt'))).toBe(false);
      await executeWrite('allowed.txt');
      expect(fs.readFileSync(path.join(root, 'allowed.txt'), 'utf8')).toBe('approved');
      manager.listWorkItems = () => [{ work_item_id: 'WI-0001', current_state: 'closed' }];
      await expect(executeWrite('allowed.txt')).rejects.toThrow();
      await server.stop();
      await expect(executeWrite('offline.txt')).rejects.toThrow();
      expect(fs.existsSync(path.join(root, 'offline.txt'))).toBe(false);
    } finally { client.dispose(); await server.stop(); }
  });
  it('allows an authorized native file and rejects an unauthorized file', async () => {
    const { root, deps, manager } = fixture();
    expect((await checkNativeTool(deps, root, 'write', { filePath: 'allowed.txt' })).allowed).toBe(true);
    expect((await checkNativeTool(deps, root, 'write', { filePath: 'denied.txt' })).allowed).toBe(false);
    expect(manager.rebuildState).toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, 'denied.txt'))).toBe(false);
  });
  it('does not trust a stale projection after authoritative close', async () => {
    const { root, deps, manager } = fixture(); manager.listWorkItems = () => [{ work_item_id: 'WI-0001', current_state: 'closed' }];
    expect((await checkNativeTool(deps, root, 'write', { filePath: 'allowed.txt' })).allowed).toBe(false);
    expect(enforceRuntimeWriteGuardForShell({ projectRoot: root, workItemId: 'WI-0001', command: 'echo hi > allowed.txt' }).allowed).toBe(false);
  });
  it('rejects native arbitrary execution and unknown tools', async () => {
    const { root, deps } = fixture();
    for (const tool of ['bash', 'apply_patch', 'unknown_writer']) expect((await checkNativeTool(deps, root, tool, { command: 'echo hi > denied.txt' })).allowed).toBe(false);
  });
  it('propagates daemon rejection from the real pre-execution hook', async () => {
    const check = vi.fn(async () => { throw new Error('DENIED'); });
    const hooks = await createSpecForgeThinPlugin({ directory: 'test' }, { client: { register: async () => ({ sessionId: 's', projectId: 'p', mode: 'personal' }), postEvent: async () => ({ ok: true, dropped: false, reason: 'success' }), checkNativeTool: check }, notify: () => {} });
    await expect(hooks['tool.execute.before']({ tool: 'write' }, { args: { filePath: 'denied.txt' } })).rejects.toThrow('DENIED');
    expect(check).toHaveBeenCalledWith('test', 'write', { filePath: 'denied.txt' });
  });
});
function response() {
  let status = 0; let body: any;
  return { res: { writeHead: (code: number) => { status = code; }, end: (value: string) => { body = JSON.parse(value); } }, result: () => ({ status, body }) };
}
describe('truthful HTTP responses', () => {
  it('requires project identity even when a global state dependency exists', async () => {
    const server: any = new HTTPServer(new DaemonConfig([]));
    const globalRead = vi.fn(() => ({ current_state: 'closed' }));
    server.deps.stateManager = { getState: globalRead };
    const out = response();
    await server.handleStateRead({}, out.res, JSON.stringify({ workItemId: 'WI-0001' }));
    expect(out.result().status).toBe(400);
    expect(globalRead).not.toHaveBeenCalled();
  });
  it('does not wrap a rejected controlled transition in a success envelope', async () => {
    const server: any = new HTTPServer(new DaemonConfig([]));
    server.deps.toolDispatcher = { dispatch: async () => ({ success: false, error: 'GATE_REJECTED' }) };
    const out = response();
    await server.handleStateTransition({}, out.res, JSON.stringify({ projectPath: path.resolve('fixture'), workItemId: 'WI-0001', fromState: 'created', toState: 'intake_ready' }));
    expect(out.result().status).toBe(409);
    expect(out.result().body.success).toBe(false);
  });
  it.each(['handleEventQuery', 'handleCasStore', 'handleCasRetrieve', 'handleSessionList', 'handleStateRead'])('never reports an unimplemented/missing owner as success: %s', async method => {
    const server: any = new HTTPServer(new DaemonConfig([])); const out = response();
    await server[method]({ url: '/?hash=abc' }, out.res, '{}');
    expect(out.result().status).toBeGreaterThanOrEqual(400);
    expect(out.result().body.success).toBe(false);
  });
  it('reads the project StateManager and returns registered sessions', async () => {
    const server: any = new HTTPServer(new DaemonConfig([]));
    const sm = { rebuildState: vi.fn(async () => {}), getState: () => ({ current_state: 'closed' }) };
    server.deps.projectManager = { getProjectStateManager: async () => sm };
    server.deps.sessionRegistry = { listSessions: () => [{ sessionId: 'real-session' }] };
    const state = response(); await server.handleStateRead({}, state.res, JSON.stringify({ projectPath: path.resolve('fixture'), workItemId: 'WI-0001' }));
    expect(state.result().body.data.workItem.current_state).toBe('closed');
    const sessions = response(); server.handleSessionList({}, sessions.res);
    expect(sessions.result().body.data.sessions[0].sessionId).toBe('real-session');
  });
});
