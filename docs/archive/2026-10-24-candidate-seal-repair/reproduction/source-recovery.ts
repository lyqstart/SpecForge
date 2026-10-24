import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { StateManager } from '../candidate-seal-worktree/packages/daemon-core/src/state/StateManager';
import { PersonalPathResolver } from '../candidate-seal-worktree/packages/daemon-core/src/daemon/path-resolver';
import { getHandler } from '../candidate-seal-worktree/packages/daemon-core/src/tools/ToolDispatcher';
import '../candidate-seal-worktree/packages/daemon-core/src/tools/handlers/sf-state-transition';
import '../candidate-seal-worktree/packages/daemon-core/src/tools/handlers/sf-v11-gate-run';
const out=import.meta.dirname, root=path.join(out,'source-fixture-'+process.argv[2]), records:any[]=[];
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function files(dir:string):Promise<Record<string,string>>{const result:Record<string,string>={};async function walk(p:string){for(const e of await fs.readdir(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())await walk(f);else result[path.relative(dir,f)]=hash(await fs.readFile(f));}}await walk(dir);return result;}
let sm:StateManager;
async function call(tool:string,args:object){const start=new Date().toISOString();const result=await getHandler(tool)!({work_item_id:'WI-0002',...args},{directory:root,agent:'sf-orchestrator'},{projectManager:{getProjectStateManager:async()=>sm}} as any);records.push({tool,args,start,end:new Date().toISOString(),result});return result as any;}
async function main(){await fs.cp(path.join(out,'original'),root,{recursive:true,errorOnExist:true,force:false});sm=new StateManager(new PersonalPathResolver(),root);await sm.initialize();assert.equal(sm.getState('WI-0002')?.current_state,'candidate_preparing');
 const wi=path.join(root,'.specforge/work-items/WI-0002'), old=await files(path.join(wi,'gate_attempts'));
 const before=await files(root);const deny=await call('sf_v11_gate_run',{candidate_phase:'full'});assert.equal(deny.success,false);assert.match(deny.error,/CANDIDATE_SEAL_REQUIRED/);assert.deepEqual(await files(root),before);
 const seal=await call('sf_state_transition',{from_state:'candidate_preparing',to_state:'candidate_prepared',evidence:'isolated exact-copy recovery test; no approval'});assert.equal(seal.success,true,JSON.stringify(seal));assert.equal(sm.getState('WI-0002')?.current_state,'candidate_prepared');
 const manifest=JSON.parse(await fs.readFile(path.join(wi,'candidate_manifest.json'),'utf8'));assert.equal(manifest.project_spec_precondition_sha256,'sha256:'+hash(await fs.readFile(path.join(root,'.specforge/project/spec_manifest.json'))));assert.ok(manifest.entries.length>0);records.push({manifest});
 sm=new StateManager(new PersonalPathResolver(),root);await sm.initialize();assert.equal(sm.getState('WI-0002')?.current_state,'candidate_prepared');records.push({recreated_owner_state:sm.getState('WI-0002')?.current_state});
 const gate=await call('sf_v11_gate_run',{candidate_phase:'full'});assert.equal(gate.gate_attempt_id,'attempt-0003',JSON.stringify(gate));assert.ok(['approval_required','gates_failed'].includes(sm.getState('WI-0002')?.current_state!));
 for(const [p,h]of Object.entries(old))assert.equal((await files(path.join(wi,'gate_attempts')))[p],h);
 if(sm.getState('WI-0002')?.current_state==='gates_failed'){
   const beforeRetry=await files(root);const retry=await call('sf_v11_gate_run',{candidate_phase:'full'});assert.equal(retry.success,false);assert.match(retry.error,/CANDIDATE_SEAL_REQUIRED/);assert.deepEqual(await files(root),beforeRetry);
   const recover=await call('sf_state_transition',{from_state:'gates_failed',to_state:'candidate_preparing',evidence:'isolated retry must return to seal owner'});assert.equal(recover.success,true,JSON.stringify(recover));const reseal=await call('sf_state_transition',{from_state:'candidate_preparing',to_state:'candidate_prepared',evidence:'isolated reseal after failed gate'});assert.equal(reseal.success,true,JSON.stringify(reseal));
 }
 records.push({verdict:'PASS',state:sm.getState('WI-0002')?.current_state,old_attempt_files_preserved:Object.keys(old).length});
}
main().catch(e=>{records.push({failure:e.stack});process.exitCode=1}).finally(async()=>{await fs.writeFile(path.join(out,'source-recovery-'+process.argv[2]+'.json'),JSON.stringify({utc:new Date().toISOString(),exit:process.exitCode??0,records},null,2),{flag:'wx'});console.log(JSON.stringify({exit:process.exitCode??0}));});
