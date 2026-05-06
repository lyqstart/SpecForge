/**
 * SpecForge V3.5.0 — 核心类型定义
 *
 * 统一 Plugin 架构重构后的接口和常量定义。
 * 已移除：LegacyManifest、FORBIDDEN_COMBINATIONS、projectLevel/runtimeOnly/target 参数
 */

// ============================================================
// 用户级 Manifest（{User_Level_Directory}/specforge-manifest.json）
// ============================================================

export interface UserLevelManifest {
  /** Manifest 结构版本，当前 "1.0" */
  schema_version: "1.0"
  /** SpecForge 共享组件版本（semver，如 "3.5.0"） */
  shared_version: string
  /** 安装模式标识 */
  install_mode: "user_level"
  /** 首次安装时间 */
  installed_at: string // ISO8601
  /** 最近更新时间 */
  updated_at: string // ISO8601
  /** SpecForge 管理的 Agent 名称列表 */
  managed_agents: string[]
  /** 每个 Agent 配置片段的 SHA-256 哈希（规范化 JSON） */
  managed_agent_hashes: Record<string, string>
  /** 已部署文件的校验和、大小和类型（路径为 POSIX 风格相对路径） */
  files: Record<string, FileEntry>
}

export interface FileEntry {
  sha256: string
  size: number
  type: "agent" | "tool" | "tool_lib" | "skill" | "plugin"
}

// ============================================================
// 项目级 Manifest（specforge/manifest.json）
// ============================================================

export interface ProjectLevelManifest {
  /** Manifest 结构版本，当前 "1.0" */
  schema_version: "1.0"
  /** 运行时数据 schema 版本 */
  runtime_schema_version: string
  /** 安装模式 */
  install_mode: "user_level"
  /** 要求的共享组件版本范围（semver range，如 ">=3.5.0 <4.0.0"） */
  required_shared_version_range: string
  /** 项目运行时初始化时间 */
  initialized_at: string // ISO8601
  /** 最近更新时间 */
  updated_at: string // ISO8601
  /** 项目级文件的校验和与大小 */
  project_files: Record<string, { sha256: string; size: number }>
}

/** 支持的 schema_version 列表 */
export const SUPPORTED_SCHEMA_VERSIONS = ["1.0"] as const

// ============================================================
// 安装锁
// ============================================================

export interface InstallLockInfo {
  /** 锁唯一标识（UUID），用于所有权校验 */
  lock_id: string
  /** 持有锁的进程 PID */
  pid: number
  /** 执行的命令 */
  command: "install" | "upgrade" | "uninstall"
  /** 锁获取时间 */
  acquired_at: string // ISO8601
  /** 最近心跳时间 */
  last_heartbeat: string // ISO8601
  /** 主机名（辅助诊断） */
  hostname: string
}

// ============================================================
// Agent 配置
// ============================================================

export interface AgentConfig {
  mode: "primary" | "subagent"
  model: string
  prompt: string
  permission: { task: string; edit: string; bash: string; skill: string }
}

// ============================================================
// 共享组件注册表条目
// ============================================================

export interface ComponentEntry {
  /** POSIX 风格相对路径 */
  path: string
  /** 组件类型 */
  type: "agent" | "tool" | "tool_lib" | "skill" | "plugin"
}

// ============================================================
// CLI 参数（V3.5 简化版）
// ============================================================

export interface CLIOptions {
  subcommand: "install" | "upgrade" | "uninstall" | "verify" | null
  /** 强制覆盖（--force） */
  force: boolean
  /** 显示版本（--version） */
  showVersion: boolean
}
