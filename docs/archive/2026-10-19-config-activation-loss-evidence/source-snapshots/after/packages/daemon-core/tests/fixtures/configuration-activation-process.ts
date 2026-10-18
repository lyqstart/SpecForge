import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectManager } from '../../src/project/ProjectManager';
import { EventBus } from '../../src/event-bus/EventBus';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';

const [root, action] = process.argv.slice(2);
process.env.OPENCODE_CONFIG_DIR = path.join(root, 'user');
delete process.env.SPECFORGE_CONFIG_OVERRIDES;
const manager = new ProjectManager(new EventBus(), new PersonalPathResolver(), undefined as any);
const result: Record<string, unknown> = { pid: process.pid, action, utc: new Date().toISOString() };
try { result.timeoutMs = (await manager.getProjectConfiguration(root)).merged.timeoutMs; }
catch (error) { result.error = String(error); }
const state = await manager.getProjectStateManager(root);
if (action === 'initialize-active') await state.transition('WI-0001', '', 'created');
await state.rebuildState();
result.states = state.listWorkItems().map(item => item.current_state);
result.activationExists = fs.existsSync(path.join(root, '.specforge/runtime/configuration-activation.json'));
console.log('ACTIVATION_RESULT=' + JSON.stringify(result));
