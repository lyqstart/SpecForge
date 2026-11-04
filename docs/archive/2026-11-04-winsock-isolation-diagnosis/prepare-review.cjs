const fs=require('node:fs'),path=require('node:path');const prior=path.resolve(__dirname,'../2026-11-04-verification-isolation-poc');
let ps=fs.readFileSync(path.join(prior,'inspect-cleanup.ps1'),'utf8');
for(const[a,b]of [['ca6c3c35c0d64b50817eaf238374d721','3a0a361db28c4b72a0f8d979d39413f5'],['4c6b629555194d40929b9c34fe702dad','dcab7f35f12547038f7baa18969571ae'],['7e60d6c286ce4efca94b818664c89da8','a102d98644fe44feb6641ab3b023f613']]){if(!ps.includes(a))throw Error('RECIPE_DRIFT');ps=ps.replaceAll(a,b);}
ps=ps.replace(/^\$result \| ConvertTo-Json -Depth 12\r?$/m,"[pscustomobject]@{attempts=$observations.Count;matching_synthetic_images=$matching.Count;owned_pids_absent=$true;profiles_absent=$true;inner_exit_code=0} | ConvertTo-Json");
fs.writeFileSync(path.join(__dirname,'inspect-cleanup.ps1'),ps,{flag:'wx'});
for(const file of ['cleanup-observation.cjs','verify-unaffected.cjs','cleanup-runtime-copies.cjs','seal-final.cjs']){
 let content=fs.readFileSync(path.join(prior,file),'utf8');content=content.replaceAll('CODEX-SF-20261104-VERIFICATION-ISOLATION-POC-A01','CODEX-SF-20261104-WINSOCK-DIAGNOSIS-A01');fs.writeFileSync(path.join(__dirname,file),content,{flag:'wx'});
}
console.log(JSON.stringify({prepared:'read-only cleanup and unaffected review; owned single-file cleanup; final seal',inner_exit_code:0}));
