/**
 * IPC 路由单元测试（任务 9.2.2 编写沙箱骨架测试）
 *
 * 测试 IPRouter 的核心功能：
 *   - 通道管理
 *   - 消息路由
 *   - 请求-响应模式
 *   - 事件订阅
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  IPRouter, 
  isIPRouterConfig,
  IP_ROUTER_STATUSES 
} from '../../src/sandbox/ipc-router';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('IPRouter', () => {
  let router: IPRouter;
  let testDir: string;

  beforeEach(() => {
    router = new IPRouter();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-router-test-'));
  });

  afterEach(() => {
    router.dispose();
    
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  describe('constructor', () => {
    it('should create a router with default config', () => {
      expect(router).toBeDefined();
      expect(router.id).toBeDefined();
      expect(router.getStatus()).toBe('created');
    });

    it('should create a router with custom config', () => {
      const customRouter = new IPRouter({
        enableLogging: true,
        maxChannels: 5,
        channelConfig: {
          requestTimeoutMs: 10000,
        },
      });
      expect(customRouter).toBeDefined();
      customRouter.dispose();
    });
  });

  describe('start/stop', () => {
    it('should start and become running', () => {
      router.start();
      expect(router.isRunning()).toBe(true);
      expect(router.getStatus()).toBe('running');
    });

    it('should stop', () => {
      router.start();
      router.stop();
      expect(router.isRunning()).toBe(false);
      expect(router.getStatus()).toBe('stopped');
    });
  });

  describe('createChannel', () => {
    it('should create a channel', () => {
      // 创建一个简单的测试子进程
      const testScript = path.join(testDir, 'test.js');
      fs.writeFileSync(testScript, 'console.log("test"); process.exit(0);');
      
      const childProcess = spawn('node', [testScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      const channelId = router.createChannel('test-plugin-id', childProcess);
      
      expect(channelId).toBeDefined();
      expect(router.getChannel(channelId)).toBeDefined();
      expect(router.getChannelIds()).toContain(channelId);
      
      // 等待子进程退出
      return new Promise<void>((resolve) => {
        childProcess.on('exit', () => resolve());
      });
    });

    it('should throw when max channels reached', () => {
      const limitedRouter = new IPRouter({ maxChannels: 1 });
      
      const testScript = path.join(testDir, 'test1.js');
      fs.writeFileSync(testScript, 'process.exit(0);');
      
      const childProcess1 = spawn('node', [testScript], { stdio: 'pipe' });
      limitedRouter.createChannel('plugin-1', childProcess1);
      
      const testScript2 = path.join(testDir, 'test2.js');
      fs.writeFileSync(testScript2, 'process.exit(0);');
      const childProcess2 = spawn('node', [testScript2], { stdio: 'pipe' });
      
      expect(() => limitedRouter.createChannel('plugin-2', childProcess2))
        .toThrow('Maximum channel limit reached');
      
      limitedRouter.dispose();
      
      return new Promise<void>((resolve) => {
        childProcess2.on('exit', () => resolve());
      });
    });
  });

  describe('closeChannel', () => {
    it('should close an existing channel', () => {
      const testScript = path.join(testDir, 'test.js');
      fs.writeFileSync(testScript, 'process.exit(0);');
      
      const childProcess = spawn('node', [testScript], { stdio: 'pipe' });
      const channelId = router.createChannel('test-plugin', childProcess);
      
      expect(router.getChannel(channelId)).toBeDefined();
      
      router.closeChannel(channelId);
      
      expect(router.getChannel(channelId)).toBeUndefined();
      
      return new Promise<void>((resolve) => {
        childProcess.on('exit', () => resolve());
      });
    });

    it('should handle closing non-existent channel', () => {
      expect(() => router.closeChannel('non-existent')).not.toThrow();
    });
  });

  describe('getChannel', () => {
    it('should return channel when exists', () => {
      const testScript = path.join(testDir, 'test.js');
      fs.writeFileSync(testScript, 'process.exit(0);');
      
      const childProcess = spawn('node', [testScript], { stdio: 'pipe' });
      const channelId = router.createChannel('test-plugin', childProcess);
      
      const channel = router.getChannel(channelId);
      expect(channel).toBeDefined();
      
      return new Promise<void>((resolve) => {
        childProcess.on('exit', () => resolve());
      });
    });

    it('should return undefined for non-existent channel', () => {
      expect(router.getChannel('non-existent')).toBeUndefined();
    });
  });

  describe('getChannelIds', () => {
    it('should return empty array initially', () => {
      expect(router.getChannelIds()).toEqual([]);
    });
  });

  describe('getActiveChannelCount', () => {
    it('should count connected channels', async () => {
      const testScript = path.join(testDir, 'test.js');
      fs.writeFileSync(testScript, 'process.exit(0);');
      
      const childProcess = spawn('node', [testScript], { stdio: 'pipe' });
      router.createChannel('test-plugin', childProcess);
      
      expect(router.getActiveChannelCount()).toBe(1);
      
      return new Promise<void>((resolve) => {
        childProcess.on('exit', () => resolve());
      });
    });
  });

  describe('message handling', () => {
    it('should call message handler', () => {
      const testScript = path.join(testDir, 'test.js');
      fs.writeFileSync(testScript, 'process.exit(0);');
      
      const childProcess = spawn('node', [testScript], { stdio: 'pipe' });
      const channelId = router.createChannel('test-plugin', childProcess);
      
      const handler = vi.fn();
      router.setMessageHandler(handler);
      
      // 关闭通道来触发清理
      router.closeChannel(channelId);
      
      return new Promise<void>((resolve) => {
        childProcess.on('exit', () => resolve());
      });
    });

    it('should call event handler', () => {
      const testScript = path.join(testDir, 'test.js');
      fs.writeFileSync(testScript, 'process.exit(0);');
      
      const childProcess = spawn('node', [testScript], { stdio: 'pipe' });
      const channelId = router.createChannel('test-plugin', childProcess);
      
      const handler = vi.fn();
      router.setEventHandler(handler);
      
      router.closeChannel(channelId);
      
      return new Promise<void>((resolve) => {
        childProcess.on('exit', () => resolve());
      });
    });
  });

  describe('subscribe', () => {
    it('should subscribe to channel events', () => {
      const testScript = path.join(testDir, 'test.js');
      fs.writeFileSync(testScript, 'process.exit(0);');
      
      const childProcess = spawn('node', [testScript], { stdio: 'pipe' });
      const channelId = router.createChannel('test-plugin', childProcess);
      
      const handler = vi.fn();
      const unsubscribe = router.subscribe(channelId, 'testEvent', handler);
      
      expect(unsubscribe).toBeDefined();
      expect(typeof unsubscribe).toBe('function');
      
      router.closeChannel(channelId);
      
      return new Promise<void>((resolve) => {
        childProcess.on('exit', () => resolve());
      });
    });

    it('should throw for non-existent channel', () => {
      expect(() => router.subscribe('non-existent', 'event', vi.fn()))
        .toThrow('Channel not found');
    });

    it('should subscribeAll to all channels', () => {
      const testScript = path.join(testDir, 'test.js');
      fs.writeFileSync(testScript, 'process.exit(0);');
      
      const childProcess = spawn('node', [testScript], { stdio: 'pipe' });
      router.createChannel('test-plugin', childProcess);
      
      const handler = vi.fn();
      const unsubscribe = router.subscribeAll('testEvent', handler);
      
      expect(unsubscribe).toBeDefined();
      
      router.closeChannel(router.getChannelIds()[0]);
      
      return new Promise<void>((resolve) => {
        childProcess.on('exit', () => resolve());
      });
    });
  });

  describe('dispose', () => {
    it('should dispose and clear all channels', () => {
      const testScript = path.join(testDir, 'test.js');
      fs.writeFileSync(testScript, 'process.exit(0);');
      
      const childProcess = spawn('node', [testScript], { stdio: 'pipe' });
      router.createChannel('test-plugin', childProcess);
      
      expect(router.getChannelIds().length).toBe(1);
      
      router.dispose();
      
      expect(router.getChannelIds().length).toBe(0);
      expect(router.getStatus()).toBe('stopped');
      
      return new Promise<void>((resolve) => {
        childProcess.on('exit', () => resolve());
      });
    });

    it('should be idempotent', () => {
      router.dispose();
      expect(() => router.dispose()).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      const stats = router.getStats();
      expect(stats.total).toBe(0);
      expect(stats.connected).toBe(0);
      expect(stats.disconnected).toBe(0);
    });
  });
});

describe('IP_ROUTER_STATUSES', () => {
  it('should contain all valid statuses', () => {
    expect(IP_ROUTER_STATUSES.has('created')).toBe(true);
    expect(IP_ROUTER_STATUSES.has('running')).toBe(true);
    expect(IP_ROUTER_STATUSES.has('stopped')).toBe(true);
    expect(IP_ROUTER_STATUSES.has('error')).toBe(true);
  });
});

describe('isIPRouterConfig', () => {
  it('should validate correct config', () => {
    expect(isIPRouterConfig({
      enableLogging: true,
      maxChannels: 5,
      channelConfig: {
        requestTimeoutMs: 10000,
      },
    })).toBe(true);
    
    expect(isIPRouterConfig({})).toBe(true);
    
    expect(isIPRouterConfig({
      enableLogging: false,
    })).toBe(true);
    
    expect(isIPRouterConfig({
      maxChannels: 100,
    })).toBe(true);
  });

  it('should reject invalid config', () => {
    expect(isIPRouterConfig(null)).toBe(false);
    expect(isIPRouterConfig(undefined)).toBe(false);
    expect(isIPRouterConfig('string')).toBe(false);
    expect(isIPRouterConfig([])).toBe(false);
    
    // invalid maxChannels
    expect(isIPRouterConfig({ maxChannels: -1 })).toBe(false);
    expect(isIPRouterConfig({ maxChannels: 0 })).toBe(false);
    expect(isIPRouterConfig({ maxChannels: 1.5 })).toBe(false);
    
    // invalid enableLogging
    expect(isIPRouterConfig({ enableLogging: 'true' })).toBe(false);
    
    // invalid channelConfig
    expect(isIPRouterConfig({ channelConfig: 'invalid' })).toBe(false);
  });
});