import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProjectManager } from '../../src/project/ProjectManager';
import { EventBus } from '../../src/event-bus/EventBus';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { createSpecForgeThinPlugin } from '../../../../setup/userlevel-opencode/scripts/lib/sf_thin_plugin';
import { ReconnectingDaemonClient } from '../../../../setup/userlevel-opencode/scripts/lib/sf_plugin_client';
import { ReconnectingDaemonClient as PackageClient } from '../../../service-management/src/plugin/reconnecting-daemon-client';
import { currentHandshake } from '../helpers/current-daemon-test-config';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
describe('native hardlink enforcement through actual HTTP and pre-tool hook', () => {
  for (const [clientName, Client] of [['template', ReconnectingDaemonClient], ['package', PackageClient]] as const) {
    for (const tool of ['write', 'edit']) {
      it(`${clientName}/${tool}: denies aliases outside and inside project, permits ordinary files`, async () => {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-native-hardlink-')); roots.push(base);
        const root = path.join(base, 'project');
        vi.stubEnv('OPENCODE_CONFIG_DIR', path.join(base, 'user')); vi.stubEnv('SPECFORGE_CONFIG_OVERRIDES', '');
        fs.mkdirSync(path.join(root, '.specforge/config'), { recursive: true });
        fs.writeFileSync(path.join(root, '.specforge/config/project.json'), '{"schema_version":"1.0"}');
        const manager = new ProjectManager(new EventBus(), new PersonalPathResolver(), undefined as any);
        await manager.getProjectConfiguration(root);
        const state = await manager.getProjectStateManager(root);
        await state.transition('WI-0001', '', 'created');
        await state.transition('WI-0001', 'created', 'implementation_running');
        const wiDir = path.join(root, '.specforge/work-items/WI-0001'); fs.mkdirSync(wiDir, { recursive: true });
        fs.writeFileSync(path.join(wiDir, 'work_item.json'), JSON.stringify({ schema_version: '1.1', work_item_id: 'WI-0001', workflow_type: 'feature_spec', code_change_allowed: true, code_permission_revoked: false, allowed_write_files: [{ path: 'allowed.txt', operation: 'modify' }, { path: 'new.txt', operation: 'create' }] }));
        const server = new HTTPServer({ config: new DaemonConfig([]), projectManager: manager } as any);
        server.setToken('fixture-token'); const { port } = await server.start();
        const handshakePath = path.join(base, 'handshake.json'); fs.writeFileSync(handshakePath, JSON.stringify(currentHandshake(port, 'fixture-token')));
        const client = new Client({ handshakePath });
        const hooks = await createSpecForgeThinPlugin({ directory: root }, { client: { register: async () => ({ sessionId: 'fixture', projectId: 'fixture', mode: 'personal' }), postEvent: async () => ({ ok: true, dropped: false, reason: 'success' }), checkNativeTool: client.checkNativeTool.bind(client) }, notify: () => {} });
        const target = path.join(root, 'allowed.txt');
        const execute = async (filePath: string) => { await hooks['tool.execute.before']({ tool }, { args: { filePath } }); fs.writeFileSync(filePath, 'MODIFIED'); };
        try {
          for (const protectedPath of [path.join(base, 'outside.txt'), path.join(root, 'protected.txt')]) {
            fs.writeFileSync(protectedPath, 'PROTECTED'); fs.linkSync(protectedPath, target);
            expect(fs.lstatSync(target).nlink).toBe(2);
            await expect(execute(target)).rejects.toThrow('WRITE_HARDLINK_FORBIDDEN');
            expect(fs.readFileSync(protectedPath, 'utf8')).toBe('PROTECTED');
            expect(fs.readFileSync(target, 'utf8')).toBe('PROTECTED');
            const lastDecision = JSON.parse(fs.readFileSync(path.join(wiDir, 'write_guard_log.jsonl'), 'utf8').trim().split('\n').at(-1)!);
            expect(lastDecision).toMatchObject({ allowed: false, path: 'allowed.txt', tool, violations: ['WRITE_HARDLINK_FORBIDDEN'] });
            console.log(JSON.stringify({ tool, clientName, boundary: protectedPath === path.join(base, 'outside.txt') ? 'outside' : 'inside', links: 2, unchanged: true }));
            fs.unlinkSync(target);
          }
          const junction = path.join(root, 'junction');
          fs.symlinkSync(base, junction, process.platform === 'win32' ? 'junction' : 'dir');
          await expect(execute(path.join(junction, 'outside.txt'))).rejects.toThrow('WRITE_SYMLINK_FORBIDDEN');
          expect(fs.readFileSync(path.join(base, 'outside.txt'), 'utf8')).toBe('PROTECTED');
          fs.unlinkSync(junction);
          fs.writeFileSync(target, 'NORMAL'); await execute(target); expect(fs.readFileSync(target, 'utf8')).toBe('MODIFIED');
          await execute(path.join(root, 'new.txt')); expect(fs.readFileSync(path.join(root, 'new.txt'), 'utf8')).toBe('MODIFIED');
        } finally { client.dispose(); await server.stop(); }
      });
    }
  }
});
