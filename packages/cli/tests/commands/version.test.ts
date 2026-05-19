/**
 * Version Command 集成测试
 * 
 * 测试 version 命令与 CLI 主入口的集成。
 * 
 * Requirements: 2.4, 2.5, 6.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runVersionCommand } from '../../src/commands/version-cmd.js';
import type { VersionInfoPayload } from '../../src/distribution/types.js';

describe('Version Command Integration', () => {
  let originalConsoleLog: typeof console.log;
  let capturedOutput: string[] = [];

  beforeEach(() => {
    // Mock console.log 来捕获输出
    originalConsoleLog = console.log;
    capturedOutput = [];
    console.log = vi.fn((...args: any[]) => {
      capturedOutput.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    // 恢复 console.log
    console.log = originalConsoleLog;
  });

  describe('命令行集成', () => {
    it('应该能够通过 runVersionCommand 调用', async () => {
      await runVersionCommand({ json: false });

      expect(capturedOutput).toHaveLength(2);
      expect(capturedOutput[0]).toMatch(/^\d+\.\d+\.\d+/);
      expect(capturedOutput[1]).toBe('1.0');
    });

    it('应该支持 JSON 模式', async () => {
      await runVersionCommand({ json: true });

      expect(capturedOutput).toHaveLength(1);
      
      const payload = JSON.parse(capturedOutput[0]) as VersionInfoPayload;
      expect(payload.schema_version).toBe('1.0');
      expect(payload.cliVersion).toBeTruthy();
      expect(payload.schemaVersionBaseline).toBe('1.0');
    });
  });

  describe('输出格式验证', () => {
    it('非 JSON 模式：第一行是版本，第二行是 baseline', async () => {
      await runVersionCommand({ json: false });

      const [version, baseline] = capturedOutput;
      
      // 版本应该是 SemVer 格式
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
      
      // baseline 应该是 "MAJOR.MINOR" 格式
      expect(baseline).toMatch(/^\d+\.\d+$/);
    });

    it('JSON 模式：输出应该是有效的 JSON 对象', async () => {
      await runVersionCommand({ json: true });

      const output = capturedOutput[0];
      
      // 应该能解析为 JSON
      expect(() => JSON.parse(output)).not.toThrow();
      
      const payload = JSON.parse(output) as VersionInfoPayload;
      
      // 验证所有必需字段
      expect(payload).toHaveProperty('schema_version');
      expect(payload).toHaveProperty('cliVersion');
      expect(payload).toHaveProperty('schemaVersionBaseline');
      expect(payload).toHaveProperty('installRoot');
      expect(payload).toHaveProperty('installRootSchemaVersion');
      expect(payload).toHaveProperty('platform');
    });
  });

  describe('性能要求', () => {
    it('非 JSON 模式应该在 2 秒内完成（REQ-2.4）', async () => {
      const startTime = Date.now();
      await runVersionCommand({ json: false });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);
    });

    it('JSON 模式应该在 2 秒内完成（REQ-6.4）', async () => {
      const startTime = Date.now();
      await runVersionCommand({ json: true });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);
    });
  });
});
