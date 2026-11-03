const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
let oldProcessAlive = true;
try { process.kill(29796,0); } catch (error) { if (error.code === 'ESRCH') oldProcessAlive = false; else throw error; }
const status = cp.spawnSync('C:/Users/lyq/.config/opencode/sf-user/bin/specforge.exe',['daemon','status','--json'],{encoding:'utf8',windowsHide:true});
const result = { utc:new Date().toISOString(), old_pid:29796, old_process_alive:oldProcessAlive, status_exit_code:status.status, stdout:status.stdout, stderr:status.stderr };
result.inner_exit_code = oldProcessAlive || !Number.isInteger(status.status) || status.status===0 ? 1 : 0;
fs.writeFileSync(path.join(__dirname,'old-daemon-exit.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result)); process.exitCode=result.inner_exit_code;
