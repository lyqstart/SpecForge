/**
 * SpecForge V3.4.0 — 路径解析工具
 *
 * 解析 User_Level_Directory 路径，处理跨平台路径转换。
 */

import { homedir } from "node:os"
import { resolve, normalize, join } from "node:path"

/**
 * 解析 User_Level_Directory 路径
 *
 * 优先级：
 *   (a) OPENCODE_CONFIG_DIR 环境变量（OpenCode 原生支持）
 *   (b) 所有平台统一使用 ~/.config/opencode/
 *       OpenCode 在所有平台（包括 Windows）都使用 ~/.config/opencode/ 作为
 *       用户级配置目录，不使用 %APPDATA%。
 *   (c) 不读取 config.json 或 configDir 字段
 *
 * 所有路径通过 path.resolve() / path.normalize() 归一化
 */
export function resolveUserLevelDirectory(): string {
  // (a) 环境变量覆盖
  const envDir = process.env.OPENCODE_CONFIG_DIR
  if (envDir) {
    return resolve(normalize(envDir))
  }

  // (b) 所有平台统一：~/.config/opencode/
  // OpenCode 在 Windows 上也使用此路径，不使用 %APPDATA%
  return resolve(normalize(join(homedir(), ".config", "opencode")))
}

/**
 * 将 POSIX 风格路径转换为平台原生路径
 * 用于将 Manifest 中记录的 POSIX 路径转换为实际文件系统路径
 */
export function posixToNative(posixPath: string): string {
  if (process.platform === "win32") {
    return posixPath.replace(/\//g, "\\")
  }
  return posixPath
}

/**
 * 将平台原生路径转换为 POSIX 风格
 * 用于将文件系统路径写入 Manifest
 */
export function nativeToPosix(nativePath: string): string {
  return nativePath.replace(/\\/g, "/")
}

/**
 * Windows 长路径规范化
 *
 * 策略说明：
 * - Windows 传统 MAX_PATH 限制为 260 字符
 * - 当路径超过 260 字符时，添加 \\?\ 前缀以启用长路径支持
 * - 已有 \\?\ 前缀的路径不重复添加
 * - UNC 路径（\\server\share）转换为 \\?\UNC\server\share 格式
 * - 非 Windows 平台直接返回原路径
 *
 * 注意：Bun 运行时在 Windows 上已内置长路径支持（通过 manifest 声明），
 * 此函数作为额外保障层，确保在所有环境下都能正确处理长路径。
 */
export function normalizeLongPathForWindows(filePath: string): string {
  if (process.platform !== "win32") {
    return filePath
  }

  // 已有长路径前缀，不重复添加
  if (filePath.startsWith("\\\\?\\")) {
    return filePath
  }

  // 路径未超过 260 字符限制，无需处理
  if (filePath.length <= 260) {
    return filePath
  }

  // UNC 路径（\\server\share）→ \\?\UNC\server\share
  if (filePath.startsWith("\\\\")) {
    return "\\\\?\\UNC\\" + filePath.slice(2)
  }

  // 普通长路径 → \\?\path
  return "\\\\?\\" + filePath
}
