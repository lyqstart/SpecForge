const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const prior=path.resolve(__dirname,'../2026-11-04-verification-isolation-proposal');
const baseline=JSON.parse(fs.readFileSync(path.join(prior,'architecture-baseline.json')));
const audit=JSON.parse(fs.readFileSync(path.join(prior,'original-audit-baseline.json')));
const checks=[];
for(const [category,files,base] of [['original-business',baseline.original_files,baseline.target],['original-governance',audit.files,baseline.target],['existing-source',baseline.sources,process.cwd()],['installed',baseline.installed,'']]) {
 for(const file of files){if(file.exists===false)throw Error('BASELINE_MISSING:'+file.path);const full=base?path.join(base,file.path):file.path;const current=sha(fs.readFileSync(full));checks.push({category,path:file.path,sha256:current,unchanged:current===file.sha256});}
}
if(checks.some(c=>!c.unchanged))throw Error('UNEXPECTED_DRIFT');
const target=baseline.target;
const git=cp.spawnSync('git',['--no-pager','-c','core.hooksPath=NUL','-c','core.fsmonitor=false','rev-parse','HEAD'],{cwd:target,encoding:'utf8',windowsHide:true,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL'}});
if(git.status!==0||git.stdout.trim()!==baseline.original_head)throw Error('ORIGINAL_GIT_DRIFT');
const metadata=JSON.parse(fs.readFileSync(path.join(target,'.specforge/work-items/WI-0001/work_item.json')));
if(metadata.code_change_allowed!==false||metadata.code_permission_revoked!==true)throw Error('PERMISSION_DRIFT');
const result={utc:new Date().toISOString(),checks,original_head:git.stdout.trim(),git_exit_code:git.status,permission_revoked:true,authority_note:'No formal HTTP tool or role context injected. Authoritative event bytes and work-item metadata equal prior formal read; this is file identity verification, not a fresh StateManager execution.',inner_exit_code:0};
fs.writeFileSync(path.join(__dirname,'unaffected-verification.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({checks:checks.length,all_unchanged:true,original_head:result.original_head,permission_revoked:true,inner_exit_code:0}));
