/**
 * permissions.ts — SpecForge RBAC 权限类型定义
 *
 * Phase 1 RBAC 基座：定义资源类型、操作类型、权限请求和决策结果。
 *
 * 所有类型为纯接口，不含运行时逻辑。
 * 运行时强制由 workflow-runtime RBACEngine 实现（Phase 2+）。
 */

// ---------------------------------------------------------------------------
// ResourceType — 受保护资源类型
// ---------------------------------------------------------------------------

/**
 * 受保护资源类型枚举。
 *
 * 每种资源类型对应一组独立的权限规则：
 * - `state_transition`：WI 状态机跳转
 * - `spec_file`：requirements.md / design.md / tasks.md 等
 * - `gate_file`：gates/** / gate_summary.md
 * - `decision_file`：user_decision.json
 * - `merge_file`：merge_report.md / .specforge/project/**
 * - `code_file`：非 .specforge/ 文件
 * - `evidence_file`：evidence/** 文件
 * - `work_item_meta`：work_item.json
 * - `tool_invocation`：daemon-core tool 调用
 * - `archive_file`：archive/agent_runs/**
 */
export type ResourceType =
  | 'state_transition'
  | 'spec_file'
  | 'gate_file'
  | 'decision_file'
  | 'merge_file'
  | 'code_file'
  | 'evidence_file'
  | 'work_item_meta'
  | 'tool_invocation'
  | 'archive_file';

// ---------------------------------------------------------------------------
// Operation — 操作类型
// ---------------------------------------------------------------------------

/**
 * 操作类型枚举。
 *
 * - `read`：查看内容
 * - `create`：创建新文件/资源
 * - `modify`：修改已有内容
 * - `delete`：删除文件/资源
 * - `invoke`：调用 tool
 * - `grant`：释放/分配权限
 * - `revoke`：撤销权限
 */
export type Operation =
  | 'read'
  | 'create'
  | 'modify'
  | 'delete'
  | 'invoke'
  | 'grant'
  | 'revoke';

// ---------------------------------------------------------------------------
// Permission — 权限请求
// ---------------------------------------------------------------------------

/**
 * 一次权限请求 = (resource, operation) 对。
 *
 * RBACEngine.check() 接收 Permission 作为输入之一。
 */
export interface Permission {
  /** 目标资源类型 */
  resource: ResourceType;
  /** 请求的操作 */
  operation: Operation;
}

// ---------------------------------------------------------------------------
// PermissionContext — 权限评估上下文
// ---------------------------------------------------------------------------

/**
 * 权限评估所需的上下文信息。
 *
 * 所有字段可选 — 由调用方按场景提供。
 * RBACEngine 根据 context 中的字段做细粒度判断。
 */
export interface PermissionContext {
  /** Work Item ID */
  workItemId?: string;
  /** 工作流类型（feature_spec / bugfix_spec 等） */
  workflowType?: string;
  /** WI 当前状态 */
  currentState?: string;
  /** 目标状态（用于 state_transition） */
  targetState?: string;
  /** 目标文件路径（用于文件操作） */
  filePath?: string;
  /** 目标 tool 名称（用于 tool_invocation） */
  toolName?: string;
  /** WI 是否处于 frozen 状态 */
  isFrozen?: boolean;
}

// ---------------------------------------------------------------------------
// PermissionDecision — 权限评估结果
// ---------------------------------------------------------------------------

/**
 * RBAC 权限评估结果。
 *
 * Phase 1 语义：
 * - enableRBAC=false → { allowed: true, matchedRule: 'rbac_disabled' }
 * - enableRBAC=true + no rules → { allowed: false, reason: '...', matchedRule: 'default_deny' }
 */
export interface PermissionDecision {
  /** 是否允许 */
  allowed: boolean;
  /** 拒绝原因（allowed=false 时） */
  reason?: string;
  /** 匹配的规则 ID */
  matchedRule?: string;
}
