import fs from 'node:fs';
import path from 'node:path';
import { OpenCodeAdapter } from '../../../packages/opencode-adapter/src/OpenCodeAdapter';
import { OpenCodeHttpRuntimeClient } from '../../../packages/opencode-adapter/src/integration/OpenCodeHttpRuntimeClient';
const out=import.meta.dir;
const host=JSON.parse(fs.readFileSync(path.join(out,'resume01-identity.json'),'utf8'));
const fixture=JSON.parse(fs.readFileSync(path.join(out,'host03-identity.json'),'utf8'));
const adapter=new OpenCodeAdapter({runtimeClient:new OpenCodeHttpRuntimeClient({baseUrl:host.base,timeoutMs:90000})});
const records:any[]=[];let sid:string|undefined;
try {
 const result=await adapter.spawnAgent({agentRole:'sf-verifier',spawnIntentId:'CODEX-SF-20261025-event-probe',cwd:fixture.work,model:'zhipuai-coding-plan/glm-5.3'});sid=result.sessionId;
 records.push({utc:new Date().toISOString(),kind:'spawn',result});
 const start=Date.now();const next=adapter.subscribeEvents(sid)[Symbol.asyncIterator]().next();
 await adapter.sendPrompt(sid,{role:'user',content:'Text transport probe only: reply exactly SF-EVENT-PROBE-OK. Do not call tools, write files, or operate any work item.'});
 const messages=await fetch(`${host.base}/session/${sid}/message?directory=${encodeURIComponent(fixture.work)}`).then(r=>r.json());
 const event=await next;
 const reply=messages.some((m:any)=>m.info?.role==='assistant'&&m.parts?.some((p:any)=>p.type==='text'&&p.text.includes('SF-EVENT-PROBE-OK')));
 records.push({utc:new Date().toISOString(),kind:'live-result',elapsed_ms:Date.now()-start,reply_observed:reply,event,messages});
 if(!reply)throw Error('MODEL_REPLY_NOT_CONFIRMED');
 console.log(JSON.stringify({reply_observed:reply,event_received:!event.done,elapsed_ms:Date.now()-start}));
}catch(e){records.push({error:String(e)});process.exitCode=1;}
finally {if(sid)await adapter.cancelSession(sid,'Synthetic event probe cleanup');fs.writeFileSync(path.join(out,'adapter-events.json'),JSON.stringify({utc:new Date().toISOString(),scope:'Repository source adapter with real HTTP runtime client; no simulated or manually injected events',records},null,2),{flag:'wx'});}
