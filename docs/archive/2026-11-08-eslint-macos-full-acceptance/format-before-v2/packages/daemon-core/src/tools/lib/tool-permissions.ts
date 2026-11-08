/**
 * tool-permissions.ts — v1.2 M3: Tool Permission 定义与检查
 *
 * 职责：
 * - 定义受保护 tool 列表（PROTECTED_TOOLS）
 * - 定义最小权限检查策略
 * - 在 dispatcher 层建立统一 RBAC 入口 gate
 *
 * 设计原则：
 * - 初始只保护 3 个 tool（sf_state_transition, sf_artifact_write, sf_safe_bash）
 * - 其他 tool 保持 allow-by-default
 * - enableRBAC=false / undefined 时不执行检查
 * - 不重写 handler 内部逻辑（状态机、write guard、bash guard 各自负责）
 * - 不做文件持久化 audit（v1.2.1 范围）
 */

import { ACTOR_ROLES, type ActorRole } from '@specforge/types/actor-roles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Tool 权限配置
 */
export interface ToolPermissionConfig {
  /** 是否为受保护 tool */
  protected: boolean;
  /** 描述（用于错误信息 / audit） */
  description: string;
}

/**
 * Dispatcher 层权限检查结果
 */
export interface ToolPermissionDecision {
  /** 是否允许 */
  allowed: boolean;
  /** 被检查的 tool 名称 */
  tool: string;
  /** 提取的 actor（可能为 null） */
  actor: string | null;
  /** enableRBAC 是否生效 */
  rbacActive: boolean;
  /** 拒绝原因（仅 allowed=false 时有值） */
  reason?: string;
  /** 决策时间戳 */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// PROTECTED_TOOLS — 受保护 tool 列表
// ---------------------------------------------------------------------------

/**
 * 受保护 tool 配置表。
 *
 * v1.2 初始版本：精确包含 3 个 tool。
 * 其他 tool 不在此表中 → allow-by-default。
 */
export const PROTECTED_TOOLS: Readonly<Record<string, ToolPermissionConfig>> = {
  'sf_state_transition': {
    protected: true,
    description: 'State machine advancement — controls WI lifecycle transitions',
  },
  'sf_artifact_write': {
    protected: true,
    description: 'File write to .specforge/ — controls spec/evidence file creation',
  },
  'sf_safe_bash': {
    protected: true,
    description: 'Shell command execution — may indirectly modify files',
  },
} as const;

/**
 * 有效 ActorRole 集合（用于快速查找）
 */
const VALID_ACTOR_ROLES: ReadonlySet<string> = new Set<string>(Object.values(ACTOR_ROLES));

// ---------------------------------------------------------------------------
// In-memory decision log（v1.2 最小 audit — 不做文件持久化）
// ---------------------------------------------------------------------------

const decisionLog: ToolPermissionDecision[] = [];
const MAX_DECISION_LOG_SIZE = 1000;

function recordDecision(decision: ToolPermissionDecision): void {
  decisionLog.push(decision);
  if (decisionLog.length > MAX_DECISION_LOG_SIZE) {
    decisionLog.shift();
  }
}

/**
 * 获取最近的权限决策记录（测试 / debug 用）。
 * v1.2 不做文件持久化，仅内存。
 */
export function getRecentDecisions(count: number = 50): readonly ToolPermissionDecision[] {
  return decisionLog.slice(-count);
}

/** 清空决策记录（测试用） */
export function clearDecisionLog(): void {
  decisionLog.length = 0;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * 判断一个 tool 是否为受保护 tool。
 */
export function isProtectedTool(toolName: string): boolean {
  return PROTECTED_TOOLS[toolName]?.protected === true;
}

/**
 * 获取受保护 tool 名称列表。
 */
export function getProtectedToolNames(): readonly string[] {
  return Object.keys(PROTECTED_TOOLS);
}

/**
 * 从 context 中提取有效的 actor 字符串。
 *
 * 规则：
 * - context.agent 为有效 ActorRole → 返回该值
 * - context.agent 为空 / 无效 → 返回 null（handler 内部 fallback 到 'agent'）
 * - 不提升权限
 */
export function extractActor(context: Record<string, unknown> | undefined): string | null {
  const agent = context?.agent;
  if (typeof agent !== 'string' || !agent) return null;
  if (VALID_ACTOR_ROLES.has(agent)) return agent;
  // Unknown agent string → 不提升权限，返回 null
  return null;
}

/**
 * 从 context 中提取 enableRBAC 值。
 *
 * 规则：
 * - 只接受 boolean true
 * - 其他值（false / undefined / string / number）→ 视为 false
 */
export function extractEnableRBAC(context: Record<string, unknown> | undefined): boolean {
  const val = context?.enableRBAC;
  return val === true;
}

// ---------------------------------------------------------------------------
// resolveToolPermission — 核心权限检查函数
// ---------------------------------------------------------------------------

/**
 * Tool 权限检查参数
 */
export interface ToolPermissionParams {
  /** 要调用的 tool 名称 */
  tool: string;
  /** 从 context 提取的 actor（可为 null） */
  actor: string | null;
  /** enableRBAC 是否生效 */
  enableRBAC: boolean;
}

/**
 * 解析 tool 调用权限。
 *
 * 逻辑：
 * 1. enableRBAC=false → 直接允许（不检查）
 * 2. tool 不在 PROTECTED_TOOLS → 直接允许（allow-by-default）
 * 3. tool 在 PROTECTED_TOOLS → 执行最小权限检查
 *    - actor 必须存在（非 null）
 *    - actor 必须是有效 ActorRole
 *
 * 注意：dispatcher 层只做入口 gate，不重写 handler 内部逻辑。
 * 例如：
 * - sf_state_transition 的 seal transition 检查仍由 TransitionAuthorizer 负责
 * - sf_artifact_write 的文件保护仍由 write-guard-v11 负责
 * - sf_safe_bash 的命令安全仍由 bash-guard 负责
 */
export function resolveToolPermission(params: ToolPermissionParams): ToolPermissionDecision {
  const { tool, actor, enableRBAC } = params;
  const timestamp = new Date().toISOString();

  // 1. enableRBAC=false → allow（不执行任何检查）
  if (!enableRBAC) {
    const decision: ToolPermissionDecision = {
      allowed: true,
      tool,
      actor,
      rbacActive: false,
      timestamp,
    };
    recordDecision(decision);
    return decision;
  }

  // 2. tool 不在 PROTECTED_TOOLS → allow-by-default
  if (!isProtectedTool(tool)) {
    const decision: ToolPermissionDecision = {
      allowed: true,
      tool,
      actor,
      rbacActive: true,
      timestamp,
    };
    recordDecision(decision);
    return decision;
  }

  // 3. Protected tool — 最小权限检查
  // 3a. actor 必须存在
  if (actor === null) {
    const decision: ToolPermissionDecision = {
      allowed: false,
      tool,
      actor: null,
      rbacActive: true,
      reason: `RBAC: protected tool '${tool}' requires a valid actor, but no valid context.agent provided`,
      timestamp,
    };
    recordDecision(decision);
    return decision;
  }

  // 3b. actor 必须是有效 ActorRole（extractActor 已保证，但双重检查）
  if (!VALID_ACTOR_ROLES.has(actor)) {
    const decision: ToolPermissionDecision = {
      allowed: false,
      tool,
      actor,
      rbacActive: true,
      reason: `RBAC: protected tool '${tool}' requires a valid ActorRole, got '${actor}'`,
      timestamp,
    };
    recordDecision(decision);
    return decision;
  }

  // 4. 通过 — 允许进入 handler
  const decision: ToolPermissionDecision = {
    allowed: true,
    tool,
    actor,
    rbacActive: true,
    timestamp,
  };
  recordDecision(decision);
  return decision;
}
