/**
 * SpecForge Installer Reconcile — 共享原子写入工具
 *
 * 供 Manifest、Executor、OpenCode Merge、RuntimeManifest 共用。
 * 使用 temp file + SHA-256 验证 + rename 模式确保写入原子性。
 *
 * Requirements: 4.1, 4.2, 4.6, 5.6, 12.5
 */

import { writeFile, rename, unlink, mkdir, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import * as crypto from "node:crypto"

// ============================================================
// 接口定义
// ============================================================

/**
 * 原子写入选项
 */
export interface AtomicWriteOptions {
  /** 预期的 SHA-256 哈希，写入后验证 */
  expectedHash?: string
  /** 故障注入钩子，用于测试 */
  faultHook?: AtomicFaultHook
}

/**
 * 故障注入钩子接口
 * 用于测试时模拟写入/rename 失败
 */
export interface AtomicFaultHook {
  /** 在写入临时文件后、验证前触发 */
  afterTempWrite?: () => Promise<void> | void
  /** 在验证后、rename 前触发 */
  beforeRename?: () => Promise<void> | void
}

/**
 * 原子写入结果
 */
export interface AtomicWriteResult {
  success: boolean
  /** 写入文件的实际 SHA-256 */
  hash?: string
  error?: string
}

// ============================================================
// 核心实现
// ============================================================

/**
 * 生成唯一临时文件路径
 * 使用 pid + uuid 组合确保并发进程间不冲突
 */
function generateTempPath(targetPath: string): string {
  const uuid = crypto.randomUUID()
  return `${targetPath}.tmp.${process.pid}.${uuid}`
}

/**
 * 计算内容的 SHA-256 哈希（十六进制）
 */
function computeContentHash(content: string | Buffer | Uint8Array): string {
  const hash = crypto.createHash("sha256")
  if (typeof content === "string") {
    hash.update(content, "utf-8")
  } else {
    hash.update(content)
  }
  return hash.digest("hex")
}

/**
 * 安全删除临时文件（忽略不存在错误）
 */
async function cleanupTempFile(tempPath: string): Promise<void> {
  try {
    await unlink(tempPath)
  } catch {
    // 忽略清理失败（文件可能已不存在）
  }
}

/**
 * 原子写入文件
 *
 * 流程：
 * 1. 确保目标目录存在
 * 2. 生成唯一临时文件路径（pid + uuid）
 * 3. 写入内容到临时文件
 * 4. [可选] 调用 afterTempWrite 故障注入钩子
 * 5. 计算写入内容的 SHA-256
 * 6. [可选] 与 expectedHash 比对，不匹配则清理并返回错误
 * 7. [可选] 调用 beforeRename 故障注入钩子
 * 8. rename 临时文件到目标路径
 * 9. 任何失败都清理临时文件
 *
 * @param targetPath - 目标文件的绝对路径
 * @param content - 要写入的内容（字符串、Buffer 或 Uint8Array）
 * @param options - 可选配置（哈希验证、故障注入）
 * @returns 写入结果，包含成功状态和实际哈希
 */
export async function atomicWrite(
  targetPath: string,
  content: string | Buffer | Uint8Array,
  options?: AtomicWriteOptions
): Promise<AtomicWriteResult> {
  const tempPath = generateTempPath(targetPath)

  try {
    // 确保目标目录存在
    await mkdir(dirname(targetPath), { recursive: true })

    // 写入临时文件
    await writeFile(
      tempPath,
      content,
      typeof content === "string" ? "utf-8" : undefined
    )

    // 故障注入：写入后、验证前
    if (options?.faultHook?.afterTempWrite) {
      await options.faultHook.afterTempWrite()
    }

    // 计算实际哈希
    const actualHash = computeContentHash(content)

    // 可选哈希验证
    if (options?.expectedHash !== undefined && options.expectedHash !== actualHash) {
      await cleanupTempFile(tempPath)
      return {
        success: false,
        hash: actualHash,
        error: `SHA-256 mismatch: expected ${options.expectedHash}, got ${actualHash}`,
      }
    }

    // 故障注入：验证后、rename 前
    if (options?.faultHook?.beforeRename) {
      await options.faultHook.beforeRename()
    }

    // 原子 rename
    await rename(tempPath, targetPath)

    return {
      success: true,
      hash: actualHash,
    }
  } catch (err) {
    // 任何失败都清理临时文件
    await cleanupTempFile(tempPath)
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ============================================================
// 向后兼容：保留旧版 atomicWriteFile 接口
// ============================================================

/**
 * @deprecated 使用 atomicWrite() 替代。保留供现有模块过渡使用。
 *
 * 原子写入文件（写临时文件 → rename）
 * 失败时不留下半写文件。
 */
export async function atomicWriteFile(
  targetPath: string,
  content: string | Buffer
): Promise<void> {
  const result = await atomicWrite(targetPath, content)
  if (!result.success) {
    throw new Error(result.error ?? "Atomic write failed")
  }
}

// ============================================================
// 备份工具
// ============================================================

/**
 * 备份文件到 {userLevelDir}/.backup/ 目录
 *
 * 文件名格式：{原文件名（/替换为_）}.bak.{YYYYMMDD-HHMMSS}
 * 多次备份不会互相覆盖（时间戳不同）。
 *
 * @returns 备份文件路径，源文件不存在时返回 null
 */
export async function backupFile(
  userLevelDir: string,
  relativePath: string
): Promise<string | null> {
  const sourcePath = join(userLevelDir, relativePath)
  if (!existsSync(sourcePath)) return null

  const backupDir = join(userLevelDir, ".backup")
  await mkdir(backupDir, { recursive: true })

  const now = new Date()
  const timestamp = [
    now.getFullYear().toString(),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
    "-",
    now.getHours().toString().padStart(2, "0"),
    now.getMinutes().toString().padStart(2, "0"),
    now.getSeconds().toString().padStart(2, "0"),
  ].join("")

  const backupFileName = `${relativePath.replace(/\//g, "_")}.bak.${timestamp}`
  const backupPath = join(backupDir, backupFileName)

  const fileContent = await readFile(sourcePath)
  await writeFile(backupPath, fileContent)
  return backupPath
}
