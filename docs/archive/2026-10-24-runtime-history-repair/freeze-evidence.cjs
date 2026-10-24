const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),zlib=require('zlib');
const source=__dirname,worktree=path.resolve(source,'../runtime-history-worktree'),archive=path.join(worktree,'docs/archive/2026-10-24-runtime-history-repair');
if(fs.existsSync(archive))throw Error('EVIDENCE_DIRECTORY_COLLISION');fs.mkdirSync(archive,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function copy(dir,relative=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(relative===''&&e.name.startsWith('http-audit'))continue;if(e.name.endsWith('.js'))continue;const from=path.join(dir,e.name),rel=path.join(relative,e.name),to=path.join(archive,rel);if(e.isDirectory()){fs.mkdirSync(to,{recursive:true});copy(from,rel);}else{fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}}}
copy(source);
const prior=path.resolve(source,'../six-independent-review-20261019'),priorFiles={};
function pack(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())pack(f);else priorFiles[path.relative(prior,f).replaceAll('\\','/')]=fs.readFileSync(f).toString('base64');}}
pack(prior);fs.writeFileSync(path.join(archive,'prior-review-evidence.json.gz'),zlib.gzipSync(JSON.stringify(priorFiles)));
fs.mkdirSync(path.join(archive,'http-audit'));for(const e of fs.readdirSync(path.join(source,'http-audit'),{withFileTypes:true}))if(e.isFile())fs.copyFileSync(path.join(source,'http-audit',e.name),path.join(archive,'http-audit',e.name));
fs.mkdirSync(path.join(archive,'http-audit-final'));for(const e of fs.readdirSync(path.join(source,'http-audit-final'),{withFileTypes:true}))if(e.isFile())fs.copyFileSync(path.join(source,'http-audit-final',e.name),path.join(archive,'http-audit-final',e.name));
const baseline='04a6880c4cf8b8bf69e461cc447effe4058b7297',head=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:worktree,encoding:'utf8'}).trim();
const changed=cp.execFileSync('git',['diff',baseline,head,'--name-only'],{cwd:worktree,encoding:'utf8'}).trim().split('\n');
const oldFiles=new Set(cp.execFileSync('git',['ls-tree','-r','--name-only',baseline],{cwd:worktree,encoding:'utf8',maxBuffer:30e6}).trim().split('\n'));
for(const file of changed)for(const [phase,ref]of [['before',baseline],['after',head]]){if(phase==='before'&&!oldFiles.has(file))continue;const out=path.join(archive,'source-snapshots',phase,file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,cp.execFileSync('git',['show',ref+':'+file],{cwd:worktree,maxBuffer:50e6}));}
fs.writeFileSync(path.join(archive,'source-diff.patch'),cp.execFileSync('git',['diff',baseline,head],{cwd:worktree,maxBuffer:50e6}));
fs.copyFileSync(path.join(worktree,'release/release-manifest.json'),path.join(archive,'release-manifest.json'));
const binaries=['specforge.exe','specforged.exe'].map(n=>{const b=fs.readFileSync(path.join(worktree,'release/bin',n));return{name:n,bytes:b.length,sha256:hash(b)};});
fs.writeFileSync(path.join(archive,'provenance.json'),JSON.stringify({utc:new Date().toISOString(),baseline,candidate:head,binaries,write_classification:{TRUTH_SOURCE_WRITES:'No original business project writes. Isolated test fixtures only.',REPOSITORY_TRACKED_WRITES:changed,RUNTIME_OBSERVER_WRITES:'Temporary test runtime, installed daemon logs/handshake and installer journal.',EXTERNAL_EVIDENCE_WRITES:archive}},null,2));
const entries=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else entries.push({path:path.relative(archive,f).replaceAll('\\','/'),sha256:hash(fs.readFileSync(f))});}}walk(archive);entries.sort((a,b)=>a.path.localeCompare(b.path));
fs.writeFileSync(path.join(archive,'manifest.json'),JSON.stringify(entries,null,2));for(const e of entries)if(hash(fs.readFileSync(path.join(archive,e.path)))!==e.sha256)throw Error('SEAL_MISMATCH');
fs.writeFileSync(path.join(archive,'seal-receipt.json'),JSON.stringify({utc:new Date().toISOString(),verified:entries.length,mismatches:0,manifest_sha256:hash(fs.readFileSync(path.join(archive,'manifest.json')))},null,2));console.log(JSON.stringify({archive,verified:entries.length}));
