const fs=require('fs'),path=require('path'),zlib=require('zlib'),assert=require('assert/strict'),cp=require('child_process');
const phase=process.argv[2],evidence=path.join(__dirname,'http-audit-final'),root=path.join(evidence,'fixture');
const config=path.join(root,'.specforge/config/project.json'),runtime=path.join(root,'.specforge/runtime');
const records=[];let handshake;
function restore(name){const snapshot=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(evidence,name+'.json.gz'))));assert.equal(path.dirname(root),evidence);fs.rmSync(root,{recursive:true,force:true});fs.mkdirSync(root);for(const [n,b]of Object.entries(snapshot)){const f=path.join(root,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,Buffer.from(b,'base64'));}}
async function read(label){const response=await fetch(`http://127.0.0.1:${handshake.port}/api/v1/tool/invoke`,{method:'POST',headers:{Authorization:'Bearer '+handshake.token,'Content-Type':'application/json'},body:JSON.stringify({tool:'sf_state_read',args:{work_item_id:'all'},context:{directory:root,agent:'sf-orchestrator'}})});const body=await response.json();records.push({label,utc:new Date().toISOString(),status:response.status,body});if(response.status===500){assert.equal(body.success,false);assert.equal(body.error.code,'TOOL_ERROR');assert.match(body.error.message,/^WAL_/);return{success:false,error:body.error.message};}assert.equal(response.status,200);return body.data;}
async function main(){handshake=JSON.parse(fs.readFileSync('C:/Users/lyq/.config/opencode/sf-user/runtime/handshake.json'));const health=await(await fetch(`http://127.0.0.1:${handshake.port}/health`)).json();records.push({pid:handshake.pid,health});assert.equal(health.data.version,'1.0.18');
 if(phase==='before-restart'){
   restore('baseline');const normal=await read('installed normal active configuration');assert.equal(normal.work_items['WI-0001'].current_state,'intake_ready');
   fs.renameSync(path.join(runtime,'events.jsonl'),path.join(runtime,'events.original'));fs.writeFileSync(config,JSON.stringify({schema_version:'1.0',timeoutMs:10000}));
   const activation=fs.readFileSync(path.join(runtime,'configuration-activation.json')),state=fs.readFileSync(path.join(runtime,'state.json'));
   assert.match((await read('installed missing history live')).error,/WAL_|SCHEMA_/);assert.deepEqual(fs.readFileSync(path.join(runtime,'configuration-activation.json')),activation);assert.deepEqual(fs.readFileSync(path.join(runtime,'state.json')),state);
 }else{
   assert.match((await read('installed missing history after actual daemon restart')).error,/WAL_|SCHEMA_/);
   restore('baseline');assert.equal((await read('installed valid history restored')).work_items['WI-0001'].current_state,'intake_ready');
   const original=fs.readFileSync(path.join(runtime,'events.jsonl'));fs.writeFileSync(path.join(runtime,'events.jsonl'),'{}\n');
   assert.match((await read('installed schema invalid live unchanged configuration')).error,/WAL_|SCHEMA_/);fs.writeFileSync(path.join(runtime,'events.jsonl'),original);
   restore('rotation-before');const rotation=await read('installed five archives normal configuration');assert.equal(rotation.work_items['WI-0001'].current_state,'intake_ready');
   const activation=fs.readFileSync(path.join(runtime,'configuration-activation.json'));fs.writeFileSync(config,JSON.stringify({schema_version:'1.0',timeoutMs:10000}));
   assert.match((await read('installed five archives changed configuration')).error,/CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK/);assert.deepEqual(fs.readFileSync(path.join(runtime,'configuration-activation.json')),activation);
   fs.writeFileSync(config,JSON.stringify({schema_version:'1.0',timeoutMs:2000}));assert.equal((await read('installed final valid read')).work_items['WI-0001'].current_state,'intake_ready');
 }
 records.push({verdict:'PASS'});
}
main().catch(error=>{records.push({failure:error.stack});process.exitCode=1}).finally(()=>{fs.writeFileSync(path.join(__dirname,'installed-consumer-'+(process.argv[3]??phase)+'.json'),JSON.stringify({utc:new Date().toISOString(),exit_code:process.exitCode??0,records},null,2),{flag:'wx'});console.log(JSON.stringify({phase,exit_code:process.exitCode??0}));});
