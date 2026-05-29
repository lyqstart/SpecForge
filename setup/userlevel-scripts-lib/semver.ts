/**
 * SpecForge V3.4.0 — 简化 Semver 工具
 *
 * 仅支持 ">=x.y.z <a.b.c" 格式的范围表达式。
 * 不支持 ^、~、x-range、|| 等复杂语法。
 */

/**
 * 解析版本字符串为 [major, minor, patch] 三元组
 * 自动去除前导操作符（>=、<、> 等）
 */
export function parseVersion(v: string): [number, number, number] {
  const parts = v.replace(/^[>=<]+/, "").trim().split(".")
  return [
    parseInt(parts[0] || "0", 10),
    parseInt(parts[1] || "0", 10),
    parseInt(parts[2] || "0", 10),
  ]
}

/**
 * 比较两个版本
 * @returns -1 (a < b), 0 (a == b), 1 (a > b)
 */
export function compareVersions(
  a: [number, number, number],
  b: [number, number, number]
): -1 | 0 | 1 {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  return 0
}

/**
 * 检查版本是否满足范围表达式
 *
 * ★ 限制：仅支持 ">=x.y.z <a.b.c" 格式。
 * 传入不支持的格式时返回 true（宽松处理，不阻塞运行）。
 */
export function satisfiesRange(version: string, range: string): boolean {
  const actual = parseVersion(version)

  // 解析 range（支持 ">=x.y.z <a.b.c" 格式）
  const parts = range.trim().split(/\s+/)
  for (const part of parts) {
    if (part.startsWith(">=")) {
      const min = parseVersion(part.slice(2))
      if (compareVersions(actual, min) < 0) return false
    } else if (part.startsWith(">") && !part.startsWith(">=")) {
      const min = parseVersion(part.slice(1))
      if (compareVersions(actual, min) <= 0) return false
    } else if (part.startsWith("<=")) {
      const max = parseVersion(part.slice(2))
      if (compareVersions(actual, max) > 0) return false
    } else if (part.startsWith("<") && !part.startsWith("<=")) {
      const max = parseVersion(part.slice(1))
      if (compareVersions(actual, max) >= 0) return false
    } else {
      // 不支持的格式 → 返回 true（宽松处理）
      return true
    }
  }

  return true
}

/**
 * 校验 semver range 格式是否为安装器支持的格式
 *
 * ★ 写入端严格校验：只允许 ">=x.y.z <a.b.c" 格式
 * 运行时读取端宽松（satisfiesRange 对不支持格式返回 true）
 */
export function validateSemverRangeFormat(range: string): boolean {
  const pattern = /^>=\d+\.\d+\.\d+\s+<\d+\.\d+\.\d+$/
  return pattern.test(range.trim())
}
