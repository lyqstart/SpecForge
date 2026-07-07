/**
 * semantic-closure-core.test.ts — minimal semantic closure unit tests.
 */

import { describe, it, expect } from 'vitest';
import { validateSemanticClosure, type SemanticClosureManifest } from '../../src/tools/lib/semantic-closure-core.js';

function closedManifest(): SemanticClosureManifest {
  return {
    schema_version: '1.0',
    work_item_id: 'WI-9999',
    outcomes: [
      {
        id: 'OUT-1',
        description: 'Application logs are persisted locally and uploaded to server',
        requirement_refs: ['REQ-1'],
        required_evidence_refs: ['EV-1'],
      },
    ],
    requirements: [
      {
        id: 'REQ-1',
        type: 'MUST',
        outcome_refs: ['OUT-1'],
        design_refs: ['DD-1'],
        task_refs: ['TASK-1'],
        required_evidence_refs: ['EV-1'],
      },
    ],
    design_decisions: [
      {
        id: 'DD-1',
        requirement_refs: ['REQ-1'],
        task_refs: ['TASK-1'],
      },
    ],
    tasks: [
      {
        id: 'TASK-1',
        requirement_refs: ['REQ-1'],
        design_refs: ['DD-1'],
        evidence_refs: ['EV-1'],
      },
    ],
    evidence: [
      {
        id: 'EV-1',
        status: 'passed',
        level: 'L5',
        evidence_type: 'behavioral_e2e',
        supports: ['OUT-1', 'REQ-1', 'TASK-1'],
      },
    ],
    project_integration: {
      status: 'merged',
    },
  };
}

describe('validateSemanticClosure', () => {
  it('passes a fully closed OUT -> REQ -> DD -> TASK -> EV chain', () => {
    const result = validateSemanticClosure(closedManifest());

    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('blocks compile-only or file-only evidence from closing a MUST requirement', () => {
    const manifest = closedManifest();
    manifest.evidence = [
      {
        id: 'EV-1',
        status: 'passed',
        level: 'L2',
        evidence_type: 'compile-only',
        supports: ['OUT-1', 'REQ-1', 'TASK-1'],
      },
    ];

    const result = validateSemanticClosure(manifest);

    expect(result.passed).toBe(false);
    expect(result.errors.map((error) => error.check_id)).toContain('semantic_requirement_REQ-1_has_passed_evidence');
    expect(result.errors.map((error) => error.check_id)).toContain('semantic_outcome_OUT-1_has_passed_evidence');
  });

  it('blocks required evidence when the evidence exists but is unknown', () => {
    const manifest = closedManifest();
    manifest.evidence = [
      {
        id: 'EV-1',
        status: 'unknown',
        level: 'L5',
        evidence_type: 'behavioral_e2e',
        supports: ['OUT-1', 'REQ-1', 'TASK-1'],
      },
    ];

    const result = validateSemanticClosure(manifest);

    expect(result.passed).toBe(false);
    expect(result.errors.map((error) => error.check_id)).toContain('semantic_requirement_REQ-1_required_evidence_passed');
    expect(result.errors.map((error) => error.check_id)).toContain('semantic_task_TASK-1_evidence_passed');
  });

  it('blocks missing project integration status', () => {
    const manifest = closedManifest();
    delete manifest.project_integration;

    const result = validateSemanticClosure(manifest);

    expect(result.passed).toBe(false);
    expect(result.errors.map((error) => error.check_id)).toContain('semantic_project_integration_closed');
  });

  it('blocks design decisions that are not justified by requirements', () => {
    const manifest = closedManifest();
    manifest.design_decisions = [
      {
        id: 'DD-1',
        requirement_refs: [],
        task_refs: ['TASK-1'],
      },
    ];

    const result = validateSemanticClosure(manifest);

    expect(result.passed).toBe(false);
    expect(result.errors.map((error) => error.check_id)).toContain('semantic_design_DD-1_has_requirement');
  });
});
