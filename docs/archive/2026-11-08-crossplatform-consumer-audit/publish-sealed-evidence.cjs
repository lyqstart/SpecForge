const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=__dirname,prefix='docs/archive/2026-11-08-crossplatform-consumer-audit/',parent='f17a532a98d5716cfbae57b26916ae3dfdfce4b8',live=path.join(root,'publication-live'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=a=>{const r=cp.spawnSync('git',a,{windowsHide:true,maxBuffer:33554432});assert.equal(r.status,0,r.stderr?.toString());return r.stdout;},str=a=>git(a).toString().trim(),split=b=>b.toString().split('\0').filter(Boolean);
assert.equal(str(['rev-parse','--show-object-format']),'sha1');
const manifest=fs.readFileSync(path.join(root,'manifest.sha256'),'utf8'),members=manifest.trimEnd().split('\n').map(line=>{assert.match(line,/^[a-f0-9]{64}  /);const file=line.slice(66);assert(!file.includes('..')&&!path.isAbsolute(file));assert(!/^(?:local-assets|publication-live)\//.test(file));assert.equal(sha(fs.readFileSync(path.join(root,file))),line.slice(0,64),file);return file;});
const files=[...members,'manifest.sha256'].map(f=>prefix+f).concat(['docs/project-status.md','docs/rule/specforge-development-error-ledger-and-experience.md']).sort();
const mode=process.argv[2];
if(mode==='stage'){
 assert.equal(str(['branch','--show-current']),'codex/crossplatform-consumer-audit');assert.equal(str(['rev-parse','HEAD']),parent);assert.equal(str(['rev-parse','refs/heads/main']),parent);
 assert.equal(str(['ls-remote','--exit-code','origin','refs/heads/main']).split(/\s/)[0],parent);
 assert.equal(str(['diff','--cached','--name-only']),'');assert.deepEqual(split(git(['diff','--name-only','HEAD','-z'])).sort(),['docs/project-status.md','docs/rule/specforge-development-error-ledger-and-experience.md']);
 const paths=path.join(live,'final-publication.paths.nul');fs.writeFileSync(paths,files.join('\0')+'\0',{flag:'wx'});
 git(['--literal-pathspecs','add','-f','--pathspec-from-file='+paths,'--pathspec-file-nul']);
 assert.deepEqual(split(git(['diff','--cached','--name-only','-z'])).sort(),files);
 const index=new Map(split(git(['ls-files','--stage','-z'])).map(row=>{const tab=row.indexOf('\t'),[mode,blob,stage]=row.slice(0,tab).split(' ');assert.equal(stage,'0');return [row.slice(tab+1),{mode,blob}];}));
 const proof=files.map(file=>{let b=fs.readFileSync(file);const rawsha=sha(b);if(!file.startsWith(prefix))b=Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));const blob=crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');assert.equal(index.get(file)?.blob,blob,file);assert.equal(index.get(file).mode,'100644');return {file,raw_sha256:rawsha,blob};});
 assert.equal(str(['diff','--name-only']),'');const tree=str(['write-tree']);
 fs.writeFileSync(path.join(live,'final-index-proof.json'),JSON.stringify({utc:new Date().toISOString(),parent,tree,archive_manifest_sha256:sha(manifest),files:proof,check:'PASS'},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({stage:'PASS',files:files.length,tree,archive_manifest_sha256:sha(manifest)}));
}else if(mode==='verify-commit'){
 const proof=JSON.parse(fs.readFileSync(path.join(live,'final-index-proof.json'))),head=str(['rev-parse','HEAD']);assert.equal(str(['rev-parse','HEAD^']),parent);assert.equal(str(['rev-parse','HEAD^{tree}']),proof.tree);assert.equal(str(['diff','--name-only','HEAD']),'');assert.deepEqual(split(git(['diff-tree','--no-commit-id','--name-only','-r','-z',head])).sort(),files);
 const changedRuntime=str(['diff','--name-only',parent,head,'--','packages','setup','scripts','tests','package.json','bun.lock','.github']);assert.equal(changedRuntime,'');
 fs.writeFileSync(path.join(live,'final-commit-proof.json'),JSON.stringify({utc:new Date().toISOString(),head,parent,tree:proof.tree,files:files.length,runtime_delta:false,archive_manifest_sha256:sha(manifest),check:'PASS'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({commit:head,parent,files:files.length,runtime_delta:false,check:'PASS'}));
}else throw Error('UNKNOWN_MODE');
