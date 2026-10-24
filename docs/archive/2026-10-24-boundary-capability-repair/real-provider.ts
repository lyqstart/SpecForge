import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { OpenCodeAdapter, OpenCodeHttpRuntimeClient } from '../boundary-capability-worktree/packages/opencode-adapter/src';
const root=import.meta.dir;
const out=fs.openSync(path.join(root,'provider-host.stdout.txt'),'wx'),err=fs.openSync(path.join(root,'provider-host.stderr.txt'),'wx');
const child=spawn('C:/Users/lyq/AppData/Roaming/npm/node_modules/opencode-ai/bin/opencode.exe',['serve','--hostname','127.0.0.1','--port','0'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let text='';child.stdout!.on('data',b=>{fs.writeSync(out,b);text+=b});child.stderr!.on('data',b=>{fs.writeSync(err,b);text+=b});
const records:any[]=[];let failure:unknown;
try {
  let baseUrl:string|undefined;
  for(let i=0;i<200;i++){baseUrl=text.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(baseUrl)break;if(child.exitCode!==null)throw Error('HOST_EXIT');await new Promise(r=>setTimeout(r,100));}
  assert.ok(baseUrl);
  const client=new OpenCodeHttpRuntimeClient({baseUrl,timeoutMs:5000});
  const response=await fetch(baseUrl+'/provider');assert.equal(response.status,200);const raw:any=await response.json();
  const provider=raw.all.find((p:any)=>p.id==='zhipuai-coding-plan');const model=provider?.models?.['glm-5.3'];assert.ok(model);
  const adapter=new OpenCodeAdapter({runtimeClient:client});const result=await adapter.getCapabilities('zhipuai-coding-plan/glm-5.3');
  records.push({utc:new Date().toISOString(),pid:child.pid,baseUrl,version:await client.getVersion(),rawModelFields:{id:model.id,providerID:model.providerID,capabilities:model.capabilities,limit:model.limit},result,scope:'Read-only local host metadata; no prompt/inference or outbound test data'});
  assert.equal(result.maxContextLength,model.limit.context);assert.equal(result.vision,model.capabilities.input.image);assert.equal(result.tools,model.capabilities.toolcall);assert.equal(result.functionCalling,model.capabilities.toolcall);
  assert.equal(result.streaming,null);assert.equal(result.jsonOutput,null);assert.ok(!result.outputFormats.includes('json'));
  try {await adapter.getCapabilities('zhipuai-coding-plan/sf-missing-model');throw Error('UNEXPECTED_ALLOW')}catch(e){assert.match(String(e),/CAPABILITY_MODEL_NOT_FOUND/);records.push({utc:new Date().toISOString(),case:'unknown model',error:String(e)})}
  const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));child.kill();records.push({case:'stop dedicated host',exit:await exited});
  try {await adapter.getCapabilities('zhipuai-coding-plan/glm-5.3');throw Error('UNEXPECTED_ALLOW')}catch(e){assert.doesNotMatch(String(e),/UNEXPECTED_ALLOW/);records.push({utc:new Date().toISOString(),case:'host disconnected',error:String(e)})}
}catch(e){failure=String(e);process.exitCode=1}
finally {if(child.exitCode===null)child.kill();fs.closeSync(out);fs.closeSync(err);fs.writeFileSync(path.join(root,'real-provider-result.json'),JSON.stringify({utc:new Date().toISOString(),records,failure,exit_code:failure?1:0},null,2),{flag:'wx'});}
