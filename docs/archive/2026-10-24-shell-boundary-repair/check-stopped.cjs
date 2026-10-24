const fs=require('fs'),path=require('path'),assert=require('assert/strict');const old=JSON.parse(fs.readFileSync(path.join(__dirname,'identity-before.json')));let alive=false,error;
try{process.kill(old.pid,0);alive=true}catch(e){error=e.code;assert.equal(error,'ESRCH');}
const result={utc:new Date().toISOString(),oldPid:old.pid,alive,error};fs.writeFileSync(path.join(__dirname,'old-process-stopped.json'),JSON.stringify(result,null,2),{flag:'wx'});assert.equal(alive,false);console.log(JSON.stringify(result));
