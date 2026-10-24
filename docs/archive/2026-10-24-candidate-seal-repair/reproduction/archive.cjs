const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),cp=require('child_process');
const source=__dirname,repo='D:/code/SpecForge',dest=path.join(repo,'docs/archive/2026-10-24-candidate-seal-repair'),phase=process.argv[2];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function copy(p,to=p){const bytes=fs.readFileSync(path.join(source,p)),file=path.join(dest,to);fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file)){assert.deepEqual(fs.readFileSync(file),bytes,'evidence must be immutable: '+to);return;}fs.writeFileSync(file,bytes,{flag:'wx'});}
if(phase==='init'){assert.equal(fs.existsSync(dest),false);fs.mkdirSync(dest,{recursive:true});
 fs.writeFileSync(path.join(dest,'received-prompt.txt'),'开始修复这两个问题，保留原始证据，验证并部署后给我恢复 OpenCode 验收的提示词。不要直接推进 WI-0002，也不要替我批准候选方案。\n',{flag:'wx'});
 copy('plan.txt','change-plan.md');copy('gate.json');copy('original-manifest.json');copy('snapshot-verification.json');
 const raw=['0e/0e8eace3b933c3fe73746b8bf92f76fb3abc1f94e7f3f5c6f4d39973fd76ec74.json','12/126fae896dd70743012fb1e60a693e4f54de22ebfc30f2fd05929171423c7c88.json','95/95346ebb42222ede128a947a118dd52e664da7a0ac6ad954f2eef9855280208f.json','ad/adff3ad49102ae0c6e32c75c0fb2ac4054ab416ae77dcbc3999a1abce1b876d0.json'];
 for(const p of raw)copy('original/.specforge/logs/observability/userlevel/payloads/by-sha256/'+p,'original-errors/'+path.basename(p));
 const files=['.specforge/runtime/events.jsonl','.specforge/work-items/WI-0002/work_item.json','.specforge/work-items/WI-0002/implementation_baseline.json','.specforge/work-items/WI-0002/candidate_manifest.json'];for(const p of files)copy('original/'+p,'original-selected/'+p);
 const git=(args)=>cp.execFileSync('git',args,{cwd:repo,encoding:'utf8',windowsHide:true,maxBuffer:100*1024*1024});const changed=git(['diff','--name-only','ddf03cb48ec53631eca8eb9a4249456556f323f7','HEAD']).trim().split('\n');
 const sources=[];for(const f of changed){const b=fs.readFileSync(path.join(repo,f));sources.push({path:f,sha256:hash(b)});}fs.writeFileSync(path.join(dest,'candidate-source-files.json'),JSON.stringify({commit:git(['rev-parse','HEAD']).trim(),files:sources},null,2),{flag:'wx'});fs.writeFileSync(path.join(dest,'candidate.patch'),git(['diff','ddf03cb48ec53631eca8eb9a4249456556f323f7','HEAD']),{flag:'wx'});
}
for(const f of fs.readdirSync(source)){if(/^\d{3}[a-z]?-.+\.(command\.json|stdout\.txt|stderr\.txt|result\.json)$/.test(f)){
 const id=f.replace(/\.(command\.json|stdout\.txt|stderr\.txt|result\.json)$/,'');
 if(!fs.existsSync(path.join(source,id+'.result.json')))continue;
 const old=path.join(dest,'commands',f);
 if(fs.existsSync(old)&&!fs.readFileSync(old).equals(fs.readFileSync(path.join(source,f))))copy(f,'completed-commands/'+f);
 else copy(f,'commands/'+f);
}}
for(const f of ['source-recovery.json','source-recovery-retry1.json','identity-before.json','installed-first.json','installed-restart.json','installed-sealed-manifest.json','final-independent-review.json','resume-opencode.txt'])if(fs.existsSync(path.join(source,f))){
 if(f==='resume-opencode.txt')copy(f,'resume-opencode-final.txt');else copy(f);
}
const log=[];for(const f of fs.readdirSync(source).filter(f=>/\.result\.json$/.test(f)).sort()){const r=JSON.parse(fs.readFileSync(path.join(source,f)));log.push({event:'command_started',id:r.id,time:r.started},{event:'command_finished',id:r.id,time:r.finished,inner_exit_code:r.inner_exit_code});}const journal=path.join(dest,'journal.jsonl');const old=fs.existsSync(journal)?fs.readFileSync(journal,'utf8'):'';const seen=new Set(old.trim().split('\n').filter(Boolean).map(s=>{const e=JSON.parse(s);return e.id+':'+e.event}));const pending=log.filter(e=>!seen.has(e.id+':'+e.event));if(pending.length)fs.appendFileSync(journal,pending.map(r=>JSON.stringify(r)).join('\n')+'\n');
console.log(JSON.stringify({phase,dest,commands:log.length/2}));
