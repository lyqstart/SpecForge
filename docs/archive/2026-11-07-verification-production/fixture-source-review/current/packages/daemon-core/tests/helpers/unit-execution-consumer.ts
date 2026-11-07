/** In-process dependency double only. Never a native receipt, owner MAC, or SPS acceptance claim. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ExecutionEvidenceConsumer, ExecutionEvidenceSubject } from '../../src/verification/execution-evidence-consumer';
import type { VerificationExecutionReceipt } from '../../src/verification/verification-plan';
import { canonicalVerificationJson } from '../../src/verification/owner-store';
import { renderVerificationReport } from '../../src/tools/lib/sf_artifact_write_core';

export class UnitExecutionConsumer {
  private readonly subjects = new Map<string, string>();
  constructor(private readonly projectRoot: string) {}
  readonly consumer: ExecutionEvidenceConsumer = { consume: async (input: ExecutionEvidenceSubject) => {
    if (this.subjects.get(input.receiptId) !== canonicalVerificationJson(input)) throw Error('UNIT_EXECUTION_SUBJECT_NOT_REGISTERED');
    // Gate composition tests model this dependency's acceptance. They never
    // manufacture a passed native receipt or claim isolation was executed.
    return { synthetic_unit_dependency: true } as unknown as VerificationExecutionReceipt;
  } };
  register(workItemId: string) {
    const subject = { projectRoot: path.resolve(this.projectRoot), workItemId, taskId: `TASK-${workItemId}-001`,
      verificationType: 'unit', commandIndex: 0, command: 'synthetic-unit-consumer-fixture', purpose: 'formal' as const };
    const receiptId = createHash('sha256').update(canonicalVerificationJson({ contract: 'synthetic-unit-dependency/v1', ...subject })).digest('hex');
    this.subjects.set(receiptId, canonicalVerificationJson({ receiptId, ...subject }));
    const reference = { execution_receipt_id: receiptId, task_id: subject.taskId,
      verification_type: subject.verificationType, command_index: 0, command: subject.command };
    return { reference, command: { ...reference, status: 'pass', output_summary: 'Synthetic in-process consumer dependency; no process/native execution claimed' },
      entry: { ...reference, path: `verification-owner:receipt:${receiptId}`, hash: `sha256:${receiptId}`,
        hash_domain: 'canonical-json:verification-execution/v1', created_at: new Date().toISOString() } };
  }
  minimalArtifacts(workItemId: string) {
    const model = this.register(workItemId);
    const manifest = { schema_version: '1.0', work_item_id: workItemId, entries: [{ ...model.entry,
      evidence_id: 'EV-UNIT', id: 'EV-UNIT', type: 'command_output', description: 'Synthetic unit dependency', status: 'passed' }] };
    const report = renderVerificationReport(JSON.stringify({ conclusion: 'pass',
      test_matrix: { L1_unit: 'pass', L2_integration: 'not_applicable', L3_pbt: 'not_applicable', L4_e2e: 'not_applicable', L5_smoke: 'not_applicable', L6_regression: 'not_applicable', L7_performance: 'not_applicable', L8_security: 'not_applicable', L9_compatibility: 'not_applicable', L10_uat: 'not_applicable' },
      verification_commands: [model.command], acceptance_criteria: [{ req_id: 'REQ-UNIT-001', name: 'Unit composition', status: 'pass', evidence_refs: ['EV-UNIT'] }],
      e2e_tests: [{ name: 'Outside unit scope', status: 'not_applicable', evidence_refs: ['EV-UNIT'] }], side_effects: 'Synthetic unit fixture only', summary: 'Unit eligibility model, not real execution acceptance', semantic_closure: {} }));
    if (!report) throw Error('UNIT_REPORT_CONTRACT_INVALID');
    return { manifest, report };
  }
}
