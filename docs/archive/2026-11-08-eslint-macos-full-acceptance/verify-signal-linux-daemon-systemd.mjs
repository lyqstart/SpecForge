// Actual current Daemon under the existing systemd owner. Unique owned unit;
// this does not promote any unsupported platform or execute a business WI.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
assert.equal(process.platform,'linux');
const project=process.cwd(),fixture=await fs.mkdtemp(path.join(os.tmpdir(),'sf-systemd-daemon-')),config=path.join(fixture,'config'),out=path.join(path.dirname(new URL(import.meta.url).pathname),'actual-linux-systemd-02');await fs.mkdir(out);
const name='specforge-daemon-audit-'+randomUUID(),unitDir=path.join(os.homedir(),'.config/systemd/user'),unit=path.join(unitDir,name+'.service'),save=async(n,v)=>fs.writeFile(path.join(out,n+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
await assert.rejects(fs.lstat(unit),{code:'ENOENT'});
const {SystemdServiceManager}=await import(pathToFileURL(path.join(project,'packages/service-management/dist/index.js'))),manager=new SystemdServiceManager({unitDir});
const environment={...process.env,OPENCODE_CONFIG_DIR:config};let installed=false,running=false;const phases=[];
function run(file,args,accepted=[0]){const result=spawnSync(file,args,{cwd:project,env:environment,encoding:'utf8',timeout:120000,maxBuffer:8388608});phases.push({file,args,exit:result.status,stdout:result.stdout,stderr:result.stderr});assert.ok(accepted.includes(result.status));return result.stdout.trim();}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function health(){for(let i=0;i<100;i++){try{const h=JSON.parse(await fs.readFile(path.join(config,'sf-user/runtime/handshake.json'),'utf8')),r=await fetch('http://127.0.0.1:'+h.port+'/api/v1/healthz',{signal:AbortSignal.timeout(3000)}),body=await r.json();assert.equal(r.status,200);assert.equal(body.pid,h.pid);assert.equal(body.version,'1.0.25');assert.equal(body.pid,Number(run('systemctl',['--user','show',name,'--property=MainPID','--value'])));return body;}catch{await pause(100);}}throw Error('ACTUAL_SYSTEMD_DAEMON_HEALTH_UNPROVED');}
let failure=null;
try{
 run(process.execPath,['scripts/sf-installer.ts','install']);run(process.execPath,['scripts/sf-installer.ts','verify']);
 const binary=path.join(config,'sf-user/bin/specforged'),bytes=await fs.readFile(binary);await save('identity',{utc:new Date().toISOString(),fixture,name,unit,binary,binary_sha256:createHash('sha256').update(bytes).digest('hex'),subject:'Current official installed1.0.25 Daemon, actual user systemd; unique name is test isolation only.'});
 const result=await manager.install({name,description:'SpecForge owned current Daemon acceptance',binaryPath:binary,args:['start','--foreground'],workingDirectory:fixture,environment:{OPENCODE_CONFIG_DIR:config,PATH:process.env.PATH},dependsOn:[],restartPolicy:'no',stopTimeoutSec:20,stdoutLogPath:path.join(fixture,'daemon.stdout.log'),stderrLogPath:path.join(fixture,'daemon.stderr.log'),enableAtBoot:true});installed=true;await save('install',result);
 await manager.start(name);running=true;const first=await health();await save('first-health',first);
 await manager.restart(name);const second=await health();assert.notEqual(second.pid,first.pid);await save('restart-health',second);
 await manager.stop(name);running=false;assert.equal(run('systemctl',['--user','is-active',name],[3]),'inactive');
 await manager.uninstall(name);installed=false;await assert.rejects(fs.lstat(unit),{code:'ENOENT'});run('systemctl',['--user','is-enabled',name],[1,4]);
 run(process.execPath,['scripts/sf-installer.ts','uninstall']);
}catch(e){failure={name:e.name,message:e.message};process.exitCode=1;}
finally{
 if(running)try{await manager.stop(name);}catch(e){failure={prior:failure,cleanup:e.message};process.exitCode=1;}
 if(installed)try{await manager.uninstall(name);}catch(e){failure={prior:failure,cleanup:e.message};process.exitCode=1;}
 manager.dispose();await save('phases',phases);await save('result',{utc:new Date().toISOString(),inner_exit_code:process.exitCode??0,failure,unit_absent:await fs.lstat(unit).then(()=>false,e=>e.code==='ENOENT'),original_business_touched:false,scope:'Real official installed current Daemon under actual systemd owner: install/enable/start/health identity/restart/stop/disable/uninstall; no sleep process substituted.'});console.log(JSON.stringify({result:failure?'FAIL':'PASS',name,fixture,out,failure}));
}
