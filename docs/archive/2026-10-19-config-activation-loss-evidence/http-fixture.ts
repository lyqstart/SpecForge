import path from 'node:path';
import { ProjectManager } from '../../../packages/daemon-core/dist/project/ProjectManager.js';
import { EventBus } from '../../../packages/daemon-core/dist/event-bus/EventBus.js';
import { PersonalPathResolver } from '../../../packages/daemon-core/dist/daemon/path-resolver.js';
import { HTTPServer } from '../../../packages/daemon-core/dist/http/HTTPServer.js';
import { DaemonConfig } from '../../../packages/daemon-core/dist/daemon/DaemonConfig.js';
import { ToolDispatcher } from '../../../packages/daemon-core/dist/tools/index.js';
const root = process.argv[2];
process.env.OPENCODE_CONFIG_DIR = path.join(root, 'user');
delete process.env.SPECFORGE_CONFIG_OVERRIDES;
const manager = new ProjectManager(new EventBus(), new PersonalPathResolver(), undefined as any);
if (process.argv.includes('--initial')) {
  await manager.getProjectConfiguration(root);
  const state = await manager.getProjectStateManager(root);
  await state.transition('WI-0001', '', 'created');
}
const deps: any = { config: new DaemonConfig([]), projectManager: manager };
deps.toolDispatcher = new ToolDispatcher(deps);
const server = new HTTPServer(deps);
server.setToken('isolated-activation-test-token');
const address = await server.start();
console.log('READY=' + JSON.stringify({ pid: process.pid, port: address.port }));
