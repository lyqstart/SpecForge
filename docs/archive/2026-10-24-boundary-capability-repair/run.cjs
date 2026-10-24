const fs=require('fs'),path=require('path'),cp=require('child_process');
const [id,cwd,exe,...args]=process.argv.slice(2),root=__dirname;
const prefix=path.join(root,id);if(fs.existsSync(prefix+'.result.json'))throw Error('EVIDENCE_COLLISION');
const start=new Date().toISOString(), command={id,cwd,exe,args,started:start,purpose:id,expected_writes:'isolated workspace build/test outputs; evidence; explicit delivery commands only'};
fs.writeFileSync(prefix+'.command.json',JSON.stringify(command,null,2));
const out=fs.openSync(prefix+'.stdout.txt','wx'),err=fs.openSync(prefix+'.stderr.txt','wx');
const r=cp.spawnSync(exe,args,{cwd,stdio:['ignore',out,err],windowsHide:true,env:process.env});fs.closeSync(out);fs.closeSync(err);
const result={...command,finished:new Date().toISOString(),carrier_exit_code:0,inner_exit_code:r.status??1,error:r.error?.message,signal:r.signal,observed_status:cp.spawnSync('git',['status','--porcelain'],{cwd,encoding:'utf8',windowsHide:true}).stdout};
fs.writeFileSync(prefix+'.result.json',JSON.stringify(result,null,2));console.log(JSON.stringify({id,exit:result.inner_exit_code}));process.exitCode=result.inner_exit_code;
