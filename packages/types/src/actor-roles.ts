/**
 * actor-roles.ts — SpecForge 统一 Actor/Role 枚举定义
 *
 * 定义系统中所有 Actor 角色常量，用于：
 * - Agent Run 归档的 actor_type 字段
 * - 权限校验的角色标识
 * - 日志和审计追踪的 actor 标签
 */

/**
 * 系统内所有 Actor 角色的统一常量字典。
 *
 * 每个键值对代表一个明确的行为角色：
 * - `orchestrator`：主编排 Agent，负责工作流调度和子 Agent 分发
 * - `gateRunner`：Gate 检查执行器
 * - `userDecisionRecorder`：用户决策记录器
 * - `mergeRunner`：合并执行器
 * - `codePermissionService`：代码权限服务
 * - `closeGate`：关闭 Gate 操作执行器
 * - `agent`：通用 Agent 标识（用于非特定角色的 Agent Run）
 */
export const ACTOR_ROLES = {
  orchestrator: 'sf-orchestrator',
  gateRunner: 'gate_runner',
  userDecisionRecorder: 'user_decision_recorder',
  mergeRunner: 'merge_runner',
  codePermissionService: 'code_permission_service',
  closeGate: 'close_gate',
  agent: 'agent',
} as const;

/**
 * Actor 角色字面量联合类型。
 * 等价于 `'sf-orchestrator' | 'gate_runner' | 'user_decision_recorder' | 'merge_runner' | 'code_permission_service' | 'close_gate' | 'agent'`
 */
export type ActorRole = typeof ACTOR_ROLES[keyof typeof ACTOR_ROLES];
