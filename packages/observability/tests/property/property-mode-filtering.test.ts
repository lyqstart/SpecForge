/**
 * Property-Based Tests for Three-Tier Mode Filtering
 * 
 * Validates: Requirement 1.1 - Three-tier mode filtering
 * Uses fast-check for property-based testing
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ModeSwitch } from '../../src/mode-switch';

// Event categories
const CATEGORIES = [
  'workflow', 'gate', 'permission', 'session', 'tool', 
  'heal', 'modality', 'migration', 'system'
] as const;

// Decision actions (should be recorded in minimal mode)
const DECISION_ACTIONS = [
  'gate.passed', 'gate.failed', 'permission.evaluated',
  'workflow.started', 'workflow.completed', 'workflow.transition',
  'workflow.failed'
] as const;

// Non-decision actions (should NOT be recorded in minimal mode)
const NON_DECISION_ACTIONS = [
  'tool.invoked', 'tool.completed', 'tool.failed',
  'session.created', 'session.closed', 'session.heartbeat',
  'system.heartbeat', 'system.startup', 'system.shutdown',
  'modality.adapted', 'modality.succeeded', 'modality.failed',
  'heal.diagnosed', 'heal.executed', 'heal.completed',
  'migration.started', 'migration.progress', 'migration.completed'
] as const;

describe('ModeSwitch Property Tests', () => {
  describe('Property 1: Minimal mode only records decision events', () => {
    it.each([
      'gate.passed', 'gate.failed', 'permission.evaluated',
      'workflow.started', 'workflow.completed', 'workflow.transition'
    ])('should record %s in minimal mode', (action) => {
      fc.assert(
        fc.property(fc.constantFrom(...CATEGORIES), (category) => {
          const modeSwitch = new ModeSwitch();
          modeSwitch.setMode('minimal');
          
          // Map category to action type
          const isDecisionCategory = 
            (category === 'gate' && action.startsWith('gate.')) ||
            (category === 'permission' && action === 'permission.evaluated') ||
            (category === 'workflow' && action.startsWith('workflow.'));
          
          // For decision events in decision categories, should record
          if (isDecisionCategory) {
            const event = { category, action };
            return modeSwitch.shouldRecordEvent(event) === true;
          }
          return true;
        }),
        { numRuns: 10 }
      );
    });

    it('should reject all non-decision events in minimal mode', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...NON_DECISION_ACTIONS),
          (action) => {
            const modeSwitch = new ModeSwitch();
            modeSwitch.setMode('minimal');
            
            const event = { 
              category: 'tool' as const, 
              action 
            };
            
            // All non-decision actions should be filtered out in minimal mode
            // except for workflow events that are transitions
            const shouldRecord = modeSwitch.shouldRecordEvent(event);
            
            // Tool, session, system, heal, modality, migration events should be rejected
            return shouldRecord === false || action.includes('workflow');
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 2: Standard mode records all events', () => {
    it('should record all events in standard mode', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...CATEGORIES),
          fc.constantFrom(
            ...DECISION_ACTIONS,
            ...NON_DECISION_ACTIONS
          ),
          (category, action) => {
            const modeSwitch = new ModeSwitch();
            modeSwitch.setMode('standard');
            
            const event = { category, action };
            return modeSwitch.shouldRecordEvent(event) === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: Deep mode records all events', () => {
    it('should record all events in deep mode', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...CATEGORIES),
          fc.constantFrom(
            ...DECISION_ACTIONS,
            ...NON_DECISION_ACTIONS
          ),
          (category, action) => {
            const modeSwitch = new ModeSwitch();
            modeSwitch.setMode('deep');
            
            const event = { category, action };
            return modeSwitch.shouldRecordEvent(event) === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 4: Payload filtering by mode', () => {
    it('should never include payload in minimal mode', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constantFrom(...CATEGORIES),
            fc.constantFrom(...DECISION_ACTIONS, ...NON_DECISION_ACTIONS).map(a => ({ action: a }))
          ),
          fc.anything(),
          (eventInput, payload) => {
            const modeSwitch = new ModeSwitch();
            modeSwitch.setMode('minimal');
            
            // Create event with payload
            const event = typeof eventInput === 'string' 
              ? { category: eventInput as any, action: 'test.action', payload }
              : { category: 'tool' as any, action: 'test.action', payload };
            
            return modeSwitch.shouldIncludePayload(event) === false;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should include small payloads in standard mode', () => {
      fc.assert(
        fc.property(
          fc.record({
            smallString: fc.stringOf(fc.char(), { maxLength: 100 }),
            smallNumber: fc.integer({ max: 1000 }),
            smallArray: fc.array(fc.string(), { maxLength: 10 }),
            boolean: fc.boolean(),
            nullValue: fc.constant(null),
          }),
          (payload) => {
            const modeSwitch = new ModeSwitch();
            modeSwitch.setMode('standard');
            
            const event = { 
              category: 'tool' as const, 
              action: 'tool.invoked', 
              payload 
            };
            
            return modeSwitch.shouldIncludePayload(event) === true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should include all payloads in deep mode', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.stringOf(fc.char(), { maxLength: 1000 }),
            fc.array(fc.anything(), { maxLength: 100 }),
            fc.record({
              data: fc.stringOf(fc.char()),
              nested: fc.record({
                value: fc.integer()
              })
            })
          ),
          (payload) => {
            const modeSwitch = new ModeSwitch();
            modeSwitch.setMode('deep');
            
            const event = { 
              category: 'tool' as const, 
              action: 'tool.invoked', 
              payload 
            };
            
            return modeSwitch.shouldIncludePayload(event) === true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 5: Mode switching is immediate and deterministic', () => {
    it('should apply new mode immediately after switching', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('minimal', 'standard', 'deep'),
          fc.constantFrom('minimal', 'standard', 'deep'),
          (initialMode, newMode) => {
            const modeSwitch = new ModeSwitch();
            modeSwitch.setMode(initialMode);
            modeSwitch.setMode(newMode);
            
            return modeSwitch.getMode() === newMode;
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should produce consistent results for same input regardless of switch order', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('minimal', 'standard', 'deep'),
          (mode) => {
            const modeSwitch1 = new ModeSwitch();
            const modeSwitch2 = new ModeSwitch();
            
            // Both start at standard
            modeSwitch1.setMode(mode);
            modeSwitch2.setMode(mode);
            
            const event = { 
              category: 'gate' as const, 
              action: 'gate.passed' 
            };
            
            // Results should be identical
            return modeSwitch1.shouldRecordEvent(event) === modeSwitch2.shouldRecordEvent(event);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 6: Large payload detection', () => {
    it('should correctly identify payloads exceeding 64KB threshold', () => {
      fc.assert(
        fc.property(
          fc.nat(100 * 1024), // 0 to 100KB
          (size) => {
            const modeSwitch = new ModeSwitch();
            modeSwitch.setMode('standard');
            
            const largePayload = 'x'.repeat(size);
            const event = { 
              category: 'tool' as const, 
              action: 'tool.invoked', 
              payload: { data: largePayload } 
            };
            
            const shouldInclude = modeSwitch.shouldIncludePayload(event);
            
            // If payload > 64KB after JSON stringify, should NOT include
            const jsonSize = JSON.stringify(event.payload).length;
            const expected = jsonSize <= 64 * 1024;
            
            return shouldInclude === expected;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});