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
 * Observability hook for event logging
 */
interface ObservabilityHook {
    onPublish(event: Event): void;
    onSubscribe(topic: string, handlerId: string): void;
    onUnsubscribe(topic: string, handlerId: string): void;
}
export declare class EventBus {
    private subscriptions;
    private _isRunning;
    private topicMatcher;
    private observabilityHooks;
    start(): void;
    stop(): void;
    /**
     * Check if bus is running
     */
    isRunning(): boolean;
    /**
     * Publish an event to all matching subscribers
     * All cross-layer communication must go through this method (Property 2)
     */
    publish(event: Event): void;
    /**
     * Subscribe to events matching a topic pattern
     * @param topic Topic pattern (e.g., "session.*", "project.*", "*")
     * @param handler Event handler function
     * @returns Subscription object for unsubscribe
     */
    subscribe(topic: string, handler: (event: Event) => void): Subscription;
    /**
     * Unsubscribe from events
     */
    unsubscribe(subscription: Subscription): void;
    /**
     * Add a custom observability hook
     */
    addObservabilityHook(hook: ObservabilityHook): void;
    /**
     * Remove an observability hook
     */
    removeObservabilityHook(hook: ObservabilityHook): void;
    /**
     * Get total number of active subscriptions across all topics.
     *
     * 规则 X2（副作用必须可检测）：测试中可在 afterEach 断言为 0 验证清理完整性。
     * 见 docs/engineering-lessons/async-resource-lifecycle.md。
     */
    getTotalSubscriptionCount(): number;
    /**
     * Get all active subscriptions (for testing/debugging)
     */
    getSubscriptions(): Map<string, Map<string, (event: Event) => void>>;
    private generateId;
}
export {};
//# sourceMappingURL=EventBus.d.ts.map