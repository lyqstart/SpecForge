/**
 * SpecForge V3.5.0 — 错误码与错误类
 */

// ============================================================
// 错误码枚举
// ============================================================

export enum InstallerErrorCode {
  /**
   * 文件/目录权限不足（EACCES/EPERM）
   * @suggestedFix 检查目录权限，或使用管理员权限运行
   */
  E_PERMISSION_DENIED = "E_PERMISSION_DENIED",
  /**
   * 磁盘空间不足（ENOSPC）
   * @suggestedFix 清理磁盘空间后重试
   */
  E_DISK_FULL = "E_DISK_FULL",
  /**
   * opencode.json / manifest.json 解析失败
   * @suggestedFix 检查 JSON 语法，或从 .backup/ 恢复
   */
  E_INVALID_JSON = "E_INVALID_JSON",
  /**
   * Manifest schema_version 不受当前安装器支持（需要升级安装器）
   * @suggestedFix 升级 SpecForge 安装器到最新版本
   */
  E_MANIFEST_SCHEMA_UNSUPPORTED = "E_MANIFEST_SCHEMA_UNSUPPORTED",
  /**
   * 安装锁等待 30 秒超时
   * @suggestedFix 检查是否有其他安装进程运行；若无，删除 .specforge.lock
   */
  E_LOCK_TIMEOUT = "E_LOCK_TIMEOUT",
  /**
   * 文件 SHA-256 校验和不匹配
   * @suggestedFix 执行 `upgrade` 重新部署受损文件
   */
  E_CHECKSUM_MISMATCH = "E_CHECKSUM_MISMATCH",
  /**
   * 共享组件完整性检查失败（缺失文件/版本不匹配/校验和不一致）
   * @suggestedFix 执行 `upgrade --force` 强制重新部署
   */
  E_SHARED_COMPONENTS_INVALID = "E_SHARED_COMPONENTS_INVALID",
  /**
   * 所有注册的源文件均不存在（源目录路径可能错误）
   * @suggestedFix 检查是否在正确的 SpecForge 仓库目录中运行 install
   */
  E_SOURCE_MISSING = "E_SOURCE_MISSING",
}

// ============================================================
// 错误类
// ============================================================

export class InstallerError extends Error {
  constructor(
    public readonly code: InstallerErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(`[${code}] ${message}`)
    this.name = "InstallerError"
  }
}

// ============================================================
// 错误码到退出码映射
// ============================================================

export const EXIT_CODES: Record<InstallerErrorCode, number> = {
  [InstallerErrorCode.E_PERMISSION_DENIED]: 10,
  [InstallerErrorCode.E_DISK_FULL]: 11,
  [InstallerErrorCode.E_INVALID_JSON]: 12,
  [InstallerErrorCode.E_MANIFEST_SCHEMA_UNSUPPORTED]: 13,
  [InstallerErrorCode.E_LOCK_TIMEOUT]: 14,
  [InstallerErrorCode.E_CHECKSUM_MISMATCH]: 15,
  [InstallerErrorCode.E_SHARED_COMPONENTS_INVALID]: 16,
  [InstallerErrorCode.E_SOURCE_MISSING]: 17,
}
