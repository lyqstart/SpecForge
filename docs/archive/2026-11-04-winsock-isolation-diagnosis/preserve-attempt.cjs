const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const name=process.argv[2];if(!/^[a-f0-9]{32}$/.test(name))throw Error('NAME');
const src=path.resolve('.tmp/verification-lpac',name),dst=path.join(__dirname,'attempts',name);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.mkdirSync(dst);
const members=[];
for(const file of ['events.jsonl','receipt.json','stdout.bin','stderr.bin','input/positive.cjs']){const raw=fs.readFileSync(path.join(src,file)),out=path.join(dst,file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,raw,{flag:'wx'});members.push({file,bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')});}
const result={utc:new Date().toISOString(),source:src,members};fs.writeFileSync(path.join(dst,'members.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({attempt:name,members:members.length,inner_exit_code:0}));
