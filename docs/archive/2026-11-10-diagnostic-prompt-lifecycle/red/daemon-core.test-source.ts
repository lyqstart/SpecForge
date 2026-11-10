import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import '../../src/tools/index';
import { ToolDispatcher } from '../../src/tools/ToolDispatcher';
import { ProjectManager } from '../../src/project/ProjectManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { EventBus } from '../../src/event-bus/EventBus';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { ensureProjectInit } from '../../src/tools/lib/sf_project_init_core';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'sf-doctor-dispatch-')); roots.push(root);
  const project = path.join(root, 'project'), config = path.join(root, 'opencode'); fs.mkdirSync(project);
  vi.stubEnv('OPENCODE_CONFIG_DIR', config); vi.stubEnv('SPECFORGE_CONFIG_OVERRIDES', '');
  const runtime = process.platform === 'win32' ? '.exe' : '';
  for (const file of ['sf-user/bin/specforge' + runtime, 'sf-user/bin/specforged' + runtime, 'specforge-manifest.json', 'agents/sf-orchestrator.md', 'plugins/sf_specforge.ts', 'sf-user/lib/sf_thin_plugin.ts']) {
    const target = path.join(config, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, '{}');
  }
  fs.writeFileSync(path.join(config, 'sf-user/host-profile.json'), JSON.stringify({ scanned_at: new Date().toISOString() }));
  const eventBus = new EventBus(), pm = new ProjectManager(eventBus, new PersonalPathResolver(), undefined as never);
  const dispatcher = new ToolDispatcher({ projectManager: pm, eventBus } as never);
  return { root, project, config, pm, eventBus, dispatcher };
}
function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  function walk(dir: string): void {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name), relative = path.relative(root, file).replaceAll('\\', '/');
      if (relative === '.specforge/logs' || relative.startsWith('.specforge/logs/')) continue;
      if (item.isDirectory()) walk(file); else files[relative] = fs.readFileSync(file).toString('base64');
    }
  }
  walk(root); return files;
}
const doctor = (f: ReturnType<typeof fixture>) => f.dispatcher.dispatch({ tool: 'sf_doctor', args: {}, context: { directory: f.project, agent: 'sf-orchestrator' } });
const ordinary = (f: ReturnType<typeof fixture>) => f.dispatcher.dispatch({ tool: 'sf_handoff', args: { action: 'validate', handoff: {} }, context: { directory: f.project, agent: 'sf-orchestrator' } });

describe('readonly doctor through production dispatcher and HTTP', () => {
  it('diagnoses a new directory without configuration activation, state initialization or implicit project init', async () => {
    const f = fixture(), before = snapshot(f.project), acceptance = vi.spyOn(f.pm, 'getProjectConfiguration'), state = vi.spyOn(f.pm, 'getProjectStateManager');
    const result = await doctor(f);
    expect(result).toMatchObject({ success: true, healthy: false, project: { status: 'not_initialized', configuration: { valid: false, error: 'CONFIGURATION_READ_FAILED' } } });
    expect(acceptance).not.toHaveBeenCalled(); expect(state).not.toHaveBeenCalled();
    expect(snapshot(f.project)).toEqual(before);
    expect(fs.existsSync(path.join(f.project, '.specforge/config/project.json'))).toBe(false);
    expect(fs.existsSync(path.join(f.project, '.specforge/runtime'))).toBe(false);
    expect(await ordinary(f)).toMatchObject({ success: false, error: 'CONFIGURATION_READ_FAILED' });
  });

  it('returns a structured unhealthy result over authenticated HTTP, then diagnoses controlled initialization', async () => {
    const f = fixture(); const server = new HTTPServer({ config: new DaemonConfig(), eventBus: f.eventBus, projectManager: f.pm, toolDispatcher: f.dispatcher } as never);
    server.setToken('owned-doctor-test'); const { port } = await server.start();
    const post = (route: string, body: unknown) => fetch(`http://127.0.0.1:${port}${route}`, { method: 'POST', headers: { authorization: 'Bearer owned-doctor-test', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const invoke = () => post('/api/v1/tool/invoke', { tool: 'sf_doctor', args: {}, context: { directory: f.project, agent: 'sf-orchestrator' } });
    try {
      const before = snapshot(f.project), first = await invoke(); expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({ success: true, data: { success: true, healthy: false, project: { status: 'not_initialized' } } });
      expect(snapshot(f.project)).toEqual(before);
      const initialized = await post('/api/v1/project/ensure', { projectPath: f.project }); expect(initialized.status).toBe(200);
      expect(await initialized.json()).toMatchObject({ success: true, data: { success: true } });
      const initializedBytes = snapshot(f.project), second = await invoke(); expect(second.status).toBe(200);
      const body = await second.json(); expect(body).toMatchObject({ success: true, data: { success: true, project: { status: 'initialized', configuration: { valid: true } } } });
      expect(body.data.daemon_components.stateAuthority.source).toBe('StateManager/events');
      expect(snapshot(f.project)).toEqual(initializedBytes);
      expect(fs.existsSync(path.join(f.project, '.specforge/runtime/configuration-activation.json'))).toBe(false);
    } finally { await server.stop(); }
  });

  it('reports corrupt configuration without exposing its bytes or weakening ordinary acceptance', async () => {
    const f = fixture(); await ensureProjectInit(f.project);
    const document = path.join(f.project, '.specforge/config/project.json'), marker = 'PRIVATE_DIAGNOSTIC_SENTINEL'; fs.writeFileSync(document, '{"secret":"' + marker);
    const before = snapshot(f.project), result = await doctor(f);
    expect(result).toMatchObject({ success: true, healthy: false, project: { status: 'invalid', configuration: { valid: false, error: 'CONFIGURATION_INVALID_OBJECT' } } });
    expect(JSON.stringify(result)).not.toContain(marker); expect(snapshot(f.project)).toEqual(before);
    expect(await ordinary(f)).toMatchObject({ success: false, error: 'CONFIGURATION_INVALID_OBJECT' });
  });

  it('does not rewrite activation or state witnesses when diagnosing an already active project', async () => {
    const f = fixture(); await ensureProjectInit(f.project); await f.pm.getProjectConfiguration(f.project);
    const sm = await f.pm.getProjectStateManager(f.project); await sm.transition('WI-0001', '', 'created');
    const document = path.join(f.project, '.specforge/config/project.json'); fs.writeFileSync(document, JSON.stringify({ schema_version: '1.0', timeoutMs: 54321 }));
    const before = snapshot(f.project); expect(await doctor(f)).toMatchObject({ success: true }); expect(snapshot(f.project)).toEqual(before);
    expect(await ordinary(f)).toMatchObject({ success: false, error: 'CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK' });
  });

  it('retains project recovery exclusion before any diagnostic observation or handler work', async () => {
    const f = fixture(); let release!: () => void;
    const recovery = f.pm.withProjectArchiveRecovery(f.project, () => new Promise<void>(resolve => { release = resolve; }));
    try { await expect(doctor(f)).rejects.toThrow('ARCHIVE_RECOVERY_IN_PROGRESS'); expect(snapshot(f.project)).toEqual({}); }
    finally { release(); await recovery; }
  });
});
