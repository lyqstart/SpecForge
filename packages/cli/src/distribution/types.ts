/**
 * Distribution 模块类型定义
 * 
 * 本文件集中导出 design.md "Data Models" 章节定义的所有接口。
 * 所有持久化数据类型必须带 schema_version: "1.0" 字段。
 */

// ============================================================================
// 1. PackageMetadata（发布期校验对象）
// ============================================================================

/**
 * 解析后的 package.json 结构
 * REQ-1.2: 必需字段包含 schema_version
 */
export interface ParsedPackageJson {
  schema_version: "1.0";
  name: string;
  version: string;
  description: string;
  main: string;
  types: string;
  files: string[];
  license: string;
  repository: { type: "git"; url: string };
  engines: { node: ">=20"; bun: ">=1.0" };

  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  private?: boolean;
  keywords?: string[];
  author?: string;
}

/**
 * 包验证上下文
 */
export interface ValidationContext {
  /** 该包在 monorepo 中的绝对路径，用于错误消息定位 */
  packagePath: string;
  /** 当前流水线模式：开发期允许 workspace:*，发布期不允许 */
  mode: "dev" | "publish";
  /** 其他公开包的 name → 精确版本映射（publish 模式下用于检查依赖） */
  publishVersionMap: ReadonlyMap<string, string>;
}

/**
 * 包验证结果
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * 包验证错误
 * 稳定的机器可读错误码，用于流水线退出消息
 */
export interface ValidationError {
  code:
    | "NAME_FORMAT"
    | "MISSING_FIELD"
    | "ENGINES_NODE"
    | "ENGINES_BUN"
    | "WORKSPACE_NOT_REWRITTEN"
    | "DEP_RANGE_FORBIDDEN"
    | "DEP_VERSION_NOT_PINNED"
    | "PUBLISH_BASELINE_DOWNGRADE"
    | "PUBLISH_VALIDATION";
  /** 出错的 package.json 字段 jsonpath，例如 "engines.node" 或 "dependencies.@specforge/foo" */
  field: string;
  message: string;
}

// ============================================================================
// 2. InstallationRecord（运行期持久化）
// ============================================================================

/**
 * 安装记录
 * 写入路径：~/.specforge/.installation.json
 * REQ-4.3: 必须包含 schema_version 和 5 个元数据字段
 */
export interface InstallationRecord {
  schema_version: string;
  /** ISO 8601 UTC ms："2026-05-19T12:34:56.789Z" */
  installedAt: string;
  /** = @specforge/cli package.json#version */
  cliVersion: string;
  /** 封闭枚举 */
  platform: "win32" | "darwin" | "linux";
  /** 封闭枚举 */
  installSource: "npm-global" | "npm-local" | "dev";
}

// ============================================================================
// 3. InitOptions / InitResult / InitJsonPayload
// ============================================================================

/**
 * specforge init 命令选项
 */
export interface InitOptions {
  force: boolean;
  json: boolean;
  /** 测试与文档样例可指定，正常用户不会传；默认走 PathResolver.resolveInstallRoot() */
  installRootOverride?: string;
}

/**
 * specforge init 命令执行结果
 */
export interface InitResult {
  exitCode: 0 | 1 | 2;
  /** REQ-3.5 的 JSON 输出对象；交互模式从中提炼摘要行 */
  payload: InitJsonPayload;
}

/**
 * specforge init --json 的 stdout 单行 JSON
 * REQ-3.5: 必须包含 schema_version 和指定字段
 */
export interface InitJsonPayload {
  schema_version: "1.0";
  /** 绝对路径 */
  installRoot: string;
  cliVersion: string;
  /** = SCHEMA_VERSION_BASELINE */
  baseline: string;
  /** 相对 installRoot；不含已存在的 */
  createdDirs: string[];
  /** 相对 installRoot；含目录与已存在的 init 管理文件 */
  existingDirs: string[];
  /** ≤100 项；每项 ≤500 字符（REQ-3.5） */
  warnings: string[];
  forceUsed: boolean;
  exitCode: 0 | 1 | 2;
}

