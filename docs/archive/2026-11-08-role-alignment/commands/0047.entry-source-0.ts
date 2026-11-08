import fs from 'node:fs';
import path from 'node:path';
import { freezeValidationContract, type ValidationAssertion } from '../../../scripts/validation-contract-kernel';
const root=path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/,'$1');
const defs:Array<[string,unknown,ValidationAssertion['assertion_type'],string]>=[
  ['FINAL_EXITS',[0,0,0,0,0],'IMMUTABLE_EVIDENCE','commands/0034,0036,0037,0039,0045 numeric results'],
  ['CURRENT_ROLE_CONTRACT_TESTS',22,'IMMUTABLE_EVIDENCE','0034 frozen maintained test source, raw test stdout and current source SHA'],
  ['CURRENT_ROLE_NAMES', ['sf-analyst','sf-debugger','sf-design','sf-executor','sf-knowledge','sf-orchestrator','sf-requirements','sf-reviewer','sf-task-planner','sf-verifier'],'EXACT_HASH','fresh-loader-03/agents.json exact body identities'],
  ['CURRENT_SKILL_COUNT',8,'EXACT_HASH','fresh-loader-03/skills.json exact raw body identities'],
  ['INSTALLED_CURRENT_IDENTITIES',117,'EXACT_HASH','release/install manifest/source and independent actual installed bytes'],
  ['NATIVE_TUPLE_UNCHANGED',true,'EXACT_HASH','initial installed baseline and actual five native files'],
  ['OWNER_PRESERVED',true,'EXACT_HASH','owner baseline/nonsecret SHA and secret metadata; independent current snapshot'],
  ['BUSINESS_PRESERVED_CLOSED',true,'EXACT_HASH','installed StateManager event replay, local main,5 code and9 canonical raw identities'],
  ['FINAL_LOADER_CLEAN',true,'IMMUTABLE_EVIDENCE','strict ordered cold start and own Kernel ended/independent Daemon health'],
  ['AUTHORITY_UNCHANGED',true,'EXACT_HASH','gate baseline raw SPS/Registry versus current bytes'],
  ['STATUS_RECONCILED',true,'STRUCTURED_STATE','unique project-status schema/run/scope and completed repair assessment'],
  ['FULL_PRODUCT_VERDICT_HONEST','INSUFFICIENT_EVIDENCE','STRUCTURED_STATE','20 individually scoped findings; no aggregate PASS copied or inferred'],
];
const contract=freezeValidationContract({validator_id:'role-alignment-final/v1',validation_target:'D18/D23 role/Skill repair,actual deployment and bounded reassessment',validation_contract_id:'SF-ROLE-ALIGNMENT-20261108',contract_source:'SPS9.2/9.2.4/19/20/22;Authority Registry D18/D23;EXP195/260/287',truth_source:'Immutable raw command receipts,current source,actual loader andinstalled owner reads',baseline_source:'c641a8d4 gate and installed117;final product source7ecc7cfe',baseline_freshness:'No Runtime/native changes;physical final installation/current facts freshly verified',assertions:defs.map(([assertion_id,expected,assertion_type,truth_source])=>({assertion_id,expected,assertion_type,truth_source,contract_source:'SPS9.2/9.2.4/19/20/22;EXP195',comparator:'EQUALS',baseline_mode:'ABSOLUTE',blocking:true}))});
fs.writeFileSync(path.join(root,'final-validation-contract.json'),JSON.stringify(contract,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({contract_hash:contract.validation_contract_hash,assertions:contract.assertions.length}));
