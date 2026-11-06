const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const prior=path.resolve(__dirname,'../2026-11-05-synthetic-boundary-matrix'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),manifest=new Map(fs.readFileSync(path.join(prior,'manifest.sha256'),'utf8').trimEnd().split('\n').map(l=>[l.slice(66),l.slice(0,64)])),proof=[];
function copy(file,replacements=[]){const raw=fs.readFileSync(path.join(prior,file));if(sha(raw)!==manifest.get(file))throw Error('PRIOR_DRIFT:'+file);let s=raw.toString();for(const[a,b,n]of replacements){if(s.split(a).length-1!==n)throw Error('COUNT:'+file+':'+a);s=s.split(a).join(b);}const out=path.join(__dirname,file);fs.writeFileSync(out,s.replace(/\r\n/g,'\n'),{flag:'wx'});proof.push({file,prior_sha256:sha(raw),current_sha256:sha(fs.readFileSync(out)),replacements:replacements.map(([from,to,count])=>({from,to,count}))});}
copy('SyntheticLauncherCrash.cs',[
 ['"2026-11-05-synthetic-boundary-matrix","build-crash-owner-21"','"2026-11-06-single-process-matrix","build-single-resource-06"',1],
 ['--synthetic-resource-crash ','--synthetic-single-resource-crash ',1],
 ['Convert.ToInt32(data["ready_node_roles"])==3','Convert.ToInt32(data["ready_node_roles"])==1',1],
 ['role>=0&&role<=2','role==0',1],['roles.Count==3&&roles.Values.Distinct().Count()==3','roles.Count==1&&roles.Values.Distinct().Count()==1',1]
]);
copy('SyntheticDaemonCrash.cs',[
 ['daemon-fixture-build-05','daemon-fixture-build-07',1],['2026-11-05-synthetic-boundary-matrix','2026-11-06-single-process-matrix',1],
 ['role>=0&&role<=2','role==0',1],['roles.Count==3&&roles.Values.Distinct().Count()==3','roles.Count==1&&roles.Values.Distinct().Count()==1',1],
 ['brokerExit==1&&Convert.ToInt32(receipt["inner_exit_code"])==1','brokerExit==1&&(string)receipt["profile_id"]=="windows-lpac-node-single-process-readonly/v1"&&Convert.ToInt32(receipt["inner_exit_code"])==1',1]
]);
copy('real-daemon-harness.ts',[
 ['docs/archive/2026-11-05-synthetic-boundary-matrix/build-daemon-owner-22/','docs/archive/2026-11-06-single-process-matrix/build-single-resource-06/',1],
 ['--synthetic-resource-daemon-crash','--synthetic-single-resource-daemon-crash',1]
]);
for(const file of ['freeze-daemon-fixture.cjs','preserve-crash-attempt.cjs','preserve-daemon-attempt.cjs'])copy(file);
fs.writeFileSync(path.join(__dirname,'single-lifecycle-source-provenance.json'),JSON.stringify({utc:new Date().toISOString(),proof,scope:'Fresh current D22 single-process lifecycle; no old matrix success reused'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({copied:proof.length,inner_exit_code:0}));
