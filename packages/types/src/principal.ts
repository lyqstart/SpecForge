/**
 * principal.ts — SpecForge 统一 Principal / AgentRole 类型定义
 *
 * Phase 1 RBAC 基座：桥接 ActorRole（系统角色）与 AgentRole（调度角色），
 * 定义统一的 Principal 身份模型。
 *
 * 设计决策（P4 §11）：
 * - Q2: user 是特殊 Principal，不加入 ActorRole 常量
 * - Q3: sf-debugger / sf-investigator 继承 agent，Phase 1 不新增 ActorRole
 * - Q4: Runtime State Machine 保留字符串字面量
 */

import type { ActorRole } from './actor-roles.js';

// ---------------------------------------------------------------------------
// AgentRole — 独立定义（避免 types 反向依赖 workflow-runtime）
// ---------------------------------------------------------------------------

/**
 * Agent 调度角色类型。
 *
 * 独立于 workflow-runtime/src/AgentRunner.ts 中的同名类型，
 * 避免循环依赖。两处定义必须保持同步。
 *
 * 值来自 OpenCode Task API 的 subagent_type 参数：
 * - `dev`：sf-executor
 * - `reviewer`：sf-reviewer
 * - `orchestrator`：sf-orchestrator（agent dispatch 语境）
 * - `requirements`：sf-requirements
 * - `design`：sf-design
 * - `task-planner`：sf-task-planner
 * - `verifier`：sf-verifier
 * - `general`：默认 / 未指定
 */
export type AgentRole =
  | 'dev'
  | 'reviewer'
  | 'orchestrator'
  | 'requirements'
  | 'design'
  | 'task-planner'
  | 'verifier'
  | 'general';

// ---------------------------------------------------------------------------
// PrincipalSource — Principal 来源
// ---------------------------------------------------------------------------

/**
 * Principal 的来源标识。
 *
 * - `tool_call`：通过 daemon-core tool handler 调用
 * - `state_machine`：v1.1 状态机内部触发
 * - `http_api`：通过 HTTP API 调用
 * - `internal`：系统内部自动触发
 * - `user`：用户直接操作（Q2：特殊 Principal，不是 ActorRole）
 */
export type PrincipalSource =
  | 'tool_call'
  | 'state_machine'
  | 'http_api'
  | 'internal'
  | 'user';

// ---------------------------------------------------------------------------
// PrincipalRole — 全局角色联合类型
// ---------------------------------------------------------------------------

/**
 * 全局角色联合类型，涵盖所有可能的身份角色。
 *
 * 包含：
 * - 所有 ActorRole 值（系统角色）
 * - `'Runtime State Machine'`（Q4：保留字符串字面量）
 * - `'system'`（系统内部操作）
 * - `'user'`（Q2：用户直接操作，不加入 ACTOR_ROLES）
 */
export type PrincipalRole =
  | ActorRole
  | 'Runtime State Machine'
  | 'system'
  | 'user';

// ---------------------------------------------------------------------------
// Principal — 统一身份模型
// ---------------------------------------------------------------------------

/**
 * 统一 Principal 身份模型。
 *
 * 桥接 ActorRole（系统角色，用于 write guard / state advancement）
 * 与 AgentRole（调度角色，用于 agent dispatch / gate execution）。
 *
 * 每个操作请求必须携带 Principal，用于 RBAC 权限评估。
 */
export interface Principal {
  /** 系统角色（来自 ACTOR_ROLES），用于 write guard / state advancement */
  actorRole: ActorRole;

  /** 调度角色（来自 AgentRole），用于 agent dispatch / gate execution。
   *  system 服务类主体为 null。 */
  agentRole: AgentRole | null;

  /** 会话 ID，用于审计追踪 */
  sessionId?: string;

  /** 来源标识 */
  source: PrincipalSource;
}
