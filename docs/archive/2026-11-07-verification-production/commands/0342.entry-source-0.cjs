const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const attempt=process.argv[2];assert.match(attempt,/^\d{2}$/);const dir=path.join(__dirname,'original-verification-run-'+attempt),baseline=JSON.parse(fs.readFileSync(path.join(dir,'original-session-baseline.json')));
async function get(route){const r=await fetch('http://127.0.0.1:4096'+route+'?directory='+encodeURIComponent(baseline.directory),{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);return r.json();}
(async()=>{
 const children=await get('/session/'+baseline.session+'/children'),statuses=await get('/session/status'),records=[],activity=[];
 for(const id of[baseline.session,...children.map(x=>x.id)]){
  const messages=await get('/session/'+id+'/message');
  activity.push({session:id,messages:messages.length,last_message_role:messages.at(-1)?.info?.role,last_parts:(messages.at(-1)?.parts||[]).map(p=>({type:p.type,tool:p.tool,status:p.state?.status,text_characters:typeof p.text==='string'?p.text.length:undefined})),last_tools:messages.flatMap(m=>(m.parts||[]).filter(p=>p.type==='tool').map(p=>({tool:p.tool,status:p.state?.status,input_path:p.tool==='read'?p.state?.input?.filePath:undefined}))).slice(-3)});
  for(const m of messages)for(const p of m.parts||[])if(p.type==='tool'&&/^sf_(?:artifact_write|handoff|gate_run|verification_gate|state_transition|semantic_closure_run|trace_matrix|changed_files_audit|close_gate)$/.test(p.tool)){
   let result;try{result=JSON.parse(p.state?.output||'null');}catch{result={unparsed:true};}
   records.push({session:id,agent:m.info.agent,message:m.info.id,call_id:p.callID,tool:p.tool,status:p.state?.status,input:p.state?.input,result,error:p.state?.error});
  }
 }
 const value={utc:new Date().toISOString(),sessions:[baseline.session,...children.map(x=>x.id)].map(id=>({id,status:statuses[id]||{type:'idle'}})),activity,records,scope:'Read-only local Kernel projection; actual tool data, not proof that full Gates passed'};
 const name='artifact-tool-observation-'+Date.now()+'.json';fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({snapshot:name,active_sessions:value.sessions.filter(s=>s.status.type!=='idle'),activity,recent:records.slice(-8).map(r=>({agent:r.agent,tool:r.tool,status:r.status,file_type:r.input?.file_type,action:r.input?.action,success:r.result?.success,error:r.result?.error,native_error:r.error}))}));
})().catch(e=>{console.error(e.name);process.exitCode=1;});
