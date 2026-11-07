const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const label=process.argv[2],tag=process.argv[3];if(!/^\d{2}$/.test(label||'')||!/^\d{2}$/.test(tag||''))throw Error('LABELS');
const info=JSON.parse(fs.readFileSync(path.join(__dirname,`public-kernel-fixture-${label}.json`),'utf8'));
const destination=path.join(__dirname,'public-native-evidence-'+tag);const members=[],omitted=[];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(sha(fs.readFileSync(path.join(info.fixture,'reservation.json')))!==info.reservation_sha256)throw Error('RESERVATION_DRIFT');
if(info.install_proof_sha256&&sha(fs.readFileSync(path.join(info.fixture,'installed-byte-proof.json')))!==info.install_proof_sha256)throw Error('INSTALL_PROOF_DRIFT');
fs.mkdirSync(destination);
function snapshot(input,target){const stat=fs.lstatSync(input);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('SNAPSHOT_KIND');const bytes=fs.readFileSync(input);if(bytes.length>20*1024*1024)throw Error('SNAPSHOT_BUDGET');const out=path.join(destination,target);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,bytes,{flag:'wx'});members.push({path:target.replace(/\\/g,'/'),size:bytes.length,sha256:sha(bytes)});}
snapshot(path.join(__dirname,`public-kernel-fixture-${label}.json`),'fixture/metadata.json');
for(const name of ['reservation.json','source-release-manifest.json','installed-byte-proof.json','installer-install.json','installer-verify.json','install-driver-source.cjs','install-driver-identity.json','fixture.json'])if(fs.existsSync(path.join(info.fixture,name)))snapshot(path.join(info.fixture,name),'fixture/'+name);
function walk(source,relative){for(const e of fs.readdirSync(source,{withFileTypes:true})){
 const input=path.join(source,e.name),target=path.join(relative,e.name);if(e.isSymbolicLink())throw Error('LINK_FORBIDDEN');
 if(e.isDirectory()){walk(input,target);continue;}if(!e.isFile())throw Error('FILE_KIND');
 if(e.name==='owner.key'){omitted.push({path:target,reason:'PRIVATE_AUTHENTICATION_KEY_NEVER_ARCHIVED'});continue;}
 const bytes=fs.readFileSync(input);if(e.name==='node.exe'){omitted.push({path:target,reason:'PINNED_RUNTIME_RECORDED_BY_HASH',sha256:sha(bytes),size:bytes.length});continue;}
 if(bytes.length>20*1024*1024)throw Error('UNEXPECTED_LARGE_EVIDENCE');const output=path.join(destination,target);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,bytes,{flag:'wx'});if(sha(fs.readFileSync(output))!==sha(bytes))throw Error('COPY_DRIFT');members.push({path:target.replace(/\\/g,'/'),size:bytes.length,sha256:sha(bytes)});
}}
walk(path.join(info.fixture,'trials'),'trials');
const ownerRoot=path.join(info.config,'sf-user/runtime/verification-owner');
if(fs.existsSync(ownerRoot))walk(ownerRoot,'owner');
else omitted.push({path:'owner',reason:'OWNER_ROOT_ABSENT_AT_CAPTURE'});
const manifest={utc:new Date().toISOString(),fixture:info.fixture,scope:'Genuine Kernel/public/native evidence; finite model transport and seeded upstream baseline; not original WI or full SPS acceptance',members,omitted};
const raw=JSON.stringify(manifest,null,2)+'\n';fs.writeFileSync(path.join(destination,'manifest.json'),raw,{flag:'wx'});
for(const item of members)if(sha(fs.readFileSync(path.join(destination,item.path)))!==item.sha256)throw Error('MANIFEST_SELF_CHECK');
console.log(JSON.stringify({destination,members:members.length,manifest_sha256:sha(raw),private_key_archived:false}));
