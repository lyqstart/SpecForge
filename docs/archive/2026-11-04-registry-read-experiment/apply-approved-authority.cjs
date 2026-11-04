const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const prior=path.resolve(__dirname,'../2026-11-04-winsock-isolation-diagnosis'),auth=JSON.parse(fs.readFileSync(path.join(__dirname,'authorization.json')));
if(auth.user_reply!=='批准仅合成实验'||auth.proposal_sha256!=='d342fc7d4fc466f423c939f31da7559222a1956d4cfa4d7a5ec20fd484cc317c')throw Error('APPROVAL_BINDING');
const identity=JSON.parse(fs.readFileSync(path.join(prior,'proposed-authority/identity.json'))),writes=[];
for(const item of identity.files){const current=fs.readFileSync(item.file),candidate=fs.readFileSync(path.join(prior,'proposed-authority',path.basename(item.file)));if(sha(current)!==item.baseline_sha256||sha(candidate)!==item.proposed_sha256)throw Error('AUTHORITY_BASELINE_DRIFT');writes.push({item,current,candidate});}
fs.mkdirSync(path.join(__dirname,'authority'));
for(const entry of writes){const basename=path.basename(entry.item.file);fs.writeFileSync(path.join(__dirname,'authority',basename+'.before'),entry.current,{flag:'wx'});fs.writeFileSync(entry.item.file,entry.candidate);if(sha(fs.readFileSync(entry.item.file))!==entry.item.proposed_sha256)throw Error('AUTHORITY_READBACK');fs.writeFileSync(path.join(__dirname,'authority',basename+'.approved'),entry.candidate,{flag:'wx'});}
const result={utc:new Date().toISOString(),user_reply:auth.user_reply,proposal_sha256:auth.proposal_sha256,files:identity.files,source:'Exact reviewed D21 candidate; product self-development only; no business truth writes.',inner_exit_code:0};
fs.writeFileSync(path.join(__dirname,'authority-applied.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
