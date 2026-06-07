/**
 * Event Bus implementation
 * 
 * Internal publish/subscribe system for cross-layer communication.
 * All cross-layer communication must pass through the Event Bus (Property 2).
 * 
 * Features:
 * - Topic-based routing with pattern matching (e.g., session.* matches session.created)
 * - Category-based subscription (e.g., subscribe('workflow', handler) or subscribe('*', handler))
 * - Event buffer (ring buffer of recent N events)
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

const DEFAULT_BUFFER_SIZE = 1000;

export class EventBus {
  private subscriptions: Map<string, Map<string, (event: Event) => void>> = new Map();
  private categorySubscribers: Map<string, Set<(event: Event) => void>> = new Map();
  private eventBuffer: Event[] = [];
  private maxBufferSize: number;
  private _isRunning: boolean = false;
  private topicMatcher: TopicMatcher = new TopicMatcher();
  private observabilityHooks: ObservabilityHook[] = [new LoggingObservabilityHook()];
  private persistenceHook: ((event: Event) => Promise<void>) | undefined;

  constructor(maxBufferSize: number = DEFAULT_BUFFER_SIZE) {
    this.maxBufferSize = maxBufferSize;
  }

  start(): void {
    this._isRunning = true;
    console.log('[EventBus] Started');
  }

  stop(): void {
    this._isRunning = false;
    this.subscriptions.clear();
    this.categorySubscribers.clear();
    this.eventBuffer.length = 0;
    console.log('[EventBus] Stopped');
  }

  /**
   * Check if bus is running
   */
  isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Set a persistence hook that is called before fan-out on every publish.
   * The hook should persist the event (e.g., write to events.jsonl with fsync).
   * Set to undefined to remove the hook.
   */
  setPersistenceHook(hook: ((event: Event) => Promise<void>) | undefined): void {
    this.persistenceHook = hook;
  }

  /**
   * Publish an event to all matching subscribers
   * All cross-layer communication must go through this method (Property 2)
   */
  async publish(event: Event): Promise<void> {
    if (!this._isRunning) {
      console.warn('[EventBus] Cannot publish: bus is stopped');
      return;
    }

    // WAL-first: persist before fan-out
    if (this.persistenceHook) {
      await this.persistenceHook(event);
    }

    // Trigger observability hooks
    for (const hook of this.observabilityHooks) {
      hook.onPublish(event);
    }

    // Add to event buffer
    this.bufferEvent(event);

    // Deliver to topic-based subscribers
    const topicHandlers = this.topicMatcher.getMatchingSubscriptions(this.subscriptions, event);
    for (const handler of topicHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`[EventBus] Error in handler for ${event.action}:`, error);
      }
    }

    // Deliver to category-based subscribers
    const category = event.category ?? '';
    const categoryHandlers = this.categorySubscribers.get(category);
    if (categoryHandlers) {
      for (const handler of categoryHandlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`[EventBus] Error in category handler for ${category}:`, error);
        }
      }
    }

    // Deliver to wildcard ('*') category subscribers
    const wildcardHandlers = this.categorySubscribers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`[EventBus] Error in wildcard category handler:`, error);
        }
      }
    }
  }

  /**
   * Subscribe to events matching a topic pattern (legacy API)
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
   * Subscribe to events by category.
   * @param category Event category (e.g., 'workflow', 'gate') or '*' for all categories
   * @param handler Event handler function
   */
  subscribeByCategory(category: string, handler: (event: Event) => void): void {
    if (!this.categorySubscribers.has(category)) {
      this.categorySubscribers.set(category, new Set());
    }
    this.categorySubscribers.get(category)!.add(handler);
  }

  /**
   * Unsubscribe from events (legacy API)
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
   * Unsubscribe a category-based handler.
   * @param category Event category or '*' for wildcard
   * @param handler The handler function to remove
   */
  unsubscribeByCategory(category: string, handler: (event: Event) => void): void {
    const handlers = this.categorySubscribers.get(category);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.categorySubscribers.delete(category);
      }
    }
  }

  /**
   * Get buffered events, optionally filtered by category.
   * @param category Optional category filter
   * @returns Array of buffered events (copy)
   */
  getBufferedEvents(category?: string): Event[] {
    if (!category) {
      return [...this.eventBuffer];
    }
    return this.eventBuffer.filter(e => e.category === category);
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
    for (const handlers of this.categorySubscribers.values()) {
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

  /**
   * Get category subscriber count (for testing/debugging)
   */
  getCategorySubscriberCount(category: string): number {
    return this.categorySubscribers.get(category)?.size ?? 0;
  }

  private bufferEvent(event: Event): void {
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }
}
