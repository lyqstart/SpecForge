/**
 * IPC 通道单元测试（任务 9.2.2 编写沙箱骨架测试）
 *
 * 测试 IPCChannel 的核心功能：
 *   - 消息发送/接收
 *   - 请求-响应模式
 *   - 事件订阅机制
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  IPCChannel, 
  isIPCChannelConfig,
  IPC_CHANNEL_STATUSES 
} from '../../src/sandbox/ipc-channel';
import type { IPCMessage, IPCRequest, IPCResponse, IPCEvent } from '../../src/sandbox/index';

describe('IPCChannel', () => {
  let channel: IPCChannel;

  beforeEach(() => {
    channel = new IPCChannel('test-process-id');
  });

  afterEach(() => {
    channel.dispose();
  });

  describe('constructor', () => {
    it('should create a channel with default config', () => {
      expect(channel).toBeDefined();
      expect(channel.id).toBeDefined();
      expect(channel.getStatus()).toBe('created');
    });

    it('should create a channel with custom config', () => {
      const customChannel = new IPCChannel('test-process-id', {
        requestTimeoutMs: 5000,
        enableLogging: true,
      });
      expect(customChannel).toBeDefined();
      customChannel.dispose();
    });
  });

  describe('connect/disconnect', () => {
    it('should connect and become connected', () => {
      channel.connect();
      expect(channel.isConnected()).toBe(true);
      expect(channel.getStatus()).toBe('connected');
    });

    it('should disconnect and reject pending requests', async () => {
      // 先 mock doSend 避免实际发送
      const mockDoSend = vi.fn();
      channel.doSend = mockDoSend;
      
      channel.connect();
      
      // 创建一个 pending request 来测试 disconnect 是否会拒绝它
      const sendRequestPromise = channel.sendRequest('testMethod', ['arg1']);
      
      // 等待一小段时间确保 request 被注册
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // disconnect 应该会拒绝 pending request
      channel.disconnect();
      
      await expect(sendRequestPromise).rejects.toThrow('Channel disconnected');
    });

    it('should reject send on disconnected channel', () => {
      // 不连接直接发送应该报错
      const testMessage: IPCMessage = {
        id: 'test-1',
        type: 'request',
        direction: 'toSandbox',
        timestamp: Date.now(),
        method: 'test',
        args: [],
      };
      
      expect(() => channel.send(testMessage)).toThrow('Channel is not connected');
    });

    it('should reject send on disposed channel', () => {
      // 在发送前先 mock doSend，避免 send 内部调用时出问题
      const mockDoSend = vi.fn();
      channel.doSend = mockDoSend;
      channel.connect();
      channel.dispose();
      
      const testMessage: IPCMessage = {
        id: 'test-1',
        type: 'request',
        direction: 'toSandbox',
        timestamp: Date.now(),
        method: 'test',
        args: [],
      };
      
      expect(() => channel.send(testMessage)).toThrow('Cannot send on disposed channel');
    });
  });

  describe('message handling', () => {
    it('should call message handler on message received', () => {
      channel.connect();
      
      const handler = vi.fn();
      channel.setMessageHandler(handler);
      
      const message: IPCMessage = {
        id: 'test-msg-1',
        type: 'event',
        direction: 'toHost',
        timestamp: Date.now(),
        event: 'testEvent',
        payload: { data: 'test' },
      };
      
      channel.handleMessage(message);
      
      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should handle response for pending request', async () => {
      channel.connect();
      
      // 使用 mock 的 doSend 来避免实际发送
      const mockDoSend = vi.fn();
      channel.doSend = mockDoSend;
      
      // 发送请求
      const requestPromise = channel.sendRequest('testMethod', ['arg1']);
      
      // 获取发送的消息
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockDoSend).toHaveBeenCalled();
      const sentMessage = mockDoSend.mock.calls[0][0] as IPCRequest;
      
      // 模拟收到响应
      const response: IPCResponse = {
        id: 'response-1',
        type: 'response',
        direction: 'toHost',
        timestamp: Date.now(),
        requestId: sentMessage.id,
        success: true,
        result: { data: 'result' },
      };
      
      channel.handleMessage(response);
      
      const result = await requestPromise;
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ data: 'result' });
    });

    it('should reject on error response', async () => {
      channel.connect();
      
      const mockDoSend = vi.fn();
      channel.doSend = mockDoSend;
      
      const requestPromise = channel.sendRequest('testMethod', []);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      const sentMessage = mockDoSend.mock.calls[0][0] as IPCRequest;
      
      const response: IPCResponse = {
        id: 'response-2',
        type: 'response',
        direction: 'toHost',
        timestamp: Date.now(),
        requestId: sentMessage.id,
        success: false,
        error: { code: 'ERROR_CODE', message: 'Error message' },
      };
      
      channel.handleMessage(response);
      
      await expect(requestPromise).rejects.toThrow('Error message');
    });

    it('should ignore response for unknown request', () => {
      channel.connect();
      
      const response: IPCResponse = {
        id: 'response-3',
        type: 'response',
        direction: 'toHost',
        timestamp: Date.now(),
        requestId: 'unknown-request-id',
        success: true,
      };
      
      // 不应该抛出错误
      expect(() => channel.handleMessage(response)).not.toThrow();
    });

    it('should notify event subscribers', () => {
      channel.connect();
      
      const handler = vi.fn();
      channel.subscribe('testEvent', handler);
      
      const event: IPCEvent = {
        id: 'event-1',
        type: 'event',
        direction: 'toHost',
        timestamp: Date.now(),
        event: 'testEvent',
        payload: { data: 'test' },
      };
      
      channel.handleMessage(event);
      
      expect(handler).toHaveBeenCalledWith(event);
    });
  });

  describe('sendRequest timeout', () => {
    it('should timeout and reject after configured time', async () => {
      const shortTimeoutChannel = new IPCChannel('test-process-id', {
        requestTimeoutMs: 100,
      });
      shortTimeoutChannel.connect();
      
      // 不实现 doSend，这样请求永远不会收到响应
      shortTimeoutChannel.doSend = vi.fn();
      
      await expect(shortTimeoutChannel.sendRequest('slowMethod', []))
        .rejects.toThrow('Request timeout');
      
      shortTimeoutChannel.dispose();
    }, 200); // 测试超时，200ms 内应该完成
  });

  describe('sendResponse', () => {
    it('should send response message', () => {
      channel.connect();
      
      const mockDoSend = vi.fn();
      channel.doSend = mockDoSend;
      
      channel.sendResponse('request-123', true, { data: 'result' });
      
      expect(mockDoSend).toHaveBeenCalled();
      const sentMessage = mockDoSend.mock.calls[0][0] as IPCResponse;
      expect(sentMessage.type).toBe('response');
      expect(sentMessage.requestId).toBe('request-123');
      expect(sentMessage.success).toBe(true);
      expect(sentMessage.result).toEqual({ data: 'result' });
    });

    it('should send error response', () => {
      channel.connect();
      
      const mockDoSend = vi.fn();
      channel.doSend = mockDoSend;
      
      channel.sendResponse('request-456', false, undefined, {
        code: 'ERROR',
        message: 'Something went wrong',
      });
      
      const sentMessage = mockDoSend.mock.calls[0][0] as IPCResponse;
      expect(sentMessage.success).toBe(false);
      expect(sentMessage.error?.code).toBe('ERROR');
    });
  });

  describe('sendEvent', () => {
    it('should send event message', () => {
      channel.connect();
      
      const mockDoSend = vi.fn();
      channel.doSend = mockDoSend;
      
      channel.sendEvent('myEvent', { key: 'value' });
      
      const sentMessage = mockDoSend.mock.calls[0][0] as IPCEvent;
      expect(sentMessage.type).toBe('event');
      expect(sentMessage.event).toBe('myEvent');
      expect(sentMessage.payload).toEqual({ key: 'value' });
    });
  });

  describe('subscribe/unsubscribe', () => {
    it('should subscribe and receive events', () => {
      // 先 mock doSend 避免 sendEvent 内部调用失败
      const mockDoSend = vi.fn();
      channel.doSend = mockDoSend;
      
      channel.connect();
      
      const handler = vi.fn();
      const unsubscribe = channel.subscribe('event1', handler);
      
      channel.sendEvent('event1', { data: 'test' });
      
      expect(handler).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      channel.sendEvent('event1', { data: 'test2' });
      
      expect(handler).toHaveBeenCalledTimes(1); // 仍然是 1，因为已取消订阅
    });

    it('should allow multiple subscribers for same event', () => {
      // 先 mock doSend 避免 sendEvent 内部调用失败
      const mockDoSend = vi.fn();
      channel.doSend = mockDoSend;
      
      channel.connect();
      
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      channel.subscribe('event2', handler1);
      channel.subscribe('event2', handler2);
      
      channel.sendEvent('event2', {});
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    it('should dispose and clear all resources', () => {
      channel.connect();
      
      // 添加一些订阅
      channel.subscribe('event1', vi.fn());
      channel.subscribe('event2', vi.fn());
      
      expect(channel.getSubscriberCount()).toBe(2);
      
      channel.dispose();
      
      expect(channel.getSubscriberCount()).toBe(0);
      expect(channel.getPendingRequestCount()).toBe(0);
      expect(channel.getStatus()).toBe('disconnected');
    });

    it('should reject pending requests on dispose', async () => {
      channel.connect();
      
      const mockDoSend = vi.fn();
      channel.doSend = mockDoSend;
      
      const requestPromise = channel.sendRequest('test', []);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      channel.dispose();
      
      await expect(requestPromise).rejects.toThrow('Channel disposed');
    });

    it('should be idempotent', () => {
      channel.dispose();
      expect(() => channel.dispose()).not.toThrow();
    });
  });

  describe('getPendingRequestCount', () => {
    it('should return 0 initially', () => {
      expect(channel.getPendingRequestCount()).toBe(0);
    });

    it('should count pending requests', async () => {
      channel.connect();
      
      const mockDoSend = vi.fn();
      channel.doSend = mockDoSend;
      
      channel.sendRequest('method1', []);
      channel.sendRequest('method2', []);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(channel.getPendingRequestCount()).toBe(2);
    });
  });

  describe('getSubscriberCount', () => {
    it('should return 0 for no subscribers', () => {
      expect(channel.getSubscriberCount()).toBe(0);
      expect(channel.getSubscriberCount('event1')).toBe(0);
    });

    it('should count subscribers', () => {
      channel.subscribe('event1', vi.fn());
      channel.subscribe('event1', vi.fn());
      channel.subscribe('event2', vi.fn());
      
      expect(channel.getSubscriberCount('event1')).toBe(2);
      expect(channel.getSubscriberCount('event2')).toBe(1);
      expect(channel.getSubscriberCount()).toBe(3);
    });
  });
});

describe('IPC_CHANNEL_STATUSES', () => {
  it('should contain all valid statuses', () => {
    expect(IPC_CHANNEL_STATUSES.has('created')).toBe(true);
    expect(IPC_CHANNEL_STATUSES.has('connected')).toBe(true);
    expect(IPC_CHANNEL_STATUSES.has('disconnected')).toBe(true);
    expect(IPC_CHANNEL_STATUSES.has('error')).toBe(true);
  });
});

describe('isIPCChannelConfig', () => {
  it('should validate correct config', () => {
    expect(isIPCChannelConfig({
      requestTimeoutMs: 5000,
      enableLogging: true,
    })).toBe(true);
    
    expect(isIPCChannelConfig({})).toBe(true);
    
    expect(isIPCChannelConfig({
      requestTimeoutMs: 1000,
    })).toBe(true);
    
    expect(isIPCChannelConfig({
      enableLogging: false,
    })).toBe(true);
  });

  it('should reject invalid config', () => {
    expect(isIPCChannelConfig(null)).toBe(false);
    expect(isIPCChannelConfig(undefined)).toBe(false);
    expect(isIPCChannelConfig('string')).toBe(false);
    expect(isIPCChannelConfig([])).toBe(false);
    
    // invalid timeout
    expect(isIPCChannelConfig({ requestTimeoutMs: -1 })).toBe(false);
    expect(isIPCChannelConfig({ requestTimeoutMs: 0 })).toBe(false);
    expect(isIPCChannelConfig({ requestTimeoutMs: 1.5 })).toBe(false);
    
    // invalid enableLogging
    expect(isIPCChannelConfig({ enableLogging: 'true' })).toBe(false);
  });
});