const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert/strict');
const root=process.cwd(),relative='docs/archive/2026-10-24-runtime-history-repair',archive=path.join(root,relative),manifest=JSON.parse(fs.readFileSync(path.join(archive,'manifest.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const e of manifest){assert.equal(hash(fs.readFileSync(path.join(archive,e.path))),e.sha256);assert.equal(hash(cp.execFileSync('git',['show','HEAD:'+relative+'/'+e.path],{maxBuffer:60e6})),e.sha256);}
assert.equal(cp.execFileSync('git',['diff','3cb3b959','HEAD','--','packages/*/src','scripts','setup'],{encoding:'utf8'}),'');
const report={utc:new Date().toISOString(),manifest_members:manifest.length,working_and_git_object_hash_mismatches:0,head:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),candidate_product_bytes_unchanged:true};
fs.writeFileSync(path.join(__dirname,'post-merge-audit.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
