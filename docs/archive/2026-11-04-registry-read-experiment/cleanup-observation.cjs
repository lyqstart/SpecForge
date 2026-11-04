// One declared observation-carrier substitution: script files are disabled by
// Windows PowerShell policy; inline read-only cmdlets remain permitted.
// No ExecutionPolicy or other system setting is changed. Not a test executor.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const recipe=fs.readFileSync(path.join(__dirname,'inspect-cleanup.ps1'),'utf8');
const script=recipe.replaceAll('$PSScriptRoot',"'"+__dirname.replaceAll("'","''")+"'");
const result=cp.spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)process.stderr.write(String(result.error));
process.exitCode=Number.isInteger(result.status)?result.status:1;
