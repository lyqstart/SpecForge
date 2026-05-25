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
 * Observability hook for event logging
 */
interface ObservabilityHook {
    onPublish(event: Event): void;
    onSubscribe(topic: string, handlerId: string): void;
    onUnsubscribe(topic: string, handlerId: string): void;
}
export declare class EventBus {
    private subscriptions;
    private categorySubscribers;
    private eventBuffer;
    private maxBufferSize;
    private _isRunning;
    private topicMatcher;
    private observabilityHooks;
    private persistenceHook?;
    constructor(maxBufferSize?: number);
    start(): void;
    stop(): void;
    /**
     * Check if bus is running
     */
    isRunning(): boolean;
    /**
     * Set a persistence hook that is called before fan-out on every publish.
     * The hook should persist the event (e.g., write to events.jsonl with fsync).
     * Set to undefined to remove the hook.
     */
    setPersistenceHook(hook: ((event: Event) => Promise<void>) | undefined): void;
    /**
     * Publish an event to all matching subscribers
     * All cross-layer communication must go through this method (Property 2)
     */
    publish(event: Event): Promise<void>;
    /**
     * Subscribe to events matching a topic pattern (legacy API)
     * @param topic Topic pattern (e.g., "session.*", "project.*", "*")
     * @param handler Event handler function
     * @returns Subscription object for unsubscribe
     */
    subscribe(topic: string, handler: (event: Event) => void): Subscription;
    /**
     * Subscribe to events by category.
     * @param category Event category (e.g., 'workflow', 'gate') or '*' for all categories
     * @param handler Event handler function
     */
    subscribeByCategory(category: string, handler: (event: Event) => void): void;
    /**
     * Unsubscribe from events (legacy API)
     */
    unsubscribe(subscription: Subscription): void;
    /**
     * Unsubscribe a category-based handler.
     * @param category Event category or '*' for wildcard
     * @param handler The handler function to remove
     */
    unsubscribeByCategory(category: string, handler: (event: Event) => void): void;
    /**
     * Get buffered events, optionally filtered by category.
     * @param category Optional category filter
     * @returns Array of buffered events (copy)
     */
    getBufferedEvents(category?: string): Event[];
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
    /**
     * Get category subscriber count (for testing/debugging)
     */
    getCategorySubscriberCount(category: string): number;
    private bufferEvent;
    private generateId;
}
export {};
//# sourceMappingURL=EventBus.d.ts.map