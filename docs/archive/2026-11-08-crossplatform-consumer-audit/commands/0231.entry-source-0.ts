/** Real host acceptance through official current release/installer/CLI owners. */
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {prepareCurrentRelease} from './lib/prepare-current-release';
import {createDaemonReadClient} from '../packages/daemon-core/examples/current-read-client';
const repository=process.cwd(),hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex'),fixture=await fs.mkdtemp(path.join(os.tmpdir(),'sf-platform-acceptance-'));
const report=process.env.SPECFORGE_PLATFORM_REPORT_DIR?path.resolve(process.env.SPECFORGE_PLATFORM_REPORT_DIR):path.join(fixture,'report');await fs.mkdir(report,{recursive:true});
const config=path.join(fixture,'opencode'),privateRoot=path.join(config,'sf-user'),suffix=process.platform==='win32'?'.exe':'',cli=path.join(privateRoot,'bin','specforge'+suffix),daemon=path.join(privateRoot,'bin','specforged'+suffix);
const safeKeys=['PATH','Path','SystemRoot','WINDIR','COMSPEC','PATHEXT','ProgramFiles','ProgramFiles(x86)','TEMP','TMP','TMPDIR','USERPROFILE','LOCALAPPDATA','APPDATA','HOME','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','LANG','LC_ALL'];
const environment:NodeJS.ProcessEnv=Object.fromEntries(safeKeys.filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));environment.OPENCODE_CONFIG_DIR=config;
let sequence=0;const commands:unknown[]=[],checks:Record<string,unknown>={};let activePid:number|undefined;
async function save(name:string,value:unknown){await fs.writeFile(path.join(report,name+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
async function run(name:string,executable:string,args:string[],accepted=[0],env:NodeJS.ProcessEnv=environment){
  const number=String(++sequence).padStart(3,'0'),started=new Date().toISOString(),result=spawnSync(executable,args,{cwd:repository,env,windowsHide:true,timeout:120000,maxBuffer:8*1024*1024});
  await fs.writeFile(path.join(report,number+'.stdout.raw'),result.stdout??Buffer.alloc(0),{flag:'wx'});await fs.writeFile(path.join(report,number+'.stderr.raw'),result.stderr??Buffer.alloc(0),{flag:'wx'});
  const value={number,name,executable,args,started_utc:started,finished_utc:new Date().toISOString(),inner_exit_code:result.status,signal:result.signal,spawn_error:result.error?{name:result.error.name,message:result.error.message}:null};commands.push(value);await save(number+'.command',value);assert.ok(Number.isInteger(result.status)&&accepted.includes(result.status!),JSON.stringify(value));return {stdout:(result.stdout??Buffer.alloc(0)).toString('utf8'),stderr:(result.stderr??Buffer.alloc(0)).toString('utf8'),code:result.status};
}
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function health(){const hs=JSON.parse(await fs.readFile(path.join(privateRoot,'runtime/handshake.json'),'utf8'));assert.ok(Number.isSafeInteger(hs.pid)&&hs.pid>0);const r=await fetch('http://127.0.0.1:'+hs.port+'/api/v1/healthz',{signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);const body=await r.json() as {status:string;pid:number;version:string};assert.equal(body.pid,hs.pid);assert.equal(body.status,'ok');return {body,handshake:hs};}
async function waitHealthy(){for(let i=0;i<100;i++){try{return await health();}catch{await pause(100);}}throw Error('ACTUAL_DAEMON_HEALTH_UNPROVED');}
async function ended(pid:number){for(let i=0;i<100;i++){try{process.kill(pid,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')return true;}await pause(100);}return false;}
let failure:unknown=null;
try{
  const git=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true});assert.equal(git.status,0);const candidate=git.stdout.trim(),version=JSON.parse(await fs.readFile('package.json','utf8')).version;
  await save('identity',{utc:new Date().toISOString(),platform:process.platform,architecture:process.arch,node:process.version,bun:Bun.version,bun_executable:process.execPath,candidate,version,fixture,config,qualification:'Actual host execution; platform mocks and skipped cases do not count as this evidence.'});
  const release=await prepareCurrentRelease({candidateRoot:repository,bunExecutable:process.execPath,nodeSource:process.env.SPECFORGE_VERIFICATION_NODE_SOURCE,buildWorkspace:false});await save('release-precheck',release.precheck);assert.equal(release.precheck.passed,true);
  await run('official-install',process.execPath,['scripts/sf-installer.ts','install']);await run('official-verify',process.execPath,['scripts/sf-installer.ts','verify']);
  const managed=JSON.parse(await fs.readFile(path.join(config,'specforge-manifest.json'),'utf8')),identities=[];
  for(const entry of release.document.installFiles){const actual=await fs.readFile(path.join(config,entry.targetPath));assert.equal(hash(actual),entry.sha256);identities.push({target:entry.targetPath,sha256:hash(actual),size:actual.length});}await save('installed-identities',identities);checks.installed_files=identities.length;
  const helpCases=[[],['daemon'],['daemon','start'],['daemon','status'],['daemon','restart'],['daemon','stop'],['services'],['opencode-server'],['doctor'],['config'],['version'],...['install','uninstall','start','stop','restart','status'].map(n=>['services',n]),...['install-service','uninstall-service','start','stop','restart','status'].map(n=>['opencode-server',n])];
  for(const args of helpCases){const r=await run('current-help',cli,[...args,'--help','--json']);assert.ok(r.stdout.trim().length>0);const value=JSON.parse(r.stdout);assert.ok(!value.error);if(args.length===2)assert.equal(value.subcommand,args[1]);}
  for(const command of ['spec','workflow','job','webhook','plugin','init','heal'])await run('unsupported-command-rejected',cli,[command],[1]);
  const versionResult=await run('installed-version',cli,['--version','--json']);assert.ok(versionResult.stdout.includes(version));checks.help_cases=helpCases.length;
  const started=await run('official-daemon-start',cli,['daemon','start','--detach','--json']);const start=JSON.parse(started.stdout);assert.equal(start.success,true);activePid=start.pid;let current=await waitHealthy();assert.equal(current.body.version,version);await save('first-health',current.body);
  const unauthorized=await fetch('http://127.0.0.1:'+current.handshake.port+'/api/v1/tool/invoke',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tool:'sf_state_transition',args:{work_item_id:'WI-9000',to_state:'closed'}}),signal:AbortSignal.timeout(5000)});assert.equal(unauthorized.status,401);checks.unauthorized_governance_write='REFUSED_401';
  assert.equal(((await unauthorized.json()) as {error:{code:string}}).error.code,'UNAUTHORIZED');
  const readClient=await createDaemonReadClient(path.join(privateRoot,'runtime/handshake.json'));
  assert.equal((await readClient.health()).pid,current.body.pid);assert.ok(Number.isSafeInteger(await readClient.sessionCount()));assert.equal((await readClient.verifyAuthenticationRefusal()).code,'UNAUTHORIZED');checks.current_read_examples='PASS';
  for(const route of ['/','/events']){const result=await fetch('http://127.0.0.1:'+current.handshake.port+route,{signal:AbortSignal.timeout(5000)});assert.equal(result.status,401);await result.arrayBuffer();}
  const refused=[];
  for(const [method,route,code] of [['POST','/api/v1/event/query','EVENT_QUERY_UNSUPPORTED'],['POST','/api/v1/cas/store','CAS_API_UNSUPPORTED'],['GET','/api/v1/cas/retrieve','CAS_API_UNSUPPORTED']]){
    const response=await fetch('http://127.0.0.1:'+current.handshake.port+route,{method,headers:{Authorization:'Bearer '+current.handshake.token,'content-type':'application/json'},...(method==='POST'?{body:'{}'}:{}),signal:AbortSignal.timeout(5000)});assert.equal(response.status,501);const body=await response.json() as {error:{code:string}};assert.equal(body.error.code,code);refused.push({method,route,status:response.status,code});
  }
  await save('unsupported-route-refusals',refused);checks.protected_and_unsupported_routes='PASS';
  const priorPid=current.body.pid;await run('official-daemon-restart',cli,['daemon','restart','--json']);current=await waitHealthy();assert.notEqual(current.body.pid,priorPid);assert.equal(await ended(priorPid),true);activePid=current.body.pid;await save('restart-health',current.body);
  await run('official-daemon-stop',cli,['daemon','stop','--json']);assert.equal(await ended(activePid!),true);activePid=undefined;checks.official_start_restart_stop='PASS';
  await run('official-upgrade',process.execPath,['scripts/sf-installer.ts','upgrade']);await run('official-post-upgrade-verify',process.execPath,['scripts/sf-installer.ts','verify']);
  const privateSentinel=path.join(privateRoot,'platform-private-sentinel.txt'),unmanaged=path.join(config,'platform-unmanaged.txt');await fs.writeFile(privateSentinel,'synthetic private retention\n',{flag:'wx'});await fs.writeFile(unmanaged,'synthetic unmanaged retention\n',{flag:'wx'});
  await run('official-uninstall',process.execPath,['scripts/sf-installer.ts','uninstall']);assert.equal(await fs.readFile(privateSentinel,'utf8'),'synthetic private retention\n');assert.equal(await fs.readFile(unmanaged,'utf8'),'synthetic unmanaged retention\n');for(const entry of identities)await assert.rejects(fs.stat(path.join(config,entry.target)),{code:'ENOENT'});checks.uninstall_private_and_unmanaged_retained=true;
}catch(e){failure={name:(e as Error).name,message:(e as Error).message};process.exitCode=1;}
finally{
  if(activePid!==undefined){try{await run('owned-failure-cleanup-stop',cli,['daemon','stop','--json']);assert.equal(await ended(activePid),true);}catch(e){failure={prior:failure,cleanup:{message:(e as Error).message}};process.exitCode=1;}}
  await save('result',{utc:new Date().toISOString(),platform:process.platform,architecture:process.arch,inner_exit_code:process.exitCode??0,checks,failure,commands:commands.length,original_business_touched:false,product_authority_modified:false,scope:'Official release build/precheck,actual installed bytes,current help/unsupported commands,independent Daemon/auth refusal/restart/stop,upgrade/verify/uninstall retention. D23 readonly Node execution remains Windows x64 only;no unsupported platform is promoted.'});
  console.log(JSON.stringify({platform:process.platform,result:failure?'FAIL':'PASS',report,checks}));
}
