import {describe,it,expect,beforeEach,afterEach} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {getHandler} from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-contract-register';
import {ensureProjectInit} from '../../src/tools/lib/sf_project_init_core';
import {setHardStop} from '../../src/tools/lib/hard-stop-latch';
import {validateCurrentCandidateManifestValue} from '@specforge/types';

describe('registered current Contract Candidate owner',()=>{
 let root:string,wi:string,state:string|null;
 const handler=getHandler('sf_contract_register')!;
 const entry={id:'PhotoStatus',owner_module:'CORE',value_type:'string',values:['pending','done']};
 const args={work_item_id:'WI-0001',action:'add',kind:'shared_enum',entry};
 const context=()=>({directory:root,agent:'sf-orchestrator'});
 const deps=()=>({projectManager:{getProjectStateManager:async()=>({getState:async()=>state})}} as any);
 const invoke=(input:Record<string,unknown>=args,ctx=context())=>handler(input,ctx,deps()) as Promise<any>;
 async function snapshot(){const files:Record<string,string>={};async function visit(dir:string){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await visit(p);else files[path.relative(root,p)]=(await fs.readFile(p)).toString('base64');}}await visit(root);return files;}
 beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'sf-current-contract-owner-'));await ensureProjectInit(root,{ensureHostProfile:async()=>{}});wi=path.join(root,'.specforge/work-items/WI-0001');await fs.mkdir(wi,{recursive:true});await fs.writeFile(path.join(wi,'work_item.json'),JSON.stringify({schema_version:'1.1',work_item_id:'WI-0001',workflow_type:'feature_spec',workflow_path:'contract_change_path',code_change_allowed:false,allowed_write_files:[]}));state='candidate_preparing';});
 afterEach(async()=>{await fs.rm(root,{recursive:true,force:true});});
 it('authors cumulative current feature_spec contracts without changing formal Registry or workflow identity',async()=>{
  const live=await fs.readFile(path.join(root,'.specforge/project/extension_registry.json'));
  expect((await invoke()).success).toBe(true);
  const first=JSON.parse(await fs.readFile(path.join(wi,'candidate_manifest.json'),'utf8'));
  expect(first.workflow_type).toBe('feature_spec');expect(first.workflow_path).toBe('contract_change_path');expect(validateCurrentCandidateManifestValue(first,'WI-0001').valid).toBe(true);
  expect((await invoke({...args,entry:{...entry,id:'OtherStatus'}})).success).toBe(true);
  const candidate=JSON.parse(await fs.readFile(path.join(wi,'candidates/project/extension_registry.json'),'utf8'));
  expect(candidate.contracts.shared_enums.map((e:any)=>e.id)).toEqual(['PhotoStatus','OtherStatus']);
  expect(await fs.readFile(path.join(root,'.specforge/project/extension_registry.json'))).toEqual(live);
  expect((await invoke({work_item_id:'WI-0001',action:'reset'})).success).toBe(true);
  expect(JSON.parse(await fs.readFile(path.join(wi,'candidate_manifest.json'),'utf8')).workflow_type).toBe('feature_spec');
 });
 it.each(['sf-design','sf-executor','unknown'])('rejects caller %s before any write',async agent=>{const before=await snapshot();expect((await invoke(args,{directory:root,agent})).error).toBe('CONTRACT_REGISTER_ORCHESTRATOR_ONLY');expect(await snapshot()).toEqual(before);});
 it.each(['candidate_prepared','approval_required','closed',null])('rejects immutable or unavailable authoritative state %s',async value=>{state=value;const before=await snapshot();expect((await invoke()).success).toBe(false);expect(await snapshot()).toEqual(before);});
 it.each(['promote','repair_relocate_to_module'])('refuses unshipped action %s',async action=>{const before=await snapshot();expect((await invoke({...args,action})).error).toBe('UNSUPPORTED_CURRENT_RELEASE_CONTRACT_ACTION');expect(await snapshot()).toEqual(before);});
 it('refuses HardStop and a forged caller-selected path without rewriting evidence',async()=>{const before=await snapshot();expect((await invoke({...args,workflow_path:'architecture_change_path'})).error).toBe('CONTRACT_REGISTER_WORKFLOW_PATH_MISMATCH');expect(await snapshot()).toEqual(before);setHardStop(root,'WI-0001','synthetic owner boundary','sf_safe_bash');const stopped=await snapshot();expect((await invoke()).hard_stop).toBe(true);expect(await snapshot()).toEqual(stopped);});
 it('rejects unknown Registry schemas and mismatched Candidate identity without normalization',async()=>{const p=path.join(root,'.specforge/project/extension_registry.json'),raw=await fs.readFile(p,'utf8');await fs.writeFile(p,raw.replace('"schema_version": "1.0"','"schema_version": "999"'));const before=await snapshot();expect((await invoke()).success).toBe(false);expect(await snapshot()).toEqual(before);});
 it('refuses a retained workflow Candidate instead of converting it to the current workflow',async()=>{await fs.writeFile(path.join(wi,'candidate_manifest.json'),JSON.stringify({schema_version:'1.0',work_item_id:'WI-0001',workflow_type:'contract_change',workflow_path:'contract_change_path',candidate_phase:'full',base_spec_version:'PSV-0001',merge_required:true,entries:[]}));const before=await snapshot();expect((await invoke()).error).toBe('CURRENT_CONTRACT_CANDIDATE_SUBJECT_MISMATCH');expect(await snapshot()).toEqual(before);});
 it('rejects a linked candidate directory without touching its external target',async()=>{const external=path.join(root,'external');await fs.mkdir(external);await fs.writeFile(path.join(external,'sentinel'),'keep');await fs.symlink(external,path.join(wi,'candidates'),process.platform==='win32'?'junction':'dir');expect((await invoke()).error).toBe('CONTRACT_REGISTER_LINK_REFUSED');expect(await fs.readFile(path.join(external,'sentinel'),'utf8')).toBe('keep');expect(await fs.readdir(external)).toEqual(['sentinel']);});
});
