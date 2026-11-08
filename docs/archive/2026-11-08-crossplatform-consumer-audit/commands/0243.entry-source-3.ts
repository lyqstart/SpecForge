import {describe,it,expect} from 'vitest';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {CURRENT_RELEASE_WORKFLOW_TYPE} from '@specforge/types';
import {getHandler} from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-state-transition';import '../../src/tools/handlers/sf-v11-gate-run';import '../../src/tools/handlers/sf-requirements-gate';import '../../src/tools/handlers/sf-verification-gate';
import {projectReleaseAuthority} from '../../../scope-gate/src/release-authority-projection';
import {WorkflowLoader} from '../../../workflow-runtime/src/engine/WorkflowLoader';
const root=path.resolve(import.meta.dirname,'../../../..');
describe('registered current workflow identity and Gate strategy boundaries',()=>{
 it('matches the actual builtin and the independently declared SPS current release',async()=>{
  const file='docs/product-specification/specforge-product-specification.md',authority=projectReleaseAuthority({releaseId:'specforge-current',productSpecification:{path:file,content:await fs.readFile(path.join(root,file),'utf8')}});
  expect(authority.ok,authority.errors.join(';')).toBe(true);
  const declared=authority.document!.items.filter(i=>i.id.startsWith('workflow:')&&i.classification.startsWith('CURRENT')).map(i=>i.id.slice('workflow:'.length));
  expect(declared).toEqual([CURRENT_RELEASE_WORKFLOW_TYPE]);
  const loaded=await new WorkflowLoader().loadBuiltinWorkflows(path.join(root,'configs/workflows/builtin'));expect(loaded.map(d=>d.id)).toEqual(declared);
 });
 it('refuses every SPS built-not-enabled workflow at public state/Gate entry before filesystem mutation',async()=>{
  const file='docs/product-specification/specforge-product-specification.md',authority=projectReleaseAuthority({releaseId:'specforge-current',productSpecification:{path:file,content:await fs.readFile(path.join(root,file),'utf8')}});expect(authority.ok).toBe(true);
  const disabled=authority.document!.items.filter(i=>i.id.startsWith('workflow:')&&i.classification==='BUILT_NOT_ENABLED');expect(disabled.length).toBeGreaterThan(0);
  const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'sf-current-wf-boundary-'));try{await fs.writeFile(path.join(fixture,'sentinel'),'keep');for(const item of disabled)for(const name of ['sf_state_transition','sf_v11_gate_run']){const result:any=await getHandler(name)!({work_item_id:'WI-0001',workflow_type:item.id.slice('workflow:'.length),from_state:'intake_ready',to_state:'impact_analyzing'},{directory:fixture,agent:'sf-orchestrator'},{} as any);expect(result.error,item.id+name).toBe('UNSUPPORTED_CURRENT_RELEASE_WORKFLOW');}expect(await fs.readdir(fixture)).toEqual(['sentinel']);expect(await fs.readFile(path.join(fixture,'sentinel'),'utf8')).toBe('keep');}finally{await fs.rm(fixture,{recursive:true,force:true});}
 });
 it.each([['sf_requirements_gate',{mode:'bugfix'}],['sf_requirements_gate',{gate_mode:'investigation'}],['sf_verification_gate',{mode:'ops_task'}],['sf_verification_gate',{gate_mode:'refactor'}],['sf_verification_gate',{required_types:[]}]])('refuses an unsupported standalone strategy override at %s',async(name,args)=>{
  const result:any=await getHandler(name as string)!({work_item_id:'WI-0001',...(args as object)},{directory:os.tmpdir()},{} as any);expect(result.success).toBe(false);expect(result.error).toMatch(/(?:MODE|OVERRIDE)_NOT_CURRENT$/);
 });
});
