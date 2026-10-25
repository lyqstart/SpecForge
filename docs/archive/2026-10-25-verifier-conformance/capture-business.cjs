const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const out=__dirname,name=process.argv[2],host=JSON.parse(fs.readFileSync(path.join(out,'resume01-identity.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!name)throw Error('capture id required');const start=new Date().toISOString();
const entries=[];function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){if(d.name==='.git')continue;const full=path.join(dir,d.name);if(d.isSymbolicLink())throw Error('SYMLINK_NOT_CAPTURED');if(d.isDirectory())walk(full);else if(d.isFile()){const b=fs.readFileSync(full);entries.push({path:path.relative(host.work,full).replaceAll('\\','/'),sha256:hash(b),size:b.length,bytes_base64:b.toString('base64')});}}}walk(host.work);
const events=entries.filter(e=>e.path.endsWith('/events.jsonl')||/events-.*\.jsonl\.bak$/.test(e.path)).flatMap(e=>Buffer.from(e.bytes_base64,'base64').toString('utf8').split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s))).filter(e=>e.category==='state');
const status=cp.spawnSync('git',['status','--short'],{cwd:host.work,encoding:'utf8',windowsHide:true});
const record={started_utc:start,finished_utc:new Date().toISOString(),project:host.work,scope:'Read-only point-in-time file collection; active runs may change after capture. State conclusions use retained events, not state.json alone.',git_status:status.stdout,git_exit:status.status,entries,state_events:events};
fs.writeFileSync(path.join(out,`${name}-business-files.json`),JSON.stringify(record,null,2),{flag:'wx'});
console.log(JSON.stringify({files:entries.length,last_state:events.at(-1)?.payload,git_exit:status.status}));
