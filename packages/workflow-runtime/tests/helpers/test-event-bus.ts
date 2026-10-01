import type { Event, IEventBus, Subscription } from '../../src/types.js';

function matchesTopic(topic: string, pattern: string): boolean {
  if (pattern === '*') return true;

  const patternParts = pattern.split('.');
  const topicParts = topic.split('.');
  return patternParts.every((part, index) =>
    part === '*' || part === topicParts[index]
  );
}

/** Minimal in-package test double for the Workflow Runtime event port. */
export class TestEventBus implements IEventBus {
  private running = false;
  private nextId = 0;
  private readonly subscriptions = new Map<string, Subscription>();

  publish(event: Event): void {
    if (!this.running) return;

    for (const subscription of this.subscriptions.values()) {
      if (matchesTopic(event.action, subscription.topic)) {
        subscription.handler(event);
      }
    }
  }

  subscribe(topic: string, handler: (event: Event) => void): Subscription {
    const subscription: Subscription = {
      id: `test-subscription-${++this.nextId}`,
      topic,
      handler,
    };
    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  unsubscribe(subscription: Subscription): void {
    this.subscriptions.delete(subscription.id);
  }

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.subscriptions.clear();
  }

  getTotalSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}
