import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ProjectManager } from '../boundary-capability-worktree/packages/daemon-core/src/project/ProjectManager';
import { EventBus } from '../boundary-capability-worktree/packages/daemon-core/src/event-bus/EventBus';
import { PersonalPathResolver } from '../boundary-capability-worktree/packages/daemon-core/src/daemon/path-resolver';
import { createSpecForgeThinPlugin } from 'C:/Users/lyq/.config/opencode/sf-user/lib/sf_thin_plugin.ts';
import { ReconnectingDaemonClient } from 'C:/Users/lyq/.config/opencode/sf-user/lib/sf_plugin_client.ts';
const base=path.join(import.meta.dir,'installed-fixture'),root=path.join(base,'project'),records:any[]=[];
const handshake=JSON.parse(fs.readFileSync('C:/Users/lyq/.config/opencode/sf-user/runtime/handshake.json','utf8'));
const health=await(await fetch(`http://127.0.0.1:${handshake.port}/health`)).json();assert.equal(health.data.version,'1.0.19');records.push({utc:new Date().toISOString(),pid:handshake.pid,health});
fs.mkdirSync(path.join(root,'.specforge/config'),{recursive:true});fs.writeFileSync(path.join(root,'.specforge/config/project.json'),'{"schema_version":"1.0"}');
const manager=new ProjectManager(new EventBus(),new PersonalPathResolver(),undefined as any);await manager.getProjectConfiguration(root);const state=await manager.getProjectStateManager(root);await state.transition('WI-0001','','created');await state.transition('WI-0001','created','implementation_running');
const wi=path.join(root,'.specforge/work-items/WI-0001');fs.mkdirSync(wi,{recursive:true});fs.writeFileSync(path.join(wi,'work_item.json'),JSON.stringify({schema_version:'1.1',work_item_id:'WI-0001',workflow_type:'feature_spec',code_change_allowed:true,code_permission_revoked:false,allowed_write_files:[{path:'allowed.txt',operation:'modify'},{path:'new.txt',operation:'create'}]}));
const client=new ReconnectingDaemonClient({handshakePath:'C:/Users/lyq/.config/opencode/sf-user/runtime/handshake.json'});
const hooks=await createSpecForgeThinPlugin({directory:root},{client:{register:async()=>({sessionId:'fixture',projectId:'fixture',mode:'personal'}),postEvent:async()=>({ok:true,dropped:false,reason:'success'}),checkNativeTool:client.checkNativeTool.bind(client)},notify:()=>{}});
const target=path.join(root,'allowed.txt');
async function execute(tool:string,filePath:string){await hooks['tool.execute.before']({tool},{args:{filePath}});fs.writeFileSync(filePath,'MODIFIED');}
let failure:unknown;
try{
 for(const location of ['outside','inside']){
  const other=path.join(location==='outside'?base:root,location+'.txt');fs.writeFileSync(other,'PROTECTED');fs.linkSync(other,target);
  for(const tool of ['edit','write']){let error='';try{await execute(tool,target)}catch(e){error=String(e)}assert.match(error,/WRITE_HARDLINK_FORBIDDEN/);assert.equal(fs.readFileSync(other,'utf8'),'PROTECTED');assert.equal(fs.readFileSync(target,'utf8'),'PROTECTED');records.push({utc:new Date().toISOString(),location,tool,error,nlink:fs.statSync(target).nlink,target:fs.readFileSync(target,'utf8'),alias:fs.readFileSync(other,'utf8')});}
  fs.unlinkSync(target);
 }
 fs.writeFileSync(target,'NORMAL');await execute('edit',target);assert.equal(fs.readFileSync(target,'utf8'),'MODIFIED');await execute('write',path.join(root,'new.txt'));assert.equal(fs.readFileSync(path.join(root,'new.txt'),'utf8'),'MODIFIED');
 records.push({case:'ordinary edit and create',target:fs.readFileSync(target,'utf8'),newFile:fs.readFileSync(path.join(root,'new.txt'),'utf8')});
 records.push({guardLog:fs.readFileSync(path.join(wi,'write_guard_log.jsonl'),'utf8')});
}catch(e){failure=String(e);process.exitCode=1}finally{client.dispose();fs.writeFileSync(path.join(import.meta.dir,'installed-native-result.json'),JSON.stringify({utc:new Date().toISOString(),records,failure,exit_code:failure?1:0},null,2),{flag:'wx'});}
