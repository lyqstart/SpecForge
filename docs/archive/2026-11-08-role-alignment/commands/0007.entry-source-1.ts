/** Unit boundary tests. Identity/state/assets are explicit doubles; no native execution or SPS acceptance is claimed. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { VerificationRuntime } from '../../src/verification/VerificationRuntime';
import { VerificationOwnerStore, canonicalVerificationJson as json, verificationId as hash } from '../../src/verification/owner-store';
import { PINNED_NODE_SHA256, VERIFICATION_PROFILE, type VerificationAssets } from '../../src/verification/verification-plan';
import { computeCandidateHash } from '../../src/tools/lib/governance-invariants-v11';
import { setHardStop } from '../../src/tools/lib/hard-stop-latch';
import type { ToolInvocationVerifier, TrustedToolInvocationProof } from '@specforge/types/trusted-tool-invocation';
import type { NativeExecutionFacts } from '../../src/verification/native-executor';

const roots:string[]=[], wi='WI-9002';
const git=(root:string,args:string[])=>execFileSync('git',['-c','core.hooksPath='+(process.platform==='win32'?'NUL':'/dev/null'),...args],{cwd:root,encoding:'utf8',windowsHide:true});
async function write(file:string,value:string|object){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,typeof value==='string'?value:JSON.stringify(value)+'\n');}
async function fixture(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'sf-verification-runtime-unit-'));roots.push(base);
  const project=path.join(base,'project'),wiRoot=path.join(project,'.specforge','work-items',wi);await fs.mkdir(project);
  git(project,['init','-q','-b','main']);
  await write(path.join(project,'package.json'),{type:'module'});
  await write(path.join(project,'src','value.ts'),'export function value(name:string):string{return "hi "+name;}\n');
  await write(path.join(project,'tests','value.test.mjs'),'import {test} from "node:test";import assert from "node:assert/strict";import {value} from "../src/value.ts";test("value",()=>assert.equal(value("Ada"),"hi Ada"));\n');
  await write(path.join(project,'unrelated.env'),'SYNTHETIC_NOT_AN_EXECUTION_INPUT=1');
  git(project,['add','package.json','src/value.ts','tests/value.test.mjs','unrelated.env']);
  git(project,['-c','user.name=Synthetic','-c','user.email=synthetic@localhost.invalid','commit','-q','-m','unit fixture']);
  await write(path.join(project,'.specforge','project','spec_manifest.json'),{project_spec_version:'PSV-0002'});
  await write(path.join(wiRoot,'work_item.json'),{schema_version:'1.1',work_item_id:wi,workflow_type:'feature_spec',workflow_path:'requirement_change_path',project_spec_version_at_permission:'PSV-0002',code_change_allowed:false,code_permission_revoked:true,updated_at:new Date().toISOString()});
  await write(path.join(wiRoot,'governance_scope.json'),{active:false});
  await write(path.join(wiRoot,'candidates','tasks.md'),`### TASK-${wi}-001 Verify value\n\n- **refs**: [DD-TEST-001, REQ-TEST-001]\n- **allowed_write_files**: [src/value.ts]\n- **verification_commands**:\n  - unit:\n    - \`node --test tests/value.test.mjs\`\n`);
  const manifest={schema_version:'1.0',work_item_id:wi,workflow_path:'requirement_change_path',workflow_type:'feature_spec',base_spec_version:'PSV-0001',merge_required:true,entries:[]};
  await write(path.join(wiRoot,'candidate_manifest.json'),manifest);
  const now=new Date().toISOString();
  await write(path.join(wiRoot,'user_decision.json'),{schema_version:'1.0',decision_id:'UD-'+wi+'-unit',work_item_id:wi,workflow_path:'requirement_change_path',base_spec_version:'PSV-0001',candidate_manifest_path:'candidate_manifest.json',manifest_hash:'sha256:'+hash(json(manifest)),candidate_hash:await computeCandidateHash(wiRoot),gate_summary_path:'gate_summary.md',gate_summary_hash:'sha256:'+'a'.repeat(64),decision_status:'approved',decision_type:'user_approved',decided_by:'synthetic-unit-user',decided_at:now,decision_scope:'full',waivers:[]});
  await write(path.join(wiRoot,'merge_report.md'),`Contract: merge-report/v1\nWork Item: ${wi}\nStatus: success\nTotal entries: 1\nSuccessful: 1\nFailed: 0\n`);
  let role:'sf-orchestrator'|'sf-verifier'|null=null;
  const callStarts=new Map<string,number>();
  const runtime:ToolInvocationVerifier={async verifyToolInvocation(request){
    if(!callStarts.has(request.messageId))callStarts.set(request.messageId,Date.now());
    const projection={sessionId:request.sessionId,messageId:request.messageId,callId:'call-'+request.messageId,agent:role??(request.tool==='sf_verification_plan'?'sf-orchestrator' as const:'sf-verifier' as const),directory:request.directory,tool:request.tool,inputSha256:hash(json(request.args)),startedAt:callStarts.get(request.messageId)!};
    return {source:'runtime-tool-invocation/v1',...projection,observedAt:new Date().toISOString(),runtimeProjectionSha256:hash(json(projection))} as TrustedToolInvocationProof;
  }};
  const store=new VerificationOwnerStore(path.join(base,'owner'));
  const assets:VerificationAssets={contract:'verification-assets/v1',profile:VERIFICATION_PROFILE,nodePath:path.join(base,'bin','node.exe'),nodeSha256:PINNED_NODE_SHA256,launcherPath:path.join(base,'bin','specforge-verify.exe'),launcherSha256:'b'.repeat(64),daemonPath:process.execPath,daemonSha256:'c'.repeat(64),manifestSha256:'d'.repeat(64)};
  const state={getState:async()=>({current_state:'implementation_running'}),rebuildState:async()=>{}};
  const service=new VerificationRuntime({projectManager:{getProjectStateManager:async()=>state},stateManager:undefined},runtime,store,async()=>assets);
  const context=(messageID:string)=>({sessionID:'unit-opaque-session',messageID,directory:project,agent:'caller-self-claim-ignored'});
  const args={action:'create',work_item_id:wi,task_id:'TASK-'+wi+'-001',verification_type:'unit',command_index:0};
  return {base,project,wiRoot,service,store,context,args,setRole:(value:typeof role)=>{role=value;}};
}
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots.splice(0)){const full=path.resolve(root);if(path.dirname(full)!==path.resolve(os.tmpdir())||!path.basename(full).startsWith('sf-verification-runtime-unit-'))throw Error('UNSAFE_TEST_CLEANUP');await fs.rm(full,{recursive:true,force:true});}});

describe('verification Runtime plan/permission owner (unit dependencies)',()=>{
  it('retains the legal code-only not_applicable merge path',async()=>{
    const f=await fixture();
    for(const name of ['work_item.json','candidate_manifest.json','user_decision.json']){
      const file=path.join(f.wiRoot,name),value=JSON.parse(await fs.readFile(file,'utf8'));value.workflow_path='code_only_fast_path';
      if(name==='candidate_manifest.json')value.merge_required=false;
      await write(file,value);
    }
    await write(path.join(f.wiRoot,'merge_report.md'),`Contract: merge-report/v1\nWork Item: ${wi}\nStatus: not_applicable\nTotal entries: 0\nSuccessful: 0\nFailed: 0\n`);
    expect((await f.service.plan(f.args,f.context('codeOnly'))).success).toBe(true);
  });
  it('binds canonical WI-owned Tasks even when the Project Spec merge manifest has no Task entry',async()=>{
    const f=await fixture(), result=await f.service.plan(f.args,f.context('plan1'));
    expect(result.success).toBe(true); const plan=await f.service.getPlan(result.plan_id as string);
    expect(plan.authority.taskPath).toBe(`.specforge/work-items/${wi}/candidates/tasks.md`);
    expect(plan.source.files.map(x=>x.path)).toEqual(['package.json','src/value.ts','tests/value.test.mjs']);
    expect(plan.permission.codeWriteGranted).toBe(false);
    expect(JSON.parse(await fs.readFile(path.join(f.wiRoot,'work_item.json'),'utf8')).code_change_allowed).toBe(false);
  });
  it('rejects an actual role mismatch and caller-supplied commands before private writes',async()=>{
    const f=await fixture(); f.setRole('sf-verifier');
    await expect(f.service.plan(f.args,{...f.context('wrong'),agent:'sf-orchestrator'})).rejects.toThrow('OWNER_PROOF_INVALID');
    f.setRole(null);await expect(f.service.plan({...f.args,command:'node -e anything'},f.context('extra'))).rejects.toThrow('SCHEMA_FIELDS_INVALID');
    await expect(fs.stat(f.store.root)).rejects.toMatchObject({code:'ENOENT'});
  });
  it('does not reuse an actual invocation or accept changed source/approved Tasks',async()=>{
    const f=await fixture(), result=await f.service.plan(f.args,f.context('one'));
    await expect(f.service.plan(f.args,f.context('one'))).rejects.toThrow('INVOCATION_ALREADY_USED');
    await write(path.join(f.project,'src','value.ts'),'export function value(name:string):string{return "changed"+name;}');
    await expect(f.service.run({action:'prepare',work_item_id:wi,plan_id:result.plan_id},f.context('drift'))).rejects.toThrow('SOURCE_CHANGED');
    await fs.appendFile(path.join(f.wiRoot,'candidates','tasks.md'),'\nchanged approved task\n');
    await expect(f.service.plan(f.args,f.context('changedTask'))).rejects.toThrow('APPROVED_CANDIDATE_CONTENT_CHANGED');
  });
  it('rejects orchestrator run ownership even with a verifier self-claim and preserves code permission',async()=>{
    const f=await fixture(),plan=await f.service.plan(f.args,f.context('ownerPlan'));
    const metadata=await fs.readFile(path.join(f.wiRoot,'work_item.json'));
    const native=vi.spyOn(f.service.native,'execute').mockRejectedValue(Error('UNEXPECTED_NATIVE_START'));
    f.setRole('sf-orchestrator');
    await expect(f.service.run({action:'prepare',work_item_id:wi,plan_id:plan.plan_id},
      {...f.context('wrongRunOwner'),agent:'sf-verifier'})).rejects.toThrow('OWNER_PROOF_INVALID');
    expect(native).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(f.wiRoot,'work_item.json'))).toEqual(metadata);
    f.setRole('sf-verifier');
    const prepared=await f.service.run({action:'prepare',work_item_id:wi,plan_id:plan.plan_id},f.context('actualVerifier'));
    expect(prepared.application_started).toBe(false);
    expect(await fs.readFile(path.join(f.wiRoot,'work_item.json'))).toEqual(metadata);
    expect(native).not.toHaveBeenCalled();
  });
  it('revokes only the independent verification grant and blocks a new Attempt',async()=>{
    const f=await fixture(), before=await fs.readFile(path.join(f.wiRoot,'work_item.json')), result=await f.service.plan(f.args,f.context('grant'));
    await f.service.plan({action:'revoke',work_item_id:wi,plan_id:result.plan_id},f.context('revoke'));
    await expect(f.service.run({action:'prepare',work_item_id:wi,plan_id:result.plan_id},f.context('denied'))).rejects.toThrow('PERMISSION_REVOKED');
    expect(await fs.readFile(path.join(f.wiRoot,'work_item.json'))).toEqual(before);
  });
  it('prepares immutable fixed config and can cancel it under HardStop without launching anything',async()=>{
    const f=await fixture(), plan=await f.service.plan(f.args,f.context('grant'));
    const prepared=await f.service.run({action:'prepare',work_item_id:wi,plan_id:plan.plan_id},f.context('prepare'));
    expect(prepared.application_started).toBe(false);
    setHardStop(f.project,wi,'Synthetic unit latch','sf_safe_bash');
    const result=await f.service.run({action:'cancel',work_item_id:wi,attempt_record_id:prepared.attempt_record_id},f.context('cancel'));
    expect(result.cancellation_requested).toBe(true);
    const cancellation=JSON.parse(await fs.readFile(path.join(f.store.root,'cancellations',prepared.attempt_id+'.json'),'utf8'));
    expect(cancellation).toEqual({attempt_id:prepared.attempt_id,plan_id:plan.plan_id});
    await expect(fs.stat(path.join(f.store.root,'runs',prepared.attempt_id as string))).rejects.toMatchObject({code:'ENOENT'});
  });
  it('rejects prepare-only plan_id on run before native start and preserves the Attempt for controlled cancellation',async()=>{
    const f=await fixture(),plan=await f.service.plan(f.args,f.context('grant'));
    const prepared=await f.service.run({action:'prepare',work_item_id:wi,plan_id:plan.plan_id},f.context('prepare'));
    const native=vi.spyOn(f.service.native,'execute').mockRejectedValue(Error('UNEXPECTED_NATIVE_START'));
    await expect(f.service.run({action:'run',work_item_id:wi,attempt_record_id:prepared.attempt_record_id,plan_id:plan.plan_id},f.context('extraPrepareField'))).rejects.toThrow('VERIFICATION_SCHEMA_FIELDS_INVALID');
    expect(native).not.toHaveBeenCalled();
    expect(await f.store.has('start',hash(prepared.attempt_id as string))).toBe(false);
    expect(await f.service.getAttempt(prepared.attempt_record_id as string)).toMatchObject({planId:plan.plan_id});
    const cancelled=await f.service.run({action:'cancel',work_item_id:wi,attempt_record_id:prepared.attempt_record_id},f.context('cancelSameAttempt'));
    expect(cancelled.cancellation_requested).toBe(true);
    expect(cancelled.application_passed).toBe(false);
    expect(native).not.toHaveBeenCalled();
  });
  it('recovers an authenticated interrupted preparation and refuses unknown extra files',async()=>{
    const f=await fixture();
    const spy=vi.spyOn(f.service as any,'freeze').mockRejectedValueOnce(Error('Synthetic preparation interruption'));
    const interrupted=await f.service.plan(f.args,f.context('interrupted'));spy.mockRestore();
    expect(interrupted.success).toBe(false);
    const recovered=await f.service.plan({action:'recover',work_item_id:wi,preparation_id:interrupted.preparation_id},f.context('recover'));
    expect(recovered.success).toBe(true);
    await write(path.join(f.store.root,'input',recovered.plan_id as string,'extra.txt'),'not approved');
    await expect(f.service.plan({action:'recover',work_item_id:wi,preparation_id:interrupted.preparation_id},f.context('refuseExtra'))).rejects.toThrow('PREPARATION_EXTRA_INPUT');
  });
  it('cancels active work and waits for its receipt before completing graceful shutdown (unit backend)',async()=>{
    const f=await fixture(),plan=await f.service.plan(f.args,f.context('grant'));
    const prepared=await f.service.run({action:'prepare',work_item_id:wi,plan_id:plan.plan_id},f.context('prepare'));
    let entered!:()=>void,release!:(facts:NativeExecutionFacts)=>void;
    const nativeEntered=new Promise<void>(resolve=>{entered=resolve;});
    vi.spyOn(f.service.native,'execute').mockImplementation(async()=>{entered();return new Promise<NativeExecutionFacts>(resolve=>{release=resolve;});});
    const running=f.service.run({action:'run',work_item_id:wi,attempt_record_id:prepared.attempt_record_id},f.context('run'));
    await nativeEntered;let stopped=false;const shutdown=f.service.shutdown().then(()=>{stopped=true;});
    const cancel=path.join(f.store.root,'cancellations',prepared.attempt_id+'.json');
    for(let i=0;i<100;i++){try{await fs.access(cancel);break;}catch{await new Promise(resolve=>setTimeout(resolve,10));}}
    expect(JSON.parse(await fs.readFile(cancel,'utf8')).attempt_id).toBe(prepared.attempt_id);expect(stopped).toBe(false);
    release({processStarted:false,processResumed:false,exitCode:null,launcherExitCode:130,jobEnded:false,cleanupProved:false,outputComplete:false,
      stdoutSha256:hash(''),stderrSha256:hash(''),nativeReceiptSha256:null,nativeEventsSha256:null,inspectionSha256:null,outcome:'cancelled',failure:'CANCELLED'});
    const result=await running;await shutdown;expect(result.outcome).toBe('cancelled');expect(stopped).toBe(true);
    expect(await f.store.has('receipt',result.receipt_id as string)).toBe(true);
    await expect(f.service.plan(f.args,f.context('afterStop'))).rejects.toThrow('DAEMON_STOPPING');
  });
});
