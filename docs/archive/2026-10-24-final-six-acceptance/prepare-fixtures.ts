import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import assert from 'node:assert/strict';
import {ProjectManager} from '../../packages/daemon-core/src/project/ProjectManager';
import {EventBus} from '../../packages/daemon-core/src/event-bus/EventBus';
import {PersonalPathResolver} from '../../packages/daemon-core/src/daemon/path-resolver';
const out=import.meta.dir,files=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(out,'original-before.json.gz'))).toString());
const names=['closed-projection','closed-rotation','activation-loss','history-loss','history-corrupt','config-corrupt','privacy'];
const manager=new ProjectManager(new EventBus(),new PersonalPathResolver(),undefined as any);const records:any[]=[];
for(const name of names){const root=path.join(out,'fixtures',name);assert.equal(fs.existsSync(root),false);for(const e of files){if(e.path.startsWith('.specforge/logs/')||e.path.startsWith('.specforge/runtime/logs/')||e.path.startsWith('.specforge/runtime/sessions/'))continue;const target=path.join(root,e.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Buffer.from(e.base64,'base64'));}
 await manager.getProjectConfiguration(root);const state=await manager.getProjectStateManager(root);await state.rebuildState();assert.equal(state.getState('WI-0001')?.current_state,'closed');
 if(['activation-loss','history-loss','history-corrupt','config-corrupt'].includes(name)){await state.transition('WI-TEST','','created');}
 if(name==='closed-rotation'){const wal=state.getWal();for(let i=0;i<5;i++){await wal.appendEvent(wal.createEvent(root,'system','acceptance-padding',{data:'x'.repeat(5*1024*1024)}));await wal.appendEvent(wal.createEvent(root,'system','acceptance-after-rotation',{i}));}}
 const runtime=path.join(root,'.specforge/runtime'),backup=path.join(out,'fixture-backups',name);fs.mkdirSync(backup,{recursive:true});for(const file of ['events.jsonl','state.json','configuration-activation.json']){fs.copyFileSync(path.join(runtime,file),path.join(backup,file));}fs.copyFileSync(path.join(root,'.specforge/config/project.json'),path.join(backup,'project.json'));
 records.push({name,root,originalWI:state.getState('WI-0001'),testWI:state.getState('WI-TEST'),archives:fs.readdirSync(runtime).filter(n=>n.endsWith('.jsonl.bak')).length});
}
fs.writeFileSync(path.join(out,'fixture-identities.json'),JSON.stringify({utc:new Date().toISOString(),scope:'Original authoritative/business bytes copied; prior observation/session logs excluded. WI-TEST is an isolated StateManager test fixture, not a new business work item.',records},null,2),{flag:'wx'});console.log(JSON.stringify({fixtures:records.length}));
