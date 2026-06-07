/**
 * workflow-path-selector-v11.ts — v1.1 标准 Workflow Path Selection（§6）
 *
 * 依据：SpecForge 最终融合标准 v1.1
 *
 * 负责：
 * - §6.2 Classification 与 Impact Analysis
 * - §6.3 匹配结果类型
 * - §6.4 workflow_path 枚举
 * - §6.5 路径优先级
 * - §6.6 unknown 升级规则
 * - §6.7 code-only 不是免流程
 *
 * 具体实现已拆分至三个模块（单向依赖）：
 * - change-classification.ts  — ChangeClassification interface + canUseCodeOnlyFastPath
 * - impact-analysis.ts        — selectWorkflowPath + generateTriggerResult + TriggerResult + WorkflowPath
 * - trigger-result.ts         — MatchResultType
 */

export * from './change-classification.js'
export * from './impact-analysis.js'
export * from './trigger-result.js'
