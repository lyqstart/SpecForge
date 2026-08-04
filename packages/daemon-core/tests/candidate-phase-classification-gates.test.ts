import { describe, expect, it } from 'vitest';
import {
  requiredCandidateKindsForGate,
  workflowSpecificGateStages,
} from '../src/tools/lib/gate-runner-v11';

function phasedClassification(): Record<string, unknown> {
  return {
    requirement_changed: false,
    acceptance_criteria_changed: true,
    business_rule_changed: false,
    user_visible_behavior_changed: true,
    data_semantics_changed: true,
    design_changed: true,
    module_boundary_changed: false,
    api_contract_changed: false,
    architecture_changed: true,
    unknowns: [],
  };
}

describe('Candidate Phase and Classification gate intersection', () => {
  it('keeps design phase limited to Design Candidate and Design Gate', () => {
    const classification = phasedClassification();

    expect(
      requiredCandidateKindsForGate({
        workflowPath: 'design_change_path',
        candidatePhase: 'design',
        classification,
      })
    ).toEqual(['design']);
    expect(
      workflowSpecificGateStages({
        workflowPath: 'design_change_path',
        candidatePhase: 'design',
        classification,
      })
    ).toEqual(['design']);
  });

  it('requires Requirement only when the requirements phase becomes active', () => {
    const classification = phasedClassification();

    expect(
      requiredCandidateKindsForGate({
        workflowPath: 'design_change_path',
        candidatePhase: 'requirements',
        classification,
      })
    ).toEqual(['design', 'requirements']);
    expect(
      workflowSpecificGateStages({
        workflowPath: 'design_change_path',
        candidatePhase: 'requirements',
        classification,
      })
    ).toEqual(['requirements']);
  });

  it('reconciles every applicable professional artifact and Gate at full phase', () => {
    const classification = phasedClassification();

    expect(
      requiredCandidateKindsForGate({
        workflowPath: 'design_change_path',
        candidatePhase: 'full',
        classification,
      })
    ).toEqual(['design', 'requirements', 'tasks', 'trace_delta']);
    expect(
      workflowSpecificGateStages({
        workflowPath: 'design_change_path',
        candidatePhase: 'full',
        classification,
      })
    ).toEqual(['requirements', 'design', 'tasks']);
  });
});
