const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const phase=process.argv[2],old=JSON.parse(fs.readFileSync(path.join(__dirname,phase==='before'?'identity-before.json':'installed-first.json')));let alive=false,error;
try{process.kill(old.pid,0);alive=true;}catch(e){error=e.code;assert.equal(error,'ESRCH');}
const result={utc:new Date().toISOString(),phase,oldPid:old.pid,alive,error};fs.writeFileSync(path.join(__dirname,'stopped-'+phase+'.json'),JSON.stringify(result,null,2),{flag:'wx'});assert.equal(alive,false);console.log(JSON.stringify(result));
