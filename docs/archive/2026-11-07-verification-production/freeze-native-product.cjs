const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),out=path.join(__dirname,'native-product-build-01'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const seq of ['0051','0055']){const receipt=JSON.parse(fs.readFileSync(path.join(__dirname,'commands',seq+'.result.json')));if(receipt.inner_exit_code!==0)throw Error('BUILD_NOT_QUALIFIED:'+seq);}
fs.mkdirSync(out);const source=path.join(root,'packages/daemon-core/src/verification/windows'),members={};
const inputs=fs.readdirSync(source).filter(name=>name.endsWith('.cs')).sort().map(name=>({file:path.join(source,name),name:'source/'+name}));
inputs.push({file:path.join(__dirname,'NativeProductPlanRegression.cs'),name:'source/NativeProductPlanRegression.cs'},
 {file:path.join(root,'.tmp/verification-lpac-build/specforge-verify.exe'),name:'specforge-verify.exe'},
 {file:path.join(root,'.tmp/verification-lpac-build/NativeProductPlanRegression.exe'),name:'NativeProductPlanRegression.exe'});
for(const item of inputs){const raw=fs.readFileSync(item.file),target=path.join(out,item.name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,raw,{flag:'wx'});if(sha(fs.readFileSync(target))!==sha(raw)||sha(fs.readFileSync(item.file))!==sha(raw))throw Error('FREEZE_DRIFT');members[item.name]={sha256:sha(raw),bytes:raw.length};}
const value={utc:new Date().toISOString(),qualified_compile_receipts:['0051','0055'],entry:'LpacVerificationMain',parser_entry:'NativeProductPlanRegression',application_executed:false,prior_0053:'UNQUALIFIED_STALE_EXECUTABLE',members};
fs.writeFileSync(path.join(out,'build.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({build:'native-product-build-01',members:Object.keys(members).length,launcher_sha256:members['specforge-verify.exe'].sha256,harness_sha256:members['NativeProductPlanRegression.exe'].sha256,application_executed:false}));
