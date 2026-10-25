const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const args=['-n','\\.pushEvent\\(|\\.subscribeEvents\\(|\\.simulateEvent\\(','packages','setup','-g','*.ts','-g','!*.test.ts','-g','!*.d.ts','-g','!**/tests/**','-g','!**/dist/**','-g','!**/node_modules/**'];
const result=cp.spawnSync('rg',args,{encoding:'utf8',windowsHide:true});
fs.writeFileSync(path.join(__dirname,'event-callsite-audit.json'),JSON.stringify({utc:new Date().toISOString(),method:'Complete tracked production TypeScript roots packages/setup, exclude tests/declarations/dist/node_modules; inspect runtime composition and interfaces in source-evidence.json',command:['rg',...args],exit_code:result.status,stdout:result.stdout,stderr:result.stderr},null,2),{flag:'wx'});
console.log(result.stdout);if(result.status!==0)process.exitCode=result.status||1;
