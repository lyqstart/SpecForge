const fs=require('fs'),path=require('path'),zlib=require('zlib'),assert=require('assert/strict'),cp=require('child_process'),crypto=require('crypto');
const auditName=process.argv[2]??'http-audit', outputName=process.argv[3]??'independent-audit.json';
const root=path.join(__dirname,auditName);const summary=JSON.parse(fs.readFileSync(path.join(root,'results.json'))),checks=[];
const snapshot=name=>Object.fromEntries(Object.entries(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,name+'.json.gz'))))).map(([k,v])=>[k,Buffer.from(v,'base64')]));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const original=snapshot('baseline');
assert.equal(summary.exit_code,0);const starts=summary.records.filter(r=>r.start).map(r=>r.start.pid);assert.equal(new Set(starts).size,12);
for(const fault of ['missing','invalid-schema','whitespace','truncated','rotation']){
 const before=snapshot(fault+'-injected'),after=snapshot(fault+'-after');
 assert.equal(hash(before['.specforge/runtime/configuration-activation.json']),hash(after['.specforge/runtime/configuration-activation.json']));
 if(fault!=='rotation')assert.equal(hash(before['.specforge/runtime/state.json']),hash(after['.specforge/runtime/state.json']));
 for(const phase of ['live','restarted']){
  const r=summary.records.find(r=>r.label===fault+': '+phase+' changed config');assert.equal(r.status,200);assert.equal(r.body.data.success,false);
  assert.match(r.body.data.error,fault==='rotation'?/CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK/:/WAL_|SCHEMA_/);
 }
 checks.push({fault,live_and_restart_rejected:true,activation_unchanged:true,rejected_history_checkpoint_unchanged:fault!=='rotation'});
}
// Independently parse retained raw bytes; do not call the implementation being tested.
const rotated=snapshot('rotation-after');const segments=Object.keys(rotated).filter(p=>/events-.*\.jsonl\.bak$/.test(p)).sort();assert.equal(segments.length,5);
const events=[...segments,'.specforge/runtime/events.jsonl'].flatMap(p=>rotated[p].toString().trim().split('\n').map(JSON.parse));
const states={};for(let i=0;i<events.length;i++){assert.equal(events[i].monotonicSeq,i+1);if(events[i].action==='state.transition')states[events[i].payload.work_item_id]=events[i].payload.to_state;}
assert.equal(states['WI-0001'],'intake_ready');checks.push({independent_segment_count:segments.length,event_count:events.length,states});
for(const r of summary.records.filter(r=>r.label?.includes('normal')||r.label?.includes('restored'))){assert.equal(r.body.data.work_items['WI-0001'].current_state,'intake_ready');assert.equal(r.body.data.rebuilt_from_events,true);}
assert.equal(hash(original['.specforge/runtime/configuration-activation.json']),hash(snapshot('final-normal')['.specforge/runtime/configuration-activation.json']));
const worktree=path.resolve(__dirname,'../runtime-history-worktree');
const changed=cp.execFileSync('git',['diff','04a6880c4cf8b8bf69e461cc447effe4058b7297','HEAD','--name-only'],{cwd:worktree,encoding:'utf8'}).trim().split('\n');
const sources=changed.map(file=>{const committed=cp.execFileSync('git',['show','HEAD:'+file],{cwd:worktree,maxBuffer:100*1024*1024});const working=fs.readFileSync(path.join(worktree,file));assert.equal(committed.toString().replaceAll('\r\n','\n'),working.toString().replaceAll('\r\n','\n'));return{file,working_sha256:hash(working),committed_sha256:hash(committed)};});
const result={utc:new Date().toISOString(),status:'PASS',method:'independent raw HTTP and snapshot parsing; no WAL or StateManager imports',checks,sources,limits:['No reconstruction of physically deleted authoritative bytes is claimed.','All history segments must be retained; storage compaction is not implemented.','This audit covers the confirmed history defects; it is not a proof of absence of every product defect.']};
fs.writeFileSync(path.join(__dirname,outputName),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({status:'PASS',checks:checks.length,source_files:sources.length}));
