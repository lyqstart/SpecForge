const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),root=__dirname,prior=path.resolve(root,'../2026-11-04-winsock-isolation-diagnosis');
if(fs.existsSync(path.join(root,'authorization.json')))throw Error('EVIDENCE_DIRECTORY_COLLISION');
const manifest=fs.readFileSync(path.join(prior,'manifest.sha256'));if(sha(manifest)!=='b7cdae8c82f775dba703f4c04863712c60418938dfb68b6992221dbf34260702')throw Error('PRIOR_MANIFEST_DRIFT');
let count=0;for(const line of manifest.toString().trimEnd().split('\n')){if(sha(fs.readFileSync(path.join(prior,line.slice(66))))!==line.slice(0,64))throw Error('PRIOR_MEMBER_DRIFT');count++;}
const proposal=fs.readFileSync(path.join(prior,'registry-read-experiment-proposal.md'));if(sha(proposal)!=='d342fc7d4fc466f423c939f31da7559222a1956d4cfa4d7a5ec20fd484cc317c')throw Error('PROPOSAL_DRIFT');
const ruleHashes={
 'docs/rule/specforge-active-development-rules.md':'de23c0d38acda18052752344805703f2df53cd502503925a51c0341573b19d74',
 'docs/design/SpecForge架构一致性治理最终实施方案.md':'956df3943a44d1b99636790a32e9b2a0dc266b7116f50b60b7b8c6f2614423ac',
 'docs/rule/specforge-execution-mode-and-evidence-protocol.md':'166db21aecece99aa7787bc62978a1bdb89c8b17750182ea1030fedd17a063ef',
 'docs/product-specification/authority-registry.md':'546e861a181074939d6772ba237178299f54db17bb8121190d239e290003b8ae',
 'docs/product-specification/specforge-product-specification.md':'4c678232970c8906ccf532605a2e690e35b0b4e225f257aa6f15e76a12dfced9'};
for(const[file,hash]of Object.entries(ruleHashes))if(sha(fs.readFileSync(file))!==hash)throw Error('RULE_DRIFT:'+file);
const utc=new Date().toISOString();
fs.writeFileSync(path.join(root,'authorization.json'),JSON.stringify({utc,mode:'CODEX_DIRECT',run_id:'CODEX-SF-20261104-REGISTRY-READ-EXPERIMENT-A01',attempt_id:'CODEX-SF-20261104-REGISTRY-READ-EXPERIMENT-A01-01',baseline:'5bee5e5144ad02f9281f363db5dfd4d032ddfb29',bootstrap:'READY/CLEAN/local=remote',prior_sealed_members:count,user_reply:'批准仅合成实验',proposal_id:'WINSOCK-REGISTRY-READ-EXPERIMENT-001',proposal_sha256:sha(proposal),rule_hashes:ruleHashes,coverage:'Same-conversation complete reads reused with identical raw hashes; approved D21 candidate fully read. Not a claim of fresh full reading from hash alone.',authorization:'First formal D21, then exactly registryRead capability in an independent synthetic profile; undebugged positive and fake canary isolation; no product/WI/deployment, no second capability or existing ACL/system setting change.'},null,2)+'\n',{flag:'wx'});
for(const file of ['run-command.cjs','seal-receipts.cjs','verify-final-publication.cjs','seal-final.cjs']){let text=fs.readFileSync(path.join(prior,file),'utf8').replaceAll('CODEX-SF-20261104-WINSOCK-DIAGNOSIS-A01','CODEX-SF-20261104-REGISTRY-READ-EXPERIMENT-A01');fs.writeFileSync(path.join(root,file),text,{flag:'wx'});}
fs.writeFileSync(path.join(root,'journal.jsonl'),JSON.stringify({event:'phase_authorized',utc,mode:'CODEX_DIRECT',run_id:'CODEX-SF-20261104-REGISTRY-READ-EXPERIMENT-A01',user_reply:'批准仅合成实验',prior_run:'CODEX-SF-20261104-WINSOCK-DIAGNOSIS-A01'})+'\n',{flag:'wx'});
console.log(JSON.stringify({prior_members:count,proposal_identity:'PASS',rules:'PASS',inner_exit_code:0}));
