// Genuine OpenCode Kernel + finite local model transport fixture. No real-provider inference claim.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const label=process.argv[2],requestedMode=process.argv[3]||'positive',proxyEnabled=requestedMode==='crash-proxy',mode=proxyEnabled?'crash':requestedMode;
const priorTrialId=process.argv[4]||'fbe1e32e-e7ef-44e9-82c9-412832bafcab';
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(priorTrialId))throw Error('PRIOR_TRIAL_ID');
if(!/^\d{2}$/.test(label||'')||!['probe','positive','matrix','crash','formal','consumers','state','abort','routing'].includes(mode))throw Error('ARGUMENTS');
const info=JSON.parse(fs.readFileSync(path.join(__dirname,`public-kernel-fixture-${label}.json`),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),pause=ms=>new Promise(r=>{setTimeout(r,ms).unref()});
assert.equal(sha(fs.readFileSync(path.join(info.fixture,'reservation.json'))),info.reservation_sha256);
const trial=path.join(info.fixture,'trials',crypto.randomUUID());fs.mkdirSync(trial,{recursive:true});
const save=(name,value)=>fs.writeFileSync(path.join(trial,name+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const driverSource=fs.readFileSync(__filename);fs.writeFileSync(path.join(trial,'driver-source.cjs'),driverSource,{flag:'wx'});save('driver-source-identity',{utc:new Date().toISOString(),source:__filename,sha256:sha(driverSource),bytes:driverSource.length,argv:process.argv.slice(2)});
const env={};for(const key of ['PATH','SystemRoot','WINDIR','USERPROFILE','LOCALAPPDATA','APPDATA','SYSTEMDRIVE','PATHEXT','ProgramFiles'])if(process.env[key]!==undefined)env[key]=process.env[key];
Object.assign(env,{OPENCODE_CONFIG_DIR:info.config,HOME:path.join(info.fixture,'home'),TEMP:path.join(info.fixture,'temp'),TMP:path.join(info.fixture,'temp'),XDG_CONFIG_HOME:path.join(info.fixture,'xdg-config'),XDG_DATA_HOME:path.join(info.fixture,'data'),XDG_CACHE_HOME:path.join(info.fixture,'cache'),XDG_STATE_HOME:path.join(info.fixture,'state'),OPENCODE_DISABLE_DEFAULT_PLUGINS:'true',OPENCODE_DISABLE_AUTOUPDATE:'true'});
const children=[],logs=[],records=[];let base,handshake,providerCounter=0,failed,runtimeProxy,actualSdkBefore;
function sdkSnapshot(){const files=['node_modules/@opencode-ai/plugin/package.json','node_modules/@opencode-ai/plugin/dist/index.js','node_modules/@opencode-ai/plugin/dist/tool.js','node_modules/zod/package.json'];return {utc:new Date().toISOString(),initial_copied_sdk_version:info.tool_sdk_version,actual_sdk_version:JSON.parse(fs.readFileSync(path.join(info.config,files[0]),'utf8')).version,files:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(info.config,f)))]))};}
function launch(name,file,args,extra={}){
 const child=cp.spawn(file,args,{cwd:info.project,env:{...env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});
 const log=fs.createWriteStream(path.join(trial,name+'.log'),{flags:'wx'});logs.push(log);let text='';
 for(const pipe of [child.stdout,child.stderr])pipe.on('data',b=>{text+=b;log.write(b)});
 const exit=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal,utc:new Date().toISOString()})));
 child.on('error',e=>{log.write(String(e));});const owned={name,child,exit,output:()=>text};children.push(owned);return owned;
}
async function request(method,url,body,timeout=180000,headers={}){
 const response=await fetch(url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});
 const text=await response.text();assert.ok(response.ok,`${method} ${url} HTTP${response.status} ${text.slice(0,900)}`);return text?JSON.parse(text):null;
}
function textContent(content){if(typeof content==='string')return content;return Array.isArray(content)?content.map(v=>v.text||'').join('\n'):'';}
const provider=http.createServer(async(req,res)=>{
 try{
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2*1024*1024)throw Error('TRANSPORT_REQUEST_BUDGET');}
  const body=JSON.parse(raw),n=++providerCounter;save('provider-request-'+n,{utc:new Date().toISOString(),url:req.url,body});
  const messages=body.messages;assert.ok(Array.isArray(messages));let user=-1,payload;
  for(let i=messages.length-1;i>=0;i--){const match=textContent(messages[i].content).match(/SF_FIXTURE_REQUEST:([A-Za-z0-9+/=]+)/);if(messages[i].role==='user'&&match){user=i;payload=JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));break;}}
  assert.ok(payload&&typeof payload.tool==='string');
  const done=messages.slice(user+1).some(m=>m.role==='tool');
  assert.ok(done||(body.tools||[]).some(t=>t.function?.name===payload.tool),'REQUESTED_TOOL_NOT_EXPOSED');
  const id='chatcmpl-'+crypto.randomUUID(),created=Math.floor(Date.now()/1000),model='finite-model';
  const delta=done?{role:'assistant',content:'SF_FIXTURE_TOOL_COMPLETE'}:{role:'assistant',tool_calls:[{index:0,id:'call_'+crypto.randomUUID().replace(/-/g,''),type:'function',function:{name:payload.tool,arguments:JSON.stringify(payload.args)}}]};
  if(body.stream){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
   for(const value of [{id,object:'chat.completion.chunk',created,model,choices:[{index:0,delta,finish_reason:null}]},{id,object:'chat.completion.chunk',created,model,choices:[{index:0,delta:{},finish_reason:done?'stop':'tool_calls'}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}}])res.write('data: '+JSON.stringify(value)+'\n\n');res.end('data: [DONE]\n\n');
  }else{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id,object:'chat.completion',created,model,choices:[{index:0,message:delta,finish_reason:done?'stop':'tool_calls'}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}}));}
 }catch(e){save('provider-error-'+(++providerCounter),{error:String(e)});res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:String(e)}}));}
});
async function invoke(name,agent,tool,args){
 const session=await request('POST',base+'/session?directory='+encodeURIComponent(info.project),{title:'D23 owned '+name});
 const marker=Buffer.from(JSON.stringify({tool,args})).toString('base64');
 save(name+'-request',{utc:new Date().toISOString(),session:session.id,agent,tool,args});
 const result=await request('POST',base+`/session/${session.id}/message?directory=`+encodeURIComponent(info.project),{agent,model:{providerID:'sf-fixture',modelID:'finite-model'},parts:[{type:'text',text:'Execute the single requested tool once, then stop. SF_FIXTURE_REQUEST:'+marker}]});
 const messages=await request('GET',base+`/session/${session.id}/message?directory=`+encodeURIComponent(info.project));save(name+'-messages',messages);save(name+'-response',result);
 const matches=messages.flatMap(m=>(m.parts||[]).filter(p=>p.type==='tool'&&p.tool===tool).map(p=>({info:m.info,part:p})));
 assert.equal(matches.length,1,'ONE_REAL_TOOL_PART_REQUIRED');const actual=matches[0];assert.equal(actual.info.agent,agent);assert.equal(actual.part.state.status,'completed',JSON.stringify(actual.part.state));
 const value=JSON.parse(actual.part.state.output);records.push({name,session:session.id,message:actual.info.id,call:actual.part.callID,agent,tool,value});console.log(JSON.stringify({name,value}));return value;
}
async function main(){
 try{
  if(mode==='state'){
   const source=path.resolve('setup/userlevel-opencode/tools/sf_safe_bash.ts'),target=path.join(info.config,'tools/sf_safe_bash.ts'),bytes=fs.readFileSync(source),reused=fs.existsSync(target);
   if(reused){const prior=JSON.parse(fs.readFileSync(path.join(info.fixture,'trials/8bb24d06-47ea-46b1-90bc-c3c7b4096a32/readonly-tool-source.json'),'utf8'));assert.equal(prior.target,target);assert.equal(prior.sha256,sha(bytes));assert.equal(sha(fs.readFileSync(target)),prior.sha256);}else fs.writeFileSync(target,bytes,{flag:'wx'});
   save('readonly-tool-source',{source,target,sha256:sha(bytes),reused_exact_prior_owned_copy:reused});
  }
  if(mode==='consumers'){
   const file='sf_changed_files_audit.ts',source=path.resolve('setup/userlevel-opencode/tools',file),target=path.join(info.config,'tools',file),bytes=fs.readFileSync(source);
   const reused=fs.existsSync(target);
   const installerOwned=info.installation==='ACTUAL_INSTALLER_ALL_MANAGED_FILES'&&info.build_identities['tools/'+file]===sha(bytes);
   if(reused){
    if(installerOwned)assert.equal(sha(fs.readFileSync(path.join(info.fixture,'installed-byte-proof.json'))),info.install_proof_sha256,'INSTALL_PROOF_DRIFT');
    else {const witnesses=fs.readdirSync(path.join(info.fixture,'trials')).map(n=>path.join(info.fixture,'trials',n,'additional-official-tool.json')).filter(f=>fs.existsSync(f)).map(f=>JSON.parse(fs.readFileSync(f,'utf8'))).filter(p=>p.target===target&&p.sha256===sha(bytes));assert.ok(witnesses.length>0,'PRIOR_COPY_WITNESS_REQUIRED');}
    assert.equal(sha(fs.readFileSync(target)),sha(bytes));
   }else {assert.equal(installerOwned,false,'MANAGED_TOOL_MISSING');fs.writeFileSync(target,bytes,{flag:'wx'});}
   save('additional-official-tool',{source,sha256:sha(bytes),target,reused_exact_prior_owned_copy:reused,existing_installer_owned_copy:installerOwned,reason:'Actual installer proof or prior owned copy witness; actual audit owner creates an intentional fixture-precondition HardStop; no fabricated latch'});
  }
  await new Promise(r=>provider.listen(0,'127.0.0.1',r));const providerURL='http://127.0.0.1:'+provider.address().port+'/v1';
  const tools=Object.fromEntries(['sf_verification_plan','sf_verification_run',...(['formal','consumers','routing'].includes(mode)?['sf_artifact_write','sf_gate_run','sf_semantic_closure_run']:[]),...(mode==='consumers'?['sf_changed_files_audit']:[]),...(mode==='state'?['sf_safe_bash']:[])].map(name=>[name,true]));
  const configuration={autoupdate:false,enabled_providers:['sf-fixture'],model:'sf-fixture/finite-model',small_model:'sf-fixture/finite-model',provider:{'sf-fixture':{npm:'@ai-sdk/openai-compatible',name:'Finite local transport fixture',options:{baseURL:providerURL,apiKey:'fixture-no-secret'},models:{'finite-model':{name:'Finite local transport fixture',tool_call:true,limit:{context:131072,output:4096}}}}},permission:{'*':'deny',...Object.fromEntries(Object.keys(tools).map(name=>[name,'allow']))},agent:Object.fromEntries(['sf-orchestrator','sf-verifier'].map(name=>[name,{mode:'primary',prompt:'You are a finite product integration fixture. Execute only the exact single requested SpecForge tool. No other work.',tools:{'*':false,...tools}}]))};
  // Installed acceptance loads the real deployed professional Agent files unchanged.
  // Only provider/finite-tool permissions belong to the transport fixture.
  if(info.installation==='ACTUAL_INSTALLER_ALL_MANAGED_FILES')delete configuration.agent;
  fs.writeFileSync(path.join(info.config,'opencode.json'),JSON.stringify(configuration,null,2)+'\n');
  const executable='C:\\Users\\lyq\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe';assert.equal(sha(fs.readFileSync(executable)),'83567c13cc5e361ded7e48351cb024cd4503285960d82c30fc585194da46d757');
  const kernel=launch('kernel',executable,['serve','--hostname','127.0.0.1','--port','0']);
  for(let n=0;n<600;n++){base=kernel.output().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(base)break;assert.equal(kernel.child.exitCode,null,'KERNEL_EARLY_EXIT '+kernel.output().slice(-1200));await pause(100);}assert.ok(base,'KERNEL_START_TIMEOUT');
  save('kernel-health',await request('GET',base+'/global/health'));
  save('kernel-agent-list-request',{utc:new Date().toISOString(),base,directory:info.project,timeout_ms:180000});
  const agents=await request('GET',base+'/agent?directory='+encodeURIComponent(info.project));save('actual-agents',agents);for(const name of ['sf-orchestrator','sf-verifier'])assert.ok(agents.some(a=>a.name===name));
  actualSdkBefore=sdkSnapshot();save('actual-sdk-before',actualSdkBefore);
  if(info.installation==='ACTUAL_INSTALLER_ALL_MANAGED_FILES'){
   const orchestrator=agents.find(a=>a.name==='sf-orchestrator'),verifier=agents.find(a=>a.name==='sf-verifier');
   assert.equal(orchestrator.mode,'primary');assert.equal(verifier.mode,'subagent');
   assert.ok(orchestrator.prompt.includes('sf_verification_plan'));assert.ok(verifier.prompt.includes('sf_verification_run'));
   save('actual-installed-agent-proof',{utc:new Date().toISOString(),professional_agents_unoverridden:true,orchestrator_prompt_sha256:sha(orchestrator.prompt),verifier_prompt_sha256:sha(verifier.prompt),managed_file_hashes:info.build_identities});
  }
  const daemonPath=path.join(info.config,'sf-user/bin/specforged.exe');assert.equal(sha(fs.readFileSync(daemonPath)),info.build_identities['sf-user/bin/specforged.exe']);
  let runtimeURL=base;
  if(proxyEnabled){
   let sequence=0;
   runtimeProxy=http.createServer((req,res)=>{
    const id=++sequence,started=Date.now();assert.ok(req.url.startsWith('/')&&!req.url.startsWith('//'));
    const upstream=http.request(base+req.url,{method:req.method,headers:{...req.headers,host:new URL(base).host}},response=>{
     fs.appendFileSync(path.join(trial,'runtime-transport.jsonl'),JSON.stringify({utc:new Date().toISOString(),id,method:req.method,path:req.url,status:response.statusCode,headers_ms:Date.now()-started})+'\n');
     res.writeHead(response.statusCode,response.headers);response.pipe(res);
    });
    upstream.on('error',error=>{fs.appendFileSync(path.join(trial,'runtime-transport.jsonl'),JSON.stringify({utc:new Date().toISOString(),id,error_name:error.name,error_code:error.code||null})+'\n');if(!res.headersSent)res.writeHead(502);res.end();});
    req.pipe(upstream);req.on('aborted',()=>upstream.destroy());res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});
   });
   await new Promise(r=>runtimeProxy.listen(0,'127.0.0.1',r));runtimeURL='http://127.0.0.1:'+runtimeProxy.address().port;
   save('runtime-transport-proxy',{utc:new Date().toISOString(),listen:runtimeURL,upstream:base,actual_kernel_unmodified:true,scope:'Transparent loopback transport diagnosis; never generates Runtime records or credentials'});
  }
  const daemon=launch('daemon',daemonPath,['start','--foreground'],{OPENCODE_SERVER_URL:runtimeURL});
  const hsFile=path.join(info.config,'sf-user/runtime/handshake.json');
  for(let n=0;n<600;n++){try{handshake=JSON.parse(fs.readFileSync(hsFile,'utf8'));if(handshake.pid===daemon.child.pid)break;}catch{}assert.equal(daemon.child.exitCode,null,'DAEMON_EARLY_EXIT '+daemon.output().slice(-1600));await pause(100);}assert.equal(handshake?.pid,daemon.child.pid,'DAEMON_HANDSHAKE_REQUIRED');
  save('identity',{utc:new Date().toISOString(),trial,fixture:info.fixture,kernel:{pid:kernel.child.pid,base,executable,sha256:sha(fs.readFileSync(executable))},daemon:{pid:daemon.child.pid,path:daemonPath,sha256:sha(fs.readFileSync(daemonPath)),port:handshake.port},scope:'REAL_KERNEL_PUBLIC_TOOLS_AND_NATIVE;FINITE_MODEL_TRANSPORT;SEEDED_UPSTREAM_BASELINE',original_business_touched:false});
  save('daemon-health',await request('GET',`http://127.0.0.1:${handshake.port}/health`));
  if(mode==='probe')return;
  if(mode==='state'){
   const owner=path.join(info.config,'sf-user/runtime/verification-owner');assert.equal(fs.existsSync(owner),false);
   const result=await invoke('actual-implementation-done-state-rejected','sf-orchestrator','sf_verification_plan',{action:'create',work_item_id:'WI-9901',task_id:'TASK-WI-9901-001',verification_type:'unit',command_index:0});assert.equal(result.success,false);assert.equal(result.error,'VERIFICATION_AUTHORITATIVE_STATE_REQUIRED');assert.equal(fs.existsSync(owner),false);
   const readonly=await invoke('safe-bash-remains-readonly','sf-verifier','sf_safe_bash',{command:'node --test tests/positive.test.cjs'});assert.equal(readonly.success,false);assert.equal(readonly.policy_violation,true);assert.equal(readonly.retry_allowed,false);assert.match(readonly.error,/SHELL_EXECUTION_UNAVAILABLE/);assert.equal(fs.existsSync(owner),false);return;
  }
  if(mode==='abort'){
   const owner=path.join(info.config,'sf-user/runtime/verification-owner');
   const readReceipt=attempt=>{try{for(const f of fs.readdirSync(path.join(owner,'receipt'))){const env=JSON.parse(fs.readFileSync(path.join(owner,'receipt',f),'utf8'));if(env.payload?.attemptId===attempt)return {id:f.slice(0,-5),payload:env.payload};}}catch{}return null;};
   for(const kind of ['http-abort','graceful-active-stop']){
    const plan=await invoke(kind+'-plan','sf-orchestrator','sf_verification_plan',{action:'create',work_item_id:'WI-9901',task_id:'TASK-WI-9901-003',verification_type:'unit',command_index:0});assert.equal(plan.success,true);
    const attempt=await invoke(kind+'-prepare','sf-verifier','sf_verification_run',{action:'prepare',work_item_id:'WI-9901',plan_id:plan.plan_id});assert.equal(attempt.success,true);
    const running=invoke(kind+'-run','sf-verifier','sf_verification_run',{action:'run',work_item_id:'WI-9901',attempt_record_id:attempt.attempt_record_id}).then(value=>({value}),error=>({error:String(error)}));
    const events=path.join(owner,'runs',attempt.attempt_id,'events.jsonl');let resumed=false;for(let n=0;n<600;n++){try{resumed=fs.readFileSync(events,'utf8').split('\n').filter(Boolean).map(v=>JSON.parse(v)).some(e=>e.name==='process_resumed');}catch{}if(resumed)break;await pause(100);}assert.equal(resumed,true);
    if(kind==='http-abort'){
     const requestInfo=JSON.parse(fs.readFileSync(path.join(trial,kind+'-run-request.json'),'utf8'));save('actual-kernel-session-abort',await request('POST',base+`/session/${requestInfo.session}/abort?directory=`+encodeURIComponent(info.project)));
    }else{
     save('actual-admin-stop-with-active-verification',await request('POST',`http://127.0.0.1:${handshake.port}/api/v1/admin/stop`,{},20000,{Authorization:'Bearer '+handshake.token}));
    }
    const result=await running;save(kind+'-tool-lifetime',result);assert.notEqual(result.value?.success,true);
    let receipt=null;for(let n=0;n<400;n++){receipt=readReceipt(attempt.attempt_id);if(receipt)break;await pause(100);}assert.ok(receipt,'IMMUTABLE_INTERRUPTION_RECEIPT_REQUIRED');assert.equal(receipt.payload.outcome,'cancelled');assert.equal(receipt.payload.cleanupProved,true);assert.equal(receipt.payload.processResumed,true);assert.equal(receipt.payload.exitCode,130);save(kind+'-private-receipt-observation',receipt);
    if(kind==='graceful-active-stop'){const ended=await Promise.race([daemon.exit,pause(30000).then(()=>{throw Error('ACTIVE_STOP_TIMEOUT')})]);assert.equal(ended.code,0);assert.equal(fs.existsSync(hsFile),false);save('active-stop-completed',{utc:new Date().toISOString(),daemon_exit:ended,handshake_absent:true,receipt_id:receipt.id,receipt_sha256:sha(fs.readFileSync(path.join(owner,'receipt',receipt.id+'.json')))});}
   }
   return;
  }
  if(mode==='consumers'){
   const prior=path.join(info.fixture,'trials',priorTrialId);const qualification=JSON.parse(fs.readFileSync(path.join(prior,'result.json'),'utf8'));assert.equal(qualification.exit_code,0);assert.equal(qualification.failure,null);
   const report=JSON.parse(JSON.parse(fs.readFileSync(path.join(prior,'formal-report-request.json'),'utf8')).args.content),manifest=JSON.parse(JSON.parse(fs.readFileSync(path.join(prior,'formal-manifest-request.json'),'utf8')).args.content);
   const revoked=report.verification_commands[0].execution_receipt_id;report.verification_commands=report.verification_commands.filter(e=>e.execution_receipt_id!==revoked);manifest.entries=manifest.entries.filter(e=>e.execution_receipt_id!==revoked);
   const artifact=async(name,type,value,extra={})=>invoke(name,'sf-verifier','sf_artifact_write',{work_item_id:'WI-9901',file_type:type,content:JSON.stringify(value),...extra});
   assert.equal((await artifact('remaining-authentic-manifest','evidence_manifest',manifest)).success,true);assert.equal((await artifact('remaining-authentic-report','verification_report',report,{template:'verification_report'})).success,true);
   async function gates(name,expected){
    const outputs=[];
    for(const alias of ['verification','close']){
     const value=await invoke(name+'-'+alias,'sf-orchestrator','sf_gate_run',{work_item_id:'WI-9901',gate_type:alias});outputs.push(value);
    }
    for(const [gate,id]of [['verification_gate','verification_evidence_source_and_time_integrity'],['formal_version_gate','formal_execution_evidence_integrity'],['close_gate','close_verification_evidence_source_and_time_integrity']]){
     const value=JSON.parse(fs.readFileSync(path.join(info.project,'.specforge/work-items/WI-9901/gates',gate+'.json'),'utf8'));save(name+'-'+gate,value);const check=value.checks.find(c=>c.check_id===id);assert.ok(check,'COMMON_CHECK_NOT_REACHED:'+gate);assert.equal(check.passed,expected,gate+' '+JSON.stringify(check));
     records.push({gate,check:id,passed:check.passed,gate_overall_status:value.status,scope:'Actual common-consumer projection only; seeded upstream audit/closure remain incomplete'});
    }
   }
   await gates('authentic-common-consumers',true);
   const id=report.verification_commands[0].execution_receipt_id,file=path.join(info.config,'sf-user/runtime/verification-owner/receipt',id+'.json'),raw=fs.readFileSync(file);
   try{const altered=JSON.parse(raw);altered.untrusted_override='passed';fs.writeFileSync(file,JSON.stringify(altered));await gates('tampered-common-consumers',false);}finally{fs.writeFileSync(file,raw);assert.equal(sha(fs.readFileSync(file)),sha(raw));}
   await gates('restored-common-consumers',true);
   const plan=await invoke('pre-hard-stop-plan','sf-orchestrator','sf_verification_plan',{action:'create',work_item_id:'WI-9901',task_id:'TASK-WI-9901-003',verification_type:'unit',command_index:0});assert.equal(plan.success,true);
   const pending=await invoke('pre-hard-stop-prepare','sf-verifier','sf_verification_run',{action:'prepare',work_item_id:'WI-9901',plan_id:plan.plan_id});assert.equal(pending.success,true);
   const audit=await invoke('actual-audit-owner-hard-stop','sf-orchestrator','sf_changed_files_audit',{work_item_id:'WI-9901'});assert.equal(audit.success,false);assert.equal(audit.hard_stop,true);assert.match(audit.error,/ALLOWED_WRITE_FILES_EMPTY/);
   const denied=await invoke('hard-stop-plan-create-denied','sf-orchestrator','sf_verification_plan',{action:'create',work_item_id:'WI-9901',task_id:'TASK-WI-9901-001',verification_type:'unit',command_index:0});assert.equal(denied.success,false);assert.equal(denied.hard_stop,true);
   const deniedRun=await invoke('hard-stop-prepare-denied','sf-verifier','sf_verification_run',{action:'prepare',work_item_id:'WI-9901',plan_id:plan.plan_id});assert.equal(deniedRun.success,false);assert.equal(deniedRun.hard_stop,true);
   const cancel=await invoke('hard-stop-owned-cancel-allowed','sf-verifier','sf_verification_run',{action:'cancel',work_item_id:'WI-9901',attempt_record_id:pending.attempt_record_id});assert.equal(cancel.cancellation_requested,true);
   const recover=await invoke('hard-stop-owned-recovery-allowed','sf-verifier','sf_verification_run',{action:'recover',work_item_id:'WI-9901',attempt_record_id:pending.attempt_record_id});assert.equal(recover.cleanup_proved,true);assert.equal(recover.application_passed,false);
   save('consumer-scope',{actual_common_projections:['Report','Evidence','Verification Gate','Formal Version Gate','Close Gate'],positive_and_tamper_rejection:true,full_business_workflow_accepted:false,fixture_hard_stop:'ALLOWED_WRITE_FILES_EMPTY retained intentionally; no original or user installation affected',prepared_application_never_started:true});return;
  }
  if(mode==='routing'){
   const wi='WI-9901',manifestFile=path.join(info.project,'.specforge/work-items',wi,'evidence/evidence_manifest.json');
   const manifest={schema_version:'1.0',work_item_id:wi,entries:Array.from({length:22},(_,i)=>({evidence_id:'EV-ROUTING-'+i,type:'command_output',path:'evidence/source/blocked-'+i+'.txt',description:'Blocked synthetic entry for destination preservation, not an execution pass',created_at:new Date().toISOString(),status:'blocked'}))};
   const initial=await invoke('routing-canonical-manifest','sf-verifier','sf_artifact_write',{work_item_id:wi,file_type:'evidence_manifest',content:JSON.stringify(manifest)});assert.equal(initial.success,true);const before=fs.readFileSync(manifestFile);assert.equal(JSON.parse(before).entries.length,22);
   const runId='verifier-wi0001-manifest-align',content=JSON.stringify({run_id:runId,work_item_id:wi,agent:'sf-verifier',action:'evidence_manifest_supports_alignment',details:'Execution log about an Evidence Manifest'});
   const logged=await invoke('routing-original-work-log-shape','sf-verifier','sf_artifact_write',{work_item_id:wi,file_type:'work_log',run_id:runId,content,agent_content:'Observed evidence_manifest alignment; this is an execution log, not a replacement manifest.'});
   assert.equal(logged.success,true);assert.equal(logged.path,'.specforge/archive/agent_runs/'+runId+'/work_log.md');assert.equal(sha(fs.readFileSync(manifestFile)),sha(before));assert.ok(fs.existsSync(path.join(info.project,logged.path)));
   for(const topic of ['trigger-result','candidate-manifest','trace-delta','impact-analysis','change-classification','task-plan','merge-report','evidence-manifest']){
    const result=await invoke('routing-topic-'+topic,'sf-verifier','sf_artifact_write',{work_item_id:wi,file_type:'work_log',run_id:topic,content:'Review log for '+topic});assert.equal(result.success,true);assert.equal(result.path,'.specforge/archive/agent_runs/'+topic+'/work_log.md');assert.equal(sha(fs.readFileSync(manifestFile)),sha(before));
   }
   const refused=await invoke('routing-missing-array-refused','sf-verifier','sf_artifact_write',{work_item_id:wi,file_type:'evidence_manifest',content:JSON.stringify({schema_version:'1.0',work_item_id:wi,action:'evidence_manifest_supports_alignment'})});assert.equal(refused.success,false);assert.equal(refused.error,'INVALID_ARTIFACT_JSON');assert.equal(sha(fs.readFileSync(manifestFile)),sha(before));
   save('routing-destination-proof',{utc:new Date().toISOString(),canonical_manifest_sha256:sha(before),retained_entries:22,actual_original_work_log_shape_preserved:true,all8_topics_stay_in_archive:true,missing_array_refused_before_write:true,formal_execution_claimed:false,original_business_touched:false});return;
  }
  if(mode==='formal'){
   const executions=[];
   async function executeTask(number,type='unit',expected=true){
    const plan=await invoke('formal-'+number+'-plan','sf-orchestrator','sf_verification_plan',{action:'create',work_item_id:'WI-9901',task_id:'TASK-WI-9901-'+number,verification_type:type,command_index:0});assert.equal(plan.success,true);assert.equal(plan.purpose,'formal');
    const attempt=await invoke('formal-'+number+'-prepare','sf-verifier','sf_verification_run',{action:'prepare',work_item_id:'WI-9901',plan_id:plan.plan_id});assert.equal(attempt.success,true);
    const result=await invoke('formal-'+number+'-run','sf-verifier','sf_verification_run',{action:'run',work_item_id:'WI-9901',attempt_record_id:attempt.attempt_record_id});assert.equal(result.success,expected);
    if(expected){assert.equal(result.exit_code,0);assert.equal(result.cleanup_proved,true);}else{assert.notEqual(result.outcome,'passed');assert.equal(result.cleanup_proved,true);}
    const reference={execution_receipt_id:result.receipt_id,task_id:'TASK-WI-9901-'+number,verification_type:type,command_index:0,command:plan.original_command};
    executions.push({number,type,plan,attempt,result,reference});return executions.at(-1);
   }
   for(const [number,type]of [['001','unit'],['002','e2e'],['004','unit'],['005','unit'],['006','unit'],['007','integration'],['008','unit'],['009','e2e']])await executeTask(number,type);
   const fail=await executeTask('010','unit',false);assert.notEqual(fail.result.exit_code,0);
   const unsupported=await invoke('unsupported-native-dependency','sf-orchestrator','sf_verification_plan',{action:'create',work_item_id:'WI-9901',task_id:'TASK-WI-9901-011',verification_type:'unit',command_index:0});assert.equal(unsupported.success,false);
   await executeTask('012','unit',false);await executeTask('013','unit',false);
   const positive=executions.filter(e=>e.result.success),e2e=positive.find(e=>e.number==='002'),e2eId='EV-NATIVE-002';
   const entries=positive.map(e=>({...e.reference,evidence_id:'EV-NATIVE-'+e.number,type:e.type==='e2e'?'behavioral_e2e':e.type==='integration'?'integration_test':'unit_test',evidence_type:e.type==='e2e'?'behavioral_e2e':e.type==='integration'?'integration_test':'unit_test',level:e.type==='e2e'?'L5':e.type==='integration'?'L2':'L1',status:'passed',path:'verification-owner:receipt:'+e.result.receipt_id,hash:'sha256:'+e.result.receipt_id,hash_domain:'canonical-json:verification-execution/v1',supports:['OUT-DEMO-001','REQ-DEMO-001','DD-DEMO-001',e.reference.task_id]}));
   const manifest={schema_version:'1.0',work_item_id:'WI-9901',entries};
   const closure={schema_version:'1.0',work_item_id:'WI-9901',outcomes:[{id:'OUT-DEMO-001',requirement_refs:['REQ-DEMO-001'],required_evidence_refs:[e2eId]}],requirements:[{id:'REQ-DEMO-001',type:'MUST',outcome_refs:['OUT-DEMO-001'],design_refs:['DD-DEMO-001'],task_refs:[e2e.reference.task_id],required_evidence_refs:[e2eId]}],design_decisions:[{id:'DD-DEMO-001',requirement_refs:['REQ-DEMO-001'],task_refs:[e2e.reference.task_id]}],tasks:[{id:e2e.reference.task_id,requirement_refs:['REQ-DEMO-001'],design_refs:['DD-DEMO-001'],evidence_refs:[e2eId]}],evidence:[{id:e2eId,status:'passed',level:'L5',evidence_type:'behavioral_e2e',supports:['OUT-DEMO-001','REQ-DEMO-001','DD-DEMO-001',e2e.reference.task_id]}],project_integration:{status:'not_applicable'}};
   const report={conclusion:'pass',test_matrix:{L1_unit:'pass',L2_integration:'pass',L3_pbt:'not_applicable',L4_e2e:'pass',L5_smoke:'pass',L6_regression:'not_applicable',L7_performance:'not_applicable',L8_security:'not_applicable',L9_compatibility:'not_applicable',L10_uat:'not_applicable'},verification_commands:positive.map(e=>({...e.reference,status:'pass',output_summary:'Actual isolated Node exit0 and independent cleanup; normalization '+(e.plan.original_command.startsWith('node')?'single-file-no-host-observation/v1':'finite-posix-readonly-predicate/v1')})),acceptance_criteria:[{req_id:'REQ-DEMO-001',name:'Owned library consumer returns hi Ada',status:'pass',evidence:e2eId}],e2e_tests:[{name:'Actual isolated library public consumer',status:'pass',evidence:e2eId}],side_effects:'Readonly inputs and independent native cleanup verified',summary:'Producer/common-consumer integration fixture only; seeded upstream baseline and fault-injection Tasks are not a completed business workflow',semantic_closure:closure};
   const artifact=async(name,file_type,content,extra={})=>invoke(name,'sf-verifier','sf_artifact_write',{work_item_id:'WI-9901',file_type,content:JSON.stringify(content),...extra});
   assert.equal((await artifact('formal-manifest','evidence_manifest',manifest)).success,true);
   assert.equal((await artifact('formal-report','verification_report',report,{template:'verification_report'})).success,true);
   const call=async(tool,args)=>{const value=await request('POST',`http://127.0.0.1:${handshake.port}/api/v1/tool/invoke`,{tool,args,context:{directory:info.project,agent:'sf-verifier'}},30000,{Authorization:'Bearer '+handshake.token});return value.data??value;};
   const validate=async(name,value=report)=>{const result=await call('sf_verification',{action:'validate_verification_report',work_item_id:'WI-9901',content:'```json\n'+JSON.stringify(value)+'\n```'});save(name,result);return result;};
   assert.equal((await validate('shared-formal-positive')).valid,true);
   const wrong=structuredClone(report);wrong.verification_commands[0].task_id='TASK-WI-9901-002';assert.equal((await validate('shared-copied-subject-denied',wrong)).valid,false);
   const reportFile=path.join(info.project,'.specforge/work-items/WI-9901/verification_report.md'),beforeReport=sha(fs.readFileSync(reportFile));
   const rejected=await artifact('copied-report-write-denied','verification_report',wrong,{template:'verification_report'});assert.equal(rejected.success,false);assert.equal(sha(fs.readFileSync(reportFile)),beforeReport);
   const receiptFile=path.join(info.config,'sf-user/runtime/verification-owner/receipt',positive[0].result.receipt_id+'.json'),raw=fs.readFileSync(receiptFile);
   try{const data=JSON.parse(raw);data.payload={forged:true};fs.writeFileSync(receiptFile,JSON.stringify(data));assert.equal((await validate('shared-tampered-receipt-denied')).valid,false);}finally{fs.writeFileSync(receiptFile,raw);assert.equal(sha(fs.readFileSync(receiptFile)),sha(raw));}
   assert.equal((await validate('shared-restored-authentic-receipt')).valid,true);
   const gate=await invoke('formal-gate-integration-projection','sf-orchestrator','sf_gate_run',{work_item_id:'WI-9901',gate_type:'verification_gate'});save('gate-upstream-fixture-limit',gate);
   const gateFile=path.join(info.project,'.specforge/work-items/WI-9901/gates/verification_gate.json');const gateReport=JSON.parse(fs.readFileSync(gateFile,'utf8'));save('actual-gate-report',gateReport);
   assert.equal(gateReport.checks.find(c=>c.check_id==='verification_evidence_source_and_time_integrity')?.passed,true,'ACTUAL_GATE_SHARED_EXECUTION_CHECK_REQUIRED');
   const revoked=await invoke('formal-revoke-used-plan','sf-orchestrator','sf_verification_plan',{action:'revoke',work_item_id:'WI-9901',plan_id:positive[0].plan.plan_id});assert.equal(revoked.success,true);
   const revokedReport=await validate('shared-revoked-receipt-denied');assert.equal(revokedReport.valid,false);
   save('formal-execution-scope',{upstream_baseline:'SEEDED_ONLY',complete_business_gate_acceptance:false,gate_status:gateReport.status,executed:executions.map(e=>({task:e.number,outcome:e.result.outcome,receipt_id:e.result.receipt_id})),report_and_manifest_actual_kernel:true,private_key_archived:false});return;
  }
  if(mode==='crash'){
   const build=JSON.parse(fs.readFileSync(path.join(__dirname,'commands/0085.result.json'),'utf8'));assert.equal(build.inner_exit_code,0);
   const witness=path.resolve('.tmp/verification-lpac-build/ProductCrashWitness.exe');save('crash-witness-build',{receipt:'0085',sha256:sha(fs.readFileSync(witness)),source_sha256:sha(fs.readFileSync(path.join(__dirname,'ProductCrashWitness.cs')))});
   for(const target of ['broker','daemon']){
    const plan=await invoke(target+'-crash-plan','sf-orchestrator','sf_verification_plan',{action:'create',work_item_id:'WI-9901',task_id:'TASK-WI-9901-003',verification_type:'unit',command_index:0});assert.equal(plan.success,true);
    const attempt=await invoke(target+'-crash-prepare','sf-verifier','sf_verification_run',{action:'prepare',work_item_id:'WI-9901',plan_id:plan.plan_id});assert.equal(attempt.success,true);
    const running=invoke(target+'-crash-run','sf-verifier','sf_verification_run',{action:'run',work_item_id:'WI-9901',attempt_record_id:attempt.attempt_record_id}).then(value=>({value}),error=>({error:String(error)}));
    const events=path.join(info.config,'sf-user/runtime/verification-owner/runs',attempt.attempt_id,'events.jsonl');let resumed=false;
    for(let n=0;n<600;n++){try{resumed=fs.readFileSync(events,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line)).some(e=>e.name==='process_resumed');}catch{}if(resumed)break;await pause(100);}assert.equal(resumed,true,'CRASH_REQUIRES_ACTUAL_RESUME');
    const installedWitness=info.installation==='ACTUAL_INSTALLER_ALL_MANAGED_FILES';
    const selectedWitness=installedWitness?path.resolve('.tmp/verification-lpac-build/InstalledProductCrashWitness.exe'):witness;
    if(installedWitness){const source=fs.readFileSync(path.join(__dirname,'InstalledProductCrashWitness.cs'));fs.writeFileSync(path.join(trial,'installed-crash-witness-source-'+target+'.cs'),source,{flag:'wx'});save('installed-crash-witness-identity-'+target,{source_sha256:sha(source),binary_sha256:sha(fs.readFileSync(selectedWitness)),install_proof_sha256:info.install_proof_sha256});}
    const killed=cp.spawnSync(selectedWitness,[info.fixture,attempt.attempt_id,target,...(installedWitness?[info.install_proof_sha256]:[])],{cwd:path.resolve('.'),windowsHide:true,env,encoding:'utf8',timeout:30000,maxBuffer:1048576});save(target+'-stable-crash',{status:killed.status,stdout:killed.stdout,stderr:killed.stderr,error:killed.error?.message});assert.equal(killed.status,0,killed.stderr);
    const interrupted=await running;save(target+'-interrupted',interrupted);assert.notEqual(interrupted.value?.success,true,'CRASH_MUST_NOT_PASS');
    if(target==='daemon'){
     const old=children.find(c=>c.name==='daemon');const ended=await old.exit;assert.equal(ended.code,199);
     const restarted=launch('daemon-restarted',daemonPath,['start','--foreground'],{OPENCODE_SERVER_URL:runtimeURL});handshake=undefined;
     for(let n=0;n<600;n++){try{const current=JSON.parse(fs.readFileSync(hsFile,'utf8'));if(current.pid===restarted.child.pid){handshake=current;break;}}catch{}assert.equal(restarted.child.exitCode,null,'RESTART_EARLY_EXIT '+restarted.output().slice(-1600));await pause(100);}assert.equal(handshake?.pid,restarted.child.pid);save('daemon-restarted-health',await request('GET',`http://127.0.0.1:${handshake.port}/health`));
    }
    const recovered=await invoke(target+'-crash-recover','sf-verifier','sf_verification_run',{action:'recover',work_item_id:'WI-9901',attempt_record_id:attempt.attempt_record_id});assert.equal(recovered.cleanup_proved,true);assert.equal(recovered.application_passed,false);
    const again=await invoke(target+'-crash-recover-again','sf-verifier','sf_verification_run',{action:'recover',work_item_id:'WI-9901',attempt_record_id:attempt.attempt_record_id});assert.equal(again.cleanup_proved,true);assert.equal(again.application_passed,false);
   }
   return;
  }
  const p=await invoke('positive-plan','sf-orchestrator','sf_verification_plan',{action:'create',work_item_id:'WI-9901',task_id:'TASK-WI-9901-001',verification_type:'unit',command_index:0});assert.equal(p.success,true);
  const attempt=await invoke('positive-prepare','sf-verifier','sf_verification_run',{action:'prepare',work_item_id:'WI-9901',plan_id:p.plan_id});assert.equal(attempt.success,true);
  const result=await invoke('positive-run','sf-verifier','sf_verification_run',{action:'run',work_item_id:'WI-9901',attempt_record_id:attempt.attempt_record_id});assert.equal(result.success,true);assert.equal(result.outcome,'passed');assert.equal(result.exit_code,0);
  if(mode!=='matrix')return;
  const plan=async(name,task,type='unit')=>{const value=await invoke(name,'sf-orchestrator','sf_verification_plan',{action:'create',work_item_id:'WI-9901',task_id:'TASK-WI-9901-'+task,verification_type:type,command_index:0});assert.equal(value.success,true);return value;};
  const prepare=async(name,p)=>{const value=await invoke(name,'sf-verifier','sf_verification_run',{action:'prepare',work_item_id:'WI-9901',plan_id:p.plan_id});assert.equal(value.success,true);return value;};
  const run=async(name,a)=>invoke(name,'sf-verifier','sf_verification_run',{action:'run',work_item_id:'WI-9901',attempt_record_id:a.attempt_record_id});
  const inline=await plan('inline-plan','002','e2e'),ia=await prepare('inline-prepare',inline),ir=await run('inline-run',ia);assert.equal(ir.success,true);assert.equal(ir.stdout.trim(),'SF_PRODUCT_INLINE_OK');
  const wrong=await invoke('wrong-real-agent','sf-orchestrator','sf_verification_run',{action:'prepare',work_item_id:'WI-9901',plan_id:p.plan_id});assert.equal(wrong.success,false);assert.match(wrong.error,/TOOL_INVOCATION_OWNER_NOT_PROVED/);
  const spoof=await request('POST',`http://127.0.0.1:${handshake.port}/api/v1/tool/invoke`,{tool:'sf_verification_run',args:{action:'prepare',work_item_id:'WI-9901',plan_id:p.plan_id},context:{directory:info.project,agent:'sf-verifier',sessionID:records[0].session,messageID:records[0].message}},20000,{Authorization:'Bearer '+handshake.token});save('self-declared-role-rejection',spoof);assert.ok(spoof.data?.success===false||spoof.success===false);
  const duplicate=await run('same-attempt-cannot-reexecute',attempt);assert.equal(duplicate.success,false);
  const revoked=await plan('revoked-plan','001');const rev=await invoke('revoke-plan','sf-orchestrator','sf_verification_plan',{action:'revoke',work_item_id:'WI-9901',plan_id:revoked.plan_id});assert.equal(rev.success,true);
  const denied=await invoke('revoked-plan-denied','sf-verifier','sf_verification_run',{action:'prepare',work_item_id:'WI-9901',plan_id:revoked.plan_id});assert.equal(denied.success,false);assert.equal(denied.error,'VERIFICATION_VERIFICATION_PERMISSION_REVOKED');
  const waiting=await plan('cancel-plan','003'),wa=await prepare('cancel-prepare',waiting);
  const running=run('cancel-target-run',wa);let resumed=false;
  const events=path.join(info.config,'sf-user/runtime/verification-owner/runs',wa.attempt_id,'events.jsonl');
  for(let n=0;n<600;n++){try{resumed=fs.readFileSync(events,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line)).some(e=>e.name==='process_resumed');}catch{}if(resumed)break;await pause(100);}assert.equal(resumed,true,'CANCEL_REQUIRES_ACTUAL_RESUME');
  const cancel=await invoke('cancel-after-resume','sf-verifier','sf_verification_run',{action:'cancel',work_item_id:'WI-9901',attempt_record_id:wa.attempt_record_id});assert.equal(cancel.cancellation_requested,true);
  const cancelled=await running;assert.equal(cancelled.success,false);assert.equal(cancelled.outcome,'cancelled');assert.equal(cancelled.cleanup_proved,true);
  const recover=await invoke('recover-cancelled','sf-verifier','sf_verification_run',{action:'recover',work_item_id:'WI-9901',attempt_record_id:wa.attempt_record_id});assert.equal(recover.cleanup_proved,true);assert.equal(recover.application_passed,false);
  const stale=await plan('source-drift-plan','001'),source=path.join(info.project,'src/library.cjs'),before=fs.readFileSync(source);fs.writeFileSync(source,Buffer.concat([before,Buffer.from('// owned drift test\n')]));
  try{const drift=await invoke('source-drift-denied','sf-verifier','sf_verification_run',{action:'prepare',work_item_id:'WI-9901',plan_id:stale.plan_id});assert.equal(drift.success,false);assert.equal(drift.error,'VERIFICATION_SOURCE_CHANGED');}finally{fs.writeFileSync(source,before);assert.equal(sha(fs.readFileSync(source)),sha(before));}
 }catch(e){failed=String(e?.stack||e);process.exitCode=1;}
 finally{
  const daemon=children.filter(v=>v.name.startsWith('daemon')).at(-1);
  if(daemon&&daemon.child.exitCode===null&&handshake){try{save('daemon-stop',await request('POST',`http://127.0.0.1:${handshake.port}/api/v1/admin/stop`,{},20000,{Authorization:'Bearer '+handshake.token}));await Promise.race([daemon.exit,pause(35000).then(()=>{throw Error('DAEMON_STOP_TIMEOUT')})]);}catch(e){records.push({shutdown_error:String(e)});process.exitCode=1;}}
  for(const owned of children){if(owned.child.exitCode===null&&owned.child.signalCode===null)owned.child.kill();records.push({child:owned.name,pid:owned.child.pid,exit:await Promise.race([owned.exit,pause(10000).then(()=>({unknown:true}))])});}
  if(actualSdkBefore){try{const after=sdkSnapshot();save('actual-sdk-after',after);assert.deepEqual(after.files,actualSdkBefore.files,'SDK_BYTES_CHANGED_DURING_TRIAL');}catch(e){failed=failed||String(e);process.exitCode=1;}}
  if(runtimeProxy){runtimeProxy.closeAllConnections();await new Promise(r=>runtimeProxy.close(r));}
  await new Promise(r=>provider.close(r));for(const log of logs)log.end();
  const output={utc:new Date().toISOString(),trial,records,failure:failed||null,exit_code:process.exitCode||0,original_business_touched:false};save('result',output);
  const evidence=path.join(__dirname,'public-kernel-trial-'+path.basename(trial)+'.json');fs.writeFileSync(evidence,JSON.stringify({trial,result_sha256:sha(fs.readFileSync(path.join(trial,'result.json'))),...output},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({trial,failure:failed||null,exit_code:process.exitCode||0}));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
