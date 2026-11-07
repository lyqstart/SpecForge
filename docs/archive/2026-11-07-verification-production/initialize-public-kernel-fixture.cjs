const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),sha=raw=>crypto.createHash('sha256').update(raw).digest('hex');
const label=process.argv[2];if(!/^\d{2}$/.test(label||''))throw Error('FIXTURE_LABEL_REQUIRED');
if(fs.existsSync(path.join(__dirname,`public-kernel-fixture-${label}.json`)))throw Error('FIXTURE_LABEL_COLLISION');
const buildSeq=process.argv[3]||'0066';if(!/^\d{4}$/.test(buildSeq))throw Error('BUILD_RECEIPT_REQUIRED');
const build=JSON.parse(fs.readFileSync(path.join(__dirname,'commands',buildSeq+'.stdout.txt'),'utf8'));
const result=JSON.parse(fs.readFileSync(path.join(__dirname,'commands',buildSeq+'.result.json'),'utf8'));if(result.inner_exit_code!==0)throw Error('UNQUALIFIED_BUILD');
const parent=path.join(root,'.tmp','verification-public-kernel');fs.mkdirSync(parent,{recursive:true});
const nonce=crypto.randomUUID().replace(/-/g,''),fixture=path.join(parent,nonce);fs.mkdirSync(fixture);
const config=path.join(fixture,'config'),bin=path.join(config,'sf-user','bin');fs.mkdirSync(bin,{recursive:true});
const identities={};
for(const artifact of [...build.artifacts.filter(a=>a.id==='runtime:specforged'),...build.verification_assets]){
  const source=path.join(root,artifact.path),bytes=fs.readFileSync(source);if(sha(bytes)!==artifact.sha256)throw Error('BUILD_BYTES_CHANGED');
  const relative=artifact.path.replace(/^release\/bin\//,''),target=path.join(bin,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});if(sha(fs.readFileSync(target))!==artifact.sha256)throw Error('COPY_DRIFT');identities['sf-user/bin/'+relative]=artifact.sha256;
}
for(const file of ['sf_verification_plan.ts','sf_verification_run.ts','sf_artifact_write.ts','sf_gate_run.ts','sf_semantic_closure_run.ts','lib/thin-client.ts','lib/sf-observability.ts','lib/sf-observability-config.ts']){
  const source=path.join(root,'setup/userlevel-opencode/tools',file),target=path.join(config,'tools',file),bytes=fs.readFileSync(source);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});identities['tools/'+file]=sha(bytes);
}
// The tool SDK's public index only re-exports tool.js, which imports zod. Copy immutable code, never user auth/config.
const pluginSource='C:\\Users\\lyq\\.config\\opencode\\node_modules\\@opencode-ai\\plugin';
for(const file of ['package.json','dist/index.js','dist/tool.js']){const target=path.join(config,'node_modules','@opencode-ai','plugin',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(pluginSource,file),target);}
fs.cpSync('C:\\Users\\lyq\\.config\\opencode\\node_modules\\zod',path.join(config,'node_modules','zod'),{recursive:true,errorOnExist:true,force:false});
fs.writeFileSync(path.join(config,'package.json'),JSON.stringify({private:true,dependencies:{'@opencode-ai/plugin':'1.18.16',zod:'4.1.8'}})+'\n',{flag:'wx'});
for(const folder of ['home','data','cache','state','temp','xdg-config'])fs.mkdirSync(path.join(fixture,folder));
const reservation={utc:new Date().toISOString(),kind:'D23_SELF_OWNED_PUBLIC_KERNEL_FIXTURE',root:fixture,nonce,config,project:path.join(fixture,'project'),qualified_build_receipt:buildSeq,build_identities:identities,expected_work_item_id:'WI-9901',upstream_governance:'SEEDED_SYNTHETIC_BASELINE_NOT_BUSINESS_ACCEPTANCE',original_business_touched:false,profile_created:false};
fs.writeFileSync(path.join(fixture,'reservation.json'),JSON.stringify(reservation,null,2)+'\n',{flag:'wx'});
const bundle=path.join(root,'.tmp/verification-lpac-build/create-public-fixture.js'),bytes=fs.readFileSync(bundle);fs.writeFileSync(path.join(fixture,'create-public-fixture.js'),bytes,{flag:'wx'});
const metadata={utc:new Date().toISOString(),fixture,nonce,config,project:reservation.project,reservation_sha256:sha(fs.readFileSync(path.join(fixture,'reservation.json'))),fixture_bundle_sha256:sha(bytes),tool_sdk_version:'1.18.16',actual_kernel_version:'1.18.35',profile_created:false,build_identities:identities};
fs.writeFileSync(path.join(__dirname,`public-kernel-fixture-${label}.json`),JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({fixture,nonce,reservation_sha256:metadata.reservation_sha256,source_files:Object.keys(identities).length,profile_created:false}));
