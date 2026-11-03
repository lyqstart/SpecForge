const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const identity=JSON.parse(fs.readFileSync(path.join(__dirname,'native-resume-implementation/identity.json')));
let nativeAlive=true;try{process.kill(identity.pid,0)}catch(error){if(error.code==='ESRCH')nativeAlive=false;else throw error}
const r=cp.spawnSync('C:/Users/lyq/.config/opencode/sf-user/bin/specforge.exe',['daemon','status','--json'],{encoding:'utf8',windowsHide:true});
const result={utc:new Date().toISOString(),owned_native_host_pid:identity.pid,owned_native_host_alive:nativeAlive,daemon_exit_code:r.status,daemon:JSON.parse(r.stdout),inner_exit_code:0};
if(nativeAlive||r.status!==0||result.daemon.pid!==21644)throw Error('FINAL_ENVIRONMENT_MISMATCH');
fs.writeFileSync(path.join(__dirname,'final-environment.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
