import fs from 'node:fs';
import path from 'node:path';
import { freezeValidationContract, type ValidationAssertion } from '../../../scripts/validation-contract-kernel';
const root = path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, '$1');
const definitions: Array<[string, unknown, ValidationAssertion['assertion_type'], string]> = [
  ['REGRESSION_EXIT_CODES', [0, 0, 0, 0], 'IMMUTABLE_EVIDENCE', 'commands/0007..0010 sealed results and frozen test sources'],
  ['AUDIT_ZERO_TOTAL_POLICIES', 0, 'PARSER', 'all actual shared audit paragraphs + actual audit verdict regression'],
  ['AUDIT_MISSING_UNRESOLVED_POLICIES', 0, 'PARSER', 'all actual shared audit paragraphs + actual unresolved rejection regression'],
  ['POSITIVE_PLANNING_GRAMMAR_VERIFIED', true, 'IMMUTABLE_EVIDENCE', 'maintained16-case complete suite, actual finite compiler positive/negative checks'],
  ['INSTALLED_IDENTITIES', 117, 'EXACT_HASH', 'official117 release manifest and independently read installed bytes'],
  ['ACTUAL_CHANGED_AGENT_NAMES', ['sf-debugger','sf-design','sf-executor','sf-knowledge','sf-requirements','sf-reviewer','sf-task-planner','sf-verifier'], 'STRUCTURED_STATE', 'fresh-loader-02/agents.json'],
  ['ACTUAL_CHANGED_SKILL_NAMES', ['sf-intake','sf-workflow-feature-spec','superpowers-writing-plans'], 'STRUCTURED_STATE', 'fresh-loader-02/skills.json exact raw-body bindings'],
  ['OWNER_STORE_PRESERVED', true, 'EXACT_HASH', 'before owner nonsecret hashes/key metadata versus independent current owner snapshot'],
  ['BUSINESS_DELIVERY_PRESERVED', true, 'EXACT_HASH', 'approved localmain28c8e3d,5 raw code files,9 canonical acceptance members'],
  ['NATIVE_TUPLE_PRESERVED', true, 'EXACT_HASH', 'five original qualified native asset identities from deployment-readiness'],
  ['STATUS_COMPLETED_AND_RECONCILED', true, 'STRUCTURED_STATE', 'unique project-status parsed fields and current required-validation scope'],
  ['NO_NEW_MODEL_OR_BUSINESS_EXECUTION', true, 'IMMUTABLE_EVIDENCE', 'actual fresh-loader-02 process receipt: no model prompt or business tool'],
];
const contract = freezeValidationContract({validator_id:'consumer-conformance-final/v1',validation_target:'Three specific subordinate consumer gaps and current deployment',validation_contract_id:'SPS-CONSUMER-RECONCILIATION-20261107',contract_source:'SPS sections9.2/9.2.4/19.19/20/22;GOV-POST-001;EXP193/287',truth_source:'Current source,real maintained test consumers,physical installation andactual freshloader',baseline_source:'main0995f0c5 and baseline/manifest.json',baseline_freshness:'main24f6b0c7 reviewed21 source paths;no Runtime/native edits;before final reconciliation',assertions:definitions.map(([assertion_id,expected,assertion_type,truth_source])=>({assertion_id,expected,assertion_type,truth_source,contract_source:'SPS9.2/9.2.4/19.19/20/22;GOV-POST-001',comparator:'EQUALS',baseline_mode:'ABSOLUTE',blocking:true}))});
fs.writeFileSync(path.join(root,'final-validation-contract.json'),JSON.stringify(contract,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({contract_hash:contract.validation_contract_hash,assertions:contract.assertions.length,frozen:true}));
