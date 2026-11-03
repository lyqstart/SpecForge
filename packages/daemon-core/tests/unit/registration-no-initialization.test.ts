import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { EventBus } from '../../src/event-bus/EventBus';
import { ProjectManager } from '../../src/project/ProjectManager';
import type { StateManager } from '../../src/state/StateManager';

async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function visit(dir: string, prefix: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) { files[relative + '/'] = ''; await visit(join(dir, entry.name), relative + '/'); }
      else files[relative] = (await fs.readFile(join(dir, entry.name))).toString('base64');
    }
  }
  await visit(root, '');
  return files;
}

describe('plugin registration does not initialize projects', () => {
  it.each([true, false])('rejects legacy=%s without changing any project bytes or directories', async legacy => {
    const root = await fs.mkdtemp(join(tmpdir(), 'sf-register-no-init-'));
    const bus = new EventBus();
    const manager = new ProjectManager(bus, new PersonalPathResolver(), {} as StateManager);
    const server = new HTTPServer({ config: new DaemonConfig(), eventBus: bus,
      projectManager: manager, sessionRegistry: {} } as any);
    const token = 'registration-boundary-test';
    server.setToken(token);
    try {
      if (legacy) {
        await fs.mkdir(join(root, '.specforge/project'), { recursive: true });
        await fs.mkdir(join(root, '.specforge/config'), { recursive: true });
        await fs.writeFile(join(root, '.specforge/manifest.json'), '{"schema_version":"6.0"}\r\n');
        await fs.writeFile(join(root, '.specforge/project/spec_manifest.json'), '{"schema_version":"1.0","modules":[]}\r\n');
        await fs.writeFile(join(root, '.specforge/config/project.json'), '{"schema_version":"1.0","custom":true}\r\n');
      }
      const before = await snapshot(root);
      const { port } = await server.start();
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/ingest/register`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: root }),
      });
      expect(response.status).toBe(legacy ? 500 : 409);
      expect(await response.text()).toContain(legacy ? 'UNSUPPORTED_PROJECT_LAYOUT' : 'PROJECT_NOT_INITIALIZED');
      expect(await snapshot(root)).toEqual(before);
    } finally {
      await server.stop();
      manager.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
