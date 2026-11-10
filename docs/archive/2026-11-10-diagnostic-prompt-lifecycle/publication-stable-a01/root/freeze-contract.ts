import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { freezeValidationContract, type ValidationAssertion } from '../../../scripts/validation-contract-kernel';

const guarantees = [
  ['RULES_AND_BASELINE', 'Rule coverage and live Git evidence', 'SPS §22 / GOV-PRE-001'],
  ['DIAGNOSTIC_RED_GREEN', 'Dedicated original/candidate HTTP and dispatcher reports', 'SPS §5,§6.1,§14,§19; user authorized diagnostic repair'],
  ['DIAGNOSTIC_NO_TRUTH_WRITES', 'Before/after exact file identities excluding declared observability output', 'SPS §3,§5,§9,§10.1 / EXP-006,282'],
  ['NORMAL_GUARDS_RETAINED', 'Configuration,HardStop,recovery exclusion and history integrity regressions', 'SPS §3.3,§5.2,§9 / EXP-031,282,284'],
  ['ASYNC_DELIVERY_RED_GREEN', 'Original/candidate official-transport behavior reports and preserved30000ms bound', 'SPS §7.3,§10.2 / neutral sendPrompt delivery acknowledgment'],
  ['DELAYED_COMPLETION_OVER_30S', 'Actual delayed31s producer trace,delivery ACK and later terminal message/tool identities', 'User no-timeout-increase goal / EXP-282,298'],
  ['ERROR_CANCEL_ORDERING', 'NoReply persistence ordering,transport rejection,async error and cancellation regressions', 'SPS §7.3,§10.2 / EXP-008,289,290,298'],
  ['SYMMETRIC_FULL_AB', 'Exact-HEAD same-lock original/candidate full test reports and normalized failure comparison', 'EXP-009,118,121,122,136,140'],
  ['BUILD_LINT_TYPES', 'Formal build,full lint,typecheck numeric phase receipts', 'GOV-CLOSELOOP-001 / EXP-011,052,102'],
  ['THREE_PLATFORM_QUALIFICATION', 'Official current candidate Windows/Linux/macOS full and distribution job raw receipts and digests', 'SPS §12,§17,§19 / change-plan G3'],
  ['DEPLOYED_NEW_PROCESS', 'Official installer payload identities,old process stopped,new process identity/health and actual tool result', 'SPS §7.2,§12 / EXP-023,125,283'],
  ['GENUINE_MODEL_E2E', 'Actual configured GLM model tool parts,empty-directory diagnosis,controlled init,healthy diagnosis and daemon payload match', 'SPS §10.1,§10.2,§19 / EXP-007,282,290'],
  ['AUTHORITY_CONSUMER_RECONCILIATION', 'Final complete source/docs/template/installer consumer audit and goal reconciliation', 'GOV-POST-001 / EXP-004,026,031,193,276'],
  ['EVIDENCE_ACCEPTED', 'Immutable exact-member SHA256 manifest and independent verification,no credential publication', 'EXP-023,032,089,193,260,289,296,298'],
  ['GIT_DELIVERY', 'Exact staged payload,local main merge,push live ref,final clean READY and final-main CI', 'AGENTS Git collaboration / EXP-037,082,113,201'],
] as const;
const assertions: ValidationAssertion[] = guarantees.map(([id, truth, contract]) => ({
  assertion_id: id, assertion_type: id === 'GIT_DELIVERY' ? 'STRUCTURED_GIT' : 'IMMUTABLE_EVIDENCE',
  truth_source: truth, contract_source: contract, expected: true, comparator: 'EQUALS',
  baseline_mode: 'ABSOLUTE', blocking: true,
}));
const contract = freezeValidationContract({
  validator_id: 'diagnostic-kernel-lifecycle-acceptance', validation_target: 'CODEX-SF-20261110-KERNEL-A01',
  validation_contract_id: 'SF-DIAGNOSTIC-ASYNC-PROMPT/v1', contract_source: 'SPS §5,§7.3,§10,§14,§19,§22;change-plan G1..G3',
  truth_source: 'Raw process/test/model/tool/deployment/Git receipts under this evidence root',
  baseline_source: 'main6a1dd14e61f8d0ccc5c1120f342ac4f57e20f4da and prior stable real E2E evidence',
  baseline_freshness: 'Readonly Bootstrap verified exact live baseline; source payload,CI and deployment rechecked at acceptance',
  assertions,
});
writeFileSync(join(import.meta.dirname, 'validation-contract.json'), JSON.stringify(contract, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ validation_contract_frozen: true, validation_contract_hash: contract.validation_contract_hash, assertions: assertions.length }));
