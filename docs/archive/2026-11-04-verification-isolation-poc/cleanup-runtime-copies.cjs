const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const observation=JSON.parse(fs.readFileSync(path.join(__dirname,'independent-cleanup.json'),'utf8').replace(/^\uFEFF/,''));
if(observation.inner_exit_code!==0||observation.attempts.some(a=>a.profile_present||a.processes.some(p=>p.present)))throw Error('CLEANUP_PREFLIGHT_MISSING');
const facts=[];const scope=fs.realpathSync(path.resolve('.tmp/verification-lpac'));
for(const attempt of observation.attempts){
 if(!/^[a-f0-9]{32}$/.test(attempt.attempt))throw Error('NAME');
 const archived=JSON.parse(fs.readFileSync(path.join(__dirname,'attempts',attempt.attempt,'receipt.json')));
 const expected=path.join(scope,attempt.attempt,'runtime','node.exe');const resolved=fs.realpathSync(expected);
 if(resolved!==expected||!resolved.startsWith(scope+path.sep)||archived.root!==path.dirname(path.dirname(resolved)))throw Error('PATH_OWNERSHIP');
 const stat=fs.lstatSync(resolved),hash=sha(fs.readFileSync(resolved));
 if(!stat.isFile()||stat.nlink!==1||hash!=='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237')throw Error('COPY_DRIFT');
 fs.unlinkSync(resolved);facts.push({file:resolved,sha256:hash,bytes:stat.size,deleted:true});
}
const result={utc:new Date().toISOString(),method:'Exact owned single-file unlink after hash/path/nlink/process/profile checks; no recursive deletion.',facts,inner_exit_code:0};
fs.writeFileSync(path.join(__dirname,'runtime-copy-cleanup.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({deleted_files:facts.length,deleted_bytes:facts.reduce((sum,f)=>sum+f.bytes,0),inner_exit_code:0}));
