const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const label=process.argv[2];if(!/^build-[a-z0-9-]+$/.test(label||''))throw Error('LABEL');
const dir=path.join(__dirname,label);fs.mkdirSync(dir);const members=[];
const files=['LpacStartupPoc.cs','LpacReadTrace.cs','LpacRegistryReadCapability.cs','LpacRegistryReadCanary.cs','LpacFileBoundaryProbe.cs','LpacNativeWmiCom.cs','LpacNativeBoundaryProbe.cs','LpacNetworkAndUncFixture.cs','LpacUncProbe.cs','LpacJobNotifications.cs','LpacResourceProbe.cs','LpacAliasFixture.cs','LpacLoopbackFixture.cs','LpacFileAclAttack.cs','LpacOwnedRegistryGuard.cs','LpacPrivateRegistryChild.cs','LpacPrivateRegistryChild.exe','LpacRegistryReadPoc.exe'];
files.push('LpacProbeJson.cs');
files.push('LpacParentLifetime.cs');
files.push('LpacNodeFileProbe.cs');
files.push('LpacSingleProcessProbe.cs','LpacSingleProcessNative.exe');
for(const file of files){
  const source=file.endsWith('.exe')?path.resolve('.tmp/verification-lpac-build',file):path.resolve('packages/daemon-core/src/verification/windows',file);
  const bytes=fs.readFileSync(source);fs.writeFileSync(path.join(dir,file),bytes,{flag:'wx'});
  members.push({source,file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
if(label==='build-single-process-bypass-30')for(const file of ['run-single-process-host-control.cjs','single-process-experiment-plan.md','typescript-file-experiment-plan.md']){const source=path.join(__dirname,file),bytes=fs.readFileSync(source);fs.writeFileSync(path.join(dir,file),bytes,{flag:'wx'});members.push({source,file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
fs.writeFileSync(path.join(dir,'identity.json'),JSON.stringify({utc:new Date().toISOString(),hash_domain:'raw filesystem bytes',members},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({build:label,members:members.length,inner_exit_code:0}));
