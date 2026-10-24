const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root='D:/code/sf-acceptance-six/.specforge/runtime';
const names=fs.readdirSync(root).filter(n=>n==='events.jsonl'||/^events-.*\.jsonl\.bak$/.test(n));
names.sort((a,b)=>a==='events.jsonl'?1:b==='events.jsonl'?-1:a.localeCompare(b));
const hashes={},events=[];for(const n of names){const b=fs.readFileSync(path.join(root,n));hashes[n]=crypto.createHash('sha256').update(b).digest('hex');events.push(...b.toString().trim().split('\n').map(JSON.parse));}
const gaps=events.flatMap((e,i)=>e.monotonicSeq===i+1?[]:[{index:i,seq:e.monotonicSeq}]);const states={};const badTransitions=[];
for(const e of events)if(e.action==='state.transition'){const id=e.payload.work_item_id??e.projectId;if(e.payload.from_state!==(states[id]??''))badTransitions.push(e.eventId);states[id]=e.payload.to_state;}
const result={utc:new Date().toISOString(),method:'read-only raw file parse, no product APIs',event_count:events.length,gaps,badTransitions,states,hashes};
fs.writeFileSync(path.join(__dirname,'existing-history-audit.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));assert.equal(gaps.length,0);assert.equal(badTransitions.length,0);assert.equal(states['WI-0001'],'closed');
