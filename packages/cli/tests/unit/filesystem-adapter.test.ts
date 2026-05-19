/**
 * FilesystemAdapter 单元测试
 * 
 * 测试覆盖：
 * - writeAtomic：原子写、UTF-8 无 BOM、末尾换行、失败清理
 * - mkdirTracked：递归创建、追踪、已存在不重复追踪
 * - rollback：逆序删除、忽略失败
 * - exists：路径存在性检查
 * - readJson：JSON 读取与解析
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { DefaultFilesystemAdapter } from "../../src/utils/filesystem-adapter.js";

describe("FilesystemAdapter", () => {
  let adapter: DefaultFilesystemAdapter;
  let tempDir: string;
  const createdDirs: string[] = [];

  beforeEach(async () => {
    adapter = new DefaultFilesystemAdapter();
    // 创建临时测试目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-adapter-test-"));
    createdDirs.push(tempDir);
  });

  afterEach(async () => {
    // 清理所有创建的临时目录
    for (const dir of createdDirs.reverse()) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // 忽略清理失败
      }
    }
    createdDirs.length = 0;
  });

  describe("writeAtomic", () => {
    it("应该原子写入文件，UTF-8 编码，末尾自动添加换行", async () => {
      const filePath = path.join(tempDir, "test.txt");
      const content = "Hello, World!";

      await adapter.writeAtomic(filePath, content);

      // 验证文件存在
      const exists = await adapter.exists(filePath);
      expect(exists).toBe(true);

      // 验证内容正确，末尾有换行
      const readContent = await fs.readFile(filePath, { encoding: "utf-8" });
      expect(readContent).toBe("Hello, World!\n");
    });

    it("如果内容已有换行符，不应重复添加", async () => {
      const filePath = path.join(tempDir, "test-with-newline.txt");
      const content = "Hello, World!\n";

      await adapter.writeAtomic(filePath, content);

      const readContent = await fs.readFile(filePath, { encoding: "utf-8" });
      expect(readContent).toBe("Hello, World!\n");
      expect(readContent).not.toBe("Hello, World!\n\n");
    });

    it("应该覆盖已存在的文件", async () => {
      const filePath = path.join(tempDir, "overwrite.txt");

      // 第一次写入
      await adapter.writeAtomic(filePath, "First content");
      let content = await fs.readFile(filePath, { encoding: "utf-8" });
      expect(content).toBe("First content\n");

      // 第二次写入（覆盖）
      await adapter.writeAtomic(filePath, "Second content");
      content = await fs.readFile(filePath, { encoding: "utf-8" });
      expect(content).toBe("Second content\n");
    });

    it("写入失败时应该清理临时文件", async () => {
      // 使用不存在的目录路径，导致写入失败
      const invalidPath = path.join(tempDir, "nonexistent", "test.txt");

      await expect(adapter.writeAtomic(invalidPath, "content")).rejects.toThrow();

      // 验证临时目录中没有残留的 .tmp 文件
      const files = await fs.readdir(tempDir);
      const tmpFiles = files.filter((f) => f.includes(".tmp"));
      expect(tmpFiles.length).toBe(0);
    });
  });

  describe("mkdirTracked", () => {
    it("应该创建目录并添加到追踪集合", async () => {
      const createdSet = new Set<string>();
      const dirPath = path.join(tempDir, "tracked-dir");

      await adapter.mkdirTracked(dirPath, createdSet);

      // 验证目录已创建
      const exists = await adapter.exists(dirPath);
      expect(exists).toBe(true);

      // 验证已添加到追踪集合
      expect(createdSet.has(dirPath)).toBe(true);
      expect(createdSet.size).toBe(1);
    });

    it("应该递归创建嵌套目录", async () => {
      const createdSet = new Set<string>();
      const nestedPath = path.join(tempDir, "level1", "level2", "level3");

      await adapter.mkdirTracked(nestedPath, createdSet);

      // 验证嵌套目录已创建
      const exists = await adapter.exists(nestedPath);
      expect(exists).toBe(true);

      // 验证已添加到追踪集合
      expect(createdSet.has(nestedPath)).toBe(true);
    });

    it("如果目录已存在，不应重复添加到追踪集合", async () => {
      const createdSet = new Set<string>();
      const dirPath = path.join(tempDir, "existing-dir");

      // 先手动创建目录
      await fs.mkdir(dirPath);

      // 再调用 mkdirTracked
      await adapter.mkdirTracked(dirPath, createdSet);

      // 验证目录存在
      const exists = await adapter.exists(dirPath);
      expect(exists).toBe(true);

      // 验证未添加到追踪集合（因为已存在）
      expect(createdSet.has(dirPath)).toBe(false);
      expect(createdSet.size).toBe(0);
    });
  });

  describe("rollback", () => {
    it("应该逆序删除追踪集合中的所有路径", async () => {
      const createdSet = new Set<string>();

      // 创建多个目录
      const dir1 = path.join(tempDir, "rollback-1");
      const dir2 = path.join(tempDir, "rollback-2");
      const dir3 = path.join(tempDir, "rollback-3");

      await adapter.mkdirTracked(dir1, createdSet);
      await adapter.mkdirTracked(dir2, createdSet);
      await adapter.mkdirTracked(dir3, createdSet);

      // 验证都已创建
      expect(await adapter.exists(dir1)).toBe(true);
      expect(await adapter.exists(dir2)).toBe(true);
      expect(await adapter.exists(dir3)).toBe(true);

      // 回滚
      await adapter.rollback(createdSet);

      // 验证都已删除
      expect(await adapter.exists(dir1)).toBe(false);
      expect(await adapter.exists(dir2)).toBe(false);
      expect(await adapter.exists(dir3)).toBe(false);
    });

    it("应该递归删除目录及其内容", async () => {
      const createdSet = new Set<string>();
      const dirPath = path.join(tempDir, "rollback-recursive");

      await adapter.mkdirTracked(dirPath, createdSet);

      // 在目录中创建文件和子目录
      await fs.writeFile(path.join(dirPath, "file.txt"), "content");
      await fs.mkdir(path.join(dirPath, "subdir"));
      await fs.writeFile(path.join(dirPath, "subdir", "nested.txt"), "nested");

      // 回滚
      await adapter.rollback(createdSet);

      // 验证整个目录树已删除
      expect(await adapter.exists(dirPath)).toBe(false);
    });

    it("应该忽略删除失败的错误", async () => {
      const createdSet = new Set<string>();

      // 添加一个不存在的路径到追踪集合
      const nonexistentPath = path.join(tempDir, "nonexistent-dir");
      createdSet.add(nonexistentPath);

      // 回滚不应抛错（直接调用，不应抛出异常）
      await adapter.rollback(createdSet);
      
      // 如果执行到这里，说明没有抛错，测试通过
      expect(true).toBe(true);
    });
  });

  describe("exists", () => {
    it("对于存在的路径应返回 true", async () => {
      const filePath = path.join(tempDir, "exists-test.txt");
      await fs.writeFile(filePath, "content");

      const exists = await adapter.exists(filePath);
      expect(exists).toBe(true);
    });

    it("对于不存在的路径应返回 false", async () => {
      const nonexistentPath = path.join(tempDir, "nonexistent.txt");

      const exists = await adapter.exists(nonexistentPath);
      expect(exists).toBe(false);
    });

    it("对于目录应返回 true", async () => {
      const dirPath = path.join(tempDir, "exists-dir");
      await fs.mkdir(dirPath);

      const exists = await adapter.exists(dirPath);
      expect(exists).toBe(true);
    });
  });

  describe("readJson", () => {
    it("应该读取并解析 JSON 文件", async () => {
      const jsonPath = path.join(tempDir, "test.json");
      const data = { name: "test", value: 42, nested: { key: "value" } };

      await fs.writeFile(jsonPath, JSON.stringify(data, null, 2), {
        encoding: "utf-8",
      });

      const result = await adapter.readJson<typeof data>(jsonPath);

      expect(result).toEqual(data);
      expect(result.name).toBe("test");
      expect(result.value).toBe(42);
      expect(result.nested.key).toBe("value");
    });

    it("文件不存在时应抛错", async () => {
      const nonexistentPath = path.join(tempDir, "nonexistent.json");

      await expect(adapter.readJson(nonexistentPath)).rejects.toThrow();
    });

    it("JSON 格式错误时应抛错", async () => {
      const invalidJsonPath = path.join(tempDir, "invalid.json");
      await fs.writeFile(invalidJsonPath, "{ invalid json }", {
        encoding: "utf-8",
      });

      await expect(adapter.readJson(invalidJsonPath)).rejects.toThrow();
    });
  });
});
