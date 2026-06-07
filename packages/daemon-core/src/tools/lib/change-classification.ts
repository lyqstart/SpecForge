/**
 * change-classification.ts — Classification 结果与 §6.7 code-only 条件检查
 *
 * 从 workflow-path-selector-v11.ts 提取。
 */

// ---------------------------------------------------------------------------
// Classification 结果
// ---------------------------------------------------------------------------

export interface ChangeClassification {
  /** 变化层级：影响需求/设计/架构/任务/代码 */
  requirement_changed: boolean;
  acceptance_criteria_changed: boolean;
  business_rule_changed: boolean;
  user_visible_behavior_changed: boolean;
  data_semantics_changed: boolean;
  design_changed: boolean;
  module_boundary_changed: boolean;
  api_contract_changed: boolean;
  architecture_changed: boolean;
  /** unknowns 列表 */
  unknowns: string[];
}

/**
 * §6.7 code-only 进入条件。
 */
export function canUseCodeOnlyFastPath(classification: ChangeClassification): boolean {
  return (
    classification.requirement_changed === false &&
    classification.acceptance_criteria_changed === false &&
    classification.business_rule_changed === false &&
    (classification.user_visible_behavior_changed === false) &&
    classification.data_semantics_changed === false &&
    classification.design_changed === false &&
    classification.module_boundary_changed === false &&
    classification.api_contract_changed === false &&
    classification.unknowns.length === 0
  );
}
