const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=file=>JSON.parse(fs.readFileSync(path.join(__dirname,file),'utf8').replace(/^\uFEFF/,''));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const suffix=process.argv[2]||'';assert(suffix===''||/^-[a-z0-9-]+$/.test(suffix),'REVIEW_SUFFIX');
const name='7e60d6c286ce4efca94b818664c89da8',base='attempts/'+name+'/';
const receipt=json(base+'receipt.json'),events=fs.readFileSync(path.join(__dirname,base+'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
assert(receipt.process_started&&receipt.process_resumed&&receipt.application_exit_code===2147483651&&receipt.job_all_ended&&receipt.isolation_acceptance==='INCOMPLETE','RAW_FACT_DRIFT');
assert(fs.readFileSync(path.join(__dirname,base+'stdout.bin')).length===0,'UNEXPECTED_POSITIVE_OUTPUT');
const stderr=fs.readFileSync(path.join(__dirname,base+'stderr.bin')).toString('ascii');assert(stderr.includes('WSAStartup')&&stderr.includes('10107'),'EXPECTED_DIAGNOSTIC_MISSING');
const tokens=events.filter(e=>e.name==='actual_token').map(e=>e.data);
assert(tokens.length===2&&tokens[0].lpac_effective_check===false&&tokens[0].all_application_packages===true&&tokens[1].lpac_effective_check===true&&tokens[1].all_application_packages===false,'TOKEN_CONTROL_MISSING');
assert(tokens.every(t=>t.is_appcontainer===1&&t.capability_count===0&&t.package_read===true&&t.everyone_only===false),'TOKEN_IDENTITY_DRIFT');
assert(events.findIndex(e=>e.name==='pre_resume_checks')<events.findIndex(e=>e.name==='process_resumed'),'ORDER_VIOLATION');
assert(events.some(e=>e.name==='job_empty'&&e.data.active===0)&&events.some(e=>e.name==='profile_cleanup'&&e.data.hresult===0&&e.data.profile_path_exists===false),'CLEANUP_NOT_RECORDED');
const independent=json('independent-cleanup.json');assert(independent.inner_exit_code===0&&independent.attempts.every(a=>!a.profile_present&&a.processes.every(p=>p.query_succeeded&&!p.present)),'INDEPENDENT_CLEANUP_MISSING');
const unaffected=json('unaffected-verification.json');assert(unaffected.checks.length===156&&unaffected.checks.every(c=>c.unchanged)&&unaffected.permission_revoked,'UNEXPECTED_OTHER_WRITE');
const previous=[];
for(const directory of ['2026-11-04-verification-isolation-proposal','2026-11-03-original-wi-approved-implementation']){
 const root=path.resolve(__dirname,'..',directory),raw=fs.readFileSync(path.join(root,'manifest.sha256'));let count=0;
 for(const line of raw.toString().trimEnd().split('\n')){assert(sha(fs.readFileSync(path.join(root,line.slice(66))))===line.slice(0,64),'PRIOR_SEAL_DRIFT:'+directory);count++;}
 previous.push({directory,manifest_sha256:sha(raw),members:count});
}
const allowed=['.gitattributes','docs/product-specification/authority-registry.md','docs/product-specification/specforge-product-specification.md','docs/design/windows-lpac-node-readonly-contract.md','docs/project-status.md','docs/rule/specforge-development-error-ledger-and-experience.md','packages/daemon-core/src/verification/windows/LpacStartupPoc.cs','packages/daemon-core/src/verification/windows/README.md'];
const git=args=>cp.execFileSync('git',args,{windowsHide:true,maxBuffer:64*1024*1024});
const names=[...new Set(Buffer.concat([git(['diff','--name-only','-z']),git(['ls-files','--others','--exclude-standard','-z'])]).toString().split('\0').filter(Boolean))];
assert(names.every(f=>allowed.includes(f)||f.startsWith('docs/archive/2026-11-04-verification-isolation-poc/')),'UNCLASSIFIED_WORKTREE');
const identities=allowed.map(file=>({file,bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}));
const evidence={utc:new Date().toISOString(),review:'PASS_FOR_HONEST_FAILED_SYNTHETIC_CHECKPOINT_ONLY',isolation_acceptance:'FAILED_P01_OTHER_ROWS_NOT_EXECUTED',application_exit_code:receipt.application_exit_code,source_and_deployment_unchanged:true,prior_seals:previous,non_evidence_file_identities:identities,scope_files:names.length,limitations:['Class46 API returned87; LPAC effective semantics tested with ordinary AppContainer control, not a supported class46 result.','No hostile filesystem/registry/network/process or crash/limit acceptance.','No public tool, Gate consumer, installer or deployment changes.','Earlier command text views may contain code-page replacement; primary native events/pipe bytes retained in attempts. Raw command pipe buffers added from0018.','Initial compiler build was not retained; its native failure facts do not prove source-binary reproducibility. Later two source/binary snapshots retained.'],inner_exit_code:0};
fs.writeFileSync(path.join(__dirname,'phase-review'+suffix+'.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
const matrix={utc:evidence.utc,contract:'windows-lpac-node-readonly/v1',result:'NOT_ACCEPTED',rows:[{id:'P01',status:'FAILED_AT_RUNTIME_STARTUP',evidence:'commands/0012 and attempts/'+name},{id:'TOKEN_PREFLIGHT',status:'OBSERVED_EFFECTIVE_ACCESS_CONTROL',does_not_prove:'Full application isolation'},...['A01','A02','A03','L01','L02','L03','I01','D01'].map(id=>({id,status:'NOT_EXECUTED',reason:id.startsWith('I')||id.startsWith('D')?'Later production phase not entered':'P01 failed; synthetic startup/normal cleanup facts do not replace this full row'}))]};
fs.writeFileSync(path.join(__dirname,'matrix-result'+suffix+'.json'),JSON.stringify(matrix,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({review:evidence.review,isolation_acceptance:matrix.result,prior_sealed_members:previous.reduce((n,p)=>n+p.members,0),scope_files:names.length,inner_exit_code:0}));
