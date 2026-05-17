/**
 * Event Subscription Tests
 *
 * 规则 T1（清理必须与创建对称）：
 * beforeEach 创建订阅，afterEach 必须清理所有订阅。
 * 使用动态追踪列表而非硬编码 ID。
 *
 * 规则 T2（异步测试必须有超时兜底）：
 * vitest.config.ts 已配置 testTimeout: 10000
 *
 * 规则 T4（不依赖进程退出判断通过）：
 * 每个测试结束后断言 getActiveSubscriptionCount() === 0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../../daemon-core/src/event-bus/EventBus.js';
import {
  EventSubscriptionManager,
  createEventSubscriptionManager,
  type EventSubscription,
} from '../src/event-subscription.js';
import type { Event } from '../src/types.js';

describe('EventSubscriptionManager', () => {
  let eventBus: EventBus;
  let manager: EventSubscriptionManager;
  // 规则 D3 + T1：动态追踪列表
  const trackedSubscriptions: EventSubscription[] = [];

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();
    manager = createEventSubscriptionManager(eventBus);
  });

  afterEach(async () => {
    // 规则 T1：清理所有动态创建的订阅
    for (const subscription of trackedSubscriptions) {
      subscription.unsubscribe();
    }
    trackedSubscriptions.length = 0;

    // 规则 A4：销毁 manager
    await manager.dispose();

    // 规则 X2：断言无残留
    expect(manager.getActiveSubscriptionCount()).toBe(0);
    expect(eventBus.getTotalSubscriptionCount()).toBe(0);

    eventBus.stop();
  });

  describe('subscribe', () => {
    it('should subscribe to event type and receive matching events', async () => {
      const events: Event[] = [];
      const handler = (event: Event) => {
        events.push(event);
      };

      const subscription = manager.subscribe('workflow.started', handler);
      trackedSubscriptions.push(subscription);

      // 发布匹配的事件
      const testEvent: Event = {
        eventId: 'test-1',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'workflow.started',
        payload: { instanceId: 'inst-1' },
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      };

      eventBus.publish(testEvent);

      // 等待异步处理
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('workflow.started');
    });

    it('should support wildcard patterns', async () => {
      const events: Event[] = [];
      const handler = (event: Event) => {
        events.push(event);
      };

      const subscription = manager.subscribe('workflow.*', handler);
      trackedSubscriptions.push(subscription);

      // 发布多个匹配的事件
      const events_to_publish = [
        { action: 'workflow.started' },
        { action: 'workflow.completed' },
        { action: 'workflow.failed' },
      ];

      for (const evt of events_to_publish) {
        const testEvent: Event = {
          eventId: `test-${evt.action}`,
          ts: Date.now(),
          projectId: 'test-project',
          action: evt.action,
          payload: {},
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        };
        eventBus.publish(testEvent);
      }

      // 等待异步处理
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(3);
    });

    it('should handle multiple subscriptions to same event type', async () => {
      const events1: Event[] = [];
      const events2: Event[] = [];

      const subscription1 = manager.subscribe('workflow.started', (event: Event) => {
        events1.push(event);
      });
      trackedSubscriptions.push(subscription1);

      const subscription2 = manager.subscribe('workflow.started', (event: Event) => {
        events2.push(event);
      });
      trackedSubscriptions.push(subscription2);

      const testEvent: Event = {
        eventId: 'test-1',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'workflow.started',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      };

      eventBus.publish(testEvent);

      // 等待异步处理
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
      expect(manager.getActiveSubscriptionCount()).toBe(2);
    });

    it('should throw error for invalid event type', () => {
      const handler = (event: Event) => {};

      expect(() => {
        manager.subscribe('', handler);
      }).toThrow('Invalid event type');

      expect(() => {
        manager.subscribe(null as any, handler);
      }).toThrow('Invalid event type');
    });

    it('should throw error for invalid handler', () => {
      expect(() => {
        manager.subscribe('workflow.started', null as any);
      }).toThrow('Invalid handler');

      expect(() => {
        manager.subscribe('workflow.started', undefined as any);
      }).toThrow('Invalid handler');
    });

    it('should handle handler errors gracefully', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const events: Event[] = [];

      const subscription = manager.subscribe('workflow.started', (event: Event) => {
        events.push(event);
        throw new Error('Handler error');
      });
      trackedSubscriptions.push(subscription);

      const testEvent: Event = {
        eventId: 'test-1',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'workflow.started',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      };

      eventBus.publish(testEvent);

      // 等待异步处理
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(1);
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe and stop receiving events', async () => {
      const events: Event[] = [];
      const handler = (event: Event) => {
        events.push(event);
      };

      const subscription = manager.subscribe('workflow.started', handler);
      trackedSubscriptions.push(subscription);

      // 发布第一个事件
      let testEvent: Event = {
        eventId: 'test-1',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'workflow.started',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      };
      eventBus.publish(testEvent);

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(events).toHaveLength(1);

      // 取消订阅
      subscription.unsubscribe();
      trackedSubscriptions.pop();

      // 发布第二个事件
      testEvent = {
        eventId: 'test-2',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'workflow.started',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      };
      eventBus.publish(testEvent);

      await new Promise(resolve => setTimeout(resolve, 50));

      // 应该仍然只有 1 个事件
      expect(events).toHaveLength(1);
      expect(manager.getActiveSubscriptionCount()).toBe(0);
    });

    it('should handle unsubscribe of non-existent subscription', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      manager.unsubscribe('non-existent-id');

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should support unsubscribe via returned subscription object', async () => {
      const events: Event[] = [];

      const subscription = manager.subscribe('workflow.started', (event: Event) => {
        events.push(event);
      });
      trackedSubscriptions.push(subscription);

      expect(manager.getActiveSubscriptionCount()).toBe(1);

      // 通过返回的对象取消订阅
      subscription.unsubscribe();
      trackedSubscriptions.pop();

      expect(manager.getActiveSubscriptionCount()).toBe(0);
    });
  });

  describe('getActiveSubscriptions', () => {
    it('should return all active subscriptions', () => {
      const subscription1 = manager.subscribe('workflow.started', () => {});
      trackedSubscriptions.push(subscription1);

      const subscription2 = manager.subscribe('workflow.completed', () => {});
      trackedSubscriptions.push(subscription2);

      const subscription3 = manager.subscribe('workflow.*', () => {});
      trackedSubscriptions.push(subscription3);

      const active = manager.getActiveSubscriptions();

      expect(active).toHaveLength(3);
      expect(active).toContain(subscription1);
      expect(active).toContain(subscription2);
      expect(active).toContain(subscription3);
    });

    it('should return empty array when no subscriptions', () => {
      const active = manager.getActiveSubscriptions();
      expect(active).toHaveLength(0);
    });

    it('should reflect subscription removal', () => {
      const subscription1 = manager.subscribe('workflow.started', () => {});
      trackedSubscriptions.push(subscription1);

      const subscription2 = manager.subscribe('workflow.completed', () => {});
      trackedSubscriptions.push(subscription2);

      expect(manager.getActiveSubscriptions()).toHaveLength(2);

      subscription1.unsubscribe();
      trackedSubscriptions.pop();

      expect(manager.getActiveSubscriptions()).toHaveLength(1);
      expect(manager.getActiveSubscriptions()[0]).toBe(subscription2);
    });
  });

  describe('dispose', () => {
    it('should clean up all subscriptions', async () => {
      const subscription1 = manager.subscribe('workflow.started', () => {});
      const subscription2 = manager.subscribe('workflow.completed', () => {});
      const subscription3 = manager.subscribe('workflow.*', () => {});

      expect(manager.getActiveSubscriptionCount()).toBe(3);

      await manager.dispose();

      expect(manager.getActiveSubscriptionCount()).toBe(0);
      expect(manager.getActiveSubscriptions()).toHaveLength(0);
    });
  });

  describe('async handler support', () => {
    it('should handle async event handlers', async () => {
      const events: Event[] = [];

      const subscription = manager.subscribe('workflow.started', async (event: Event) => {
        // 模拟异步操作
        await new Promise(resolve => setTimeout(resolve, 10));
        events.push(event);
      });
      trackedSubscriptions.push(subscription);

      const testEvent: Event = {
        eventId: 'test-1',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'workflow.started',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      };

      eventBus.publish(testEvent);

      // 等待异步处理完成
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(events).toHaveLength(1);
    });
  });

  describe('subscription lifecycle', () => {
    it('should track subscription metadata correctly', () => {
      const handler = (event: Event) => {};
      const subscription = manager.subscribe('workflow.started', handler);
      trackedSubscriptions.push(subscription);

      expect(subscription.subscriptionId).toBeDefined();
      expect(subscription.eventType).toBe('workflow.started');
      expect(subscription.handler).toBe(handler);
      expect(typeof subscription.unsubscribe).toBe('function');
    });

    it('should generate unique subscription IDs', () => {
      const subscription1 = manager.subscribe('workflow.started', () => {});
      trackedSubscriptions.push(subscription1);

      const subscription2 = manager.subscribe('workflow.started', () => {});
      trackedSubscriptions.push(subscription2);

      expect(subscription1.subscriptionId).not.toBe(subscription2.subscriptionId);
    });
  });

  describe('integration with Event Bus', () => {
    it('should properly integrate with Event Bus lifecycle', async () => {
      const subscription = manager.subscribe('workflow.*', () => {});
      trackedSubscriptions.push(subscription);

      expect(eventBus.getTotalSubscriptionCount()).toBe(1);

      subscription.unsubscribe();
      trackedSubscriptions.pop();

      expect(eventBus.getTotalSubscriptionCount()).toBe(0);
    });

    it('should handle Event Bus stop gracefully', async () => {
      const events: Event[] = [];
      const subscription = manager.subscribe('workflow.started', (event: Event) => {
        events.push(event);
      });
      trackedSubscriptions.push(subscription);

      eventBus.stop();

      const testEvent: Event = {
        eventId: 'test-1',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'workflow.started',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      };

      eventBus.publish(testEvent);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Event Bus 已停止，不应该收到事件
      expect(events).toHaveLength(0);
    });
  });

  describe('resource cleanup (规则 D3 + T1)', () => {
    it('should track all dynamically created subscriptions', () => {
      const subscriptions = [];

      for (let i = 0; i < 5; i++) {
        const sub = manager.subscribe(`workflow.event${i}`, () => {});
        subscriptions.push(sub);
        trackedSubscriptions.push(sub);
      }

      expect(manager.getActiveSubscriptionCount()).toBe(5);

      // 清理所有
      for (const sub of subscriptions) {
        sub.unsubscribe();
      }
      trackedSubscriptions.length = 0;

      expect(manager.getActiveSubscriptionCount()).toBe(0);
    });

    it('should verify no resource leaks after test', async () => {
      // 这个测试验证 afterEach 的清理逻辑
      const subscription = manager.subscribe('workflow.started', () => {});
      trackedSubscriptions.push(subscription);

      // 测试结束时 afterEach 会验证清理完整性
      expect(manager.getActiveSubscriptionCount()).toBe(1);
    });
  });
});
