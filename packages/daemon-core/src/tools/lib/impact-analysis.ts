/**
 * impact-analysis.ts — §6.5 路径选择逻辑 + Trigger Result 生成
 *
 * 从 workflow-path-selector-v11.ts 提取。
 * 依赖 change-classification.ts 和 trigger-result.ts（单向）。
 */

import type { ChangeClassification } from './change-classification.js';
import { canUseCodeOnlyFastPath } from './change-classification.js';
import type { MatchResultType } from './trigger-result.js';

// ---------------------------------------------------------------------------
// §6.4 workflow_path 枚举（impact-analysis 使用）
// ---------------------------------------------------------------------------

export type WorkflowPath =
  | 'requirement_change_path'
  | 'design_change_path'
  | 'architecture_change_path'
  | 'task_change_path'
  | 'code_only_fast_path'
  | 'spec_migration_path'
  | 'rollback_path';

// ---------------------------------------------------------------------------
// §6.5 路径选择逻辑
// ---------------------------------------------------------------------------

/**
 * 根据 Classification 选择 workflow_path（§6.5）。
 *
 * 优先级：
 * 1. architecture_change_path（最高）
 * 2. requirement_change_path
 * 3. design_change_path
 * 4. task_change_path
 * 5. code_only_fast_path（最低）
 */
export function selectWorkflowPath(
  classification: ChangeClassification,
): WorkflowPath {
  // §6.6 unknown 升级规则
  if (classification.unknowns.length > 0) {
    if (classification.architecture_changed || classification.unknowns.some(u => u.includes('architecture'))) {
      return 'architecture_change_path';
    }
    if (classification.requirement_changed || classification.unknowns.some(u => u.includes('requirement'))) {
      return 'requirement_change_path';
    }
    if (classification.design_changed || classification.unknowns.some(u => u.includes('design'))) {
      return 'design_change_path';
    }
    // unknown 存在但不明确层级 → 最高安全路径
    return 'requirement_change_path';
  }

  // §6.5 普通路径优先级
  if (classification.architecture_changed || classification.module_boundary_changed) {
    return 'architecture_change_path';
  }

  if (classification.requirement_changed || classification.acceptance_criteria_changed || classification.business_rule_changed) {
    return 'requirement_change_path';
  }

  if (classification.design_changed || classification.api_contract_changed || classification.data_semantics_changed) {
    return 'design_change_path';
  }

  if (classification.user_visible_behavior_changed) {
    return 'task_change_path';
  }

  // §6.7 code-only 条件检查
  if (canUseCodeOnlyFastPath(classification)) {
    return 'code_only_fast_path';
  }

  // 默认走 task_change_path（安全降级）
  return 'task_change_path';
}

// ---------------------------------------------------------------------------
// Trigger Result 生成
// ---------------------------------------------------------------------------

export interface TriggerResult {
  schema_version: '1.0';
  work_item_id: string;
  workflow_path: WorkflowPath;
  classification: ChangeClassification;
  match_results: Array<{
    spec_type: string;
    spec_path: string;
    match_type: MatchResultType;
  }>;
  selected_at: string;
}

/**
 * 生成 trigger_result.json（§6.1）。
 */
export function generateTriggerResult(
  workItemId: string,
  classification: ChangeClassification,
  matchResults: TriggerResult['match_results'],
): TriggerResult {
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    workflow_path: selectWorkflowPath(classification),
    classification,
    match_results: matchResults,
    selected_at: new Date().toISOString(),
  };
}
