const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const name=process.argv[2];if(!/^build-[a-z0-9-]+$/.test(name))throw Error('SNAPSHOT_NAME');
const root=path.join(__dirname,'builds',name);fs.mkdirSync(root,{recursive:false});
const members=['packages/daemon-core/src/verification/windows/LpacStartupPoc.cs','.tmp/verification-lpac-build/LpacStartupPoc.exe'];
const receipt={utc:new Date().toISOString(),members:[]};
for(const source of members){const bytes=fs.readFileSync(source),target=path.join(root,path.basename(source));fs.writeFileSync(target,bytes,{flag:'wx'});receipt.members.push({source,file:path.basename(source),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
fs.writeFileSync(path.join(root,'identity.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));
