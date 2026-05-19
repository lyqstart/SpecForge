/**
 * Error Payload 工厂与错误处理
 * 
 * 本文件实现 design.md "Error Handling" 章节定义的：
 * 1. ErrorCode → exitCode 映射表（11 条 ErrorCode 全覆盖）
 * 2. ErrorPayload 工厂函数
 * 3. emitError 函数：stderr 输出人类消息 + JSON 模式额外 stdout 输出 ErrorPayload
 * 
 * **Validates: Requirements 3.1, 3.7, 3.8, 3.9, 4.9, 6.5, 7.5, 7.6**
 */

import type { ErrorCode, ErrorPayload } from "./types.js";

// ============================================================================
// ErrorCode → exitCode 映射表
// ============================================================================

/**
 * ErrorCode 到退出码的完整映射表
 * 
 * 退出码语义：
 * - 0: 仅警告（INIT_RESOURCE_WARNING）
 * - 1: 一般错误（HOME 未设置、权限拒绝、baseline 不匹配等）
 * - 2: 用户输入错误（未知 flag、锁冲突）
 * - 4: 降级拒绝（DAEMON_DOWNGRADE_REJECTED）
 * - 5: 安装损坏（DAEMON_INSTALLATION_BROKEN）
 * 
 * **覆盖范围**：12 条 ErrorCode 全覆盖
 * - INIT 类：5 条（UNKNOWN_FLAG, RESOURCE_WARNING, HOME_NOT_SET, LOCKED, PERMISSION_DENIED）
 * - PUBLISH 类：4 条（VALIDATION, BUILD_FAILED, DIST_MISSING, BASELINE_DOWNGRADE）
 * - DAEMON 类：3 条（INSTALLATION_BROKEN, BASELINE_MISMATCH, DOWNGRADE_REJECTED）
 */
export const ERROR_CODE_TO_EXIT_CODE: Record<ErrorCode, number> = {
  // INIT 类错误
  INIT_RESOURCE_WARNING: 0,       // REQ-3.7: 资源不足警告，不阻止安装
  INIT_UNKNOWN_FLAG: 2,           // REQ-3.1: 用户输入错误
  INIT_HOME_NOT_SET: 1,           // REQ-4.9: 环境配置错误
  INIT_LOCKED: 2,                 // REQ-3.9: 并发冲突
  INIT_PERMISSION_DENIED: 1,      // REQ-3.8: 权限错误
  
  // PUBLISH 类错误（流水线）
  PUBLISH_VALIDATION: 1,          // REQ-1.7: 包验证失败
  PUBLISH_BUILD_FAILED: 1,        // REQ-1.8: 构建失败
  PUBLISH_DIST_MISSING: 1,        // REQ-1.9: dist 文件缺失
  PUBLISH_BASELINE_DOWNGRADE: 1,  // REQ-6.6: baseline 单调性违反
  
  // DAEMON 类错误（运行期健康检查）
  DAEMON_INSTALLATION_BROKEN: 5,  // REQ-7.6: .installation.json 损坏/缺失
  DAEMON_BASELINE_MISMATCH: 1,    // REQ-6.5: baseline 不匹配（需迁移）
  DAEMON_DOWNGRADE_REJECTED: 4,   // REQ-7.5: 降级拒绝
};

// ============================================================================
// ErrorContext 类型
// ============================================================================

/**
 * 错误上下文
 * 根据不同 ErrorCode 提供不同的上下文信息
 */
export interface ErrorContext {
  /** 人类可读的错误消息 */
  message?: string;
  /** 额外的结构化详情（可选） */
  details?: Record<string, unknown>;
  /** 操作名称（用于 ErrorPayload.context.operation） */
  operation?: string;
  /** 补救措施（可选） */
  remediation?: {
    action: string;
    command?: string;
  };
}

// ============================================================================
// ErrorPayload 工厂函数
// ============================================================================

/**
 * 构造 ErrorPayload 对象
 * 
 * @param code - ErrorCode 枚举值
 * @param context - 错误上下文
 * @param cliVersion - CLI 版本（从 package.json 读取）
 * @param platform - 平台字符串（形如 "win32-x64"）
 * @returns 完整的 ErrorPayload 对象
 */
