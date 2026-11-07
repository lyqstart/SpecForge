const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function prepare(input,output,kind){let text=fs.readFileSync(path.join(__dirname,input),'utf8');const replacements=[];function replace(old,next,count=1){const n=text.split(old).length-1;assert.equal(n,count,old);text=text.split(old).join(next);replacements.push({old,new:next,count:n});}
 replace("'user-installation-upgrade/result.json'","'user-installation-upgrade-1.0.23/result.json'");
 replace("v.version==='1.0.22'","v.version==='1.0.23'");
 replace("JSON.parse(fs.readFileSync(path.join(__dirname,'commands/0235.result.json'))).finished_utc","JSON.parse(fs.readFileSync(path.join(__dirname,'user-installation-upgrade-1.0.23/result.json'))).utc");
 if(kind==='original'){
  replace("assert.equal(installation.version,'1.0.22')","assert.equal(installation.version,'1.0.23')");
  replace("assert.equal(consent.allow_prior_session_history,false);","assert.equal(consent.allow_prior_session_history,false);assert.equal(consent.allow_credentials_or_keys,false);");
 }else{
  replace("'fresh-user-runtime-'+attempt","'fresh-user-runtime-1.0.23-'+attempt");
  const marker="const own=JSON.parse(fs.readFileSync(path.join(__dirname,'public-kernel-fixture-16.json')))";
  replace(marker,"const ownerBefore=ownerSnapshot();save('owner-before-policy-negative',{utc:new Date().toISOString(),members:ownerBefore,key_content_read:false});"+marker);
  replace("assert.equal(fs.existsSync(path.join(config,'sf-user/runtime/verification-owner')),false);","assert.deepEqual(ownerSnapshot(),ownerBefore,'POLICY_NEGATIVE_MUTATED_OWNER');save('owner-after-policy-negative',{utc:new Date().toISOString(),members:ownerSnapshot(),key_content_read:false});");
  const functionText=`\nfunction ownerSnapshot(){const root=path.join(config,'sf-user/runtime/verification-owner'),out={};function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name),s=fs.lstatSync(f),n=path.relative(root,f).replace(/\\\\/g,'/');assert.equal(s.isSymbolicLink(),false);if(s.isDirectory())walk(f);else if(e.name==='owner.key')out[n]={content_not_read:true,size:s.size,ino:s.ino,mtimeMs:s.mtimeMs,birthtimeMs:s.birthtimeMs};else out[n]={size:s.size,sha256:sha(fs.readFileSync(f))};}}walk(root);return out;}\n`;
  text+=functionText;
 }
 fs.writeFileSync(path.join(__dirname,output),text,{flag:'wx'});return {input,output,replacements};}
const value={utc:new Date().toISOString(),drivers:[prepare('verify-fresh-user-runtime.cjs','verify-fresh-user-runtime-1.0.23.cjs','fresh'),prepare('resume-original-verification.cjs','resume-original-verification-1.0.23.cjs','original')],execution_performed:false,privacy:'No owner.key or provider credential contents read; consent and fresh empty external-model session restrictions retained',original_receipts:'Old assets invalidate consumption; future continuation must create fresh formal evidence through current owners'};
fs.writeFileSync(path.join(__dirname,'user-runtime-driver-preparation-1.0.23.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({drivers:value.drivers.map(d=>d.output),execution_performed:false}));