// ============================================================================
// 4. VersionInfoPayload（CLI 输出契约）
// ============================================================================

/**
 * specforge --version --json 的 stdout 单行 JSON
 * REQ-6.4
 */
export interface VersionInfoPayload {
  schema_version: "1.0";
  cliVersion: string;
  schemaVersionBaseline: string;
  installRoot: string;
  /** 读不到/解析不了 → null */
  installRootSchemaVersion: string | null;
  /** 形如 "win32-x64" / "darwin-arm64" / "linux-x64" */
  platform: string;
}

// ============================================================================
// 5. SmokeTest 相关类型
// ============================================================================

/**
 * 烟雾测试单步
 */
export interface SmokeStep {
  name: string;
  command: string;
  /** 单步超时 ms，默认 120000 */
  timeoutMs?: number;
}

/**
 * 烟雾测试单步结果
 */
export interface SmokeStepResult {
  /** 形如 "specforge --version" */
  name: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  exitCode: number;
  /** stdout 摘要：UTF-8 截断到 4096 字符 */
  stdout: string;
  stderr: string;
  status: "passed" | "failed" | "timeout";
}

/**
 * 烟雾测试运行选项
 */
export interface SmokeRunOptions {
  /** 临时 HOME 目录的绝对路径，runner 自己创建 */
  tempHome: string;
  /** 报告输出路径；亦可由 SMOKE_REPORT_PATH 环境变量提供 */
  reportPath: string;
  /** 单步超时；默认 120000 ms */
  perStepTimeoutMs: number;
}

/**
 * 烟雾测试报告
 * 写入路径：--report-path 或 $SMOKE_REPORT_PATH
 * REQ-5.5: 必须包含 schema_version
 */
export interface SmokeReport {
  schema_version: "1.0";
  /** ISO 8601 UTC */
  startTime: string;
  endTime: string;
  /** process.platform-process.arch */
  platform: string;
  overallStatus: "passed" | "failed" | "timeout" | "cleanup_failed";
  steps: SmokeStepResult[];
  cleanup: { success: boolean; errors: string[] };
}

// ============================================================================
// 6. ErrorPayload（CLI 错误输出）
// ============================================================================

/**
 * CLI 错误输出
 * REQ-3.1, 3.7, 3.8, 3.9, 4.9, 6.5, 7.5, 7.6
 */
export interface ErrorPayload {
  schema_version: "1.0";
  error: { code: ErrorCode; message: string; details?: string };
  context: { operation: string; platform: string; cliVersion: string };
  remediation?: { action: string; command?: string };
}

/**
 * 错误码枚举
 * 每个 ErrorCode 一一对应一条 AC，便于测试逐项断言
 */
export type ErrorCode =
  | "INIT_UNKNOWN_FLAG"           // REQ-3.1 → exit 2
  | "INIT_LOCKED"                 // REQ-3.9 → exit 2
  | "INIT_HOME_NOT_SET"           // REQ-4.9 → exit 1
  | "INIT_PERMISSION_DENIED"      // REQ-3.8 → exit 1
  | "INIT_RESOURCE_WARNING"       // REQ-3.7 → exit 0（仅警告）
  | "PUBLISH_VALIDATION"          // REQ-1.7
  | "PUBLISH_BUILD_FAILED"        // REQ-1.8
  | "PUBLISH_DIST_MISSING"        // REQ-1.9
  | "PUBLISH_BASELINE_DOWNGRADE"  // REQ-6.6
  | "DAEMON_BASELINE_MISMATCH"    // REQ-6.5 → exit 1
  | "DAEMON_DOWNGRADE_REJECTED"   // REQ-7.5 → exit 4
  | "DAEMON_INSTALLATION_BROKEN"; // REQ-7.6 → exit 5
