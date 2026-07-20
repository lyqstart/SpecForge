import { describe, expect, it } from 'vitest';
import { validateSemanticClosure } from '../src/tools/lib/semantic-closure-core.js';

function validManifest() {
  return {
    schema_version: '1.0',
    closure_profile: 'investigation',
    workflow_type: 'investigation',
    work_item_id: 'WI-0001',
    outcomes: [],
    requirements: [],
    design_decisions: [],
    tasks: [],
    investigation_questions: [
      { id: 'IQ-1', finding_refs: ['F-1'], required_evidence_refs: ['EV-1'] },
    ],
    findings: [
      {
        id: 'F-1',
        question_refs: ['IQ-1'],
        evidence_refs: ['EV-1'],
        root_cause_status: 'ROOT_CAUSE_CONFIRMED',
      },
    ],
    evidence: [
      {
        id: 'EV-1',
        status: 'passed',
        level: 'L4',
        evidence_type: 'runtime_reproduction',
        supports: ['IQ-1', 'F-1'],
      },
    ],
    project_integration: { required: false, status: 'not_applicable', refs: [] },
  };
}

describe('Investigation semantic closure', () => {
  it('accepts question-to-finding-to-evidence closure without fabricated implementation artifacts', () => {
    const result = validateSemanticClosure(validManifest());
    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects fabricated requirements, weak evidence, and unlinked findings', () => {
    const invalid = validManifest();
    invalid.requirements = [{ id: 'REQ-FAKE' }] as any;
    invalid.findings[0].question_refs = [];
    invalid.evidence[0].level = 'L1';

    const result = validateSemanticClosure(invalid);
    expect(result.passed).toBe(false);
    const messages = result.errors.map(issue => issue.message).join('\n');
    expect(messages).toContain('Investigation semantic closure does not fabricate requirements');
    expect(messages).toContain('F-1');
  });
});
