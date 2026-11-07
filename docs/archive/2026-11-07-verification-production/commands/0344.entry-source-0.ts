// Self-owned SP-I01 baseline. Upstream business approval is seeded fixture data, not a claimed Workflow acceptance.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ensureProjectInit } from '../../../packages/daemon-core/src/tools/lib/sf_project_init_core';
import { StateManager } from '../../../packages/daemon-core/src/state/StateManager';
import { PersonalPathResolver } from '../../../packages/daemon-core/src/daemon/path-resolver';
import { computeCandidateHash } from '../../../packages/daemon-core/src/tools/lib/governance-invariants-v11';
import { ProjectManager } from '../../../packages/daemon-core/src/project/ProjectManager';
import { EventBus } from '../../../packages/daemon-core/src/event-bus/EventBus';
const digest=(raw:string|Buffer)=>createHash('sha256').update(raw).digest('hex');
const wi='WI-9901';
async function write(file:string,value:string|object){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');}
async function main(){
  const root=path.resolve(process.argv[2]??'');
  const purpose=process.argv[3]??'implementation';if(!['implementation','formal'].includes(purpose))throw Error('FIXTURE_PURPOSE');
  if(path.dirname(root)!==path.resolve('.tmp/verification-public-kernel')||!/^[a-f0-9]{32}$/.test(path.basename(root)))throw Error('FIXTURE_SCOPE');
  const reservation=JSON.parse(await fs.readFile(path.join(root,'reservation.json'),'utf8'));
  if(reservation.root!==root||!['D23_SELF_OWNED_PUBLIC_KERNEL_FIXTURE','D23_PRIVATE_REAL_INSTALLER_FIXTURE'].includes(reservation.kind))throw Error('FIXTURE_RESERVATION');
  if(reservation.kind==='D23_PRIVATE_REAL_INSTALLER_FIXTURE'){
    const proof=JSON.parse(await fs.readFile(path.join(root,'installed-byte-proof.json'),'utf8'));
    if(proof.release_manifest_sha256!==reservation.release_manifest_sha256||proof.config_was_empty!==true||JSON.stringify(proof.actual_installer_exit_codes)!=='[0,0]')throw Error('FIXTURE_INSTALLATION_PROOF');
    for(const [file,hash]of Object.entries(proof.managed_identities))if(digest(await fs.readFile(path.join(reservation.config,file)))!==hash)throw Error('FIXTURE_INSTALLED_BYTES_CHANGED');
  }
  const project=path.join(root,'project');await fs.mkdir(project);
  const initialized=await ensureProjectInit(project,'D23 owned public Kernel fixture');
  const git=(args:string[])=>execFileSync('git',['-c','core.hooksPath=NUL','-c','core.autocrlf=false',...args],{cwd:project,windowsHide:true,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL'}});
  git(['init','-q','-b','main']);
  await write(path.join(project,'package.json'),{name:'specforge-owned-public-fixture',private:true,type:'module'});
  await write(path.join(project,'src','library.cjs'),'function salute(name){return "hi "+name;}module.exports={salute};\n');
  await write(path.join(project,'tests','positive.test.cjs'),'const {test}=require("node:test");const assert=require("node:assert/strict");const {salute}=require("../src/library.cjs");test("salute",()=>assert.equal(salute("Ada"),"hi Ada"));\n');
  await write(path.join(project,'tests','waiting.test.cjs'),'const {test}=require("node:test");test("wait",()=>{while(true){}});\n');
  await write(path.join(project,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true}});
  await write(path.join(project,'src','value.ts'),'export function greet(name:string):string{return name===""?"Hello, world!":"Hello, "+name+"!";}\n');
  await write(path.join(project,'tests','value.test.ts'),'import {test} from "node:test";import assert from "node:assert/strict";import {greet} from "../src/value.ts";test("name",()=>assert.equal(greet("Ada"),"Hello, Ada!"));test("empty",()=>assert.equal(greet(""),"Hello, world!"));\n');
  await write(path.join(project,'src','esm.mjs'),'export function sum(a,b){return a+b;}\n');
  await write(path.join(project,'tests','esm.test.mjs'),'import {test} from "node:test";import assert from "node:assert/strict";import {sum} from "../src/esm.mjs";test("sum",()=>assert.equal(sum(2,3),5));\n');
  await write(path.join(project,'tests','failed.test.cjs'),'const {test}=require("node:test");const assert=require("node:assert/strict");test("expected fixture failure",()=>assert.equal(1,2));\n');
  const files=['package.json','tsconfig.json','src/library.cjs','tests/positive.test.cjs','tests/waiting.test.cjs','src/value.ts','tests/value.test.ts','src/esm.mjs','tests/esm.test.mjs','tests/failed.test.cjs'];
  try{await fs.access(path.join(project,'.gitignore'));files.push('.gitignore');}catch{}
  git(['add','--',...files]);git(['-c','user.name=SpecForge Synthetic Fixture','-c','user.email=synthetic@localhost.invalid','commit','-q','-m','D23 self-owned public fixture']);
  const manifestPath=path.join(project,'.specforge','project','spec_manifest.json'),psv=JSON.parse(await fs.readFile(manifestPath,'utf8')).project_spec_version;
  const wiRoot=path.join(project,'.specforge','work-items',wi),now=new Date().toISOString();
  await write(path.join(wiRoot,'work_item.json'),{schema_version:'1.1',work_item_id:wi,workflow_type:'feature_spec',workflow_path:'code_only_fast_path',project_spec_version_at_permission:psv,code_change_allowed:false,code_permission_revoked:true,created_at:now,updated_at:now});
  await write(path.join(wiRoot,'governance_scope.json'),{active:false});
  const task=(n:string,title:string,type:string,command:string)=>`### TASK-${wi}-${n} ${title}\n\n- **refs**: [DD-DEMO-001, REQ-DEMO-001]\n- **allowed_write_files**: [src/library.cjs]\n- **verification_commands**:\n  - ${type}:\n    - \`${command}\`\n\n`;
  const inline="const {salute}=require('./src/library.cjs');if(salute('Ada')!=='hi Ada')process.exit(1);console.log('SF_PRODUCT_INLINE_OK');";
  await write(path.join(wiRoot,'candidates','tasks.md'),task('001','Positive CJS','unit','node --test tests/positive.test.cjs')+
    task('002','Frozen inline','e2e',`node -e "${inline}"`)+task('003','Owned cancellation/crash','unit','node --test tests/waiting.test.cjs')+
    task('004','Static conjunction','unit','test -f package.json && test -f tsconfig.json')+
    task('005','Static count','unit',`grep -c '"type": "module"' package.json`)+
    task('006','Static negative','unit','! grep -qE "^import |^import\\{|require\\(" src/value.ts')+
    task('007','TypeScript','integration','node --test tests/value.test.ts')+
    task('008','ESM','unit','node --test tests/esm.test.mjs')+
    task('009','TypeScript inline','e2e',`node -e "import('./src/value.ts').then(m=>{if(m.greet('Ada')!=='Hello, Ada!'||m.greet('')!=='Hello, world!')process.exit(1);console.log('TS_INLINE_OK');}).catch(()=>process.exit(1))"`)+
    task('010','Expected native failed test','unit','node --test tests/failed.test.cjs')+
    task('011','Unsupported dependency must be refused','unit',`node -e "require('node:net')"`)+
    task('012','Output limit','unit',`node -e "console.log('x'.repeat(1100000));"`)+
    task('013','Memory limit','unit',`node -e "const blocks=[];while(true){blocks.push(Array(1000000).fill(123456789));}"`));
  const manifest={schema_version:'1.0',work_item_id:wi,workflow_path:'code_only_fast_path',workflow_type:'feature_spec',base_spec_version:psv,merge_required:false,entries:[]};
  await write(path.join(wiRoot,'candidate_manifest.json'),manifest);
  await write(path.join(wiRoot,'user_decision.json'),{schema_version:'1.0',decision_id:'UD-'+wi+'-synthetic-baseline',work_item_id:wi,workflow_path:'code_only_fast_path',base_spec_version:psv,candidate_manifest_path:'candidate_manifest.json',manifest_hash:'sha256:'+digest(JSON.stringify(manifest)),candidate_hash:await computeCandidateHash(wiRoot),gate_summary_path:'gate_summary.md',gate_summary_hash:'sha256:'+'a'.repeat(64),decision_status:'approved',decision_type:'auto_approved',decided_by:'synthetic-fixture-policy',decided_at:now,decision_scope:'fixture',waivers:[],auto_approval_policy_id:'SELF_OWNED_TEST_BASELINE_ONLY'});
  await write(path.join(wiRoot,'merge_report.md'),`Contract: merge-report/v1\nWork Item: ${wi}\nStatus: not_applicable\nTotal entries: 0\nSuccessful: 0\nFailed: 0\n`);
  const resolver=new PersonalPathResolver(),bus=new EventBus();
  const projects=new ProjectManager(bus,resolver,new StateManager(resolver,project));
  // The actual configuration owner must accept the baseline while no WI is active.
  await projects.getProjectConfiguration(project);
  const state=await projects.getProjectStateManager(project);
  await state.transition(wi,'','created','synthetic-fixture-seed','feature_spec');
  await state.transition(wi,'created','implementation_running','synthetic-fixture-seed','feature_spec');
  if(purpose==='formal'){
    await state.transition(wi,'implementation_running','implementation_done','synthetic-fixture-seed','feature_spec');
    await state.transition(wi,'implementation_done','verification_running','synthetic-fixture-seed','feature_spec');
  }
  const current=await state.getState(wi);
  projects.stop();bus.stop();
  if(current?.current_state!==(purpose==='formal'?'verification_running':'implementation_running'))throw Error('FIXTURE_STATE_REPLAY');
  const result={utc:new Date().toISOString(),root,project,work_item_id:wi,head:git(['rev-parse','HEAD']).trim(),initialization:initialized,authoritative_state:current,
    purpose,upstream_governance:'SYNTHETIC_BASELINE_ONLY_NOT_BUSINESS_APPROVAL_ACCEPTANCE',real_state_owner:true,original_business_touched:false,profile_created:false};
  await write(path.join(root,'fixture.json'),result);console.log(JSON.stringify({project,work_item_id:wi,head:result.head,real_state_owner:true,profile_created:false}));
}
main().catch(error=>{console.error(error?.stack??String(error));process.exitCode=1;});
