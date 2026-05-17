/**
 * Event Subscription Module
 * Implements event subscription mechanism for workflows
 *
 * 规则 D3（动态 ID 资源用注册表追踪）：
 * 订阅 ID 是运行时动态生成的，必须用注册表追踪所有活跃订阅，
 * 清理时遍历注册表释放所有资源。
 * 见 docs/engineering-lessons/async-resource-lifecycle.md
 */

import { v4 as uuidv4 } from 'uuid';
import { IEventBus, Event, Subscription } from './types.js';

/**
 * Event handler function type
 */
export type EventHandler = (event: Event) => void | Promise<void>;

/**
 * Subscription object returned to caller
 * Caller must call unsubscribe() to clean up resources
 */
export interface EventSubscription {
  subscriptionId: string;
  eventType: string;
  handler: EventHandler;
  unsubscribe(): void;
}

/**
 * EventSubscriptionManager
 * Manages event subscriptions with proper lifecycle management
 *
 * 规则 A4（创建者负责销毁）：
 * 创建的订阅必须由调用者通过 unsubscribe() 释放，
 * 或由 EventSubscriptionManager 在清理时释放。
 */
export class EventSubscriptionManager {
  private eventBus: IEventBus;
  private subscriptions: Map<string, EventSubscription> = new Map();
  private busSubscriptions: Map<string, Subscription> = new Map();

  constructor(eventBus: IEventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Subscribe to a specific event type
   *
   * @param eventType - The event type to subscribe to (e.g., "workflow.started", "workflow.*")
   * @param handler - The event handler function
   * @returns EventSubscription object with unsubscribe method
   *
   * 规则 D3：订阅 ID 动态生成，必须注册到 subscriptions 注册表
   */
  subscribe(eventType: string, handler: EventHandler): EventSubscription {
    if (!eventType || typeof eventType !== 'string') {
      throw new Error('Invalid event type: must be a non-empty string');
    }

    if (!handler || typeof handler !== 'function') {
      throw new Error('Invalid handler: must be a function');
    }

    const subscriptionId = uuidv4();

    // 创建包装的 handler，处理异步调用
    const wrappedHandler = async (event: Event) => {
      try {
        await Promise.resolve(handler(event));
      } catch (error) {
        console.error(
          `[EventSubscriptionManager] Error in handler for ${eventType}:`,
          error
        );
      }
    };

    // 向 Event Bus 订阅
    const busSubscription = this.eventBus.subscribe(eventType, wrappedHandler);

    // 创建订阅对象
    const subscription: EventSubscription = {
      subscriptionId,
      eventType,
      handler,
      unsubscribe: () => {
        this.unsubscribe(subscriptionId);
      },
    };

    // 规则 D3：注册到动态追踪注册表
    this.subscriptions.set(subscriptionId, subscription);
    this.busSubscriptions.set(subscriptionId, busSubscription);

    return subscription;
  }

  /**
   * Unsubscribe from an event
   *
   * @param subscriptionId - The subscription ID returned from subscribe()
   *
   * 规则 A4：销毁时必须清理 Event Bus 中的订阅
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      console.warn(
        `[EventSubscriptionManager] Subscription not found: ${subscriptionId}`
      );
      return;
    }

    // 从 Event Bus 取消订阅
    const busSubscription = this.busSubscriptions.get(subscriptionId);
    if (busSubscription) {
      this.eventBus.unsubscribe(busSubscription);
      this.busSubscriptions.delete(subscriptionId);
    }

    // 从注册表移除
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Get all active subscriptions
   *
   * 规则 X2（副作用必须可检测）：
   * 提供检测 API 让测试能断言"无残留"。
   * 见 docs/engineering-lessons/async-resource-lifecycle.md
   *
   * @returns Array of active subscriptions
   */
  getActiveSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get count of active subscriptions
   * Used for testing assertions (规则 X2)
   */
  getActiveSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Clean up all subscriptions
   *
   * 规则 A4（创建者负责销毁）：
   * 当 EventSubscriptionManager 被销毁时，必须清理所有订阅
   */
  async dispose(): Promise<void> {
    // 规则 T1（清理必须与创建对称）：
    // 创建时注册到两个 Map，清理时必须从两个 Map 都移除
    const subscriptionIds = Array.from(this.subscriptions.keys());

    for (const subscriptionId of subscriptionIds) {
      const hadSubscription = this.subscriptions.has(subscriptionId);
      this.unsubscribe(subscriptionId);
      // 如果 unsubscribe 没有成功移除（例如没有对应的 busSubscription），会留下残留
      const stillExists = this.subscriptions.has(subscriptionId);
      if (hadSubscription && stillExists) {
        throw new Error(
          `[EventSubscriptionManager] Failed to unsubscribe: ${subscriptionId}`
        );
      }
    }

    // 验证清理完整
    if (this.subscriptions.size !== 0) {
      throw new Error(
        `[EventSubscriptionManager] Cleanup failed: ${this.subscriptions.size} subscriptions remain`
      );
    }
    if (this.busSubscriptions.size !== 0) {
      throw new Error(
        `[EventSubscriptionManager] Cleanup failed: ${this.busSubscriptions.size} bus subscriptions remain`
      );
    }
  }
}

/**
 * Create an EventSubscriptionManager
 */
export function createEventSubscriptionManager(
  eventBus: IEventBus
): EventSubscriptionManager {
  return new EventSubscriptionManager(eventBus);
}
