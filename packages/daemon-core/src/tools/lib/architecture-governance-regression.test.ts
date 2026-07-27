import { describe, expect, it } from 'vitest';
import { canUseCodeOnlyFastPath, type ChangeClassification } from './change-classification.js';
import { generateTriggerResult, selectWorkflowPath } from './impact-analysis.js';

function baseClassification(): ChangeClassification {
  return {
    requirement_changed: false,
    acceptance_criteria_changed: false,
    business_rule_changed: false,
    user_visible_behavior_changed: false,
    data_semantics_changed: false,
    design_changed: false,
    module_boundary_changed: false,
    api_contract_changed: false,
    architecture_changed: false,
    data_model_changed: false,
    module_contract_changed: false,
    contract_registry_only: false,
    unknowns: [],
  };
}

describe('architecture consistency routing', () => {
  it('blocks Fast Path when Architecture changes', () => {
    const classification = { ...baseClassification(), architecture_changed: true };
    expect(canUseCodeOnlyFastPath(classification)).toBe(false);
    expect(selectWorkflowPath(classification)).toBe('architecture_change_path');
  });

  it('routes Data Model changes through design governance when Requirement and Architecture stay stable', () => {
    const classification = { ...baseClassification(), data_model_changed: true };
    expect(canUseCodeOnlyFastPath(classification)).toBe(false);
    expect(selectWorkflowPath(classification)).toBe('design_change_path');
  });

  it('keeps Requirement governance authoritative when a Requirement cascades into Architecture changes', () => {
    const classification = {
      ...baseClassification(),
      requirement_changed: true,
      architecture_changed: true,
    };
    expect(selectWorkflowPath(classification)).toBe('requirement_change_path');
  });

  it('persists a normalized Impact Scope in Trigger Result', () => {
    const result = generateTriggerResult('WI-0042', baseClassification(), [], {
      affected_modules: ['SYNC', 'SYNC'],
      architecture_refs: ['ARCH-FILE-001'],
      data_model_refs: [],
      design_refs: ['DD-SYNC-001'],
      project_contract_refs: [],
      module_contract_refs: [],
      planned_code_paths: ['packages/sync/**'],
    });
    expect(result.impact_scope.affected_modules).toEqual(['SYNC']);
    expect(result.impact_scope.architecture_refs).toEqual(['ARCH-FILE-001']);
    expect(result.impact_scope.design_refs).toEqual(['DD-SYNC-001']);
  });
});
