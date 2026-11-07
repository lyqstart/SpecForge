// Read-only independent coverage: canonical approved Tasks + actual Kernel tool parts.
// Trace results do not substitute for authenticated common-consumer/Gate validation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { validateTaskArtifactContract } from '../../../packages/daemon-core/src/tools/lib/sf_markdown_verification_parser';

const root=import.meta.dirname,sha=(b:Buffer|string)=>crypto.createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'original-predeploy-baseline.json'),'utf8'));
const attempt=process.argv[2];assert.match(attempt,/^\d{2}$/);
const run=path.join(root,'original-verification-run-'+attempt),session=JSON.parse(fs.readFileSync(path.join(run,'original-session-baseline.json'),'utf8'));
assert.equal(session.prior_session_history_loaded,false);
const tasksPath='.specforge/work-items/WI-0001/candidates/tasks.md',raw=fs.readFileSync(path.join(baseline.project,tasksPath));
assert.equal(sha(raw),baseline.members.find((m:any)=>m.path===tasksPath).sha256,'APPROVED_TASK_BYTES_CHANGED');
const parsed=validateTaskArtifactContract(raw.toString('utf8'));assert.equal(parsed.valid,true);
const declarations=new Map<string,{task_id:string,verification_type:string,command_index:number,command:string}>();
for(const task of parsed.tasks)for(const[type,declared]of Object.entries(task.verification_commands)){const commands=typeof declared==='string'?[declared]:declared;for(const[command_index,command]of(commands||[]).entries()){const item={task_id:task.task_id,verification_type:type,command_index,command};declarations.set([task.task_id,type,command_index].join('/'),item);}}
assert.equal(declarations.size,22);
async function get(route:string){const r=await fetch('http://127.0.0.1:4096'+route+'?directory='+encodeURIComponent(session.directory),{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const b=await r.text();assert.ok(Buffer.byteLength(b)<=64*1024*1024);return JSON.parse(b);}
function output(p:any){try{return JSON.parse(p.state?.output||'null');}catch{return null;}}
const parentHistory:any[]=JSON.parse(fs.readFileSync(path.join(root,'original-verification-run-01/final-new-messages.json'),'utf8')).data;
const liveParent=await get('/session/'+session.session+'/message'),children=await get('/session/'+session.session+'/children');
const childHistory:any[]=[];for(const n of fs.readdirSync(path.join(root,'original-verification-run-01')).filter(n=>/^child-.*\.json$/.test(n)))childHistory.push(...JSON.parse(fs.readFileSync(path.join(root,'original-verification-run-01',n),'utf8')).data);
for(const child of children)childHistory.push(...await get('/session/'+child.id+'/message'));
const plans=new Map<string,any>(),attempts=new Map<string,string>(),runs:any[]=[],rejected:any[]=[];
for(const m of[...parentHistory,...liveParent])for(const p of m.parts||[])if(p.type==='tool'&&p.tool==='sf_verification_plan'&&p.state?.status==='completed'){const r=output(p);if(r?.success&&p.state.input.action==='create'){assert.equal(m.info.agent,'sf-orchestrator');plans.set(r.plan_id,{...p.state.input,purpose:r.purpose,original_command:r.original_command,call_id:p.callID,session:m.info.sessionID,message:m.info.id});}}
for(const m of childHistory)for(const p of m.parts||[])if(p.type==='tool'&&p.tool==='sf_verification_run'&&p.state?.status==='completed'){const r=output(p),input=p.state.input;if(r?.success&&input.action==='prepare')attempts.set(r.attempt_record_id,r.plan_id);if(input.action==='run'){assert.equal(m.info.agent,'sf-verifier');if(r?.success)runs.push({input,result:r,session:m.info.sessionID,message:m.info.id,call_id:p.callID});else rejected.push({input,error:r?.error,session:m.info.sessionID,message:m.info.id,call_id:p.callID});}}
const passed:any[]=[];for(const r of runs){const p=plans.get(attempts.get(r.input.attempt_record_id)!);assert.ok(p,'PLAN_TRACE_MISSING');assert.equal(r.result.plan_id,attempts.get(r.input.attempt_record_id));assert.deepEqual(Object.keys(r.input).sort(),['action','attempt_record_id','work_item_id']);assert.equal(r.result.outcome,'passed');assert.equal(r.result.exit_code,0);assert.equal(r.result.cleanup_proved,true);assert.equal(r.result.output_complete,true);assert.match(r.result.receipt_id,/^[a-f0-9]{64}$/);const key=[p.task_id,p.verification_type,p.command_index].join('/'),declared=declarations.get(key);assert.ok(declared,'UNDECLARED_SELECTOR');assert.equal(p.original_command,declared.command,'DECLARED_COMMAND_DRIFT');passed.push({...declared,purpose:p.purpose,plan_id:r.result.plan_id,attempt_record_id:r.input.attempt_record_id,receipt_id:r.result.receipt_id,exit_code:0,cleanup_proved:true,output_complete:true,actual_agent:'sf-verifier',session:r.session,message:r.message,call_id:r.call_id});}
const phases:any={};for(const purpose of['implementation','formal']){const values=passed.filter(r=>r.purpose===purpose),covered=new Set(values.map(r=>[r.task_id,r.verification_type,r.command_index].join('/')));phases[purpose]={declared:declarations.size,covered:covered.size,successful_receipts:values.length,missing:[...declarations].filter(([key])=>!covered.has(key)).map(([,value])=>value),receipts:values};}
const value={utc:new Date().toISOString(),source:'Actual genuine installed professional Agent tool parts; plans and prepare/run linked to canonical Task selectors',task_path:tasksPath,task_raw_sha256:sha(raw),declarations:[...declarations.values()],phases,rejected_runs:rejected,scope:'Observed native owner results and semantic selector coverage. Does not itself authenticate owner-store MACs, re-evaluate freshness, prove Review/Audit/any full Gate/Formal Version/Close, or authorize workflow transitions.'};
const name='original-execution-coverage-'+Date.now()+'.json';fs.writeFileSync(path.join(root,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({snapshot:name,declared_commands:declarations.size,implementation_covered:phases.implementation.covered,formal_covered:phases.formal.covered,rejected_run_records:rejected.length,common_consumer_acceptance_claimed:false}));
