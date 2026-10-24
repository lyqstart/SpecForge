import * as path from 'node:path';
import { ProjectManager } from '../../src/project/ProjectManager';
import { EventBus } from '../../src/event-bus/EventBus';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
const root=process.argv[2]!;
process.env.OPENCODE_CONFIG_DIR=path.join(root,'user');
delete process.env.SPECFORGE_CONFIG_OVERRIDES;
const manager=new ProjectManager(new EventBus(),new PersonalPathResolver(),undefined as any);
const result:Record<string,unknown>={pid:process.pid,utc:new Date().toISOString()};
try {
  result.timeoutMs=(await manager.getProjectConfiguration(root)).merged.timeoutMs;
  const state=await manager.getProjectStateManager(root);await state.rebuildState();
  result.states=state.listWorkItems().map(item=>item.current_state);
} catch(error) {result.error=String(error);}
console.log('HISTORY_RESULT='+JSON.stringify(result));
