/**
 * FilesystemAdapter - 提供原子写、追踪目录创建与回滚能力
 * 
 * 设计原则（遵守 async-resource-coding-standards + lessons-injected）：
 * - 原子写：tmp + rename 模式，UTF-8 无 BOM，末尾换行
 * - 追踪创建：mkdirTracked 把已创建路径压入 createdSet
 * - 回滚：逆序删除 createdSet 中的路径，忽略删除失败
 * - 所有方法无副作用（构造器只赋值依赖，不做 I/O）
 * 
 * @module FilesystemAdapter
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomBytes } from "node:crypto";

export interface FilesystemAdapter {
  /**
   * 原子写文件：先写临时文件，成功后 rename 到目标路径
   * - UTF-8 编码，无 BOM
   * - 内容末尾自动添加换行符（如果不存在）
   * - 失败时清理临时文件
   * 
   * @param filePath 目标文件路径（绝对路径）
   * @param content 文件内容
   * @throws 写入或 rename 失败时抛错
   */
  writeAtomic(filePath: string, content: string): Promise<void>;

  /**
   * 创建目录并追踪到 createdSet
   * - 递归创建目录（mkdir -p）
   * - 将已创建的路径添加到 createdSet（用于后续回滚）
   * - 如果目录已存在，不重复添加到 createdSet
   * 
   * @param dirPath 目录路径（绝对路径）
   * @param createdSet 追踪集合，记录本次创建的所有路径
   * @throws 创建失败时抛错
   */
  mkdirTracked(dirPath: string, createdSet: Set<string>): Promise<void>;

  /**
   * 回滚已创建的目录
   * - 逆序删除 createdSet 中的路径（后创建的先删除）
   * - 使用 fs.rm(path, { recursive: true, force: true })
   * - 捕获并忽略删除失败的错误（已经不存在的路径）
   * 
   * @param createdSet 追踪集合，包含需要删除的路径
   */
  rollback(createdSet: Set<string>): Promise<void>;

  /**
   * 检查路径是否存在
   * 
   * @param targetPath 目标路径
   * @returns 存在返回 true，否则返回 false
   */
  exists(targetPath: string): Promise<boolean>;

  /**
   * 读取并解析 JSON 文件
   * 
   * @param filePath JSON 文件路径
   * @returns 解析后的对象
   * @throws 文件不存在、读取失败或 JSON 解析失败时抛错
   */
  readJson<T>(filePath: string): Promise<T>;
}

/**
 * FilesystemAdapter 默认实现
 */
export class DefaultFilesystemAdapter implements FilesystemAdapter {
  /**
   * 构造器只赋值依赖，不做 I/O（遵守 lessons-injected JS1）
   */
  constructor() {
    // 无副作用构造器
  }

  async writeAtomic(filePath: string, content: string): Promise<void> {
    // 确保内容末尾有换行符
    const contentWithNewline = content.endsWith("\n") ? content : `${content}\n`;

    // 生成临时文件路径：同目录下，文件名加随机后缀
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);
    const tmpSuffix = randomBytes(8).toString("hex");
    const tmpPath = path.join(dir, `${basename}.tmp.${tmpSuffix}`);

    try {
      // 写入临时文件（UTF-8，无 BOM）
      await fs.writeFile(tmpPath, contentWithNewline, { encoding: "utf-8" });

      // 原子 rename 到目标路径
      await fs.rename(tmpPath, filePath);
    } catch (error) {
      // 失败时清理临时文件（忽略清理失败）
      try {
        await fs.unlink(tmpPath);
      } catch {
        // 忽略清理失败（临时文件可能已经不存在）
      }
      throw error;
    }
  }

  async mkdirTracked(dirPath: string, createdSet: Set<string>): Promise<void> {
    // 检查目录是否已存在
    const alreadyExists = await this.exists(dirPath);

    if (!alreadyExists) {
      // 递归创建目录
      await fs.mkdir(dirPath, { recursive: true });

      // 添加到追踪集合
      createdSet.add(dirPath);
    }
  }

  async rollback(createdSet: Set<string>): Promise<void> {
    // 转为数组并逆序（后创建的先删除）
    const pathsToDelete = Array.from(createdSet).reverse();

    for (const dirPath of pathsToDelete) {
      try {
        // 递归删除，force: true 忽略不存在的路径
        await fs.rm(dirPath, { recursive: true, force: true });
      } catch (error) {
        // 捕获并忽略删除失败的错误
        // 可能的原因：路径已经不存在、权限不足等
        // 按 requirements 4.10，回滚失败不应阻止流程继续
        console.warn(`Failed to rollback ${dirPath}:`, error);
      }
    }
  }

  async exists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  async readJson<T>(filePath: string): Promise<T> {
    const content = await fs.readFile(filePath, { encoding: "utf-8" });
    return JSON.parse(content) as T;
  }
}

/**
 * 导出默认实例（单例模式，无状态）
 */
export const filesystemAdapter = new DefaultFilesystemAdapter();
