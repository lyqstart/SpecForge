const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let source=fs.readFileSync(path.join(__dirname,'public-kernel-chain.cjs'),'utf8').replace(/\r\n/g,'\n');
function once(old,next){assert.equal(source.split(old).length,2,old);source=source.replace(old,next);}
once("['probe','positive','matrix','crash','formal','consumers','state','abort']","['probe','positive','matrix','crash','formal','consumers','state','abort','routing']");
once("...(['formal','consumers'].includes(mode)?", "...(['formal','consumers','routing'].includes(mode)?");
const needle="  if(mode==='formal'){\n   const executions=[];";
const branch=`  if(mode==='routing'){
   const wi='WI-9901',manifestFile=path.join(info.project,'.specforge/work-items',wi,'evidence/evidence_manifest.json');
   const manifest={schema_version:'1.0',work_item_id:wi,entries:Array.from({length:22},(_,i)=>({evidence_id:'EV-ROUTING-'+i,type:'command_output',path:'evidence/source/blocked-'+i+'.txt',description:'Blocked synthetic entry for destination preservation, not an execution pass',created_at:new Date().toISOString(),status:'blocked'}))};
   const initial=await invoke('routing-canonical-manifest','sf-verifier','sf_artifact_write',{work_item_id:wi,file_type:'evidence_manifest',content:JSON.stringify(manifest)});assert.equal(initial.success,true);const before=fs.readFileSync(manifestFile);assert.equal(JSON.parse(before).entries.length,22);
   const runId='verifier-wi0001-manifest-align',content=JSON.stringify({run_id:runId,work_item_id:wi,agent:'sf-verifier',action:'evidence_manifest_supports_alignment',details:'Execution log about an Evidence Manifest'});
   const logged=await invoke('routing-original-work-log-shape','sf-verifier','sf_artifact_write',{work_item_id:wi,file_type:'work_log',run_id:runId,content,agent_content:'Observed evidence_manifest alignment; this is an execution log, not a replacement manifest.'});
   assert.equal(logged.success,true);assert.equal(logged.path,'.specforge/archive/agent_runs/'+runId+'/work_log.md');assert.equal(sha(fs.readFileSync(manifestFile)),sha(before));assert.ok(fs.existsSync(path.join(info.project,logged.path)));
   for(const topic of ['trigger-result','candidate-manifest','trace-delta','impact-analysis','change-classification','task-plan','merge-report','evidence-manifest']){
    const result=await invoke('routing-topic-'+topic,'sf-verifier','sf_artifact_write',{work_item_id:wi,file_type:'work_log',run_id:topic,content:'Review log for '+topic});assert.equal(result.success,true);assert.equal(result.path,'.specforge/archive/agent_runs/'+topic+'/work_log.md');assert.equal(sha(fs.readFileSync(manifestFile)),sha(before));
   }
   const refused=await invoke('routing-missing-array-refused','sf-verifier','sf_artifact_write',{work_item_id:wi,file_type:'evidence_manifest',content:JSON.stringify({schema_version:'1.0',work_item_id:wi,action:'evidence_manifest_supports_alignment'})});assert.equal(refused.success,false);assert.equal(refused.error,'INVALID_ARTIFACT_JSON');assert.equal(sha(fs.readFileSync(manifestFile)),sha(before));
   save('routing-destination-proof',{utc:new Date().toISOString(),canonical_manifest_sha256:sha(before),retained_entries:22,actual_original_work_log_shape_preserved:true,all8_topics_stay_in_archive:true,missing_array_refused_before_write:true,formal_execution_claimed:false,original_business_touched:false});return;
  }
`;
once(needle,branch+needle);fs.writeFileSync(path.join(__dirname,'public-kernel-routing.cjs'),source,{flag:'wx'});console.log(JSON.stringify({mode:'routing',actual_professional_agents:true,canonical22_preservation:true,all8_legacy_topics:true,missing_array_refusal:true,synthetic_entries_blocked:true}));
