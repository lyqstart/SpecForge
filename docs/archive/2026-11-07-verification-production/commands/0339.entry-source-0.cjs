const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const old=fs.readFileSync(path.join(__dirname,'install-private-fixture.cjs'),'utf8'),needle="assert.equal(release.version,'1.0.22')";
assert.equal(old.split(needle).length,2);assert.equal(fs.existsSync(path.join(__dirname,'public-kernel-fixture-17.json')),false);
fs.writeFileSync(path.join(__dirname,'install-private-fixture-1.0.23.cjs'),old.replace(needle,"assert.equal(release.version,'1.0.23')"),{flag:'wx'});
for(const n of ['0065','0150']){const r=JSON.parse(fs.readFileSync(path.join(__dirname,'commands',n+'.command.txt')));console.log(JSON.stringify({seq:n,executable:r.executable,args:r.args}));}
console.log(JSON.stringify({changed:'test harness expected release version only',fixture_label:'17',build_receipt:'0331',release_precheck:'0334'}));
