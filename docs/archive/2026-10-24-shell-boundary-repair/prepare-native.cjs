const fs=require('fs'),path=require('path'),assert=require('assert/strict');let s=fs.readFileSync('D:/code/SpecForge/.tmp/boundary-capability-repair-20261024/installed-native.ts','utf8');
s=s.replaceAll('../boundary-capability-worktree/packages/','../../packages/').replace("version,'1.0.19'","version,'1.0.20'").replaceAll('WI-0001','WI-0002');
const needle="fs.mkdirSync(path.join(root,'.specforge/config'),{recursive:true});fs.writeFileSync(path.join(root,'.specforge/config/project.json'),'{\"schema_version\":\"1.0\"}');";assert.ok(s.includes(needle));s=s.replace(needle,`const originals=JSON.parse((await import('node:zlib')).gunzipSync(fs.readFileSync(path.join(import.meta.dir,'original-before.json.gz'))).toString());
for(const file of originals){if(file.path.startsWith('.specforge/logs/')||file.path.startsWith('.specforge/runtime/logs/'))continue;const dest=path.join(root,file.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,Buffer.from(file.base64,'base64'));}`);
const target="try{\n for(const location";assert.ok(s.includes(target));s=s.replace(target,`try{
 fs.writeFileSync(path.join(root,'active-writer.cjs'),"require('fs').writeFileSync('allowed.txt','BYPASS')");
 fs.writeFileSync(path.join(root,'active-child.cjs'),"require('child_process').execFileSync(process.execPath,['active-writer.cjs'])");
 for(const command of ['node active-writer.cjs','node active-child.cjs']){
  const r=await fetch('http://127.0.0.1:'+handshake.port+'/api/v1/tool/invoke',{method:'POST',headers:{Authorization:'Bearer '+handshake.token,'Content-Type':'application/json'},body:JSON.stringify({tool:'sf_safe_bash',args:{command,work_item_id:'WI-0002'},context:{directory:root,agent:'sf-executor'}})});const raw=await r.text(),body=JSON.parse(raw);records.push({case:'active authorized shell denial',command,status:r.status,raw});assert.equal(body.data.success,false);assert.ok(body.data.policy_violation===true||body.data.rejected===true);assert.equal(fs.existsSync(target),false);
 }
 for(const location`);
fs.writeFileSync(path.join(__dirname,'installed-native.ts'),s,{flag:'wx'});
