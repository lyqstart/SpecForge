import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { extractStructuredVerificationReport, validateVerificationReportContract } from '../../../packages/daemon-core/src/tools/lib/verification-report-contract';
import { EvidenceManifestSchema } from '../../../packages/types/src/index';

const root=import.meta.dirname,sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'original-predeploy-baseline.json'),'utf8'));
const reconciliation=JSON.parse(fs.readFileSync(path.join(root,'original-report-timeout-reconciliation/reconciliation.json'),'utf8'));
const coverage=JSON.parse(fs.readFileSync(path.join(root,'original-execution-coverage-1794033632326.json'),'utf8'));
const reportBytes=fs.readFileSync(path.join(baseline.project,'.specforge/work-items/WI-0001/verification_report.md'));
const manifestBytes=fs.readFileSync(path.join(baseline.project,'.specforge/work-items/WI-0001/evidence/evidence_manifest.json'));
assert.equal(sha(reportBytes),reconciliation.artifacts.find((a:any)=>a.path.endsWith('verification_report.md')).sha256);
assert.equal(sha(manifestBytes),reconciliation.artifacts.find((a:any)=>a.path.endsWith('evidence_manifest.json')).sha256);
const report=extractStructuredVerificationReport(reportBytes.toString('utf8'))!;
const validation=validateVerificationReportContract(report);assert.equal(validation.valid,true,JSON.stringify(validation.errors));
const manifest=JSON.parse(manifestBytes.toString('utf8'));assert.equal(EvidenceManifestSchema.safeParse(manifest).success,true);
const expected=new Map(coverage.phases.formal.receipts.map((r:any)=>[[r.task_id,r.verification_type,r.command_index].join('/'),r]));
const actual=new Set<string>();
for(const command of report.verification_commands){
 if(command.status!=='pass')continue;
 const key=[command.task_id,command.verification_type,command.command_index].join('/'),r:any=expected.get(key);assert.ok(r,'UNEXPECTED_COMMAND_SUBJECT:'+key);assert.equal(command.command,r.command);assert.equal(command.execution_receipt_id,r.receipt_id);assert.equal(actual.has(key),false,'DUPLICATE_SELECTOR:'+key);actual.add(key);
 const evidence=manifest.entries.filter((e:any)=>e.execution_receipt_id===r.receipt_id);assert.equal(evidence.length,1);assert.equal(evidence[0].path,'verification-owner:receipt:'+r.receipt_id);assert.equal(evidence[0].hash,'sha256:'+r.receipt_id);assert.equal(evidence[0].hash_domain,'canonical-json:verification-execution/v1');assert.equal(evidence[0].status,'passed');
}
assert.equal(actual.size,22);assert.equal(expected.size,22);
const value={utc:new Date().toISOString(),project:baseline.project,report_sha256:sha(reportBytes),manifest_sha256:sha(manifestBytes),report_contract_valid:true,manifest_basic_schema_valid:true,formal_command_subjects_matched:actual.size,report_conclusion:report.conclusion,semantic_closure_present:!!report.semantic_closure,actual_owner_write_records:reconciliation.results.filter((r:any)=>r.handler_success===true),qualification:'Read-only typed/selector/hash inspection of actual professional artifacts; previous actual owner writes consumed authenticated execution evidence. This is not full Verification/Formal Version/Close Gate acceptance and does not author or rewrite professional conclusions.'};
fs.writeFileSync(path.join(root,'original-professional-artifact-inspection.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({report_contract_valid:true,manifest_basic_schema_valid:true,formal_subjects:22,conclusion:report.conclusion,professional_artifact_rewritten:false,full_gate_acceptance_claimed:false}));
