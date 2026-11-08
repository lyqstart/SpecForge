/**
 * semantic-closure-fj1-regression.test.ts — regression acceptance tests for fj1-style semantic completion gaps.
 *
 * These tests model the original class of defect: an implementation can create logging framework files
 * and pass compile/build checks while still failing the user's actual outcome because local persistence,
 * flush wiring, or server upload evidence is missing.
 */

import { describe, it, expect } from 'vitest';
import { validateSemanticClosure, type SemanticClosureManifest } from '../../src/tools/lib/semantic-closure-core.js';

function completeLoggingClosure(overrides: Partial<SemanticClosureManifest> = {}): SemanticClosureManifest {
  const base: SemanticClosureManifest = {
    schema_version: '1.0',
    work_item_id: 'WI-FJ1-REGRESSION',
    outcomes: [
      {
        id: 'OUT-LOGGING-COMPLETE',
        description: 'Application logs are persisted locally and uploaded to the log server through the real runtime path.',
        requirement_refs: ['REQ-LOCAL-PERSIST', 'REQ-FLUSH-WIRED', 'REQ-SERVER-UPLOAD'],
        required_evidence_refs: ['EV-LOCAL-PERSIST', 'EV-FLUSH-WIRED', 'EV-SERVER-UPLOAD'],
      },
    ],
    requirements: [
      {
        id: 'REQ-LOCAL-PERSIST',
        type: 'MUST',
        outcome_refs: ['OUT-LOGGING-COMPLETE'],
        design_refs: ['DD-LOGGING-PIPELINE'],
        task_refs: ['TASK-IMPLEMENT-LOGGING'],
        required_evidence_refs: ['EV-LOCAL-PERSIST'],
      },
      {
        id: 'REQ-FLUSH-WIRED',
        type: 'MUST',
        outcome_refs: ['OUT-LOGGING-COMPLETE'],
        design_refs: ['DD-LOGGING-PIPELINE'],
        task_refs: ['TASK-IMPLEMENT-LOGGING'],
        required_evidence_refs: ['EV-FLUSH-WIRED'],
      },
      {
        id: 'REQ-SERVER-UPLOAD',
        type: 'MUST',
        outcome_refs: ['OUT-LOGGING-COMPLETE'],
        design_refs: ['DD-LOGGING-PIPELINE'],
        task_refs: ['TASK-IMPLEMENT-LOGGING'],
        required_evidence_refs: ['EV-SERVER-UPLOAD'],
      },
    ],
    design_decisions: [
      {
        id: 'DD-LOGGING-PIPELINE',
        requirement_refs: ['REQ-LOCAL-PERSIST', 'REQ-FLUSH-WIRED', 'REQ-SERVER-UPLOAD'],
        task_refs: ['TASK-IMPLEMENT-LOGGING'],
      },
    ],
    tasks: [
      {
        id: 'TASK-IMPLEMENT-LOGGING',
        requirement_refs: ['REQ-LOCAL-PERSIST', 'REQ-FLUSH-WIRED', 'REQ-SERVER-UPLOAD'],
        design_refs: ['DD-LOGGING-PIPELINE'],
        evidence_refs: ['EV-LOCAL-PERSIST', 'EV-FLUSH-WIRED', 'EV-SERVER-UPLOAD'],
      },
    ],
    evidence: [
      {
        id: 'EV-LOCAL-PERSIST',
        status: 'passed',
        level: 'L5',
        evidence_type: 'behavioral_runtime',
        supports: ['OUT-LOGGING-COMPLETE', 'REQ-LOCAL-PERSIST', 'TASK-IMPLEMENT-LOGGING'],
        outcome_refs: ['OUT-LOGGING-COMPLETE'],
        requirement_refs: ['REQ-LOCAL-PERSIST'],
        task_refs: ['TASK-IMPLEMENT-LOGGING'],
      },
      {
        id: 'EV-FLUSH-WIRED',
        status: 'passed',
        level: 'L5',
        evidence_type: 'behavioral_call_chain',
        supports: ['OUT-LOGGING-COMPLETE', 'REQ-FLUSH-WIRED', 'TASK-IMPLEMENT-LOGGING'],
        outcome_refs: ['OUT-LOGGING-COMPLETE'],
        requirement_refs: ['REQ-FLUSH-WIRED'],
        task_refs: ['TASK-IMPLEMENT-LOGGING'],
      },
      {
        id: 'EV-SERVER-UPLOAD',
        status: 'passed',
        level: 'L5',
        evidence_type: 'behavioral_integration',
        supports: ['OUT-LOGGING-COMPLETE', 'REQ-SERVER-UPLOAD', 'TASK-IMPLEMENT-LOGGING'],
        outcome_refs: ['OUT-LOGGING-COMPLETE'],
        requirement_refs: ['REQ-SERVER-UPLOAD'],
        task_refs: ['TASK-IMPLEMENT-LOGGING'],
      },
    ],
    project_integration: { status: 'not_applicable' },
  };

  return {
    ...base,
    ...overrides,
  };
}

