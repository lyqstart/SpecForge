/**
 * SpecForge V3.4.0 — 原子写入与备份工具
 */

import { writeFile, rename, unlink, mkdir, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

/**
 * 原子写入文件（写临时文件 → rename）
 *
 * 失败时不留下半写文件。
 * 临时文件在目标同目录（跨设备 rename 不支持）。
 */
export async function atomicWriteFile(
  targetPath: string,
  content: string | Buffer
): Promise<void> {
  const tempPath = targetPath + ".tmp." + process.pid
  await mkdir(dirname(targetPath), { recursive: true })

  try {
    await writeFile(
      tempPath,
      content,
      typeof content === "string" ? "utf-8" : undefined
    )
    await rename(tempPath, targetPath)
  } catch (err) {
    // 清理临时文件
    await unlink(tempPath).catch(() => {})
    throw err
  }
}

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

  const content = await readFile(sourcePath)
  await writeFile(backupPath, content)
  return backupPath
}
