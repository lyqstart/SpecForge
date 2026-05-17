/**
 * Event Translator
 *
 * Maps OpenCode event schemas to Daemon event schemas.
 */

import { OpenCodeEvent, TranslationResult, KernelEvent, IEventTranslator } from '../types';

/**
 * Event translator mapping
 * Maps OpenCode event types to Daemon event types
 */
const EVENT_TYPE_MAP: Record<string, string> = {
  // Session events
  'session.start': 'session.started',
  'session.end': 'session.ended',
  'session.error': 'session.error',

  // Message events
  'message.delta': 'content.delta',
  'message.complete': 'content.complete',

  // Tool events
  'tool.call': 'tool.called',
  'tool.result': 'tool.result',
  'tool.error': 'tool.error',

  // Error events
  error: 'adapter.error',

  // Version events
  'version.mismatch': 'adapter.version_mismatch',
};

/**
 * Event Translator
 *
 * Converts OpenCode events to Daemon-format events.
 * Handles event payload translation and supports different OpenCode event versions.
 */
export class EventTranslator implements IEventTranslator {
  /**
   * Translate OpenCode event to Daemon event
   *
   * @param ocEvent - OpenCode event object
   * @returns Translation result with Daemon event or unsupported indicator
   */
  translate(ocEvent: OpenCodeEvent): TranslationResult<KernelEvent> {
    // Validate required fields
    if (!ocEvent.event_type) {
      return {
        success: false,
        unsupported: true,
        reason: 'Missing required field: event_type',
      };
    }

    if (!ocEvent.sid) {
      return {
        success: false,
        unsupported: true,
        reason: 'Missing required field: sid',
      };
    }

    // Map event type
    const daemonEventType = EVENT_TYPE_MAP[ocEvent.event_type] || `opencode.${ocEvent.event_type}`;

    // Translate to Daemon format
    const daemonEvent: KernelEvent = {
      type: daemonEventType,
      payload: ocEvent.data,
      sessionId: ocEvent.sid,
      timestamp: new Date(ocEvent.ts),
    };

    return { success: true, data: daemonEvent };
  }

  /**
   * Check if an event type is supported
   *
   * @param eventType - OpenCode event type
   * @returns Whether the event type is supported
   */
  isEventTypeSupported(eventType: string): boolean {
    return eventType in EVENT_TYPE_MAP;
  }

  /**
   * Get Daemon event type for an OpenCode event type
   *
   * @param ocEventType - OpenCode event type
   * @returns Daemon event type
   */
  mapEventType(ocEventType: string): string {
    return EVENT_TYPE_MAP[ocEventType] || `opencode.${ocEventType}`;
  }
}
