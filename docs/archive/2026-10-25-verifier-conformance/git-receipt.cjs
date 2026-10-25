const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const [id,exe,...args]=process.argv.slice(2);if(!id||!exe)throw Error('id/executable required');
const started=new Date().toISOString();
const r=cp.spawnSync(exe,args,{cwd:process.cwd(),windowsHide:true,encoding:'utf8',maxBuffer:64*1024*1024});
const record={run_id:'CODEX-SF-20261025-VERIFIER-CONFORMANCE-A01',id,started_utc:started,finished_utc:new Date().toISOString(),cwd:process.cwd(),command:[exe,...args],inner_exit_code:r.status,stdout:r.stdout,stderr:r.stderr,scope:'Post-seal Git delivery receipt retained locally; does not mutate sealed journal/manifest.'};
fs.writeFileSync(path.join(__dirname,`delivery-${id}.raw.log`),JSON.stringify(record,null,2),{flag:'wx'});
console.log(r.stdout?.slice(-5000)||'');console.error(r.stderr?.slice(-2000)||'');console.log(JSON.stringify({id,inner_exit_code:r.status,finished_utc:record.finished_utc}));process.exitCode=typeof r.status==='number'?r.status:1;
