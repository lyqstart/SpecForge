/**
 * EventTranslator Unit Tests
 *
 * Tests for the EventTranslator class which maps OpenCode event schemas
 * to Daemon event schemas.
 *
 * Requirements: 3.1, 3.4
 */

import { describe, it, expect } from 'vitest';
import { EventTranslator } from '../src/translators/EventTranslator';
import type { OpenCodeEvent, KernelEvent } from '../src/types';

describe('EventTranslator', () => {
  const translator = new EventTranslator();

  // ============================================================
  // Valid Event Translation Tests
  // ============================================================

  describe('translate - valid events', () => {
    it('should translate a minimal valid OpenCode event', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.start',
        data: {},
        sid: 'session-123',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('session.started');
        expect(result.data.sessionId).toBe('session-123');
        expect(result.data.payload).toEqual({});
      }
    });

    it('should translate session.start to session.started', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.start',
        data: { agentRole: 'developer' },
        sid: 'session-456',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('session.started');
        expect(result.data.payload).toEqual({ agentRole: 'developer' });
      }
    });

    it('should translate session.end to session.ended', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.end',
        data: { reason: 'completed' },
        sid: 'session-789',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('session.ended');
      }
    });

    it('should translate session.error to session.error', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.error',
        data: { error: 'Connection lost' },
        sid: 'session-error',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('session.error');
      }
    });

    it('should translate message.delta to content.delta', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'message.delta',
        data: { content: 'Hello ' },
        sid: 'session-msg',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('content.delta');
      }
    });

    it('should translate message.complete to content.complete', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'message.complete',
        data: { content: 'Full response' },
        sid: 'session-complete',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('content.complete');
      }
    });

    it('should translate tool.call to tool.called', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'tool.call',
        data: { tool: 'sf_state_read', arguments: { key: 'test' } },
        sid: 'session-tool',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('tool.called');
      }
    });

    it('should translate tool.result to tool.result', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'tool.result',
        data: { call_id: 'call-123', result: { success: true } },
        sid: 'session-tool-res',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('tool.result');
      }
    });

    it('should translate tool.error to tool.error', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'tool.error',
        data: { call_id: 'call-456', error: 'Tool not found' },
        sid: 'session-tool-err',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('tool.error');
      }
    });

    it('should translate error to adapter.error', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'error',
        data: { message: 'Something went wrong' },
        sid: 'session-err',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('adapter.error');
      }
    });

    it('should translate version.mismatch to adapter.version_mismatch', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'version.mismatch',
        data: { expected: '1.14', actual: '1.15' },
        sid: 'session-ver',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('adapter.version_mismatch');
      }
    });

    it('should preserve timestamp correctly', () => {
      const timestamp = Date.now();
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.start',
        data: {},
        sid: 'session-ts',
        ts: timestamp,
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp.getTime()).toBe(timestamp);
      }
    });

    it('should preserve complex payload data', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'message.delta',
        data: {
          content: 'Test content',
          delta: ['Hello', ' ', 'World'],
          metadata: { tokenCount: 10, model: 'claude-3' },
        },
        sid: 'session-complex',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.payload).toEqual({
          content: 'Test content',
          delta: ['Hello', ' ', 'World'],
          metadata: { tokenCount: 10, model: 'claude-3' },
        });
      }
    });
  });

  // ============================================================
  // Missing Required Fields Tests
  // ============================================================

  describe('translate - missing required fields', () => {
    it('should return unsupported when event_type is missing', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: '',
        data: {},
        sid: 'session-123',
        ts: Date.now(),
      } as OpenCodeEvent;

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('event_type');
    });

    it('should return unsupported when sid is missing', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.start',
        data: {},
        sid: '',
        ts: Date.now(),
      } as OpenCodeEvent;

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('sid');
    });

    it('should return unsupported when both event_type and sid are missing', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: '',
        data: {},
        sid: '',
        ts: Date.now(),
      } as OpenCodeEvent;

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
    });

    it('should return unsupported when event_type is undefined', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: undefined as unknown as string,
        data: {},
        sid: 'session-123',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
    });

    it('should return unsupported when sid is undefined', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.start',
        data: {},
        sid: undefined as unknown as string,
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
    });
  });

  // ============================================================
  // Unsupported Event Types Tests
  // ============================================================

  describe('translate - unsupported event types', () => {
    it('should prefix unknown event types with opencode.', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'custom.event',
        data: { custom: 'data' },
        sid: 'session-custom',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('opencode.custom.event');
      }
    });

    it('should handle unknown event type with special characters', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'custom/special@event#name!',
        data: {},
        sid: 'session-special',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('opencode.custom/special@event#name!');
      }
    });

    it('should handle unknown event type with numbers', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'event2024.v1',
        data: {},
        sid: 'session-num',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('opencode.event2024.v1');
      }
    });

    it('should handle unknown event type with version suffix', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'agent.thinking.v2',
        data: {},
        sid: 'session-ver2',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('opencode.agent.thinking.v2');
      }
    });
  });

  // ============================================================
  // isEventTypeSupported Tests
  // ============================================================

  describe('isEventTypeSupported', () => {
    it('should return true for supported event types', () => {
      expect(translator.isEventTypeSupported('session.start')).toBe(true);
      expect(translator.isEventTypeSupported('session.end')).toBe(true);
      expect(translator.isEventTypeSupported('session.error')).toBe(true);
      expect(translator.isEventTypeSupported('message.delta')).toBe(true);
      expect(translator.isEventTypeSupported('message.complete')).toBe(true);
      expect(translator.isEventTypeSupported('tool.call')).toBe(true);
      expect(translator.isEventTypeSupported('tool.result')).toBe(true);
      expect(translator.isEventTypeSupported('tool.error')).toBe(true);
      expect(translator.isEventTypeSupported('error')).toBe(true);
      expect(translator.isEventTypeSupported('version.mismatch')).toBe(true);
    });

    it('should return false for unsupported event types', () => {
      expect(translator.isEventTypeSupported('unknown.event')).toBe(false);
      expect(translator.isEventTypeSupported('custom.event')).toBe(false);
      expect(translator.isEventTypeSupported('agent.thinking')).toBe(false);
      expect(translator.isEventTypeSupported('')).toBe(false);
    });

    it('should return false for null/undefined input', () => {
      expect(translator.isEventTypeSupported(null as unknown as string)).toBe(false);
      expect(translator.isEventTypeSupported(undefined as unknown as string)).toBe(false);
    });
  });

  // ============================================================
  // mapEventType Tests
  // ============================================================

  describe('mapEventType', () => {
    it('should map supported event types correctly', () => {
      expect(translator.mapEventType('session.start')).toBe('session.started');
      expect(translator.mapEventType('session.end')).toBe('session.ended');
      expect(translator.mapEventType('session.error')).toBe('session.error');
      expect(translator.mapEventType('message.delta')).toBe('content.delta');
      expect(translator.mapEventType('message.complete')).toBe('content.complete');
      expect(translator.mapEventType('tool.call')).toBe('tool.called');
      expect(translator.mapEventType('tool.result')).toBe('tool.result');
      expect(translator.mapEventType('tool.error')).toBe('tool.error');
      expect(translator.mapEventType('error')).toBe('adapter.error');
      expect(translator.mapEventType('version.mismatch')).toBe('adapter.version_mismatch');
    });

    it('should prefix unknown event types with opencode.', () => {
      expect(translator.mapEventType('custom.event')).toBe('opencode.custom.event');
      expect(translator.mapEventType('agent.thinking')).toBe('opencode.agent.thinking');
    });

    it('should handle empty string input', () => {
      expect(translator.mapEventType('')).toBe('opencode.');
    });
  });

  // ============================================================
  // Edge Cases Tests
  // ============================================================

  describe('translate - edge cases', () => {
    it('should handle null data payload', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.start',
        data: null,
        sid: 'session-null-data',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.payload).toBeNull();
      }
    });

    it('should handle undefined data payload', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.start',
        data: undefined,
        sid: 'session-undefined-data',
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.payload).toBeUndefined();
      }
    });

    it('should handle very long session ID', () => {
      const longSid = 'a'.repeat(1000);
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.start',
        data: {},
        sid: longSid,
        ts: Date.now(),
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessionId).toBe(longSid);
      }
    });

    it('should handle zero timestamp', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.start',
        data: {},
        sid: 'session-zero',
        ts: 0,
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp.getTime()).toBe(0);
      }
    });

    it('should handle negative timestamp', () => {
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.start',
        data: {},
        sid: 'session-neg',
        ts: -1000,
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp.getTime()).toBe(-1000);
      }
    });

    it('should handle very large timestamp', () => {
      // Use a large but valid timestamp that JavaScript Date can handle
      const largeTimestamp = 253402300799999; // Year 9999 in ms
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.start',
        data: {},
        sid: 'session-large',
        ts: largeTimestamp,
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp.getTime()).toBe(largeTimestamp);
      }
    });

    it('should handle large Unix timestamp beyond 2038', () => {
      // Test timestamps that work beyond 32-bit Unix time limits
      const futureTimestamp = 2000000000000; // Year 2033
      const ocEvent: OpenCodeEvent = {
        event_type: 'session.start',
        data: {},
        sid: 'session-future',
        ts: futureTimestamp,
      };

      const result = translator.translate(ocEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp.getTime()).toBe(futureTimestamp);
      }
    });
  });

  // ============================================================
  // Round-trip Translation Tests
  // ============================================================

  describe('round-trip translation', () => {
    it('should preserve all fields through translation', () => {
      const original: OpenCodeEvent = {
        event_type: 'tool.call',
        data: { tool: 'sf_state_read', arguments: { key: 'test', format: 'json' } },
        sid: 'roundtrip-session',
        ts: 1234567890,
      };

      const result = translator.translate(original);

      expect(result.success).toBe(true);
      if (result.success) {
        const translated = result.data;
        expect(translated.type).toBe('tool.called');
        expect(translated.sessionId).toBe(original.sid);
        expect(translated.payload).toEqual(original.data);
        expect(translated.timestamp.getTime()).toBe(original.ts);
      }
    });

    it('should preserve complex nested data structures', () => {
      const original: OpenCodeEvent = {
        event_type: 'message.delta',
        data: {
          content: {
            text: 'Hello',
            parts: [
              { type: 'text', value: 'Hello' },
              { type: 'tool_use', value: { id: 'tool1', name: 'test' } },
            ],
          },
          metadata: {
            tokens: 100,
            models: ['claude-3', 'gpt-4'],
            nested: { deep: { value: 42 } },
          },
        },
        sid: 'nested-session',
        ts: Date.now(),
      };

      const result = translator.translate(original);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.payload).toEqual(original.data);
      }
    });
  });

  // ============================================================
  // Multiple Events Test
  // ============================================================

  describe('translate - multiple events', () => {
    it('should handle multiple valid events correctly', () => {
      const events: OpenCodeEvent[] = [
        { event_type: 'session.start', data: {}, sid: 's1', ts: 1 },
        { event_type: 'session.end', data: {}, sid: 's2', ts: 2 },
        { event_type: 'message.delta', data: {}, sid: 's3', ts: 3 },
      ];

      const results = events.map((event) => translator.translate(event));

      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should handle mix of valid and invalid events', () => {
      const events: Array<OpenCodeEvent | null> = [
        { event_type: 'session.start', data: {}, sid: 's1', ts: 1 },
        { event_type: '', data: {}, sid: 's2', ts: 2 } as OpenCodeEvent, // invalid event_type
        { event_type: 'session.end', data: {}, sid: 's3', ts: 3 },
        null, // edge case
      ];

      const results = events.map((event) => {
        if (!event) {
          return { success: false, unsupported: true, reason: 'Null event' };
        }
        return translator.translate(event);
      });

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
      expect(results[3].success).toBe(false);
    });
  });

  // ============================================================
  // All Event Type Mappings Test
  // ============================================================

  describe('all event type mappings', () => {
    it('should correctly map all known event types', () => {
      const eventMappings: Array<{ input: string; expected: string }> = [
        { input: 'session.start', expected: 'session.started' },
        { input: 'session.end', expected: 'session.ended' },
        { input: 'session.error', expected: 'session.error' },
        { input: 'message.delta', expected: 'content.delta' },
        { input: 'message.complete', expected: 'content.complete' },
        { input: 'tool.call', expected: 'tool.called' },
        { input: 'tool.result', expected: 'tool.result' },
        { input: 'tool.error', expected: 'tool.error' },
        { input: 'error', expected: 'adapter.error' },
        { input: 'version.mismatch', expected: 'adapter.version_mismatch' },
      ];

      for (const { input, expected } of eventMappings) {
        expect(translator.mapEventType(input)).toBe(expected);
        expect(translator.isEventTypeSupported(input)).toBe(true);
      }
    });
  });
});