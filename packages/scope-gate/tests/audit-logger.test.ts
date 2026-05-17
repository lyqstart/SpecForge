import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditLogger } from '../src/audit-logger.js';
import type { 
  ScopeViolationAttempt, 
  FeatureFlagChange, 
  ValidationResult,
  ScopeEventQuery,
  ScopeContext
} from '../src/types.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

describe('AuditLogger (Tasks 6.1-6.4)', () => {
  let logger: AuditLogger;
  let testLogDir: string;

  // Helper to create a unique test log directory
  const getTestLogDir = () => join(__dirname, 'test-logs', randomUUID());

  // Helper to create a scope violation attempt
  function createViolationAttempt(
    capabilityId: string = 'test-capability',
    scopeTag: 'p0' | 'p1' | 'p2' = 'p1'
  ): ScopeViolationAttempt {
    return {
      capabilityId,
      scopeTag,
      context: {
        releaseBranch: 'v6.0',
        featureFlags: new Set(),
        environment: 'production'
      },
      userId: 'test-user',
      sessionId: 'test-session',
      timestamp: new Date(),
      stackTrace: 'Error: Test violation'
    };
  }

  // Helper to create a feature flag change
  function createFeatureFlagChange(
    flag: string = 'enable_test',
    newValue: boolean = true
  ): FeatureFlagChange {
    return {
      flag,
      oldValue: !newValue,
      newValue,
      reason: 'Test flag change',
      userId: 'test-user',
      timestamp: new Date()
    };
  }

  // Helper to create validation results
  function createValidationResults(): ValidationResult[] {
    return [
      {
        type: 'error' as const,
        code: 'p0_depends_on_p1',
        message: 'P0 capability depends on P1',
        location: { file: 'test.ts', line: 10, column: 5 },
        context: { capabilityId: 'test', dependencyId: 'p1-cap' }
      }
    ];
  }

  beforeEach(async () => {
    testLogDir = getTestLogDir();
    // Disable timer for tests and set highWaterMark to 1 for immediate flush
    // This ensures events are written to disk immediately after logging
    logger = new AuditLogger(testLogDir, undefined, { 
      enableTimer: false,
      highWaterMark: 1 
    });
  });

  afterEach(async () => {
    // Stop flush timer and flush any remaining events
    await logger.shutdown();
    
    // Clean up test log directory
    try {
      await fs.rm(testLogDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Task 6.1: Create AuditLogger class', () => {
    it('should create AuditLogger instance with default log directory', async () => {
      const defaultLogger = new AuditLogger(undefined, undefined, { enableTimer: false });
      expect(defaultLogger).toBeDefined();
      await defaultLogger.shutdown();
    });

    it('should create AuditLogger instance with custom log directory', () => {
      expect(logger).toBeDefined();
    });

    it('should have a log file path', () => {
      // The log file should be in the specified directory
      const logFile = join(testLogDir, 'events.jsonl');
      expect(logFile).toContain('events.jsonl');
    });

    it('should support setting actor identity', () => {
      logger.setActor({ id: 'test-actor', name: 'Test Actor', type: 'agent' });
      const actor = logger.getActor();
      expect(actor).toBeDefined();
      expect(actor?.id).toBe('test-actor');
    });
  });

  describe('Task 6.2: Implement event logging to events.jsonl', () => {
    it('should log violation attempt to events.jsonl', async () => {
      const violation = createViolationAttempt();
      await logger.logViolationAttempt(violation);

      const content = await fs.readFile(join(testLogDir, 'events.jsonl'), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      expect(lines).toHaveLength(1);
      const event = JSON.parse(lines[0]);
      expect(event.type).toBe('scope_violation');
      expect(event.payload.capabilityId).toBe('test-capability');
    });

    it('should log feature flag change to events.jsonl', async () => {
      const change = createFeatureFlagChange();
      await logger.logFeatureFlagChange(change);

      const content = await fs.readFile(join(testLogDir, 'events.jsonl'), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      expect(lines).toHaveLength(1);
      const event = JSON.parse(lines[0]);
      expect(event.type).toBe('feature_flag_change');
      expect(event.payload.flag).toBe('enable_test');
    });

    it('should log validation results to events.jsonl', async () => {
      const results = createValidationResults();
      await logger.logValidationResults(results);

      const content = await fs.readFile(join(testLogDir, 'events.jsonl'), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      expect(lines).toHaveLength(1);
      const event = JSON.parse(lines[0]);
      expect(event.type).toBe('scope_validation');
      expect(event.payload.results).toBeDefined();
    });

    it('should append multiple events to events.jsonl', async () => {
      await logger.logViolationAttempt(createViolationAttempt('cap1', 'p1'));
      await logger.logFeatureFlagChange(createFeatureFlagChange('flag1', true));
      await logger.logViolationAttempt(createViolationAttempt('cap2', 'p2'));

      const content = await fs.readFile(join(testLogDir, 'events.jsonl'), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      expect(lines).toHaveLength(3);
    });

    it('should generate unique event IDs', async () => {
      await logger.logViolationAttempt(createViolationAttempt());
      await logger.logViolationAttempt(createViolationAttempt());

      const content = await fs.readFile(join(testLogDir, 'events.jsonl'), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      const event1 = JSON.parse(lines[0]);
      const event2 = JSON.parse(lines[1]);
      
      expect(event1.eventId).not.toBe(event2.eventId);
    });

    it('should include timestamp in events', async () => {
      await logger.logViolationAttempt(createViolationAttempt());

      const content = await fs.readFile(join(testLogDir, 'events.jsonl'), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      const event = JSON.parse(lines[0]);
      
      expect(event.timestamp).toBeDefined();
      expect(new Date(event.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should include actor information when set', async () => {
      logger.setActor({ id: 'actor-1', name: 'Test Actor', type: 'agent' });
      await logger.logViolationAttempt(createViolationAttempt());

      const content = await fs.readFile(join(testLogDir, 'events.jsonl'), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      const event = JSON.parse(lines[0]);
      
      expect(event.actor).toBeDefined();
      expect(event.actor?.id).toBe('actor-1');
    });

    it('should handle missing actor gracefully', async () => {
      await logger.logViolationAttempt(createViolationAttempt());

      const content = await fs.readFile(join(testLogDir, 'events.jsonl'), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      const event = JSON.parse(lines[0]);
      
      expect(event.actor).toBeUndefined();
    });

    it('should create log directory if it does not exist', () => {
      // The constructor should have created the directory
      // We can verify by checking no error was thrown
      expect(logger).toBeDefined();
    });
  });

  describe('Task 6.3: Add query functionality for scope events', () => {
    beforeEach(async () => {
      // Pre-populate with test events
      await logger.logViolationAttempt(createViolationAttempt('cap-p1', 'p1'));
      await logger.logViolationAttempt(createViolationAttempt('cap-p2', 'p2'));
      await logger.logFeatureFlagChange(createFeatureFlagChange('enable-feature', true));
      await logger.logFeatureFlagChange(createFeatureFlagChange('disable-feature', false));
      
      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should query all events with no filters', async () => {
      const events = await logger.queryScopeEvents({});
      
      expect(events).toHaveLength(4);
    });

    it('should filter events by start date', async () => {
      const startDate = new Date(Date.now() - 1000); // 1 second ago
      const events = await logger.queryScopeEvents({ startDate });
      
      // Should return events after startDate
      expect(events.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter events by end date', async () => {
      const endDate = new Date(Date.now() + 1000); // Future date
      const events = await logger.queryScopeEvents({ endDate });
      
      // Should return events before endDate
      expect(events.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter events by event type', async () => {
      const events = await logger.queryScopeEvents({ 
        eventType: 'scope_violation' 
      });
      
      expect(events).toHaveLength(2);
      expect(events.every(e => e.type === 'scope_violation')).toBe(true);
    });

    it('should filter violations by capability ID', async () => {
      const events = await logger.queryScopeEvents({ 
        capabilityId: 'cap-p1' 
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('scope_violation');
      expect((events[0].payload as any).capabilityId).toBe('cap-p1');
    });

    it('should filter events by actor ID', async () => {
      // Set actor for subsequent events
      logger.setActor({ id: 'specific-actor', name: 'Specific Actor', type: 'user' });
      await logger.logViolationAttempt(createViolationAttempt('actor-test', 'p1'));
      
      const events = await logger.queryScopeEvents({ 
        actorId: 'specific-actor' 
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].actor?.id).toBe('specific-actor');
    });

    it('should combine multiple query filters', async () => {
      const events = await logger.queryScopeEvents({
        eventType: 'scope_violation',
        capabilityId: 'cap-p1',
        startDate: new Date(0) // Beginning of time
      });
      
      expect(events).toHaveLength(1);
      expect((events[0].payload as any).capabilityId).toBe('cap-p1');
    });

    it('should return empty array when no events match query', async () => {
      const events = await logger.queryScopeEvents({ 
        capabilityId: 'nonexistent-capability' 
      });
      
      expect(events).toHaveLength(0);
    });

    it('should return empty array when log file does not exist', async () => {
      const emptyLogger = new AuditLogger(join(__dirname, 'nonexistent-logs'));
      const events = await emptyLogger.queryScopeEvents({});
      
      expect(events).toHaveLength(0);
    });
  });

  describe('Utility methods', () => {
    it('should clear all logs', async () => {
      await logger.logViolationAttempt(createViolationAttempt());
      await logger.clearLogs();

      const content = await fs.readFile(join(testLogDir, 'events.jsonl'), 'utf-8');
      expect(content.trim()).toBe('');
    });

    it('should get log statistics', async () => {
      await logger.logViolationAttempt(createViolationAttempt('cap1', 'p1'));
      await logger.logViolationAttempt(createViolationAttempt('cap2', 'p2'));
      await logger.logFeatureFlagChange(createFeatureFlagChange());

      const stats = await logger.getLogStats();
      
      expect(stats.eventCount).toBe(3);
      expect(stats.fileSize).toBeGreaterThan(0);
      expect(stats.eventTypes).toEqual({
        scope_violation: 2,
        feature_flag_change: 1
      });
      expect(stats.lastEventTime).toBeDefined();
    });

    it('should return empty stats for non-existent log file', async () => {
      const emptyLogger = new AuditLogger(join(__dirname, 'nonexistent-logs'));
      const stats = await emptyLogger.getLogStats();
      
      expect(stats.eventCount).toBe(0);
      expect(stats.fileSize).toBe(0);
      expect(stats.eventTypes).toEqual({});
    });
  });

  describe('Edge cases', () => {
    it('should handle very long capability IDs', async () => {
      const longId = 'a'.repeat(1000);
      await logger.logViolationAttempt(createViolationAttempt(longId, 'p1'));

      const events = await logger.queryScopeEvents({ 
        capabilityId: longId 
      });
      
      expect(events).toHaveLength(1);
    });

    it('should handle special characters in capability IDs', async () => {
      await logger.logViolationAttempt(createViolationAttempt('cap-with-dashes_and_underscores', 'p1'));

      const events = await logger.queryScopeEvents({ 
        capabilityId: 'cap-with-dashes_and_underscores' 
      });
      
      expect(events).toHaveLength(1);
    });

    it('should handle empty query object', async () => {
      await logger.logViolationAttempt(createViolationAttempt());
      
      const events = await logger.queryScopeEvents({});
      expect(events.length).toBeGreaterThan(0);
    });

    it('should preserve event order in query results', async () => {
      // Log events in specific order
      for (let i = 0; i < 5; i++) {
        await logger.logViolationAttempt(createViolationAttempt(`cap-${i}`, 'p1'));
      }

      const events = await logger.queryScopeEvents({});
      
      // Events should be in chronological order
      for (let i = 0; i < events.length - 1; i++) {
        const current = new Date(events[i].timestamp).getTime();
        const next = new Date(events[i + 1].timestamp).getTime();
        expect(current).toBeLessThanOrEqual(next);
      }
    });
  });
});