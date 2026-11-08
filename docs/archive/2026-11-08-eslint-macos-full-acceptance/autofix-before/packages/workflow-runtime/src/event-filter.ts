/**
 * Event Filtering Module
 * Implements event filtering mechanism for workflow events
 *
 * Supports filtering by:
 * - Event type (exact match, wildcard patterns)
 * - Event source
 * - Timestamp range
 */

import { Event } from './types.js';

/**
 * Filter criteria for events
 */
export interface FilterCriteria {
  /**
   * Event type pattern (e.g., "workflow.started", "workflow.*", "*")
   * Supports wildcard matching with * (matches any characters)
   */
  type?: string;

  /**
   * Event source (e.g., "daemon", "client", "adapter")
   */
  source?: 'daemon' | 'client' | 'adapter';

  /**
   * Timestamp range (milliseconds since epoch)
   */
  timestampRange?: {
    start?: number;
    end?: number;
  };

  /**
   * Custom predicate function for advanced filtering
   */
  predicate?: (event: Event) => boolean;
}

/**
 * EventFilter
 * Provides filtering capabilities for workflow events
 *
 * 规则 A3（推优于拉）：
 * 过滤是"拉"操作（消费者主动过滤），但提供高效的过滤 API
 * 让消费者能快速筛选感兴趣的事件。
 */
export class EventFilter {
  /**
   * Filter events based on criteria
   *
   * @param events - Array of events to filter
   * @param criteria - Filter criteria
   * @returns Filtered array of events
   *
   * 规则 A4（创建者负责销毁）：
   * 返回的数组是新创建的，调用者负责管理其生命周期。
   */
  static filter(events: Event[], criteria: FilterCriteria): Event[] {
    if (!Array.isArray(events)) {
      throw new Error('Events must be an array');
    }

    if (!criteria || typeof criteria !== 'object') {
      throw new Error('Criteria must be an object');
    }

    return events.filter((event) => this.matches(event, criteria));
  }

  /**
   * Check if an event matches the filter criteria
   *
   * @param event - Event to check
   * @param criteria - Filter criteria
   * @returns true if event matches all criteria
   */
  private static matches(event: Event, criteria: FilterCriteria): boolean {
    // Check type filter
    if (criteria.type !== undefined) {
      if (!this.matchesType(event.action, criteria.type)) {
        return false;
      }
    }

    // Check source filter
    if (criteria.source !== undefined) {
      if (event.metadata?.source !== criteria.source) {
        return false;
      }
    }

    // Check timestamp range filter
    if (criteria.timestampRange !== undefined) {
      if (!this.matchesTimestampRange(event.ts, criteria.timestampRange)) {
        return false;
      }
    }

    // Check custom predicate
    if (criteria.predicate !== undefined) {
      if (!criteria.predicate(event)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if event type matches the pattern
   * Supports wildcard matching with *
   *
   * @param eventType - Event type to check
   * @param pattern - Pattern to match against (e.g., "workflow.*", "workflow.started")
   * @returns true if event type matches pattern
   */
  private static matchesType(eventType: string, pattern: string): boolean {
    if (!eventType || typeof eventType !== 'string') {
      return false;
    }

    if (!pattern || typeof pattern !== 'string') {
      return false;
    }

    // Exact match
    if (pattern === eventType) {
      return true;
    }

    // Wildcard match: convert pattern to regex
    // "workflow.*" -> /^workflow\..*$/
    // "*" -> /^.*$/
    const regexPattern = pattern
      .replace(/\./g, '\\.') // Escape dots
      .replace(/\*/g, '.*'); // Replace * with .*

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(eventType);
  }

  /**
   * Check if timestamp is within the specified range
   *
   * @param timestamp - Timestamp to check (milliseconds since epoch)
   * @param range - Timestamp range with optional start and end
   * @returns true if timestamp is within range
   */
  private static matchesTimestampRange(
    timestamp: number,
    range: { start?: number; end?: number }
  ): boolean {
    if (typeof timestamp !== 'number') {
      return false;
    }

    if (range.start !== undefined && timestamp < range.start) {
      return false;
    }

    if (range.end !== undefined && timestamp > range.end) {
      return false;
    }

    return true;
  }

  /**
   * Filter events by type only
   *
   * @param events - Array of events to filter
   * @param type - Event type pattern
   * @returns Filtered events
   */
  static filterByType(events: Event[], type: string): Event[] {
    return this.filter(events, { type });
  }

  /**
   * Filter events by source only
   *
   * @param events - Array of events to filter
   * @param source - Event source
   * @returns Filtered events
   */
  static filterBySource(
    events: Event[],
    source: 'daemon' | 'client' | 'adapter'
  ): Event[] {
    return this.filter(events, { source });
  }

  /**
   * Filter events by timestamp range only
   *
   * @param events - Array of events to filter
   * @param start - Start timestamp (milliseconds since epoch)
   * @param end - End timestamp (milliseconds since epoch)
   * @returns Filtered events
   */
  static filterByTimestampRange(
    events: Event[],
    start?: number,
    end?: number
  ): Event[] {
    return this.filter(events, {
      timestampRange: {
        ...(start !== undefined && { start }),
        ...(end !== undefined && { end }),
      },
    });
  }

  /**
   * Create a reusable filter function
   *
   * @param criteria - Filter criteria
   * @returns Filter function that can be used with Array.filter()
   */
  static createFilterFn(criteria: FilterCriteria): (event: Event) => boolean {
    return (event: Event) => this.matches(event, criteria);
  }
}

/**
 * Create an EventFilter instance (for consistency with other modules)
 * Note: EventFilter is a static utility class, so this just returns the class
 */
export function createEventFilter(): typeof EventFilter {
  return EventFilter;
}
