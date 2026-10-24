import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {DaemonClient} from 'C:/Users/lyq/.config/opencode/tools/lib/thin-client.ts';
const out=import.meta.dir,root=path.join(out,'fixtures/privacy'),client=new DaemonClient(),context={directory:root,agent:'sf-orchestrator'},marker='SF_SYNTHETIC_FINAL_PRIVATE_'+Date.now(),started=new Date().toISOString(),calls:any[]=[];let failure;
const invoke=async(args:any)=>{const result:any=await client.invokeTool('sf_project_config',args,context);calls.push({utc:new Date().toISOString(),args,result});assert.ok(!JSON.stringify(result).includes(marker),'public response must not echo test secret');return result;};
try{const initial=await invoke({action:'read'});assert.equal(initial.success,true);
 const normal=await invoke({action:'update',content:JSON.stringify({schema_version:'1.0',timeoutMs:30000,note:marker}),expected_sha256:initial.document_sha256});assert.equal(normal.success,true);
 const consume:any=await client.invokeTool('sf_state_read',{work_item_id:'all'},context);assert.equal(consume.success,true);assert.equal(consume.work_items['WI-0001'].current_state,'closed');calls.push({tool:'sf_state_read',result:consume});
 for(const content of [JSON.stringify({timeoutMs:marker}),JSON.stringify({[marker]:{nested:marker},schema_version:marker}),`{"${marker}`,JSON.stringify({schema_version:'1.0',nested:{apiKey:marker}})])assert.equal((await invoke({action:'validate',content})).success,false);
 const restored=await invoke({action:'restore',restore_sha256:initial.document_sha256,expected_sha256:normal.document_sha256});assert.equal(restored.success,true);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'.specforge/config/project.json'))).digest('hex'),initial.document_sha256);
 const recovered:any=await client.invokeTool('sf_state_read',{work_item_id:'all'},context);assert.equal(recovered.success,true);
}catch(e){failure=String(e);process.exitCode=1;}
const logs:string[]=[];function walk(dir:string){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else logs.push(f);}}walk(path.join(root,'.specforge/logs'));
const hits=logs.filter(f=>fs.readFileSync(f,'utf8').includes(marker)),counts:Record<string,number>={};
for(const side of ['daemon','userlevel']){const file=path.join(root,'.specforge/logs/observability',side,'index.jsonl');counts[side]=fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').map(s=>JSON.parse(s)).filter(r=>r.timestamp>=started&&r.tool_name==='sf_project_config').length:0;}
if(hits.length||Object.values(counts).some(n=>n<7)){failure=JSON.stringify({hits,counts});process.exitCode=1;}
fs.writeFileSync(path.join(out,'privacy-result.json'),JSON.stringify({started,finished:new Date().toISOString(),marker,calls,scanned:logs.length,hits,counts,failure,exit_code:process.exitCode??0,scope:'Installed client + installed daemon; automatic configuration logs, not intentional raw evidence inputs'},null,2),{flag:'wx'});console.log(JSON.stringify({scanned:logs.length,hits,counts,failure}));
