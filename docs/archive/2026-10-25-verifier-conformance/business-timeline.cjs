const fs=require('node:fs'),path=require('node:path');
const out=__dirname,source=process.argv[2]||'final-sessions.json',data=JSON.parse(fs.readFileSync(path.join(out,source)));
const entries=[];
for(const s of data.sessions)for(const m of s.messages)for(const p of m.parts||[]){
 if(p.type!=='tool'||(!p.tool.startsWith('sf_')&&p.tool!=='task'))continue;
 let result;try{result=JSON.parse(p.state?.output||'');}catch{}
 const started=p.state?.time?.start,ended=p.state?.time?.end;
 entries.push({session:s.session.id,message:m.info?.id,part:p.id,tool:p.tool,started_utc:started?new Date(started).toISOString():null,finished_utc:ended?new Date(ended).toISOString():null,status:p.state?.status,file_type:p.state?.input?.file_type,work_item_id:p.state?.input?.work_item_id,subagent_type:p.state?.input?.subagent_type,child_session:p.state?.metadata?.sessionId,success:result?.success,error:result?.error,hard_stop:result?.hard_stop,path:result?.path,result_status:result?.status,required_agent:result?.required_agent});
}
entries.sort((a,b)=>(a.started_utc||'').localeCompare(b.started_utc||''));
fs.writeFileSync(path.join(out,'business-timeline.json'),JSON.stringify({utc:new Date().toISOString(),source,scope:'Derived tool-result timeline; authoritative workflow state is separately evidenced by Runtime events. Agent prose is not promoted to facts.',entries},null,2),{flag:'wx'});
console.log(JSON.stringify({tool_calls:entries.length,failures:entries.filter(e=>e.success===false||e.status==='error'),last:entries.slice(-6)},null,2));
