/**
 * Event Bus module
 * 
 * Implements Property 2: Event Bus Traversal
 * All cross-layer communication must pass through Event Bus
 */

import { generateEventId, MonotonicTimestamp } from '@/types/event-utils';
import type { Event, EventBus as IEventBus, ObservabilityMode } from '@/types';

interface Subscriber {
  pattern: RegExp;
  callback: (event: Event) => void;
}

export class EventBus implements IEventBus {
  private mode: ObservabilityMode = 'standard';
  private subscribers: Subscriber[] = [];
  private timestampGenerator = new MonotonicTimestamp();

  /**
   * Emit an event through the Event Bus
   * Implements Property 2: All cross-layer communication must pass through Event Bus
   */
  async emit(eventData: Omit<Event, 'eventId' | 'ts' | 'monotonicSeq' | 'schema_version'>): Promise<void> {
    // Add schema_version if not provided
    const eventWithSchema = {
      schema_version: '1.0' as const,
      ...eventData
    };

    // Apply mode filtering
    if (!this.shouldRecordEvent(eventWithSchema, this.mode)) {
      return;
    }

    // Generate event with required fields
    const event = this.createEvent(eventWithSchema);
    
    // Notify subscribers
    this.notifySubscribers(event);
    
    // TODO: Integrate with Event Logger for persistence
    // This will be implemented in Phase 2
  }

  /**
   * Subscribe to events matching a pattern
   * Pattern format: "category.action" with wildcards (*)
   * Example: "workflow.*", "*.started", "permission.evaluated"
   */
  subscribe(pattern: string): AsyncIterable<Event> {
    const patternRegex = this.patternToRegex(pattern);
    const events: Event[] = [];
    let resolveNext: ((value: IteratorResult<Event>) => void) | null = null;
    let done = false;

    const subscriber: Subscriber = {
      pattern: patternRegex,
      callback: (event: Event) => {
        events.push(event);
        if (resolveNext) {
          resolveNext({ value: event, done: false });
          resolveNext = null;
        }
      }
    };

    this.subscribers.push(subscriber);

    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<Event>> => {
          if (events.length > 0) {
            return { value: events.shift()!, done: false };
          }
          
          if (done) {
            return { value: undefined, done: true };
          }

          return new Promise<IteratorResult<Event>>((resolve) => {
            resolveNext = resolve;
          });
        },
        return: (): Promise<IteratorResult<Event>> => {
          done = true;
          const index = this.subscribers.indexOf(subscriber);
          if (index !== -1) {
            this.subscribers.splice(index, 1);
          }
          return Promise.resolve({ value: undefined, done: true });
        }
      })
    };
  }

  getMode(): ObservabilityMode {
    return this.mode;
  }

  setMode(mode: ObservabilityMode): void {
    this.mode = mode;
  }

  /**
   * Create a complete event with generated fields
   */
  private createEvent(eventData: Omit<Event, 'eventId' | 'ts' | 'monotonicSeq'>): Event {
    const { timestamp, sequence } = this.timestampGenerator.getTimestamp();

    return {
      ...eventData,
      schema_version: '1.0',
      eventId: generateEventId(),
      ts: timestamp,
      monotonicSeq: sequence,
    };
  }

  /**
   * Check if an event should be recorded based on the current mode
   */
  private shouldRecordEvent(
    eventData: Omit<Event, 'eventId' | 'ts' | 'monotonicSeq'>,
    mode: ObservabilityMode
  ): boolean {
    // Always record in deep mode
    if (mode === 'deep') {
      return true;
    }

    // In standard mode, record all events (but payloads may be filtered later)
    if (mode === 'standard') {
      return true;
    }

    // In minimal mode, only record decision events
    if (mode === 'minimal') {
      return this.isDecisionEvent(eventData);
    }

    return false;
  }

  /**
   * Check if an event is a decision event (for minimal mode)
   */
  private isDecisionEvent(eventData: Omit<Event, 'eventId' | 'ts' | 'monotonicSeq'>): boolean {
    const { category, action } = eventData;
    
    // Gate decisions
    if (category === 'gate' && (action.includes('.passed') || action.includes('.failed'))) {
      return true;
    }
    
    // Permission decisions
    if (category === 'permission' && action === 'permission.evaluated') {
      return true;
    }
    
    // Workflow transitions
    if (category === 'workflow' && (
      action.includes('.started') || 
      action.includes('.completed') || 
      action.includes('.failed') ||
      action.includes('.transition')
    )) {
      return true;
    }
    
    return false;
  }

  /**
   * Convert pattern string to regex
   */
  private patternToRegex(pattern: string): RegExp {
    const escapedPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    
    return new RegExp(`^${escapedPattern}$`);
  }

  /**
   * Notify all subscribers matching the event
   */
  private notifySubscribers(event: Event): void {
    const eventKey = `${event.category}.${event.action}`;
    
    for (const subscriber of this.subscribers) {
      if (subscriber.pattern.test(eventKey)) {
        subscriber.callback(event);
      }
    }
  }

  /**
   * Get current subscriber count (for testing)
   * @internal
   */
  _getSubscriberCount(): number {
    return this.subscribers.length;
  }
}