/**
 * 集成测试用临时目录工具
 *
 * 提供创建和清理临时目录的工具函数，用于需要真实文件系统操作的集成测试。
 * 使用 Bun 兼容的 API。
 */
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * 创建一个唯一的临时目录用于测试
 *
 * @param prefix - 目录名前缀，默认 "specforge-test-"
 * @returns 临时目录的绝对路径
 */
export async function createTempDir(prefix = "specforge-test-"): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix))
}

/**
 * 递归删除临时目录及其所有内容
 *
 * @param dirPath - 要删除的目录路径
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true })
}
