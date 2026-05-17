/**
 * Test setup file
 */
import { beforeEach, afterEach, vi } from 'vitest';
import { IEventBus, Event, Subscription } from '../src/types.js';

// Setup fake timers for tests that need them
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Mock EventBus for testing
 * Implements IEventBus interface for use in tests
 */
export class MockEventBus implements IEventBus {
  private running = false;
  private subscriptions: Map<string, Map<string, (event: Event) => void>> = new Map();
  private idCounter = 0;
  private eventCount = 0;

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.subscriptions.clear();
  }

  isRunning(): boolean {
    return this.running;
  }

  publish(event: Event): void {
    if (!this.running) {
      console.warn('[MockEventBus] Cannot publish: bus is stopped');
      return;
    }

    this.eventCount++;

    for (const handlersMap of this.subscriptions.values()) {
      for (const handler of handlersMap.values()) {
        try {
          handler(event);
        } catch (error) {
          console.error('[MockEventBus] Error in handler:', error);
        }
      }
    }
  }

  subscribe(topic: string, handler: (event: Event) => void): Subscription {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Map());
    }

    const id = 'sub-' + (++this.idCounter);
    this.subscriptions.get(topic)!.set(id, handler);

    return { id, topic, handler };
  }

  unsubscribe(subscription: Subscription): void {
    const handlers = this.subscriptions.get(subscription.topic);
    if (handlers) {
      handlers.delete(subscription.id);
    }
  }

  /**
   * Get the total number of events published
   */
  getEventCount(): number {
    return this.eventCount;
  }

  /**
   * Reset event count
   */
  resetEventCount(): void {
    this.eventCount = 0;
  }
}