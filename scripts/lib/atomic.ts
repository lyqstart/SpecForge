/**
 * SpecForge Installer Reconcile — 共享原子写入工具
 *
 * 供 Manifest、Executor、OpenCode Merge 共用。
 * 使用 temp file + SHA-256 验证 + rename 模式确保写入原子性。
 *
 * Requirements: 4.1, 4.2, 4.6, 5.6, 12.5
 */

import { writeFile, rename, unlink, mkdir, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import * as crypto from "node:crypto"

export interface AtomicWriteOptions {
  expectedHash?: string
  faultHook?: AtomicFaultHook
}

export interface AtomicFaultHook {
  afterTempWrite?: () => Promise<void> | void
  beforeRename?: () => Promise<void> | void
}

export interface AtomicWriteResult {
  success: boolean
  hash?: string
  error?: string
}

function generateTempPath(targetPath: string): string {
  const uuid = crypto.randomUUID()
  return `${targetPath}.tmp.${process.pid}.${uuid}`
}

function computeContentHash(content: string | Buffer | Uint8Array): string {
  const hash = crypto.createHash("sha256")
  if (typeof content === "string") {
    hash.update(content, "utf-8")
  } else {
    hash.update(content)
  }
  return hash.digest("hex")
}

async function cleanupTempFile(tempPath: string): Promise<void> {
  try {
    await unlink(tempPath)
  } catch {
    // 文件可能已不存在。
  }
}

export async function atomicWrite(
  targetPath: string,
  content: string | Buffer | Uint8Array,
  options?: AtomicWriteOptions
): Promise<AtomicWriteResult> {
  const tempPath = generateTempPath(targetPath)
  try {
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(
      tempPath,
      content,
      typeof content === "string" ? "utf-8" : undefined
    )

    if (options?.faultHook?.afterTempWrite) {
      await options.faultHook.afterTempWrite()
    }

    const actualHash = computeContentHash(content)
    if (options?.expectedHash !== undefined && options.expectedHash !== actualHash) {
      await cleanupTempFile(tempPath)
      return {
        success: false,
        hash: actualHash,
        error: `SHA-256 mismatch: expected ${options.expectedHash}, got ${actualHash}`,
      }
    }

    if (options?.faultHook?.beforeRename) {
      await options.faultHook.beforeRename()
    }

    await rename(tempPath, targetPath)
    return { success: true, hash: actualHash }
  } catch (err) {
    await cleanupTempFile(tempPath)
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function atomicWriteFile(
  targetPath: string,
  content: string | Buffer
): Promise<void> {
  const result = await atomicWrite(targetPath, content)
  if (!result.success) {
    throw new Error(result.error ?? "Atomic write failed")
  }
}

/**
 * 备份文件到 {userLevelDir}/.backup/。
 *
 * 只备份调用方明确指定的当前 userLevelDir 内文件，不跨根寻找兼容来源。
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
