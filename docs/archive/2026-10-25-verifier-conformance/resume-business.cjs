const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=__dirname,prefix=process.argv[2]||'resume01',origin=JSON.parse(fs.readFileSync(path.join(root,'host01-identity.json'))),original=JSON.parse(fs.readFileSync(path.join(root,'host01-business-request.json')));
const save=(name,value)=>fs.writeFileSync(path.join(root,`${prefix}-${name}.json`),JSON.stringify(value,null,2),{flag:'wx'});
const child=cp.spawn('C:/Users/lyq/AppData/Roaming/npm/node_modules/opencode-ai/bin/opencode.exe',['serve','--hostname','127.0.0.1','--port','0'],{cwd:origin.work,windowsHide:true,stdio:['ignore','pipe','pipe']});
const log=fs.createWriteStream(path.join(root,`${prefix}-host.log`),{flags:'wx'});let raw='',base;for(const s of [child.stdout,child.stderr])s.on('data',b=>{raw+=b;log.write(b)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function req(method,p,body){const r=await fetch(base+p,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});const t=await r.text();assert.ok(r.ok,`${method} ${p}: ${r.status} ${t.slice(0,300)}`);return t?JSON.parse(t):null;}
(async()=>{let finished=false;try{
 for(let i=0;i<300;i++){base=raw.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(base)break;assert.equal(child.exitCode,null);await sleep(100);}assert.ok(base);
 save('identity',{utc:new Date().toISOString(),base,pid:child.pid,work:origin.work,session:original.session,scope:'Resume original synthetic WI through existing OpenCode session; no duplicate WI, no manual truth-source edits.'});
 const agents=await req('GET','/agent');save('final-verifier-loaded',agents.find(a=>a.name==='sf-verifier'));
 const before=await req('GET',`/session/${original.session}/message`);save('before',before);
 const prompt='继续原会话和原 WI-0001。上一轮由外部验收取证载体结束观察窗口并取消未完成调用，并非产品HardStop或用户取消。需求和设计owner已交接，sf-task-planner原子会话ses_e8e6313c4ffeLm2bmNL5lB3xSh可能未完成；先核对已有会话、产物和handoff，再从原合法断点恢复，避免重复覆盖已成功的需求/设计产物。先通过 sf_state_read 重读权威状态和已有产物，从最后成功步骤继续，不创建替代工作项、不重复已成功写入；保留全部历史。按原需求继续正式 feature_spec 候选、专业Agent、封存、Gate，到真实用户批准边界展示候选并停止。若确有无法合法恢复的HardStop或能力缺口，保存阻断依据并说明下一合法动作。不得伪造审批或把本条继续指令当作候选批准。';
 save('request',{utc:new Date().toISOString(),prompt});await req('POST',`/session/${original.session}/prompt_async`,{agent:'sf-orchestrator',model:{providerID:'zhipuai-coding-plan',modelID:'glm-5.3'},parts:[{type:'text',text:prompt}]});
 for(let tick=0;tick<Number(process.argv[3]||120);tick++){await sleep(15000);const statuses=await req('GET','/session/status'),messages=await req('GET',`/session/${original.session}/message`);const tools=messages.flatMap(m=>m.parts||[]).filter(p=>p.type==='tool');const last=tools.at(-1);console.log(JSON.stringify({utc:new Date().toISOString(),status:statuses[original.session],messages:messages.length,last_tool:last?.tool,last_status:last?.state?.status}));
 fs.appendFileSync(path.join(root,`${prefix}-progress.jsonl`),JSON.stringify({utc:new Date().toISOString(),status:statuses[original.session],messages:messages.length,last_tool:last?.tool,last_status:last?.state?.status})+'\n');
 if(messages.length>before.length&&!statuses[original.session]){save('messages',messages);save('children',await req('GET',`/session/${original.session}/children`));save('result',{utc:new Date().toISOString(),exit_code:0,work:origin.work,session:original.session});finished=true;break;}}
 if(!finished)throw Error('AUDIT_OBSERVATION_WINDOW_EXPIRED');
 }catch(e){save('failure',{utc:new Date().toISOString(),error:String(e),cause:String(e.cause)});try{save('failure-messages',await req('GET',`/session/${original.session}/message`));await req('POST',`/session/${original.session}/abort`)}catch{}process.exitCode=1;
 }finally{child.kill();log.end();}})();
