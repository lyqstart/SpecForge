import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
const evidence=path.dirname(fileURLToPath(import.meta.url)),directory=path.join(evidence,'deployed-registration-probe'),config='C:/Users/lyq/.config/opencode',source=JSON.parse(fs.readFileSync(path.resolve(evidence,'../../../.registration-patched-a01/release/release-manifest.json'))),sha=b=>crypto.createHash('sha256').update(b).digest('hex');fs.mkdirSync(directory);for(const file of source.installFiles)assert.equal(sha(fs.readFileSync(path.join(config,file.targetPath))),file.sha256,file.targetPath);
const owned=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'sf-plugin-deployed-')),project=path.join(owned,'project');fs.mkdirSync(project);process.chdir(project);process.env.OPENCODE_CONFIG_DIR=config;
const handshake=JSON.parse(fs.readFileSync(path.join(config,'sf-user/runtime/handshake.json'))),realFetch=globalThis.fetch,realLog=console.log,notices=[],requests=[];
console.log=(...args)=>{if(String(args[0]).startsWith('[sf:specforge] '))notices.push(String(args[0]));realLog(...args);};
globalThis.fetch=async(input,init)=>{const url=new URL(String(input));assert.equal(url.hostname,'127.0.0.1');assert.equal(Number(url.port),handshake.port);assert(['/api/v1/ingest/register','/api/v1/ingest/event','/api/v1/v11/write-guard/native','/api/v1/project/ensure','/api/v1/healthz'].includes(url.pathname),'UNEXPECTED_REQUEST_PATH');if(url.pathname==='/api/v1/ingest/register'||url.pathname==='/api/v1/project/ensure')assert.equal(JSON.parse(init.body).projectPath,project);requests.push({path:url.pathname,utc:new Date().toISOString()});return realFetch(input,init);};
try {
 const {default:plugin}=await import(pathToFileURL(path.join(config,'plugins/sf_specforge.ts')).href),hooks=await plugin({directory:project});
 for(let i=0;i<100;i++)await hooks.event({event:{type:'session.updated'}});
 assert.equal(requests.filter(r=>r.path==='/api/v1/ingest/register').length,1);assert.equal(notices.length,1);assert(notices[0].includes('sf_project_init'));assert(!/unavailable|reconnecting/.test(notices[0]));assert.deepEqual(fs.readdirSync(project),[]);
 const {default:initialize}=await import(pathToFileURL(path.join(config,'tools/sf_project_init.ts')).href);
 await hooks['tool.execute.before']({tool:'sf_project_init',sessionID:'owned-deployment-probe',callID:'owned-init'},{args:{}});
 const output=await initialize.execute({}, {directory:project,worktree:project,sessionID:'owned-deployment-probe',messageID:'owned-message',agent:'sf-orchestrator',abort:new AbortController().signal});assert.equal(typeof output,'string');
 assert.equal(JSON.parse(fs.readFileSync(path.join(project,'.specforge/project/spec_manifest.json'))).schema_version,'1.0');
 const completion={event:{type:'message.part.updated',properties:{part:{type:'tool',tool:'sf_project_init',sessionID:'owned-deployment-probe',callID:'owned-init',state:{status:'completed'}}}}};await hooks.event(completion);await Promise.all(Array.from({length:30},()=>hooks.event(completion)));await hooks.event({event:{type:'session.updated'}});
 assert.equal(requests.filter(r=>r.path==='/api/v1/ingest/register').length,2);assert.equal(requests.filter(r=>r.path==='/api/v1/project/ensure').length,1);assert.equal(notices.length,2);assert(notices[1].includes('recovered'));
 const result={utc:new Date().toISOString(),classification:'PASS_ACTUAL_INSTALLED_ENTRYPOINT_REAL_DAEMON_CONTROLLED_OWNER_RECOVERY',version:source.version,candidate:source.candidateId,installed_files_exact:source.installFiles.length,owned_fixture:project,daemon_pid:handshake.pid,ordinary_preinit_events:100,initial_registration_requests:1,total_registration_requests:2,controlled_init_requests:1,notifications:notices,requests,real_network:'Only current local daemon API; no provider or model endpoint allowed',limits:'Actual installed plugin and tool entrypoints plus real owner/HTTP. Completed runtime-event fixture follows installed SDK contract; not a new model-generated tool invocation or full UI acceptance. Synthetic project retained; t5/t2/t3/original application untouched.'};fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});realLog(JSON.stringify({classification:result.classification,installed:result.installed_files_exact,registrations:2,notices:2,controlled_init:1}));
}finally{globalThis.fetch=realFetch;console.log=realLog;}
