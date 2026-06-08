/**
 * sf_safe_bash 类型定义
 *
 * 详细规范见 docs/engineering-lessons/universal/shell-command-execution.md
 */

/** Shell 名称（内联，不依赖外部文件） */
export type ShellName = string

/** 工具输入参数 */
export interface SafeBashArgs {
  /** 要执行的 shell 命令 */
  command: string
  /** 工作目录（绝对路径或相对仓库根目录的路径）。不传则用调用方 context.directory */
  cwd?: string
  /** 命令超时（毫秒），默认 60000 (60秒) */
  timeoutMs?: number
  /** 环境变量增量（合并到当前 env） */
  env?: Record<string, string>
  /** stdin 输入（多数命令不需要） */
  stdin?: string
  /** 限制 stdout/stderr 截断长度（字符），默认 4096 */
  outputLimit?: number
  /**
   * 调用者角色标识（v1.2 M2）。
   * 从 context.agent 提取，必须是有效的 ActorRole。
   * 缺失时默认 'agent'。
   */
  callerRole?: string
}

/** 工具返回结果 */
export interface SafeBashResult {
  /** 整体是否成功（exitCode === 0 且未被拦截） */
  success: boolean
  /** 子进程退出码，被拦截或异常时为 null */
  exitCode: number | null
  /** 标准输出（已按 outputLimit 截断） */
  stdout: string
  /** 标准错误（已按 outputLimit 截断） */
  stderr: string
  /** 执行耗时（毫秒），被拦截时为 0 */
  durationMs: number
  /** 实际执行的命令（可能含编码注入前缀和自动包装） */
  command: string
  /** 实际工作目录 */
  cwd: string | null
  /** 使用的 shell 名 */
  shell: ShellName | null
  /** true = 被规则引擎拒绝，未真正执行 */
  rejected: boolean
  /** true = 超时被强杀 */
  timeout: boolean
  /** 超时阈值（仅 timeout=true 时有意义） */
  timeoutMs?: number
  /** rejected 时填命中的规则 ID */
  rule?: string
  /** rejected/timeout 时填可操作建议 */
  suggestion?: string
  /** 排错提示（不一定有，但失败时尽量给） */
  hint?: string
  /** 输出是否被截断 */
  truncated?: { stdout: boolean; stderr: boolean }
  /** rejected 拦截时，原始命令（未经任何包装的输入） */
  originalCommand?: string
}

/** 规则拦截结果 */
export interface RejectionResult {
  rule: string
  reason: string
  suggestion: string
  hint?: string
}

/** 命令重写结果（不拒绝，但替换命令为更安全的版本） */
export interface RewriteResult {
  /** 命中的规则 ID */
  rule: string
  /** 重写后的命令 */
  rewrittenCommand: string
  /** 自动调整后的超时（毫秒），可选 */
  adjustedTimeoutMs?: number
  /** 给 agent 的解释，会附在最终结果的 hint 字段 */
  explanation: string
}

/** 规则引擎处理结果 */
export type RuleResult =
  | { kind: "pass" }                                  // 命令放行，不变
  | { kind: "reject"; rejection: RejectionResult }    // 拒绝执行
  | { kind: "rewrite"; rewrite: RewriteResult }       // 重写后执行

/** 命令规则引擎接口 */
export type CommandRule = (command: string) => RuleResult
