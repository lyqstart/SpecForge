/**
 * semantic-closure-builder.test.ts — semantic closure manifest producer tests.
 */

import { describe, it, expect } from 'vitest';
import { buildSemanticClosureFromArtifacts } from '../../src/tools/lib/semantic-closure-builder.js';

function baseInput() {
  return {
    workItemId: 'WI-9001',
    workItem: { work_item_id: 'WI-9001', workflow_path: 'code_only_fast_path' },
    traceDeltaMd: '# Trace\nOUT-1 -> REQ-1 -> DD-1 -> TASK-1 -> EV-1',
    verificationReportMd: '# Verification\nEvidence EV-1 passed.',
    mergeReportMd: '# Merge\nStatus: not_applicable',
    evidenceManifest: {
      work_item_id: 'WI-9001',
      entries: [{ id: 'EV-1', status: 'passed', level: 'L5', type: 'behavioral_e2e' }],
    },
  };
}

describe('buildSemanticClosureFromArtifacts', () => {
  it('builds a valid closure from an explicit OUT -> REQ -> DD -> TASK -> EV trace chain', () => {
    const result = buildSemanticClosureFromArtifacts(baseInput());

    expect(result.source).toBe('trace_delta_chain');
    expect(result.validation.passed).toBe(true);
    expect(result.manifest.outcomes?.[0]?.id).toBe('OUT-1');
    expect(result.manifest.requirements?.[0]?.id).toBe('REQ-1');
    expect(result.manifest.design_decisions?.[0]?.id).toBe('DD-1');
    expect(result.manifest.tasks?.[0]?.id).toBe('TASK-1');
    expect(result.manifest.evidence?.[0]?.id).toBe('EV-1');
  });

  it('fails closed when the trace chain is absent instead of guessing from prose', () => {
    const input = baseInput();
    input.traceDeltaMd = '# Trace\nLogging files changed and tests passed.';

    const result = buildSemanticClosureFromArtifacts(input);

    expect(result.source).toBe('insufficient_artifacts');
    expect(result.validation.passed).toBe(false);
    expect(result.validation.errors.map((issue) => issue.check_id)).toContain('semantic_has_outcomes');
  });

  it('does not allow compile-only evidence to prove closure even when a trace chain exists', () => {
    const input = baseInput();
    input.evidenceManifest = {
      work_item_id: 'WI-9001',
      entries: [{ id: 'EV-1', status: 'passed', level: 'L2', type: 'compile-only' }],
    };

    const result = buildSemanticClosureFromArtifacts(input);

    expect(result.source).toBe('trace_delta_chain');
    expect(result.validation.passed).toBe(false);
    expect(result.validation.errors.map((issue) => issue.check_id)).toContain('semantic_requirement_REQ-1_has_passed_evidence');
  });

  it('prefers a curated semantic_closure JSON block in verification_report.md', () => {
    const input = baseInput();
    input.traceDeltaMd = '# Trace\nNo chain here.';
    input.verificationReportMd = `# Verification\n\n\`\`\`json\n${JSON.stringify({
      semantic_closure: {
        schema_version: '1.0',
        work_item_id: 'WI-9001',
        outcomes: [{ id: 'OUT-1', requirement_refs: ['REQ-1'], required_evidence_refs: ['EV-1'] }],
        requirements: [{ id: 'REQ-1', type: 'MUST', outcome_refs: ['OUT-1'], design_refs: ['DD-1'], task_refs: ['TASK-1'], required_evidence_refs: ['EV-1'] }],
        design_decisions: [{ id: 'DD-1', requirement_refs: ['REQ-1'], task_refs: ['TASK-1'] }],
        tasks: [{ id: 'TASK-1', requirement_refs: ['REQ-1'], design_refs: ['DD-1'], evidence_refs: ['EV-1'] }],
        evidence: [{ id: 'EV-1', status: 'passed', level: 'L5', evidence_type: 'behavioral_e2e', supports: ['OUT-1', 'REQ-1', 'TASK-1'] }],
        project_integration: { status: 'not_applicable' },
      },
    })}\n\`\`\``;

    const result = buildSemanticClosureFromArtifacts(input);

    expect(result.source).toBe('verification_report_json');
    expect(result.validation.passed).toBe(true);
  });
});
