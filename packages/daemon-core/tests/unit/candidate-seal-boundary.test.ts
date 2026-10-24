import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { materializeImplementationBaseline, validateImplementationTruthBeforeSeal } from '../../src/tools/lib/implementation-baseline';
import { getHandler } from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-v11-gate-run';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'sf-seal-boundary-')); roots.push(root);
  const wi = join(root, '.specforge/work-items/WI-0001');
  await fs.mkdir(join(wi, 'candidates'), { recursive: true });
  await fs.mkdir(join(root, '.specforge/project'), { recursive: true });
  const put = async (name: string, value: unknown) => fs.writeFile(join(wi, name), typeof value === 'string' ? value : JSON.stringify(value));
  await fs.writeFile(join(root, 'app.js'), 'existing implementation\n');
  await fs.writeFile(join(root, '.specforge/project/spec_manifest.json'), JSON.stringify({schema_version:'1.0', project_spec_version:'PSV-0001'}));
  await put('work_item.json', {schema_version:'1.1', work_item_id:'WI-0001', workflow_type:'feature_spec', workflow_path:'requirement_change_path', code_change_allowed:false, allowed_write_files:[]});
  await put('trigger_result.json', {workflow_type:'feature_spec', workflow_path:'requirement_change_path', impact_scope:{planned_code_paths:['app.js']}});
  await put('impact_analysis.md', '# Impact\n');
  const { baseline } = await materializeImplementationBaseline(root, 'WI-0001');
  const design = async (text: string) => put('candidates/design.candidate.md', `implementation_baseline_id: ${baseline.snapshot_id}\n${text}\n`);
  await design('本设计基于既有实现演进。');
  let state = 'candidate_preparing'; const transitions: string[] = [];
  const manager = { rebuildState: async()=>{}, getState:()=>state, transition:async(_id:string,from:string,to:string)=>{ if(from!==state)throw Error('state mismatch');transitions.push(`${from}->${to}`);state=to; } };
  const deps = { projectManager:{getProjectStateManager:async()=>manager} } as any;
  const invoke = (args: Record<string, unknown>) => getHandler('sf_v11_gate_run')!({work_item_id:'WI-0001',...args},{directory:root,agent:'sf-orchestrator'},deps) as Promise<any>;
  return {root,wi,put,design,baseline,invoke,transitions,setState:(s:string)=>{state=s;}};
}
async function snapshot(dir:string):Promise<Record<string,string>> {
  const result:Record<string,string>={};
  async function visit(p:string) { for(const e of await fs.readdir(p,{withFileTypes:true})){const f=join(p,e.name);if(e.isDirectory())await visit(f);else result[f]=createHash('sha256').update(await fs.readFile(f)).digest('hex');} }
  await visit(dir);return result;
}

describe('affirmative implementation facts',()=>{
  it.each([
    '本设计基于 PSV-0002 既有实现演进，非绿地新建。',
    '> 基线声明：current_file_count=4、all_planned_paths_missing=false，app.js 为既有实现。以已知当前实现为差量基础，不存在「当前实现未知」，无需 design_blocked。',
    '本项目不是绿地项目。',
    '本项目不是一个绿地项目。',
    'This is not a greenfield project.',
    'Current Implementation: not missing; existing app.js is retained.',
    'app.js | 修改 | createApp 工厂保留',
    'app.js: do not create a new file',
  ])('accepts a truthful statement: %s',async text=>{
    const f=await fixture();await f.design(text);
    expect(await validateImplementationTruthBeforeSeal({projectRoot:f.root,workItemId:'WI-0001'})).toMatchObject({valid:true,errors:[]});
  });
  it.each([
    '本项目为绿地新建。', '当前业务实现不存在。', '现有代码缺失。',
    '- **Current Implementation**: none', 'Current Implementation is missing',
    '{"all_files_new":true}', '| app.js | 新建 |', 'app.js: new file',
    '并非绿地新建；当前实现不存在。', '当前实现存在，但现有代码为空。',
  ])('rejects a real contradiction: %s',async text=>{
    const f=await fixture();await f.design(text);
    const r=await validateImplementationTruthBeforeSeal({projectRoot:f.root,workItemId:'WI-0001'});
    expect(r.valid).toBe(false);expect(r.errors.join('\n')).toContain('IMPLEMENTATION_BASELINE_CONTRADICTION');
  });
  it('still rejects binding loss and actual source drift',async()=>{
    const f=await fixture();await f.put('candidates/design.candidate.md','本设计不是绿地新建。');
    expect((await validateImplementationTruthBeforeSeal({projectRoot:f.root,workItemId:'WI-0001'})).errors.join('\n')).toContain('BINDING_INVALID');
    await f.design('现有实现保留。');await fs.writeFile(join(f.root,'app.js'),'changed');
    expect((await validateImplementationTruthBeforeSeal({projectRoot:f.root,workItemId:'WI-0001'})).errors.join('\n')).toContain('BASELINE_STALE');
  });
});

