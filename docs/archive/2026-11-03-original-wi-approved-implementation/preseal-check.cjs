const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const sha=raw=>crypto.createHash('sha256').update(raw).digest('hex');
const commands=path.join(__dirname,'commands');
const names=fs.readdirSync(commands).filter(n=>/^\d{4}\.command\.txt$/.test(n)).sort();
for(const name of names){const seq=name.slice(0,4);const r=JSON.parse(fs.readFileSync(path.join(commands,seq+'.result.json')));if(!Number.isInteger(r.inner_exit_code)||!Number.isInteger(r.carrier_exit_code))throw Error('NONNUMERIC_RECEIPT');const manifest=fs.readFileSync(path.join(commands,seq+'.manifest.sha256'),'utf8');for(const line of manifest.trimEnd().split('\n'))if(sha(fs.readFileSync(path.join(commands,line.slice(66))))!==line.slice(0,64))throw Error('RECEIPT_HASH_DRIFT:'+seq)}
const prior=path.join(__dirname,'../2026-11-03-original-wi-archive-restore');
const oldManifest=fs.readFileSync(path.join(prior,'manifest.sha256'),'utf8');
for(const line of oldManifest.trimEnd().split('\n'))if(sha(fs.readFileSync(path.join(prior,line.slice(66))))!==line.slice(0,64))throw Error('PRIOR_SEALED_EVIDENCE_DRIFT');
const audit=JSON.parse(fs.readFileSync(path.join(__dirname,'original-audit-final.json')));
const metadata=JSON.parse(Buffer.from(audit.files.find(f=>f.path.endsWith('/work_item.json')).bytes_base64,'base64'));
if(audit.formal_state.data.work_items['WI-0001'].current_state!=='implementation_running'||metadata.code_change_allowed!==false||metadata.code_permission_revoked!==true)throw Error('FINAL_AUTHORITY_DRIFT');
const git=args=>cp.execFileSync('git',args,{encoding:'utf8',windowsHide:true});
const changedAssets=git(['diff','--name-only','cf94aa7d7e7a04f1bfd97e34a8b1833accc1b89c','--','packages','setup','docs/product-specification']);
if(changedAssets.trim())throw Error('VALIDATED_PRODUCT_SOURCE_DRIFT');
const ignored=['native-resume-implementation/new-messages.json','native-resume-implementation/inspection-final.json'];
for(const file of ignored)git(['check-ignore','--',path.relative(process.cwd(),path.join(__dirname,file))]);
const result={utc:new Date().toISOString(),completed_receipts_verified:names.length,prior_sealed_files_verified:oldManifest.trimEnd().split('\n').length,product_source_unchanged_since_validated_commit:true,formal_state:'implementation_running',code_change_allowed:false,code_permission_revoked:true,private_native_sources_ignored:true,publication_note:'Intermediate Bootstrap LOCAL_REMOTE_HEAD_MISMATCH is expected because this authorized maintenance branch has its own unpublished cf94aa7d commit; no further product/business implementation follows. Complete already-authorized seal/fast-forward/push and rerun Bootstrap on clean main.',inner_exit_code:0};
fs.writeFileSync(path.join(__dirname,'preseal-check.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
