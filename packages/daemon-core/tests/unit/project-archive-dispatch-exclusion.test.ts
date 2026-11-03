import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { ToolDispatcher } from '../../src/tools';
import { ProjectManager } from '../../src/project/ProjectManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { EventBus } from '../../src/event-bus/EventBus';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import * as observations from '../../src/observability/observability-recorder';

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'sf-recovery-dispatch-')); roots.push(root);
  const eventBus = new EventBus(), pm = new ProjectManager(eventBus, new PersonalPathResolver(), undefined as any);
  vi.spyOn(pm, 'getProjectConfiguration').mockResolvedValue(undefined as any);
  const dispatcher = new ToolDispatcher({ projectManager: pm } as any);
  let release!: () => void;
  const recovery = pm.withProjectArchiveRecovery(root, () => new Promise<void>(resolve => { release = resolve; }));
  const recorded = vi.spyOn(observations, 'recordDaemonObservation');
  return { root, eventBus, pm, dispatcher, recovery, release, recorded };
}

describe('project archive exclusion across dispatcher consumers', () => {
  it.each(['directory', 'worktree'])('rejects direct %s dispatch before observations or handlers, then allows the real handler', async field => {
    const f = await fixture();
    const request = { tool: 'sf_handoff', args: { action: 'validate', handoff: {} }, context: { [field]: f.root, agent: 'sf-orchestrator' } };
    try {
      await expect(f.dispatcher.dispatch(request)).rejects.toThrow('ARCHIVE_RECOVERY_IN_PROGRESS');
      expect(f.recorded).not.toHaveBeenCalled();
      expect(await fs.readdir(f.root)).toEqual([]);
    } finally { f.release(); await f.recovery; }
    expect(await f.dispatcher.dispatch(request)).toMatchObject({ success: true, action: 'validate', valid: false });
    expect(f.recorded).toHaveBeenCalled();
  });

  it('rejects the legacy HTTP dispatch route before observation and preserves its normal result after recovery', async () => {
    const f = await fixture();
    const server = new HTTPServer({ config: new DaemonConfig(), eventBus: f.eventBus, stateManager: undefined as any, wal: undefined as any,
      projectManager: f.pm, toolDispatcher: f.dispatcher });
    // This legacy route currently selects the service cwd. Bind that existing
    // resolver to the owned fixture instead of letting a test touch the workspace.
    vi.spyOn(server as any, 'getProjectPathFromRequest').mockReturnValue(f.root);
    server.setToken('archive-exclusion'); const { port } = await server.start();
    const post = () => fetch(`http://127.0.0.1:${port}/api/v1/v11/handoff`, { method: 'POST', headers: {
      authorization: 'Bearer archive-exclusion', 'content-type': 'application/json',
    }, body: JSON.stringify({ action: 'validate', handoff: {} }) });
    try {
      const denied = await post(); expect(denied.status).toBe(400);
      expect(await denied.json()).toMatchObject({ success: false, error: 'ARCHIVE_RECOVERY_IN_PROGRESS' });
      expect(f.recorded).not.toHaveBeenCalled(); expect(await fs.readdir(f.root)).toEqual([]);
      f.release(); await f.recovery;
      const accepted = await post(); expect(accepted.status).toBe(200);
      expect(await accepted.json()).toMatchObject({ success: true, action: 'validate', valid: false });
    } finally { f.release(); await f.recovery; await server.stop(); }
  });
});
