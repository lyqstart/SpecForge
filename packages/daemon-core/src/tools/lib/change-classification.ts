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
  data_model_changed?: boolean;
  module_contract_changed?: boolean;
  contract_registry_only?: boolean;
  unknowns: string[];
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
