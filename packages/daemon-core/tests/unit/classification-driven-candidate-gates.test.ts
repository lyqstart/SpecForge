import { describe, expect, it } from 'vitest';
import {
  classificationRequiresRequirementsCandidateForGate,
  requiredCandidateKindsForGate,
  workflowSpecificGateStages,
} from '../../src/tools/lib/gate-runner-v11';

describe('Classification-driven Candidate Gate requirements', () => {
  const architectureContractClassification = {
    requirement_changed: false,
    acceptance_criteria_changed: false,
    business_rule_changed: false,
    user_visible_behavior_changed: false,
    architecture_changed: true,
    data_model_changed: false,
    design_changed: true,
    module_contract_changed: true,
    module_boundary_changed: false,
    api_contract_changed: true,
  };

  it('does not require or execute Requirements when Requirement Classification is unchanged', () => {
    expect(
      classificationRequiresRequirementsCandidateForGate(
        architectureContractClassification
      )
    ).toBe(false);
    expect(
      requiredCandidateKindsForGate({
        workflowPath: 'architecture_change_path',
        candidatePhase: 'full',
        classification: architectureContractClassification,
      })
    ).toEqual(['design', 'tasks', 'trace_delta']);
    expect(
      workflowSpecificGateStages({
        workflowPath: 'architecture_change_path',
        candidatePhase: 'full',
        classification: architectureContractClassification,
      })
    ).toEqual(['design', 'tasks']);
  });

  it('requires Requirements only when Requirement semantics actually changed', () => {
    const classification = {
      ...architectureContractClassification,
      requirement_changed: true,
    };
    expect(classificationRequiresRequirementsCandidateForGate(classification)).toBe(true);
    expect(
      requiredCandidateKindsForGate({
        workflowPath: 'requirement_change_path',
        candidatePhase: 'full',
        classification,
      })
    ).toEqual(['design', 'requirements', 'tasks', 'trace_delta']);
    expect(
      workflowSpecificGateStages({
        workflowPath: 'requirement_change_path',
        candidatePhase: 'full',
        classification,
      })
    ).toEqual(['requirements', 'design', 'tasks']);
  });

  it('preserves the historical fail-closed profile when Classification is unavailable', () => {
    expect(
      requiredCandidateKindsForGate({
        workflowPath: 'architecture_change_path',
        candidatePhase: 'full',
        classification: null,
      })
    ).toEqual(['design', 'requirements', 'tasks', 'trace_delta']);
    expect(
      workflowSpecificGateStages({
        workflowPath: 'architecture_change_path',
        candidatePhase: 'full',
        classification: null,
      })
    ).toEqual(['requirements', 'design', 'tasks']);
  });

  it('fails closed when the optional workflow path is unavailable', () => {
    expect(
      requiredCandidateKindsForGate({
        workflowPath: undefined,
        candidatePhase: 'full',
        classification: architectureContractClassification,
      })
    ).toEqual(['design', 'requirements', 'tasks', 'trace_delta']);
    expect(
      workflowSpecificGateStages({
        workflowPath: undefined,
        candidatePhase: 'full',
        classification: architectureContractClassification,
      })
    ).toEqual(['requirements', 'design', 'tasks']);
  });

  it('keeps task_change_path scoped to Task and Trace candidates', () => {
    expect(
      requiredCandidateKindsForGate({
        workflowPath: 'task_change_path',
        candidatePhase: 'full',
        classification: architectureContractClassification,
      })
    ).toEqual(['tasks', 'trace_delta']);
    expect(
      workflowSpecificGateStages({
        workflowPath: 'task_change_path',
        candidatePhase: 'full',
        classification: architectureContractClassification,
      })
    ).toEqual(['tasks']);
  });
});
