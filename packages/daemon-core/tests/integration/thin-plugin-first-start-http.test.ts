import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { EventBus } from '../../src/event-bus/EventBus';
import { ProjectManager } from '../../src/project/ProjectManager';
import { ReconnectingDaemonClient } from '../../../../setup/userlevel-opencode/scripts/lib/sf_plugin_client';
import { createSpecForgeThinPlugin } from '../../../../setup/userlevel-opencode/scripts/lib/sf_thin_plugin';

describe('Thin Plugin first start through real HTTP and Project Init owner', () => {
  it('leaves an uninitialized project untouched, permits controlled init, then registers once and resumes events', async () => {
    const owned = await fs.mkdtemp(join(tmpdir(), 'sf-plugin-first-start-http-'));
    const project = join(owned, 'project'),
      runtime = join(owned, 'private');
    await fs.mkdir(project);
    await fs.mkdir(runtime);
    const resolver = new PersonalPathResolver();
    resolver.resolveProjectRuntimeDir = () => join(runtime, 'runtime');
    resolver.resolveDaemonJsonPath = () => join(runtime, 'daemon.json');
    const bus = new EventBus(),
      manager = new ProjectManager(bus, resolver, undefined);
    const sessionRegistry = {
      registerPluginSession: vi.fn(async () => ({
        sessionId: 'owned-session',
        projectId: 'owned-project',
      })),
      handleOpenCodeEvent: vi.fn(async () => undefined),
      getProjectPath: () => project,
    };
    const server = new HTTPServer({
      config: new DaemonConfig(),
      eventBus: bus,
      projectManager: manager,
      sessionRegistry,
    } as never);
    const token = 'owned-synthetic-http-token';
    server.setToken(token);
    let client: ReconnectingDaemonClient | undefined;
    try {
      const { port } = await server.start();
      const handshake = join(runtime, 'handshake.json');
      await fs.writeFile(
        handshake,
        JSON.stringify({
          schema_version: '1.0',
          pid: 1,
          port,
          token,
          bound_to: '127.0.0.1',
          startedAt: 0,
          version: '1.0.25',
          serviceMode: false,
          artifact_contract_versions: { task_document: 'task-document/v1' },
        })
      );
      client = new ReconnectingDaemonClient({ handshakePath: handshake });
      const register = vi.spyOn(client, 'register'),
        post = vi.spyOn(client, 'postEvent'),
        notify = vi.fn();
      const hooks = await createSpecForgeThinPlugin({ directory: project }, { client, notify });
      await Promise.all(
        Array.from({ length: 50 }, () => hooks.event({ event: { type: 'session.updated' } }))
      );
      expect(register).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(await fs.readdir(project)).toEqual([]);
      expect(sessionRegistry.registerPluginSession).not.toHaveBeenCalled();
      await hooks['tool.execute.before']({ tool: 'sf_project_init' }, { args: {} });
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/project/ensure`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: project }),
      });
      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);
      const completion = {
        event: {
          type: 'message.part.updated',
          properties: {
            part: {
              type: 'tool',
              tool: 'sf_project_init',
              sessionID: 'owned-oc',
              callID: 'owned-init',
              state: { status: 'completed' },
            },
          },
        },
      };
      await hooks.event(completion);
      await hooks.event(completion);
      await hooks.event({ event: { type: 'session.updated' } });
      expect(register).toHaveBeenCalledTimes(2);
      expect(sessionRegistry.registerPluginSession).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledTimes(3);
      expect(notify).toHaveBeenCalledTimes(2);
      expect(
        JSON.parse(
          await fs.readFile(join(project, '.specforge/project/spec_manifest.json'), 'utf8')
        ).schema_version
      ).toBe('1.0');
    } finally {
      client?.dispose();
      await server.stop();
      manager.stop();
      await fs.rm(owned, { recursive: true, force: true });
    }
  });
});