function errorIds(manifest: SemanticClosureManifest): string[] {
  return validateSemanticClosure(manifest).errors.map((issue) => issue.check_id);
}

describe('semantic closure fj1 regression acceptance', () => {
  it('accepts a complete logging outcome only when local persistence, flush wiring, and server upload evidence all pass', () => {
    const result = validateSemanticClosure(completeLoggingClosure());

    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects framework-only or compile-only evidence even when files and trace links exist', () => {
    const manifest = completeLoggingClosure({
      evidence: [
        {
          id: 'EV-LOCAL-PERSIST',
          status: 'passed',
          level: 'L2',
          evidence_type: 'compile-only framework files created',
          supports: ['OUT-LOGGING-COMPLETE', 'REQ-LOCAL-PERSIST', 'TASK-IMPLEMENT-LOGGING'],
          outcome_refs: ['OUT-LOGGING-COMPLETE'],
          requirement_refs: ['REQ-LOCAL-PERSIST'],
          task_refs: ['TASK-IMPLEMENT-LOGGING'],
        },
        {
          id: 'EV-FLUSH-WIRED',
          status: 'passed',
          level: 'L2',
          evidence_type: 'file-only Logger.flush exists',
          supports: ['OUT-LOGGING-COMPLETE', 'REQ-FLUSH-WIRED', 'TASK-IMPLEMENT-LOGGING'],
          outcome_refs: ['OUT-LOGGING-COMPLETE'],
          requirement_refs: ['REQ-FLUSH-WIRED'],
          task_refs: ['TASK-IMPLEMENT-LOGGING'],
        },
        {
          id: 'EV-SERVER-UPLOAD',
          status: 'passed',
          level: 'L2',
          evidence_type: 'build-only server endpoint declared',
          supports: ['OUT-LOGGING-COMPLETE', 'REQ-SERVER-UPLOAD', 'TASK-IMPLEMENT-LOGGING'],
          outcome_refs: ['OUT-LOGGING-COMPLETE'],
          requirement_refs: ['REQ-SERVER-UPLOAD'],
          task_refs: ['TASK-IMPLEMENT-LOGGING'],
        },
      ],
    });

    const result = validateSemanticClosure(manifest);

    expect(result.passed).toBe(false);
    expect(errorIds(manifest)).toContain('semantic_outcome_OUT-LOGGING-COMPLETE_required_evidence_passed');
    expect(errorIds(manifest)).toContain('semantic_requirement_REQ-FLUSH-WIRED_has_passed_evidence');
    expect(errorIds(manifest)).toContain('semantic_task_TASK-IMPLEMENT-LOGGING_evidence_passed');
  });

  it('rejects Logger.flush not wired into the real runtime path', () => {
    const manifest = completeLoggingClosure({
      evidence: completeLoggingClosure().evidence?.filter((item) => item.id !== 'EV-FLUSH-WIRED'),
    });

    const result = validateSemanticClosure(manifest);

    expect(result.passed).toBe(false);
    expect(errorIds(manifest)).toContain('semantic_requirement_REQ-FLUSH-WIRED_required_evidence_passed');
    expect(errorIds(manifest)).toContain('semantic_requirement_REQ-FLUSH-WIRED_has_passed_evidence');
    expect(errorIds(manifest)).toContain('semantic_task_TASK-IMPLEMENT-LOGGING_refs_exist');
  });

  it('rejects local-only logging evidence when server upload evidence is missing', () => {
    const manifest = completeLoggingClosure({
      evidence: completeLoggingClosure().evidence?.filter((item) => item.id !== 'EV-SERVER-UPLOAD'),
    });

    const result = validateSemanticClosure(manifest);

    expect(result.passed).toBe(false);
    expect(errorIds(manifest)).toContain('semantic_requirement_REQ-SERVER-UPLOAD_required_evidence_passed');
    expect(errorIds(manifest)).toContain('semantic_requirement_REQ-SERVER-UPLOAD_has_passed_evidence');
    expect(errorIds(manifest)).toContain('semantic_task_TASK-IMPLEMENT-LOGGING_refs_exist');
  });

  it('rejects project integration that is still unknown even if behavioral evidence passes', () => {
    const manifest = completeLoggingClosure({
      project_integration: { status: 'unknown' },
    });

    const result = validateSemanticClosure(manifest);

    expect(result.passed).toBe(false);
    expect(errorIds(manifest)).toContain('semantic_project_integration_closed');
  });
});
