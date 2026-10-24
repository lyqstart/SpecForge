const fs=require('fs'),path=require('path'),assert=require('assert/strict');const prior='D:/code/SpecForge/.tmp/final-six-acceptance-20261024';
for(const f of ['prepare-fixtures.ts','privacy.ts','real-provider.ts','original-governance.ts','offline.ts'])fs.writeFileSync(path.join(__dirname,f),fs.readFileSync(path.join(prior,f)),{flag:'wx'});
let s=fs.readFileSync(path.join(prior,'integrated-v2.cjs'),'utf8');assert.ok(s.includes("version,'1.0.19'"));s=s.replace("version,'1.0.19'","version,'1.0.20'");
const old=`'node -e "const t=Date.now();while(Date.now()-t<3500){};console.log(12345)"'`;assert.ok(s.includes(old));s=s.replace(old,"'Start-Sleep -Milliseconds 3500'");s=s.replace('assert.match(result.stdout,/12345/);','assert.equal(result.stdout,\'\');');s=s.replace("'integrated-'+phase+'-v2.json'","'integrated-'+phase+'.json'");
fs.writeFileSync(path.join(__dirname,'integrated.cjs'),s,{flag:'wx'});
console.log('Copied independent original acceptance fixtures; changed only expected product version and replaced now-unavailable arbitrary program with internal wait for config timeout consumption. All state/fault/hash assertions retained.');
