const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const target='C:/Users/lyq/AppData/Local/Temp/sf-conformance-business-R6ttE7';
const sha=raw=>crypto.createHash('sha256').update(raw).digest('hex');
const files=[];
function capture(relative){const full=path.join(target,relative),s=fs.lstatSync(full);if(s.isSymbolicLink())throw Error('LINK');if(s.isDirectory()){for(const n of fs.readdirSync(full).sort())capture(relative+'/'+n)}else{const raw=fs.readFileSync(full);files.push({path:relative,size:raw.length,sha256:sha(raw),bytes_base64:raw.toString('base64')})}}
capture('.specforge/project');
capture('.specforge/archive/agent_runs/WI-0001-orchestrator-wrapup');
const before=JSON.parse(fs.readFileSync(path.join(__dirname,'business-filesystem-branches-created.json')));
const after=JSON.parse(fs.readFileSync(path.join(__dirname,'business-filesystem-final.json')));
const baseline=Buffer.from(before.files.find(f=>f.path==='README.md').bytes_base64,'base64');
const readme=Buffer.from(after.files.find(f=>f.path==='README.md').bytes_base64,'base64');
const expected=['README.md','package.json','src/greet.ts','tests/greet.test.ts','tsconfig.json'];
const tree=after.tree_raw.split('\0').filter(Boolean).map(line=>{const match=line.match(/^(\d+) blob ([a-f0-9]{40})\t(.+)$/s);if(!match)throw Error('TREE_KIND');return {mode:match[1],oid:match[2],path:match[3]}});
const artifactFacts={readme_prefix_123_bytes_exact:baseline.length===123&&readme.subarray(0,123).equals(baseline),business_inventory_exact:after.business_inventory.map(f=>f.path).sort().join('\n')===expected.join('\n'),commit_exact_five_paths:tree.map(f=>f.path).sort().join('\n')===expected.join('\n'),committed_blobs_match_observed_bytes:tree.every(item=>{const raw=Buffer.from(after.files.find(f=>f.path===item.path).bytes_base64,'base64');return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${raw.length}\0`),raw])).digest('hex')===item.oid}),commit_parent_is_original:after.commit_raw.split('\n').filter(line=>line.startsWith('parent ')).join('\n')==='parent 8a692e88c0823984647622294f5199c18bb0c587'};
if(Object.values(artifactFacts).some(value=>!value))throw Error('FORENSIC_ARTIFACT_MISMATCH');
const manifest=JSON.parse(Buffer.from(files.find(f=>f.path==='.specforge/project/spec_manifest.json').bytes_base64,'base64'));
const result={utc:new Date().toISOString(),target,files,project_manifest:manifest,artifact_facts:artifactFacts,scope:'Read-only filesystem/Git-object forensics; no business source import, test, build, typecheck, or behavioral execution. These facts do not satisfy Task verification command exits.',inner_exit_code:0};
fs.writeFileSync(path.join(__dirname,'final-original-observation.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({files:files.length,artifact_facts:artifactFacts,project_manifest:manifest,inner_exit_code:0}));
