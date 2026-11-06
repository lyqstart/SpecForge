const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const nonce=process.argv[2];if(!/^[a-f0-9]{32}$/.test(nonce||''))throw Error('NONCE');
const source=path.resolve('.tmp/verification-lpac',nonce),destination=path.join(__dirname,'node-file-attempts',nonce);fs.mkdirSync(destination,{recursive:true});
if(fs.existsSync(path.join(destination,'identity.json')))throw Error('COLLISION');const members=[];
const ts=fs.existsSync(path.join(source,'input/positive.mts'));const files=ts?['input/positive.mts','input/fixed-module.mts','input/package.json']:['input/positive.cjs','input/fixed-module.cjs'];
for(const file of [...files,'events.jsonl','receipt.json','stdout.bin','stderr.bin']){const raw=fs.readFileSync(path.join(source,file)),target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,raw,{flag:'wx'});members.push({file,bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')});}
fs.writeFileSync(path.join(destination,'identity.json'),JSON.stringify({utc:new Date().toISOString(),nonce,source,members},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({nonce,members:members.length,inner_exit_code:0}));
