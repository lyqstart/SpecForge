const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),root=__dirname;
const prior=path.resolve(root,'../2026-11-04-verification-isolation-poc');
if(fs.existsSync(path.join(root,'authorization.json')))throw Error('EVIDENCE_DIRECTORY_COLLISION');
const manifest=fs.readFileSync(path.join(prior,'manifest.sha256'));
if(sha(manifest)!=='918f5f6f5b389ec9c099fc4c2d70fa67da2edcbdf38e27342dcf72d4350f68ca')throw Error('PRIOR_MANIFEST_DRIFT');
let count=0;for(const line of manifest.toString().trimEnd().split('\n')){if(sha(fs.readFileSync(path.join(prior,line.slice(66))))!==line.slice(0,64))throw Error('PRIOR_MEMBER_DRIFT');count++;}
const hashes={
 'docs/rule/specforge-active-development-rules.md':'de23c0d38acda18052752344805703f2df53cd502503925a51c0341573b19d74',
 'docs/design/SpecForge架构一致性治理最终实施方案.md':'956df3943a44d1b99636790a32e9b2a0dc266b7116f50b60b7b8c6f2614423ac',
 'docs/rule/specforge-execution-mode-and-evidence-protocol.md':'166db21aecece99aa7787bc62978a1bdb89c8b17750182ea1030fedd17a063ef',
 'docs/product-specification/authority-registry.md':'546e861a181074939d6772ba237178299f54db17bb8121190d239e290003b8ae',
 'docs/product-specification/specforge-product-specification.md':'4c678232970c8906ccf532605a2e690e35b0b4e225f257aa6f15e76a12dfced9'};
for(const[file,expected]of Object.entries(hashes))if(sha(fs.readFileSync(file))!==expected)throw Error('RULE_DRIFT:'+file);
const utc=new Date().toISOString();
fs.writeFileSync(path.join(root,'authorization.json'),JSON.stringify({utc,mode:'CODEX_DIRECT',run_id:'CODEX-SF-20261104-WINSOCK-DIAGNOSIS-A01',attempt_id:'CODEX-SF-20261104-WINSOCK-DIAGNOSIS-A01-01',user_reply:'继续',inherited_decision:'批准有限方案，先完成隔离验收',baseline:'54b6688275af9840175dcf282ad48fde33a797f8',bootstrap:'READY/CLEAN/local=remote',prior_sealed_members:count,rule_hashes:hashes,coverage:'Same-conversation complete reads of unchanged rules revalidated; D20 changes authored and fully read in preceding phase; current D20/subordinate contract reread. Not claiming fresh full reads from hashes.',allowed:'Read-only diagnosis through a synthetic Node process with same zero-capability LPAC, bounded debugger observation, fixed input and Job. No business execution or wider permission.',observer_effects:'New owned synthetic profile/runtime/ACL setup and cleanup; hardware debug registers/context and scheduling only; no application code-memory patch, OS feature, SeDebugPrivilege change, driver installation, existing ACL change or capability expansion.'},null,2)+'\n',{flag:'wx'});
for(const file of ['run-command.cjs','seal-receipts.cjs','verify-final-publication.cjs'])fs.copyFileSync(path.join(prior,file),path.join(root,file),fs.constants.COPYFILE_EXCL);
fs.writeFileSync(path.join(root,'journal.jsonl'),JSON.stringify({event:'phase_started',utc,run_id:'CODEX-SF-20261104-WINSOCK-DIAGNOSIS-A01',mode:'CODEX_DIRECT',user_reply:'继续',prior_run:'CODEX-SF-20261104-VERIFICATION-ISOLATION-POC-A01'})+'\n',{flag:'wx'});
console.log(JSON.stringify({prior_sealed_members:count,rule_hashes:'PASS',inner_exit_code:0}));
