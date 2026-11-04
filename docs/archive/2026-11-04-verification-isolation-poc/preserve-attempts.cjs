const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'attempts');fs.mkdirSync(root);
const names=['ca6c3c35c0d64b50817eaf238374d721','4c6b629555194d40929b9c34fe702dad','7e60d6c286ce4efca94b818664c89da8'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const results=[];
for(const name of names){const src=path.resolve('.tmp/verification-lpac',name),dst=path.join(root,name);fs.mkdirSync(dst);
 const files=['events.jsonl','receipt.json','stdout.bin','stderr.bin','input/positive.cjs'];const members=[];
 for(const file of files){const raw=fs.readFileSync(path.join(src,file)),out=path.join(dst,file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,raw,{flag:'wx'});members.push({file,sha256:hash(raw),bytes:raw.length});}
 const exe=path.join(src,'runtime/node.exe');members.push({file:'runtime/node.exe',sha256:hash(fs.readFileSync(exe)),bytes:fs.statSync(exe).size,not_copied:'Pinned host Node distribution; no redistribution needed; hash remains bound in raw attempt events.'});
 fs.writeFileSync(path.join(dst,'members.json'),JSON.stringify({utc:new Date().toISOString(),source:src,members},null,2)+'\n',{flag:'wx'});results.push({attempt:name,...JSON.parse(fs.readFileSync(path.join(dst,'receipt.json')))});
}
console.log(JSON.stringify({attempts:results.map(r=>({attempt:r.attempt,started:r.process_started,resumed:r.process_resumed,application_exit_code:r.application_exit_code,job_all_ended:r.job_all_ended,result:r.startup_result})),inner_exit_code:0}));
