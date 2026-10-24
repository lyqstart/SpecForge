const fs=require('fs'),cp=require('child_process'),path=require('path'),crypto=require('crypto');
const cwd='D:/code/SpecForge/.tmp/boundary-capability-worktree';
function git(args){const r=cp.spawnSync('git',args,{cwd,encoding:null,windowsHide:true});if(r.status!==0)throw Error(String(r.stderr));return r.stdout;}
const changed=git(['diff','--name-only','-z']).toString().split('\0').filter(Boolean),fresh=git(['ls-files','--others','--exclude-standard','-z']).toString().split('\0').filter(Boolean),files=[...changed,...fresh];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const snapshots=files.map(file=>{const after=fs.readFileSync(path.join(cwd,file)),before=fresh.includes(file)?null:git(['show','93dfe4d699467954cc4582b2487cc88c4f5fe43b:'+file]);return {file,before:before&&before.toString('base64'),before_sha256:before&&sha(before),after:after.toString('base64'),after_sha256:sha(after)};});
fs.writeFileSync(path.join(__dirname,'source-snapshots.json'),JSON.stringify({utc:new Date().toISOString(),baseline:'93dfe4d699467954cc4582b2487cc88c4f5fe43b',snapshots},null,2),{flag:'wx'});
fs.writeFileSync(path.join(__dirname,'tracked.diff'),git(['diff','--binary']),{flag:'wx'});
git(['add','--',...files]);git(['diff','--cached','--check']);console.log(git(['commit','-m','fix: reject native hardlink writes and preserve unknown model capabilities']).toString());console.log(git(['rev-parse','HEAD']).toString());
