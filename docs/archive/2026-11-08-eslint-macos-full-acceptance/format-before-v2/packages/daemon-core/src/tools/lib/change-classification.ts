/**
 * change-classification.ts — Classification 结果与 code-only 条件检查。
 */
export interface ChangeClassification {
  requirement_changed: boolean;
  acceptance_criteria_changed: boolean;
  business_rule_changed: boolean;
  user_visible_behavior_changed: boolean;
  data_semantics_changed: boolean;
  design_changed: boolean;
  module_boundary_changed: boolean;
  api_contract_changed: boolean;
  architecture_changed: boolean;
  data_model_changed: boolean;
  module_contract_changed: boolean;
  contract_registry_only?: boolean;
  unknowns: string[];
}

export const REQUIRED_CHANGE_CLASSIFICATION_BOOLEAN_FIELDS = [
  'requirement_changed',
  'acceptance_criteria_changed',
  'business_rule_changed',
  'user_visible_behavior_changed',
  'data_semantics_changed',
  'design_changed',
  'module_boundary_changed',
  'api_contract_changed',
  'architecture_changed',
  'data_model_changed',
  'module_contract_changed',
] as const;

export const OPTIONAL_CHANGE_CLASSIFICATION_BOOLEAN_FIELDS = [
  'contract_registry_only',
] as const;

export function validateChangeClassification(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['classification must be an object'];
  }

  const classification = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const field of REQUIRED_CHANGE_CLASSIFICATION_BOOLEAN_FIELDS) {
    if (typeof classification[field] !== 'boolean') {
      errors.push(`${field} must be boolean`);
    }
  }
  for (const field of OPTIONAL_CHANGE_CLASSIFICATION_BOOLEAN_FIELDS) {
    if (classification[field] !== undefined && typeof classification[field] !== 'boolean') {
      errors.push(`${field} must be boolean when provided`);
    }
  }
  if (!Array.isArray(classification.unknowns) ||
      classification.unknowns.some(item => typeof item !== 'string')) {
    errors.push('unknowns must be an array of strings');
  }
  return errors;
}

export function canUseCodeOnlyFastPath(classification: ChangeClassification): boolean {
  return (
    classification.requirement_changed === false &&
    classification.acceptance_criteria_changed === false &&
    classification.business_rule_changed === false &&
    classification.user_visible_behavior_changed === false &&
    classification.data_semantics_changed === false &&
    classification.design_changed === false &&
    classification.module_boundary_changed === false &&
    classification.api_contract_changed === false &&
    classification.architecture_changed === false &&
    classification.data_model_changed !== true &&
    classification.module_contract_changed !== true &&
    classification.unknowns.length === 0
  );
}