export function createErrorPayload(
  code: ErrorCode,
  context: ErrorContext,
  cliVersion: string,
  platform: string,
): ErrorPayload {
  return {
    schema_version: "1.0",
    error: {
      code,
      message: context.message || getDefaultMessage(code),
      details: context.details ? JSON.stringify(context.details) : undefined,
    },
    context: {
      operation: context.operation || "unknown",
      platform,
      cliVersion,
    },
    remediation: context.remediation,
  };
}

/**
 * 获取 ErrorCode 的默认消息
 * 当 context.message 未提供时使用
 */
function getDefaultMessage(code: ErrorCode): string {
  const messages: Record<ErrorCode, string> = {
    INIT_RESOURCE_WARNING: "System resources below recommended threshold",
    INIT_UNKNOWN_FLAG: "Unknown flag provided to init command",
    INIT_HOME_NOT_SET: "HOME environment variable is not set",
    INIT_LOCKED: "Another init process is currently running",
    INIT_PERMISSION_DENIED: "Permission denied while creating installation directory",
    PUBLISH_VALIDATION: "Package validation failed",
    PUBLISH_BUILD_FAILED: "Package build failed",
    PUBLISH_DIST_MISSING: "Required dist files are missing after build",
    PUBLISH_BASELINE_DOWNGRADE: "Schema version baseline downgrade detected",
    DAEMON_INSTALLATION_BROKEN: "Installation is broken or incomplete",
    DAEMON_BASELINE_MISMATCH: "Schema version mismatch detected",
    DAEMON_DOWNGRADE_REJECTED: "Downgrade not supported",
  };
  return messages[code];
}

// ============================================================================
// emitError 函数
// ============================================================================

/**
 * 发出错误并返回对应的退出码
 * 
 * **行为**：
 * 1. stderr 输出单行人类可读消息
 * 2. JSON 模式：stdout 额外输出 ErrorPayload 单行 JSON
 * 3. 返回 ERROR_CODE_TO_EXIT_CODE 映射表中的退出码
 * 
 * **约束**：
 * - stderr 消息必须是单行（不含换行符，或换行符被替换为空格）
 * - JSON 模式的 stdout 必须是单行 JSON（不含 ANSI 转义序列）
 * - 退出码必须严格按照映射表返回
 * 
 * @param code - ErrorCode 枚举值
 * @param context - 错误上下文
 * @param jsonMode - 是否为 JSON 模式（--json flag）
 * @param cliVersion - CLI 版本（默认从 process.env 或 package.json 读取）
 * @param platform - 平台字符串（默认从 process.platform 和 process.arch 构造）
 * @returns 对应的退出码（0/1/2/4/5）
 */
export function emitError(
  code: ErrorCode,
  context: ErrorContext,
  jsonMode: boolean,
  cliVersion?: string,
  platform?: string,
): number {
  // 获取 CLI 版本和平台信息
  const version = cliVersion || process.env.npm_package_version || "unknown";
  const platformStr = platform || `${process.platform}-${process.arch}`;

  // 构造 ErrorPayload
  const payload = createErrorPayload(code, context, version, platformStr);

  // 构造人类可读消息（单行）
  const humanMessage = buildHumanMessage(code, context);

  // stderr 输出人类消息（单行）
  process.stderr.write(humanMessage + "\n");

  // JSON 模式：stdout 输出 ErrorPayload 单行 JSON
  if (jsonMode) {
    const jsonOutput = JSON.stringify(payload);
    process.stdout.write(jsonOutput + "\n");
  }

  // 返回对应的退出码
  return ERROR_CODE_TO_EXIT_CODE[code];
}

/**
 * 构造人类可读的错误消息（单行）
 * 
 * @param code - ErrorCode 枚举值
 * @param context - 错误上下文
 * @returns 单行错误消息
 */
function buildHumanMessage(code: ErrorCode, context: ErrorContext): string {
  const message = context.message || getDefaultMessage(code);
  
  // 构造基础消息
  let humanMsg = `Error [${code}]: ${message}`;

  // 添加详情（如果有）
  if (context.details) {
    const detailsStr = Object.entries(context.details)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(", ");
    humanMsg += ` (${detailsStr})`;
  }

  // 添加补救措施（如果有）
  if (context.remediation) {
    humanMsg += ` | Remedy: ${context.remediation.action}`;
    if (context.remediation.command) {
      humanMsg += ` (run: ${context.remediation.command})`;
    }
  }

  // 确保单行（替换所有换行符为空格）
  return humanMsg.replace(/\r?\n/g, " ");
}
