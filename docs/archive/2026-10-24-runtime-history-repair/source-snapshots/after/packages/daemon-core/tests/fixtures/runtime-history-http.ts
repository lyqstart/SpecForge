import path from 'node:path';
import { ProjectManager } from '../../src/project/ProjectManager';
import { EventBus } from '../../src/event-bus/EventBus';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { ToolDispatcher } from '../../src/tools';
const root = process.argv[2]!;
process.env.OPENCODE_CONFIG_DIR = path.join(root, 'user');
delete process.env.SPECFORGE_CONFIG_OVERRIDES;
const manager = new ProjectManager(new EventBus(), new PersonalPathResolver(), undefined as any);
if (process.argv.includes('--initial')) {
  await manager.getProjectConfiguration(root);
  const state = await manager.getProjectStateManager(root);
  await state.transition('WI-0001', '', 'created');
  await state.transition('WI-0001', 'created', 'intake_ready');
}
if (process.argv.includes('--rotate')) {
  const state = await manager.getProjectStateManager(root), wal = state.getWal();
  for (let i=0;i<5;i++) await wal.appendEvent(wal.createEvent(root,'system','padding',{data:'x'.repeat(5*1024*1024)}));
  await wal.appendEvent(wal.createEvent(root,'system','after_rotation',{}));
}
const deps: any = {config: new DaemonConfig([]), projectManager: manager};
deps.toolDispatcher = new ToolDispatcher(deps);
const server = new HTTPServer(deps);
server.setToken('isolated-history-test-token');
const address = await server.start();
console.log('READY='+JSON.stringify({pid:process.pid,port:address.port,utc:new Date().toISOString()}));
