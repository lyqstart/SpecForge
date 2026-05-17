/**
 * Event Bus implementation
 * 
 * Internal publish/subscribe system for cross-layer communication.
 * All cross-layer communication must pass through the Event Bus (Property 2).
 * 
 * Features:
 * - Topic-based routing with pattern matching (e.g., session.* matches session.created)
 * - Observability hooks for logging all events
 * - Synchronous event delivery
 */

import { Event, Subscription } from '../types';

/**
 * Topic pattern matcher
 * Supports wildcard patterns like:
 * - session.* matches session.created, session.activated
 * - project.* matches project.created, project.updated
 * - * matches all events
 */
class TopicMatcher {
  /**
   * Check if a topic matches a pattern
   * @param topic The event topic (e.g., "session.created")
   * @param pattern The subscription pattern (e.g., "session.*")
   * @returns true if topic matches pattern
   */
  matches(topic: string, pattern: string): boolean {
    if (pattern === '*') {
      return true;
    }

    const patternParts = pattern.split('.');
    const topicParts = topic.split('.');

    // Pattern with * can match topics with more parts
    // e.g., "project.*" matches "project.created" and "project.updated"
    // e.g., "project.*.*" matches "project.session.created"
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '*') {
        // Wildcard matches any single part
        continue;
      }
      if (i >= topicParts.length) {
        // Pattern has more parts than topic
        return false;
      }
      if (patternParts[i] !== topicParts[i]) {
        return false;
      }
    }

    // Topic can have more parts than pattern (if pattern ends with *)
    return true;
  }

  /**
   * Get all matching subscriptions for an event
   */
  getMatchingSubscriptions(
    subscriptions: Map<string, Map<string, (event: Event) => void>>,
    event: Event
  ): ((event: Event) => void)[] {
    const handlers: ((event: Event) => void)[] = [];

    for (const [pattern, handlersMap] of subscriptions.entries()) {
      if (this.matches(event.action, pattern)) {
        for (const handler of handlersMap.values()) {
          handlers.push(handler);
        }
      }
    }

    return handlers;
  }
}

/**
 * Observability hook for event logging
 */
interface ObservabilityHook {
  onPublish(event: Event): void;
  onSubscribe(topic: string, handlerId: string): void;
  onUnsubscribe(topic: string, handlerId: string): void;
}

/**
 * Logging observability hook
 */
class LoggingObservabilityHook implements ObservabilityHook {
  onPublish(event: Event): void {
    console.log(`[EventBus] Publish: ${event.action}`, {
      eventId: event.eventId,
      projectId: event.projectId,
      source: event.metadata.source,
      timestamp: new Date(event.ts).toISOString(),
    });
  }

  onSubscribe(topic: string, handlerId: string): void {
    console.log(`[EventBus] Subscribe: ${topic} (handler: ${handlerId})`);
  }

  onUnsubscribe(topic: string, handlerId: string): void {
    console.log(`[EventBus] Unsubscribe: ${topic} (handler: ${handlerId})`);
  }
}

export class EventBus {
  private subscriptions: Map<string, Map<string, (event: Event) => void>> = new Map();
  private _isRunning: boolean = false;
  private topicMatcher: TopicMatcher = new TopicMatcher();
  private observabilityHooks: ObservabilityHook[] = [new LoggingObservabilityHook()];

  start(): void {
    this._isRunning = true;
    console.log('[EventBus] Started');
  }

  stop(): void {
    this._isRunning = false;
    this.subscriptions.clear();
    console.log('[EventBus] Stopped');
  }

  /**
   * Check if bus is running
   */
  isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Publish an event to all matching subscribers
   * All cross-layer communication must go through this method (Property 2)
   */
  publish(event: Event): void {
    if (!this._isRunning) {
      console.warn('[EventBus] Cannot publish: bus is stopped');
      return;
    }

    // Trigger observability hooks
    for (const hook of this.observabilityHooks) {
      hook.onPublish(event);
    }

    // Get all matching handlers
    const handlers = this.topicMatcher.getMatchingSubscriptions(this.subscriptions, event);

    // Synchronous delivery
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`[EventBus] Error in handler for ${event.action}:`, error);
      }
    }
  }

  /**
   * Subscribe to events matching a topic pattern
   * @param topic Topic pattern (e.g., "session.*", "project.*", "*")
   * @param handler Event handler function
   * @returns Subscription object for unsubscribe
   */
  subscribe(topic: string, handler: (event: Event) => void): Subscription {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Map());
    }

    const id = this.generateId();
    this.subscriptions.get(topic)!.set(id, handler);

    // Trigger observability hooks
    for (const hook of this.observabilityHooks) {
      hook.onSubscribe(topic, id);
    }

    return {
      id,
      topic,
      handler,
    };
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscription: Subscription): void {
    const handlers = this.subscriptions.get(subscription.topic);
    if (handlers) {
      handlers.delete(subscription.id);

      // Trigger observability hooks
      for (const hook of this.observabilityHooks) {
        hook.onUnsubscribe(subscription.topic, subscription.id);
      }
    }
  }

  /**
   * Add a custom observability hook
   */
  addObservabilityHook(hook: ObservabilityHook): void {
    this.observabilityHooks.push(hook);
  }

  /**
   * Remove an observability hook
   */
  removeObservabilityHook(hook: ObservabilityHook): void {
    const index = this.observabilityHooks.indexOf(hook);
    if (index > -1) {
      this.observabilityHooks.splice(index, 1);
    }
  }

  /**
   * Get total number of active subscriptions across all topics.
   *
   * 规则 X2（副作用必须可检测）：测试中可在 afterEach 断言为 0 验证清理完整性。
   * 见 docs/engineering-lessons/async-resource-lifecycle.md。
   */
  getTotalSubscriptionCount(): number {
    let total = 0;
    for (const handlers of this.subscriptions.values()) {
      total += handlers.size;
    }
    return total;
  }

  /**
   * Get all active subscriptions (for testing/debugging)
   */
  getSubscriptions(): Map<string, Map<string, (event: Event) => void>> {
    return this.subscriptions;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }
}