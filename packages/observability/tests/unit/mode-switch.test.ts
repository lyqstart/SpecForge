/**
 * Unit tests for Three-Tier Mode Filtering
 * 
 * Tests the mode switching functionality:
 * - Minimal mode: only decision events
 * - Standard mode: all events, no large payloads
 * - Deep mode: all events with full payloads
 * 
 * Validates: Requirement 1.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModeSwitch } from '../../src/mode-switch';

describe('ModeSwitch', () => {
  let modeSwitch: ModeSwitch;

  beforeEach(() => {
    modeSwitch = new ModeSwitch();
  });

  describe('Default Mode', () => {
    it('should have standard mode by default', () => {
      expect(modeSwitch.getMode()).toBe('standard');
    });
  });

  describe('Runtime Mode Switching', () => {
    it('should switch to minimal mode', () => {
      modeSwitch.setMode('minimal');
      expect(modeSwitch.getMode()).toBe('minimal');
    });

    it('should switch to standard mode', () => {
      modeSwitch.setMode('standard');
      expect(modeSwitch.getMode()).toBe('standard');
    });

    it('should switch to deep mode', () => {
      modeSwitch.setMode('deep');
      expect(modeSwitch.getMode()).toBe('deep');
    });

    it('should allow multiple mode switches at runtime', () => {
      modeSwitch.setMode('minimal');
      expect(modeSwitch.getMode()).toBe('minimal');
      
      modeSwitch.setMode('deep');
      expect(modeSwitch.getMode()).toBe('deep');
      
      modeSwitch.setMode('standard');
      expect(modeSwitch.getMode()).toBe('standard');
    });
  });

  describe('Minimal Mode Filtering', () => {
    beforeEach(() => {
      modeSwitch.setMode('minimal');
    });

    it('should record gate.passed events', () => {
      const event = createTestEvent('gate', 'gate.passed');
      expect(modeSwitch.shouldRecordEvent(event)).toBe(true);
    });

    it('should record gate.failed events', () => {
      const event = createTestEvent('gate', 'gate.failed');
      expect(modeSwitch.shouldRecordEvent(event)).toBe(true);
    });

    it('should record permission.evaluated events', () => {
      const event = createTestEvent('permission', 'permission.evaluated');
      expect(modeSwitch.shouldRecordEvent(event)).toBe(true);
    });

    it('should record workflow.started events', () => {
      const event = createTestEvent('workflow', 'workflow.started');
      expect(modeSwitch.shouldRecordEvent(event)).toBe(true);
    });

    it('should record workflow.completed events', () => {
      const event = createTestEvent('workflow', 'workflow.completed');
      expect(modeSwitch.shouldRecordEvent(event)).toBe(true);
    });

    it('should record workflow.transition events', () => {
      const event = createTestEvent('workflow', 'workflow.transition');
      expect(modeSwitch.shouldRecordEvent(event)).toBe(true);
    });

    it('should not record tool invocation events', () => {
      const event = createTestEvent('tool', 'tool.invoked');
      expect(modeSwitch.shouldRecordEvent(event)).toBe(false);
    });

    it('should not record session events', () => {
      const event = createTestEvent('session', 'session.created');
      expect(modeSwitch.shouldRecordEvent(event)).toBe(false);
    });

    it('should not record system events', () => {
      const event = createTestEvent('system', 'system.heartbeat');
      expect(modeSwitch.shouldRecordEvent(event)).toBe(false);
    });

    it('should not include payloads in minimal mode', () => {
      const event = createTestEvent('gate', 'gate.passed');
      expect(modeSwitch.shouldIncludePayload(event)).toBe(false);
    });
  });

  describe('Standard Mode Filtering', () => {
    beforeEach(() => {
      modeSwitch.setMode('standard');
    });

    it('should record all events in standard mode', () => {
      const events = [
        createTestEvent('gate', 'gate.passed'),
        createTestEvent('tool', 'tool.invoked'),
        createTestEvent('session', 'session.created'),
        createTestEvent('system', 'system.heartbeat'),
        createTestEvent('workflow', 'workflow.started'),
        createTestEvent('permission', 'permission.evaluated'),
        createTestEvent('modality', 'modality.adapted'),
        createTestEvent('heal', 'heal.diagnosed'),
        createTestEvent('migration', 'migration.started'),
      ];

      for (const event of events) {
        expect(modeSwitch.shouldRecordEvent(event)).toBe(true);
      }
    });

    it('should exclude large payloads in standard mode', () => {
      const event = createTestEvent('tool', 'tool.invoked', { 
        largeData: 'x'.repeat(65 * 1024) // > 64KB
      });
      expect(modeSwitch.shouldIncludePayload(event)).toBe(false);
    });

    it('should include small payloads in standard mode', () => {
      const event = createTestEvent('tool', 'tool.invoked', { 
        smallData: 'hello world'
      });
      expect(modeSwitch.shouldIncludePayload(event)).toBe(true);
    });

    it('should handle null payloads', () => {
      const event = createTestEvent('tool', 'tool.invoked');
      event.payload = null;
      expect(modeSwitch.shouldIncludePayload(event)).toBe(true);
    });

    it('should handle undefined payloads', () => {
      const event = createTestEvent('tool', 'tool.invoked');
      expect(modeSwitch.shouldIncludePayload(event)).toBe(true);
    });
  });

  describe('Deep Mode Filtering', () => {
    beforeEach(() => {
      modeSwitch.setMode('deep');
    });

    it('should record all events in deep mode', () => {
      const events = [
        createTestEvent('gate', 'gate.passed'),
        createTestEvent('tool', 'tool.invoked'),
        createTestEvent('session', 'session.created'),
        createTestEvent('system', 'system.heartbeat'),
      ];

      for (const event of events) {
        expect(modeSwitch.shouldRecordEvent(event)).toBe(true);
      }
    });

    it('should include all payloads in deep mode', () => {
      const event = createTestEvent('tool', 'tool.invoked', { 
        largeData: 'x'.repeat(100 * 1024) // 100KB
      });
      expect(modeSwitch.shouldIncludePayload(event)).toBe(true);
    });

    it('should include large payloads (>64KB) in deep mode', () => {
      const event = createTestEvent('tool', 'tool.invoked', { 
        data: 'a'.repeat(128 * 1024) // 128KB
      });
      expect(modeSwitch.shouldIncludePayload(event)).toBe(true);
    });
  });

  describe('Payload Size Boundary', () => {
    beforeEach(() => {
      modeSwitch.setMode('standard');
    });

    it('should handle large payload (>64KB)', () => {
      // JSON.stringify adds overhead: {"data":"..."}
      // Key (4) + colon (1) + quotes (2) + braces (2) = 9 bytes overhead
      // For a payload to be > 64KB after JSON.stringify, we need > 65527 bytes of actual data
      const event = createTestEvent('tool', 'tool.invoked', { 
        data: 'x'.repeat(70 * 1024) // 70KB of data
      });
      expect(modeSwitch.shouldIncludePayload(event)).toBe(false);
    });

    it('should handle small payload (<64KB)', () => {
      const event = createTestEvent('tool', 'tool.invoked', { 
        data: 'x'.repeat(10 * 1024) // 10KB - well under threshold
      });
      expect(modeSwitch.shouldIncludePayload(event)).toBe(true);
    });

    it('should handle empty payload', () => {
      const event = createTestEvent('tool', 'tool.invoked', {});
      expect(modeSwitch.shouldIncludePayload(event)).toBe(true);
    });

    it('should handle array payloads', () => {
      // Array with many items
      const arr: string[] = [];
      for (let i = 0; i < 1000; i++) {
        arr.push('item' + i);
      }
      const event = createTestEvent('tool', 'tool.invoked', { items: arr });
      expect(modeSwitch.shouldIncludePayload(event)).toBe(true);
    });
  });

  describe('Mode Behavior Consistency', () => {
    it('should maintain consistent behavior across multiple checks', () => {
      modeSwitch.setMode('minimal');
      
      const event = createTestEvent('gate', 'gate.passed');
      
      // Run multiple times to ensure consistency
      expect(modeSwitch.shouldRecordEvent(event)).toBe(true);
      expect(modeSwitch.shouldRecordEvent(event)).toBe(true);
      expect(modeSwitch.shouldRecordEvent(event)).toBe(true);
    });

    it('should apply payload rules based on mode at check time', () => {
      // In minimal mode, payloads are never included
      modeSwitch.setMode('minimal');
      let event = createTestEvent('tool', 'tool.invoked', { data: 'test' });
      expect(modeSwitch.shouldIncludePayload(event)).toBe(false);

      // Switch to standard and check again
      modeSwitch.setMode('standard');
      event = createTestEvent('tool', 'tool.invoked', { data: 'test' });
      expect(modeSwitch.shouldIncludePayload(event)).toBe(true);

      // Switch to deep and check again
      modeSwitch.setMode('deep');
      event = createTestEvent('tool', 'tool.invoked', { data: 'test' });
      expect(modeSwitch.shouldIncludePayload(event)).toBe(true);
    });
  });
});

/**
 * Helper function to create test events
 */
function createTestEvent(
  category: 'workflow' | 'gate' | 'permission' | 'session' | 'tool' | 'heal' | 'modality' | 'migration' | 'system',
  action: string,
  payload?: unknown
): ReturnType<typeof modeSwitch.shouldRecordEvent> extends boolean 
  ? { category: typeof category; action: string; payload?: unknown } 
  : never {
  return {
    category,
    action,
    payload,
  } as any;
}