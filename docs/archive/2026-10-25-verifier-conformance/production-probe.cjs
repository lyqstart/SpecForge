const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,hs=JSON.parse(fs.readFileSync('C:/Users/lyq/.config/opencode/sf-user/runtime/handshake.json')),host=JSON.parse(fs.readFileSync(path.join(root,'resume01-identity.json'))),isolated=JSON.parse(fs.readFileSync(path.join(root,'host03-identity.json')));
const base=`http://127.0.0.1:${hs.port}`,records=[];
async function call(method,url,body,auth=true){const r=await fetch(base+url,{method,headers:{...(auth?{Authorization:`Bearer ${hs.token}`}:{}) ,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const response=await r.json();records.push({utc:new Date().toISOString(),method,url,body,http_status:r.status,response});return {status:r.status,response};}
(async()=>{try{
 const denied=await call('POST','/api/v1/state/read',{projectPath:host.work,workItemId:'all'},false);assert.equal(denied.status,401);
 const state=await call('POST','/api/v1/state/read',{projectPath:host.work,workItemId:'all'});assert.equal(state.status,200);
 for(const [url,body]of [['/api/v1/event/query',{projectId:'synthetic-audit'}],['/api/v1/cas/store',{content:'synthetic-no-store'}]]){const x=await call('POST',url,body);assert.equal(x.status,501);}
 const spawn=await call('POST','/api/v1/kernel/session/spawn',{agentRole:'sf-verifier',spawnIntentId:'CODEX-SF-20261025-kernel-probe',cwd:isolated.work,model:'zhipuai-coding-plan/glm-5.3'});assert.equal(spawn.status,201);const sid=spawn.response.data.sessionId;assert.ok(sid);
 const remote=await fetch(`${host.base}/session/${sid}?directory=${encodeURIComponent(isolated.work)}`).then(r=>r.json());records.push({utc:new Date().toISOString(),kind:'independent OpenCode session identity',remote});assert.equal(remote.id,sid);
 assert.equal((await call('GET',`/api/v1/kernel/session?sessionId=${encodeURIComponent(sid)}`)).status,200);
 assert.equal((await call('POST','/api/v1/kernel/session/cancel',{sessionId:sid,reason:'Synthetic production adapter audit complete; no inference requested'})).status,200);
 console.log('Production auth, state, unsupported routes, adapter spawn/get/cancel verified.');
 }catch(e){records.push({error:String(e),cause:String(e.cause)});process.exitCode=1;}finally{fs.writeFileSync(path.join(root,'production-probe.json'),JSON.stringify({utc:new Date().toISOString(),daemon_pid:hs.pid,token_recorded:false,records},null,2),{flag:'wx'});}})();
