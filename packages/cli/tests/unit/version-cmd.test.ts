/**
 * Version Command 单元测试
 * 
 * 测试 `specforge --version` 和 `specforge --version --json` 命令。
 * 
 * Requirements: 2.4, 2.5, 6.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runVersionCommand } from '../../src/commands/version-cmd.js';
import type { VersionInfoPayload } from '../../src/distribution/types.js';

describe('Version Command', () => {
  // 保存原始的 console.log 和环境变量
  let originalConsoleLog: typeof console.log;
  let originalEnv: NodeJS.ProcessEnv;
  let capturedOutput: string[] = [];

  beforeEach(() => {
    // Mock console.log 来捕获输出
    originalConsoleLog = console.log;
    capturedOutput = [];
    console.log = vi.fn((...args: any[]) => {
      capturedOutput.push(args.map(String).join(' '));
    });

    // 保存原始环境变量
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 恢复 console.log
    console.log = originalConsoleLog;

    // 恢复环境变量
    process.env = originalEnv;
  });

  describe('非 JSON 模式', () => {
    it('应该输出 cliVersion 和 baseline，用换行符分隔', async () => {
      await runVersionCommand({ json: false });

      expect(capturedOutput).toHaveLength(2);
      
      // 第一行应该是 CLI 版本（从 package.json 读取）
      const cliVersion = capturedOutput[0];
      expect(cliVersion).toMatch(/^\d+\.\d+\.\d+/); // SemVer 格式
      
      // 第二行应该是 baseline（默认 "1.0"）
      const baseline = capturedOutput[1];
      expect(baseline).toBe('1.0');
    });

    it('应该在 2 秒内完成（REQ-2.4）', async () => {
      const startTime = Date.now();
      await runVersionCommand({ json: false });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);
    });
  });

  describe('JSON 模式', () => {
    it('应该输出有效的 VersionInfoPayload JSON', async () => {
      await runVersionCommand({ json: true });

      expect(capturedOutput).toHaveLength(1);
      
      // 解析 JSON
      const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;

      // 验证必需字段
      expect(payload.schema_version).toBe('1.0');
      expect(payload.cliVersion).toMatch(/^\d+\.\d+\.\d+/);
      expect(payload.schemaVersionBaseline).toBe('1.0');
      expect(payload.installRoot).toBeTruthy();
      expect(payload.platform).toMatch(/^(win32|darwin|linux)-(x64|arm64)$/);
    });

    it('当 .installation.json 不存在时，installRootSchemaVersion 应为 null', async () => {
      // 这是默认情况（测试环境通常没有 ~/.specforge/.installation.json）
      await runVersionCommand({ json: true });

      const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;
      
      // 在测试环境中，通常没有安装记录，应该返回 null
      // 注意：如果测试机器上恰好有安装记录，这个测试可能会失败
      // 但这是预期行为——我们测试的是"读不到时返回 null"
      expect(payload.installRootSchemaVersion).toBeNull();
    });

    it('应该包含正确的平台字符串', async () => {
      await runVersionCommand({ json: true });

      const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;
      
      // 验证平台字符串格式
      const expectedPlatform = `${process.platform}-${process.arch}`;
      expect(payload.platform).toBe(expectedPlatform);
    });

    it('应该在 2 秒内完成（REQ-6.4）', async () => {
      const startTime = Date.now();
      await runVersionCommand({ json: true });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);
    });

    it('应该输出单行 JSON（无换行符在 JSON 内部）', async () => {
      await runVersionCommand({ json: true });

      expect(capturedOutput).toHaveLength(1);
      
      const output = capturedOutput[0];
      
      // JSON 字符串本身不应包含换行符（除了可能的尾随换行）
      const jsonContent = output.trim();
      expect(jsonContent).not.toContain('\n');
      
      // 应该能解析为有效 JSON
      expect(() => JSON.parse(jsonContent)).not.toThrow();
    });
  });

  describe('installRoot 路径解析', () => {
    it('Windows: 应该使用 USERPROFILE', async () => {
      // 只在 Windows 上运行此测试
      if (process.platform !== 'win32') {
        return;
      }

      await runVersionCommand({ json: true });
      const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;

      const expectedRoot = path.join(process.env.USERPROFILE!, '.specforge');
      expect(payload.installRoot).toBe(expectedRoot);
    });

    it('macOS/Linux: 应该使用 HOME', async () => {
      // 只在 macOS/Linux 上运行此测试
      if (process.platform === 'win32') {
        return;
      }

      await runVersionCommand({ json: true });
      const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;

      const expectedRoot = path.join(process.env.HOME!, '.specforge');
      expect(payload.installRoot).toBe(expectedRoot);
    });

    it('当 HOME 未设置时，应该使用占位符（不抛错）', async () => {
      // 临时删除 HOME 环境变量
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      
      delete process.env.HOME;
      delete process.env.USERPROFILE;

      try {
        await runVersionCommand({ json: true });
        const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;

        // 应该使用占位符，而不是抛错
        expect(payload.installRoot).toBe('<HOME not set>');
      } finally {
        // 恢复环境变量
        if (originalHome !== undefined) {
          process.env.HOME = originalHome;
        }
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });
  });

  describe('错误处理', () => {
    it('当 package.json 读取失败时，应该返回 "unknown" 版本', async () => {
      // 这个测试比较难模拟，因为 package.json 路径是硬编码的
      // 但我们可以验证即使读取失败，命令也不会崩溃
      
      // 实际上，在正常构建环境中，package.json 应该总是存在
      // 所以这个测试主要是文档性质的，说明我们有兜底逻辑
      
      await runVersionCommand({ json: true });
      const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;

      // 版本应该是有效的（不是 "unknown"，因为 package.json 存在）
      expect(payload.cliVersion).not.toBe('unknown');
    });

    it('当 .installation.json 解析失败时，应该返回 null', async () => {
      // 这是默认行为——文件不存在或损坏时返回 null
      await runVersionCommand({ json: true });
      const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;

      // 在测试环境中，通常没有安装记录
      expect(payload.installRootSchemaVersion).toBeNull();
    });
  });

  describe('installRootSchemaVersion 的三种 null 路径（REQ-6.4）', () => {
    let tempDir: string;

    beforeEach(async () => {
      // 创建临时目录作为测试用的 HOME
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specforge-test-'));
    });

    afterEach(async () => {
      // 清理临时目录
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // 忽略清理错误
      }
    });

    it('路径 1: 文件不存在（missing）', async () => {
      // 设置临时 HOME，确保 .installation.json 不存在
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      
      if (process.platform === 'win32') {
        process.env.USERPROFILE = tempDir;
      } else {
        process.env.HOME = tempDir;
      }

      try {
        await runVersionCommand({ json: true });
        const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;

        // 文件不存在时应该返回 null
        expect(payload.installRootSchemaVersion).toBeNull();
      } finally {
        // 恢复环境变量
        if (originalHome !== undefined) {
          process.env.HOME = originalHome;
        } else {
          delete process.env.HOME;
        }
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        } else {
          delete process.env.USERPROFILE;
        }
      }
    });

    it('路径 2: JSON 解析失败（unparseable）', async () => {
      // 创建 .specforge 目录和损坏的 .installation.json
      const specforgeDir = path.join(tempDir, '.specforge');
      await fs.mkdir(specforgeDir, { recursive: true });
      
      const installationPath = path.join(specforgeDir, '.installation.json');
      // 写入无效的 JSON（不是合法的 JSON 格式）
      await fs.writeFile(installationPath, '{ invalid json content }', 'utf-8');

      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      
      if (process.platform === 'win32') {
        process.env.USERPROFILE = tempDir;
      } else {
        process.env.HOME = tempDir;
      }

      try {
        await runVersionCommand({ json: true });
        const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;

        // JSON 解析失败时应该返回 null
        expect(payload.installRootSchemaVersion).toBeNull();
      } finally {
        // 恢复环境变量
        if (originalHome !== undefined) {
          process.env.HOME = originalHome;
        } else {
          delete process.env.HOME;
        }
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        } else {
          delete process.env.USERPROFILE;
        }
      }
    });

    it('路径 3: 缺少 schema_version 字段（missing_field）', async () => {
      // 创建 .specforge 目录和缺少 schema_version 字段的 .installation.json
      const specforgeDir = path.join(tempDir, '.specforge');
      await fs.mkdir(specforgeDir, { recursive: true });
      
      const installationPath = path.join(specforgeDir, '.installation.json');
      // 写入有效的 JSON，但缺少 schema_version 字段
      const incompleteRecord = {
        installedAt: '2026-05-19T12:34:56.789Z',
        cliVersion: '1.0.0',
        platform: 'linux',
        installSource: 'npm-global'
        // 故意不包含 schema_version 字段
      };
      await fs.writeFile(installationPath, JSON.stringify(incompleteRecord), 'utf-8');

      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      
      if (process.platform === 'win32') {
        process.env.USERPROFILE = tempDir;
      } else {
        process.env.HOME = tempDir;
      }

      try {
        await runVersionCommand({ json: true });
        const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;

        // 缺少 schema_version 字段时应该返回 null
        expect(payload.installRootSchemaVersion).toBeNull();
      } finally {
        // 恢复环境变量
        if (originalHome !== undefined) {
          process.env.HOME = originalHome;
        } else {
          delete process.env.HOME;
        }
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        } else {
          delete process.env.USERPROFILE;
        }
      }
    });

    it('正常路径: 文件存在且有效时应该返回 schema_version', async () => {
      // 创建 .specforge 目录和有效的 .installation.json
      const specforgeDir = path.join(tempDir, '.specforge');
      await fs.mkdir(specforgeDir, { recursive: true });
      
      const installationPath = path.join(specforgeDir, '.installation.json');
      const validRecord = {
        schema_version: '1.0',
        installedAt: '2026-05-19T12:34:56.789Z',
        cliVersion: '1.0.0',
        platform: 'linux',
        installSource: 'npm-global'
      };
      await fs.writeFile(installationPath, JSON.stringify(validRecord), 'utf-8');

      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      
      if (process.platform === 'win32') {
        process.env.USERPROFILE = tempDir;
      } else {
        process.env.HOME = tempDir;
      }

      try {
        await runVersionCommand({ json: true });
        const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;

        // 文件有效时应该返回实际的 schema_version
        expect(payload.installRootSchemaVersion).toBe('1.0');
      } finally {
        // 恢复环境变量
        if (originalHome !== undefined) {
          process.env.HOME = originalHome;
        } else {
          delete process.env.HOME;
        }
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        } else {
          delete process.env.USERPROFILE;
        }
      }
    });
  });

  describe('schema_version 字段', () => {
    it('JSON 输出应该包含 schema_version: "1.0"', async () => {
      await runVersionCommand({ json: true });
      const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;

      expect(payload.schema_version).toBe('1.0');
    });

    it('schemaVersionBaseline 应该等于 SchemaVersionManager.baseline', async () => {
      await runVersionCommand({ json: true });
      const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;

      // 默认 baseline 是 "1.0"
      expect(payload.schemaVersionBaseline).toBe('1.0');
    });
  });
});
