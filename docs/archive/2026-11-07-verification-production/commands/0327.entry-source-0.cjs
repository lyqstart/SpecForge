const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),mode=process.argv[2],parent='759cd2ffede4bd942db7bd9a0025c96cd02bac1e',sha=b=>crypto.createHash('sha256').update(b).digest('hex'),git=(args,input,encoding)=>cp.execFileSync('git',args,{cwd:root,input,encoding,maxBuffer:32*1024*1024,windowsHide:true}),read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,n))),relative=path.relative(root,__dirname).split(path.sep).join('/');
assert.ok(['prepare','verify'].includes(mode));assert.equal(git(['rev-parse','HEAD'],undefined,'utf8').trim(),parent);
const scopes=fs.readFileSync(path.join(root,'docs/project-status.md'),'utf8').match(/^ALLOWED_SCOPE=(.*)$/m)[1].split(';'),allowed=p=>scopes.some(s=>path.posix.matchesGlob(p,s));
if(mode==='prepare'){
 const sourcePaths=git(['diff','HEAD','--name-only','-z'],undefined,'utf8').split('\0').filter(Boolean).sort();assert.equal(sourcePaths.length,15);
 const initialStaged=git(['diff','--cached','--name-only','-z'],undefined,'utf8').split('\0').filter(Boolean).sort();assert.deepEqual(initialStaged,['tests/unit/verification-consumer-http.test.ts','tests/unit/verifier-evidence-manifest-example.test.ts']);
 const archives=['evidence-guidance-baseline','consumer-client-baseline'].flatMap(d=>fs.readdirSync(path.join(__dirname,d),{recursive:true}).filter(n=>fs.lstatSync(path.join(__dirname,d,n)).isFile()).map(n=>relative+'/'+d+'/'+n.split(path.sep).join('/')));
 const paths=[...sourcePaths,...archives].sort(),out=path.join(__dirname,'consumer-source-review'),bindings={};fs.mkdirSync(out);
 for(const p of paths){assert.ok(allowed(p),'OUTSIDE_ALLOWED_SCOPE:'+p);const b=fs.readFileSync(path.join(root,p)),dest=path.join(out,'current',p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b,{flag:'wx'});const binding={raw_sha256:sha(b),size:b.length};
  const tracked=cp.spawnSync('git',['cat-file','-e','HEAD:'+p],{cwd:root,windowsHide:true});if(tracked.status===0){const oid=git(['rev-parse','HEAD:'+p],undefined,'utf8').trim(),old=git(['cat-file','blob',oid]),target=path.join(out,'parent',p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,old,{flag:'wx'});binding.parent_blob_oid=oid;binding.parent_blob_sha256=sha(old);}bindings[p]=binding;
 }
 for(const seq of ['0297','0316','0317','0320','0321'])assert.equal(read('commands/'+seq+'.result.json').inner_exit_code,0);
 fs.writeFileSync(path.join(out,'tracked.diff'),git(['diff','HEAD','--binary','--full-index','--',...sourcePaths]),{flag:'wx'});
 fs.writeFileSync(path.join(__dirname,'consumer-source-preparation.json'),JSON.stringify({utc:new Date().toISOString(),parent,sourcePaths,paths,bindings,initialStaged,validation:['0297 producer2','0316 consumer/context/example14','0317 real professional artifacts22','0320 current51/748','0321 metadata commit33'],deployed:false,original_gate_acceptance:false},null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(__dirname,'consumer-source-pathspec.nul'),paths.join('\0')+'\0',{flag:'wx'});console.log(JSON.stringify({sourcePaths,paths:paths.length,scope_verified:true,raw_parent_full_patch_saved:true}));
}else{
 const value=read('consumer-source-preparation.json');assert.deepEqual(git(['diff','--cached','--name-only','--no-renames','-z'],undefined,'utf8').split('\0').filter(Boolean).sort(),value.paths);
 const index=new Map(git(['ls-files','--stage','-z'],undefined,'utf8').split('\0').filter(Boolean).map(s=>{const[h,p]=s.split('\t');return[p,h.split(' ')[1]];})),bindings={};
 for(const[p,b]of Object.entries(value.bindings)){assert.ok(allowed(p));const raw=fs.readFileSync(path.join(root,p));assert.equal(sha(raw),b.raw_sha256);const oid=git(['hash-object','--stdin','--path='+p],raw,'utf8').trim();assert.equal(index.get(p),oid);bindings[p]={...b,index_oid:oid,index_blob_sha256:sha(git(['cat-file','blob',oid]))};}
 git(['diff','--cached','--check']);fs.writeFileSync(path.join(__dirname,'consumer-staged.diff'),git(['diff','--cached','--binary','--full-index','--no-renames']),{flag:'wx'});
 fs.writeFileSync(path.join(__dirname,'consumer-staged-review.json'),JSON.stringify({utc:new Date().toISOString(),parent,paths:value.paths,bindings,scope_verified:true},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({reviewed_paths:value.paths.length,raw_index_scope_verified:true,whitespace_check:'PASS'}));
}
