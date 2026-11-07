const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),file=path.join(root,'.tmp/verification-lpac-build/NativeProductPlanRegression.exe');
const raw=fs.readFileSync(file),sha=crypto.createHash('sha256').update(raw).digest('hex');
fs.writeFileSync(path.join(__dirname,'NativeProductPlanRegression-stale-0053.exe'),raw,{flag:'wx'});
const result={utc:new Date().toISOString(),compile_receipt:'0052',compile_exit:1,subsequent_receipt:'0053',status:'UNQUALIFIED_STALE_EXECUTABLE',binary_sha256:sha,profile_created:false,application_executed:false,meaning:'Actual parser harness result only; does not qualify current source. New compiler exit and source/binary identity required before a new execution.'};
fs.writeFileSync(path.join(__dirname,'stale-harness-0053.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
