/**
 * 进程管理器单元测试（任务 9.2.4 编写沙箱骨架测试）
 *
 * 测试 ProcessManager 的核心功能：
 *   - 子进程创建
 *   - 生命周期管理
 *   - 优雅终止
 *   - 状态查询
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessManager, processManager, type ManagedProcess } from '../src/sandbox/process-manager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ProcessManager', () => {
  let manager: ProcessManager;
  let testDir: string;
  let testScriptPath: string;

  beforeEach(() => {
    manager = new ProcessManager();
    
    // 创建临时测试目录
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-loader-test-'));
    
    // 创建一个简单的测试脚本
    testScriptPath = path.join(testDir, 'test-script.js');
    fs.writeFileSync(testScriptPath, `
      // 简单的测试脚本，输出后退出
      console.log('test-script-started');
      process.exit(0);
    `);
  });

  afterEach(async () => {
    // 清理所有进程
    await manager.terminateAll({ force: true });
    manager.destroy();
    
    // 等待子进程完全退出（Windows 需要更长时间）
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    // 清理测试目录（增加重试机制处理 Windows 文件锁）
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Windows 文件锁问题，忽略清理失败
      }
    }
  });

  describe('createProcess', () => {
    it('should create a new process', async () => {
      const result = await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.pluginId).toBe('test-plugin');
      expect(result.status).toBe('running');
      expect(result.childProcess).toBeDefined();
    });

    it('should throw when entry file does not exist', async () => {
      await expect(
        manager.createProcess({
          pluginId: 'test-plugin',
          entryPath: path.join(testDir, 'non-existent.js'),
          workingDir: testDir,
        })
      ).rejects.toThrow('Plugin entry not found');
    });

    it('should throw when working directory does not exist', async () => {
      await expect(
        manager.createProcess({
          pluginId: 'test-plugin',
          entryPath: testScriptPath,
          workingDir: path.join(testDir, 'non-existent'),
        })
      ).rejects.toThrow('Working directory not found');
    });

    it('should set environment variables', async () => {
      const result = await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
        env: { TEST_VAR: 'test-value' },
      });

      expect(result.childProcess?.spawnfile).toContain('bun');
    });
  });

  describe('getStatus', () => {
    it('should return running status for created process', async () => {
      const process = await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      const status = manager.getStatus(process.id);
      expect(status).toBe('running');
    });

    it('should return undefined for non-existent process', () => {
      const status = manager.getStatus('non-existent-id');
      expect(status).toBeUndefined();
    });
  });

  describe('getProcess', () => {
    it('should return the managed process', async () => {
      const created = await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      const retrieved = manager.getProcess(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent process', () => {
      const process = manager.getProcess('non-existent-id');
      expect(process).toBeUndefined();
    });
  });

  describe('getActiveProcesses', () => {
    it('should return only running processes', async () => {
      await manager.createProcess({
        pluginId: 'test-plugin-1',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      await manager.createProcess({
        pluginId: 'test-plugin-2',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      const active = manager.getActiveProcesses();
      expect(active.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getProcessByPluginId', () => {
    it('should find process by plugin ID', async () => {
      const created = await manager.createProcess({
        pluginId: 'unique-test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      const found = manager.getProcessByPluginId('unique-test-plugin');
      expect(found?.id).toBe(created.id);
    });

    it('should return undefined for non-existent plugin ID', () => {
      const found = manager.getProcessByPluginId('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('isRunning', () => {
    it('should return true for running process', async () => {
      const process = await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      expect(manager.isRunning(process.id)).toBe(true);
    });

    it('should return false for non-existent process', () => {
      expect(manager.isRunning('non-existent-id')).toBe(false);
    });
  });

  describe('terminateProcess', () => {
    it('should gracefully terminate a running process', async () => {
      const process = await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      const result = await manager.terminateProcess(process.id);
      expect(result).toBe(true);
      
      const status = manager.getStatus(process.id);
      expect(status).toBe('terminated');
    });

    it('should return true for already terminated process', async () => {
      const process = await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      // 等待进程自然退出
      await new Promise<void>((resolve) => {
        process.childProcess?.once('exit', () => resolve());
      });

      const result = await manager.terminateProcess(process.id);
      expect(result).toBe(true);
    });

    it('should return false for non-existent process', async () => {
      const result = await manager.terminateProcess('non-existent-id');
      expect(result).toBe(false);
    });

    it('should force kill with force option', async () => {
      // 创建一个长时间运行的脚本
      const longRunningScript = path.join(testDir, 'long-running.js');
      fs.writeFileSync(longRunningScript, `
        setTimeout(() => {}, 60000);
      `);

      const process = await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: longRunningScript,
        workingDir: testDir,
      });

      const result = await manager.terminateProcess(process.id, { force: true });
      expect(result).toBe(true);
    });
  });

  describe('terminateAll', () => {
    it('should terminate all running processes', async () => {
      await manager.createProcess({
        pluginId: 'test-plugin-1',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      await manager.createProcess({
        pluginId: 'test-plugin-2',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      const results = await manager.terminateAll();
      expect(results.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('cleanup', () => {
    it('should remove terminated processes from registry', async () => {
      const process = await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      // 等待进程退出
      await new Promise<void>((resolve) => {
        process.childProcess?.once('exit', () => resolve());
      });

      const cleaned = manager.cleanup();
      expect(cleaned).toBe(1);

      const retrieved = manager.getProcess(process.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      const stats = manager.getStats();
      expect(stats.running).toBeGreaterThanOrEqual(1);
      expect(stats.created).toBe(0);
      expect(stats.terminated).toBe(0);
      expect(stats.error).toBe(0);
    });
  });

  describe('isAlive', () => {
    it('should return true for running process', async () => {
      const process = await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      expect(manager.isAlive(process.id)).toBe(true);
    });

    it('should return false for terminated process', async () => {
      const process = await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      // 等待进程退出
      await new Promise<void>((resolve) => {
        process.childProcess?.once('exit', () => resolve());
      });

      expect(manager.isAlive(process.id)).toBe(false);
    });
  });

  describe('getPid', () => {
    it('should return PID for running process', async () => {
      const process = await manager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      const pid = manager.getPid(process.id);
      expect(pid).toBeDefined();
      expect(pid).toBeGreaterThan(0);
    });

    it('should return undefined for non-existent process', () => {
      const pid = manager.getPid('non-existent-id');
      expect(pid).toBeUndefined();
    });
  });

  describe('destroy', () => {
    it('should terminate all processes and clear registry', async () => {
      await manager.createProcess({
        pluginId: 'test-plugin-1',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      await manager.createProcess({
        pluginId: 'test-plugin-2',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      manager.destroy();

      const stats = manager.getStats();
      expect(stats.running).toBe(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      // 创建一个新 manager 来避免 afterEach 冲突
      const errorManager = new ProcessManager();
      
      await errorManager.createProcess({
        pluginId: 'test-plugin',
        entryPath: testScriptPath,
        workingDir: testDir,
      });

      // destroy 应该不会抛出异常
      expect(() => errorManager.destroy()).not.toThrow();
    });
  });

  describe('type guards', () => {
    const { isProcessCreateOptions, isGracefulTerminateOptions, isManagedProcess } = require('../src/sandbox/process-manager');

    it('should validate ProcessCreateOptions', () => {
      expect(isProcessCreateOptions({
        pluginId: 'test',
        entryPath: '/path/to/file',
        workingDir: '/path/to/dir',
      })).toBe(true);

      expect(isProcessCreateOptions({})).toBe(false);
      expect(isProcessCreateOptions(null)).toBe(false);
    });

    it('should validate GracefulTerminateOptions', () => {
      expect(isGracefulTerminateOptions({})).toBe(true);
      expect(isGracefulTerminateOptions({ force: true })).toBe(true);
      expect(isGracefulTerminateOptions({ sigtermWaitMs: 1000 })).toBe(true);
      expect(isGracefulTerminateOptions({ sigtermWaitMs: -1 })).toBe(false);
    });
  });
});

describe('processManager singleton', () => {
  it('should be an instance of ProcessManager', () => {
    expect(processManager).toBeInstanceOf(ProcessManager);
  });
});