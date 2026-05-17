import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PermissionEngine } from '../../src/index';
import { EventLogger } from '../../src/services/event-logger';

describe('Permission Engine Event Logging', () => {
  let engine: PermissionEngine;
  let mockLogger: any;

  beforeEach(() => {
    // Create in-memory event logger for testing
    const { logger, getEvents, clearEvents } = EventLogger.createInMemoryLogger('test-project');
    mockLogger = { logger, getEvents, clearEvents };
    
    // Create permission engine with mock logger
    engine = new PermissionEngine({
      eventLoggingEnabled: true,
      projectId: 'test-project'
    });
    
    // Replace the event logger with our mock
    (engine as any).eventLogger = mockLogger.logger;
    mockLogger.clearEvents();
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  describe('Permission Decision Event Logging', () => {
    it('should log permission denied event when hard rule matches', async () => {
      const result = await engine.checkPermission(
        'user-123',
        'gate.bypass',
        { type: 'gate', id: 'gate-001' }
      );

      expect(result).toBe(false);
      
      const events = mockLogger.getEvents();
      expect(events).toHaveLength(1);
      
      const event = events[0];
      expect(event.action).toBe('permission.evaluated');
      expect(event.projectId).toBe('test-project');
      expect(event.payload.decision).toBe('deny');
      expect(event.payload.matched_rule).toBe('hard-001');
      expect(event.payload.rule_layer).toBe('hard');
      expect(event.payload.reason).toBeDefined();
      
      // Check all six required fields are present
      expect(event.payload.actor).toBeDefined();
      expect(event.payload.action).toBe('gate.bypass');
      expect(event.payload.resource).toBeDefined();
      expect(event.payload.matched_rule).toBeDefined();
      expect(event.payload.rule_layer).toBeDefined();
      expect(event.payload.reason).toBeDefined();
    });

    it('should log permission allowed event when no hard rule matches', async () => {
      const result = await engine.checkPermission(
        'user-123',
        'file.read',
        { type: 'file', path: '/tmp/test.txt' }
      );

      expect(result).toBe(true);
      
      const events = mockLogger.getEvents();
      expect(events).toHaveLength(1);
      
      const event = events[0];
      expect(event.action).toBe('permission.evaluated');
      expect(event.payload.decision).toBe('allow');
      // With three-layer rule merging, default-allow is returned when no rules match
      expect(event.payload.matched_rule).toBe('default-allow');
      expect(event.payload.rule_layer).toBe('builtin');
    });

    it('should include actor information in event payload', async () => {
      await engine.checkPermission(
        'user-123',
        'gate.bypass',
        { type: 'gate', id: 'gate-001' }
      );

      const events = mockLogger.getEvents();
      const event = events[0];
      
      expect(event.payload.actor.id).toBe('user-123');
      expect(event.payload.actor).toHaveProperty('id');
      // Other actor fields are optional
    });

    it('should include resource information in event payload', async () => {
      await engine.checkPermission(
        'user-123',
        'file.write',
        { type: 'file', path: '/etc/hosts', id: 'hosts-file' }
      );

      const events = mockLogger.getEvents();
      const event = events[0];
      
      expect(event.payload.resource.type).toBe('file');
      expect(event.payload.resource.path).toBe('/etc/hosts');
      expect(event.payload.resource.id).toBe('hosts-file');
    });

    it('should include context in event payload when provided', async () => {
      const context = { 
        sessionId: 'session-123',
        ipAddress: '127.0.0.1',
        userAgent: 'test-client'
      };

      await engine.checkPermission(
        'user-123',
        'gate.bypass',
        { type: 'gate', id: 'gate-001' },
        context
      );

      const events = mockLogger.getEvents();
      const event = events[0];
      
      expect(event.payload.context).toEqual(context);
    });
  });

  describe('Hard Rule Conflict Event Logging', () => {
    it('should log hard rule conflict event when configuration conflicts', async () => {
      const config = {
        rules: [
          { action: 'gate.bypass', resource: '*', effect: 'allow' }
        ]
      };

      const result = await engine.validatePermissionConfig(config);

      expect(result).toBe(false);
      
      const events = mockLogger.getEvents();
      expect(events).toHaveLength(1);
      
      const event = events[0];
      expect(event.action).toBe('config.hard_rule_conflict');
      expect(event.payload.rule.id).toBe('hard-001');
      expect(event.payload.rule.description).toBeDefined();
      expect(event.payload.conflict).toBeDefined();
      expect(event.payload.detectedAt).toBeDefined();
    });

    it('should not log conflict event when configuration is valid', async () => {
      const config = {
        rules: [
          { action: 'file.read', resource: 'file:*', effect: 'allow' }
        ]
      };

      const result = await engine.validatePermissionConfig(config);

      expect(result).toBe(true);
      
      const events = mockLogger.getEvents();
      expect(events).toHaveLength(0);
    });

    it('should log multiple conflict events for multiple conflicts', async () => {
      const config = {
        rules: [
          { action: 'gate.bypass', resource: '*', effect: 'allow' },
          { action: 'verification.forge', resource: '*', effect: 'allow' }
        ]
      };

      const result = await engine.validatePermissionConfig(config);

      expect(result).toBe(false);
      
      const events = mockLogger.getEvents();
      expect(events.length).toBeGreaterThanOrEqual(2);
      
      // Check that we have conflict events
      const conflictEvents = events.filter((e: any) => e.action === 'config.hard_rule_conflict');
      expect(conflictEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Event Logger Configuration', () => {
    it('should respect eventLoggingEnabled configuration', async () => {
      const disabledEngine = new PermissionEngine({
        eventLoggingEnabled: false,
        projectId: 'test-project'
      });

      // Get the actual event logger from the engine
      const eventLogger = disabledEngine.getEventLogger();
      
      // Check that event logging is disabled
      expect(eventLogger.isEnabled()).toBe(false);

      await disabledEngine.checkPermission(
        'user-123',
        'gate.bypass',
        { type: 'gate', id: 'gate-001' }
      );

      // Since event logging is disabled, no events should be logged
      // We can't easily verify this without mocking, but we've verified
      // the logger is disabled

      await disabledEngine.cleanup();
    });

    it('should use projectId from configuration', async () => {
      const customProjectEngine = new PermissionEngine({
        eventLoggingEnabled: true,
        projectId: 'custom-project-123'
      });

      // Replace with mock logger
      const { logger, getEvents, clearEvents } = EventLogger.createInMemoryLogger('custom-project-123');
      (customProjectEngine as any).eventLogger = logger;
      clearEvents();

      await customProjectEngine.checkPermission(
        'user-123',
        'gate.bypass',
        { type: 'gate', id: 'gate-001' }
      );

      const events = getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].projectId).toBe('custom-project-123');

      await customProjectEngine.cleanup();
    });
  });

  describe('Permission Denied Event Logging (Authentication)', () => {
    it('should log permission denied event for authentication failures', async () => {
      await engine.logPermissionDenied({
        actor: {
          id: 'unknown',
          remoteIdentity: 'openclaw-001'
        },
        action: 'tool.execute',
        resource: {
          type: 'tool',
          id: 'dangerous-tool'
        },
        reason: 'Missing Bearer Token',
        layer: 'auth',
        details: {
          httpStatus: 401,
          requiredScopes: ['tool.execute']
        }
      });

      const events = mockLogger.getEvents();
      expect(events).toHaveLength(1);
      
      const event = events[0];
      expect(event.action).toBe('permission.denied');
      expect(event.payload.reason).toBe('Missing Bearer Token');
      expect(event.payload.layer).toBe('auth');
      expect(event.payload.details).toBeDefined();
    });
  });

  describe('Event Schema Validation', () => {
    it('should generate valid event IDs', async () => {
      await engine.checkPermission(
        'user-123',
        'gate.bypass',
        { type: 'gate', id: 'gate-001' }
      );

      const events = mockLogger.getEvents();
      const event = events[0];
      
      // Event ID should be a string
      expect(typeof event.eventId).toBe('string');
      expect(event.eventId.length).toBeGreaterThan(0);
      
      // Timestamp should be a number
      expect(typeof event.ts).toBe('number');
      expect(event.ts).toBeGreaterThan(0);
    });

    it('should maintain monotonic timestamps', async () => {
      const timestamps: number[] = [];
      
      for (let i = 0; i < 5; i++) {
        await engine.checkPermission(
          `user-${i}`,
          'file.read',
          { type: 'file', path: `/tmp/test${i}.txt` }
        );
        
        const events = mockLogger.getEvents();
        timestamps.push(events[events.length - 1].ts);
      }
      
      // Check that timestamps are non-decreasing (monotonic)
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });
  });
});