describe('candidate gates cannot perform the seal owner transaction',()=>{
  it.each(['created','intake_ready','impact_analyzing','workflow_selected','candidate_preparing','gates_failed','closed'])('rejects state %s before any attempt/file/state write',async state=>{
    const f=await fixture();f.setState(state);const before=await snapshot(f.root);
    for(const args of [{candidate_phase:'full'},{gate_type:'requirements'},{gate_ids:['candidate_manifest_gate']},{gate_ids:['entry_gate','verification_gate']},{reconcile_attempt_id:'attempt-0001'},...(state==='closed'?[]:[{gate_ids:['verification_gate']},{gate_type:'post_merge'}])]) {
      const r=await f.invoke(args);expect(r.success).toBe(false);expect(r.error).toContain('CANDIDATE_SEAL_REQUIRED');
      expect(await snapshot(f.root)).toEqual(before);expect(f.transitions).toEqual([]);
    }
  });
  it('rejects a forged prepared state without manifest binding and creates no attempt',async()=>{
    const f=await fixture();f.setState('candidate_prepared');const before=await snapshot(f.root);
    const r=await f.invoke({gate_ids:['entry_gate']});expect(r.success).toBe(false);expect(r.error).toContain('CANDIDATE_SEAL_INVALID');
    expect(await snapshot(f.root)).toEqual(before);
  });
  it('allows sealed direct checks, preserves their independent attempt and does not approve',async()=>{
    const f=await fixture();f.setState('candidate_prepared');
    const manifest=await fs.readFile(join(f.root,'.specforge/project/spec_manifest.json'));
    await f.put('candidate_manifest.json',{schema_version:'1.0',work_item_id:'WI-0001',workflow_type:'feature_spec',workflow_path:'requirement_change_path',base_spec_version:'PSV-0001',project_spec_precondition_sha256:'sha256:'+createHash('sha256').update(manifest).digest('hex'),merge_required:true,entries:[]});
    const r=await f.invoke({gate_ids:['entry_gate']});expect(r.success,r.error).toBe(true);expect(r.gate_attempt_id).toBe('attempt-0001');expect(f.transitions).toEqual([]);
    expect(await fs.readFile(join(f.wi,'gate_attempts/attempt-0001/attempt-result.json'),'utf8')).toContain('entry_gate');
  });
  it('rejects stale project binding and changed implementation before any new attempt',async()=>{
    const f=await fixture();f.setState('candidate_prepared');
    const manifest={schema_version:'1.0',work_item_id:'WI-0001',workflow_type:'feature_spec',workflow_path:'requirement_change_path',base_spec_version:'PSV-0001',project_spec_precondition_sha256:'sha256:'+createHash('sha256').update(await fs.readFile(join(f.root,'.specforge/project/spec_manifest.json'))).digest('hex'),merge_required:true,entries:[]};
    await f.put('candidate_manifest.json',manifest);
    await fs.writeFile(join(f.root,'.specforge/project/spec_manifest.json'),JSON.stringify({schema_version:'1.0',project_spec_version:'PSV-0002'}));
    let before=await snapshot(f.root);let result=await f.invoke({candidate_phase:'full'});
    expect(result.success).toBe(false);expect(result.error).toContain('CANDIDATE_SEAL_INVALID');expect(await snapshot(f.root)).toEqual(before);
    manifest.base_spec_version='PSV-0002';manifest.project_spec_precondition_sha256='sha256:'+createHash('sha256').update(await fs.readFile(join(f.root,'.specforge/project/spec_manifest.json'))).digest('hex');await f.put('candidate_manifest.json',manifest);
    await fs.writeFile(join(f.root,'app.js'),'different implementation');before=await snapshot(f.root);result=await f.invoke({reconcile_attempt_id:'attempt-0001'});
    expect(result.success).toBe(false);expect(result.error).toContain('BASELINE_STALE');expect(await snapshot(f.root)).toEqual(before);expect(f.transitions).toEqual([]);
  });
});
