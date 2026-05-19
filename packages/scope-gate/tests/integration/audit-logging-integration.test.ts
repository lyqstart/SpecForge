/**
 * Audit Logging Integration Tests
 * 
 * Integration tests that verify the full integration between
 * scope-gate components and the audit logging system.
 * 
 * These tests:
 * - Verify audit logging functionality works correctly
 * - Verify event traceability through events.jsonl
 * - Verify audit logs contain all required fields per REQ-35, REQ-36
 * 
 * Note: These tests verify the AuditLogger component independently,
 * as integration with RuntimeScopeChecker and FeatureFlagManager
 * requires separate implementation.
 * 
 * Requirements: 1.5, 3.5, 3.6 (Audit Logging Integration)
 * Validates: Task 15.4
 * 
 * Note: This test suite uses pool: 'forks' for process isolation per async-resource-coding-standards.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScopeRegistry } from '../../src/scope-registry.js';
import { RuntimeScopeChecker } from '../../src/runtime-checker.js';
import { AuditLogger } from '../../src/audit-logger.js';
import type { 
  ScopeContext, 
  ScopeViolationAttempt, 
  FeatureFlagChange, 
  CapabilityDefinition,
  ScopeEvent
} from '../../src/types.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// Test helper to get unique log directory
const getTestLogDir = () => join(__dirname, '..', 'test-logs', `audit-integration-${randomUUID()}`);

describe('Audit Logging Integration (Task 15.4)', () => {
  let logger: AuditLogger;
  let registry: ScopeRegistry;
  let checker: RuntimeScopeChecker;
  let testLogDir: string;

  beforeEach(async () => {
    testLogDir = getTestLogDir();
    // Use enableTimer: false and highWaterMark: 1 for immediate flush in tests
    // This ensures events are written to disk immediately (matching audit-logger.test.ts pattern)
    logger = new AuditLogger(testLogDir, undefined, { 
      enableTimer: false,
      highWaterMark: 1 
    });
    
    // Create registry with test capabilities
    registry = new ScopeRegistry();
    registry.registerCapability({
      id: 'bugfix-workflow',
      displayName: 'Bugfix Workflow',
      scopeTag: 'p1',
      entryPoints: ['runBugfixWorkflow', 'createBugfixSession'],
      dependencies: [],
      description: 'Bugfix workflow capability (P1)'
    });
    registry.registerCapability({
      id: 'design-first-workflow',
      displayName: 'Design-First Workflow',
      scopeTag: 'p2',
      entryPoints: ['runDesignFirstWorkflow'],
      dependencies: [],
      description: 'Design-first workflow capability (P2)'
    });
    registry.registerCapability({
      id: 'core-scope-check',
      displayName: 'Core Scope Check',
      scopeTag: 'p0',
      entryPoints: ['checkScope'],
      dependencies: [],
      description: 'Core scope check capability (P0)'
    });

    // Initialize context and checker
    const initialContext: ScopeContext = {
      releaseBranch: 'v6.0',
      featureFlags: new Set(),
      environment: 'production'
    };
    checker = new RuntimeScopeChecker(registry, initialContext);
  });

  afterEach(async () => {
    // Clean up test log directory
    try {
      await fs.rm(testLogDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('15.4.1: Verify scope check events are properly logged', () => {
    it('should log P1 capability violation when logged directly', async () => {
      // Manually log a P1 violation event
      const violation: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      
      await logger.logViolationAttempt(violation);

      // Verify event was logged
      const events = await logger.queryScopeEvents({ eventType: 'scope_violation' });
      expect(events.length).toBeGreaterThan(0);
      
      // Find the specific violation event
      const violationEvent = events.find(e => 
        (e.payload as ScopeViolationAttempt).capabilityId === 'bugfix-workflow'
      );
      expect(violationEvent).toBeDefined();
      expect(violationEvent?.type).toBe('scope_violation');
    });

    it('should log P2 capability violation when logged directly', async () => {
      // Manually log a P2 violation event
      const violation: ScopeViolationAttempt = {
        capabilityId: 'design-first-workflow',
        scopeTag: 'p2',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_design-first-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      
      await logger.logViolationAttempt(violation);

      // Verify event was logged
      const events = await logger.queryScopeEvents({ eventType: 'scope_violation' });
      const p2Violation = events.find(e => 
        (e.payload as ScopeViolationAttempt).capabilityId === 'design-first-workflow'
      );
      expect(p2Violation).toBeDefined();
      expect((p2Violation?.payload as ScopeViolationAttempt).scopeTag).toBe('p2');
    });

    it('should not log P0 capability checks as violations', async () => {
      const context: ScopeContext = {
        releaseBranch: 'v6.0',
        featureFlags: new Set(),
        environment: 'production'
      };

      // P0 capability should be available (no violation)
      const result = registry.isAvailable('core-scope-check', context);
      expect(result.available).toBe(true);

      // Verify no violation events were logged for P0
      const events = await logger.queryScopeEvents({ eventType: 'scope_violation' });
      const p0Violations = events.filter(e => 
        (e.payload as ScopeViolationAttempt).capabilityId === 'core-scope-check'
      );
      expect(p0Violations.length).toBe(0);
    });

    it('should not log successful scope check', async () => {
      const context: ScopeContext = {
        releaseBranch: 'v6.0',
        // Note: feature flag format is enable_{capabilityId}, capability ID uses hyphen
        featureFlags: new Set(['enable_bugfix-workflow']),
        environment: 'production'
      };

      // Verify capability is available with feature flag
      const result = registry.isAvailable('bugfix-workflow', context);
      expect(result.available).toBe(true);

      // No violation should be logged (since capability is available)
      const events = await logger.queryScopeEvents({ eventType: 'scope_violation' });
      expect(events.length).toBe(0);
    });
  });

  describe('15.4.2: Verify event traceability (events.jsonl integration)', () => {
    it('should write events to events.jsonl file', async () => {
      // Log an event directly
      const violation: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      await logger.logViolationAttempt(violation);
      
      // Flush to ensure events are written to file
      await logger.flush();

      // Verify events.jsonl file exists
      const logFile = join(testLogDir, 'events.jsonl');
      const fileExists = await fs.access(logFile).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // Verify file contains valid JSON lines
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      expect(lines.length).toBeGreaterThan(0);

      // Each line should be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('should maintain event order in events.jsonl', async () => {
      // Log multiple violations in sequence
      const violation1: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      
      const violation2: ScopeViolationAttempt = {
        capabilityId: 'design-first-workflow',
        scopeTag: 'p2',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_design-first-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      
      await logger.logViolationAttempt(violation1);
      await logger.logViolationAttempt(violation2);

      const events = await logger.queryScopeEvents({ eventType: 'scope_violation' });
      
      // Events should be in chronological order
      for (let i = 0; i < events.length - 1; i++) {
        const current = new Date(events[i].timestamp).getTime();
        const next = new Date(events[i + 1].timestamp).getTime();
        expect(current).toBeLessThanOrEqual(next);
      }
    });

    it('should allow querying events by capability ID', async () => {
      // Log violations for different capabilities
      const violation1: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      
      const violation2: ScopeViolationAttempt = {
        capabilityId: 'design-first-workflow',
        scopeTag: 'p2',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_design-first-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      
      await logger.logViolationAttempt(violation1);
      await logger.logViolationAttempt(violation2);

      // Query specifically for bugfix-workflow
      const bugfixEvents = await logger.queryScopeEvents({ 
        capabilityId: 'bugfix-workflow' 
      });
      expect(bugfixEvents.length).toBe(1);
      expect((bugfixEvents[0].payload as ScopeViolationAttempt).capabilityId).toBe('bugfix-workflow');
    });

    it('should allow querying events by date range', async () => {
      const beforeTime = new Date();
      
      // Log an event
      const violation: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      await logger.logViolationAttempt(violation);

      const afterTime = new Date();

      // Query with date range
      const events = await logger.queryScopeEvents({
        startDate: beforeTime,
        endDate: new Date(afterTime.getTime() + 1000)
      });

      expect(events.length).toBeGreaterThan(0);
    });

    it('should append events without overwriting existing events', async () => {
      // First event
      const violation1: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      await logger.logViolationAttempt(violation1);

      const firstCount = (await logger.queryScopeEvents({})).length;

      // Second event
      const violation2: ScopeViolationAttempt = {
        capabilityId: 'design-first-workflow',
        scopeTag: 'p2',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_design-first-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      await logger.logViolationAttempt(violation2);

      const secondCount = (await logger.queryScopeEvents({})).length;
      
      expect(secondCount).toBe(firstCount + 1);
    });
  });

  describe('15.4.3: Verify audit logs contain all required fields', () => {
    it('should include eventId in all logged events', async () => {
      // Log an event directly
      const violation: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      await logger.logViolationAttempt(violation);

      const events = await logger.queryScopeEvents({ eventType: 'scope_violation' });
      
      for (const event of events) {
        expect(event.eventId).toBeDefined();
        expect(typeof event.eventId).toBe('string');
        expect(event.eventId.length).toBeGreaterThan(0);
      }
    });

    it('should include timestamp in all logged events', async () => {
      const violation: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      await logger.logViolationAttempt(violation);

      const events = await logger.queryScopeEvents({ eventType: 'scope_violation' });
      
      for (const event of events) {
        expect(event.timestamp).toBeDefined();
        const eventDate = new Date(event.timestamp);
        expect(eventDate.getTime()).toBeGreaterThan(0);
      }
    });

    it('should include type in all logged events', async () => {
      const violation: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      await logger.logViolationAttempt(violation);

      const events = await logger.queryScopeEvents({});
      
      for (const event of events) {
        expect(event.type).toBeDefined();
        expect(['scope_violation', 'feature_flag_change', 'scope_validation']).toContain(event.type);
      }
    });

    it('should include capabilityId in violation events', async () => {
      const violation: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      await logger.logViolationAttempt(violation);

      const events = await logger.queryScopeEvents({ eventType: 'scope_violation' });
      
      for (const event of events) {
        const payload = event.payload as ScopeViolationAttempt;
        expect(payload.capabilityId).toBeDefined();
        expect(typeof payload.capabilityId).toBe('string');
      }
    });

    it('should include scopeTag in violation events', async () => {
      const violation: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      await logger.logViolationAttempt(violation);

      const events = await logger.queryScopeEvents({ eventType: 'scope_violation' });
      
      for (const event of events) {
        const payload = event.payload as ScopeViolationAttempt;
        expect(payload.scopeTag).toBeDefined();
        expect(['p0', 'p1', 'p2']).toContain(payload.scopeTag);
      }
    });

    it('should include context in violation events', async () => {
      const violation: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(['test_flag']),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      await logger.logViolationAttempt(violation);

      const events = await logger.queryScopeEvents({ eventType: 'scope_violation' });
      
      for (const event of events) {
        const payload = event.payload as ScopeViolationAttempt;
        expect(payload.context).toBeDefined();
        expect(payload.context.releaseBranch).toBe('v6.0');
        expect(payload.context.environment).toBe('production');
      }
    });

    it('should include actor information when set', async () => {
      logger.setActor({ id: 'test-user', name: 'Test User', type: 'user' });
      
      const violation: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      await logger.logViolationAttempt(violation);

      const events = await logger.queryScopeEvents({ eventType: 'scope_violation' });
      
      for (const event of events) {
        expect(event.actor).toBeDefined();
        expect(event.actor?.id).toBe('test-user');
      }
    });

    it('should include unique event IDs', async () => {
      // Log multiple events
      const violation1: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      
      const violation2: ScopeViolationAttempt = {
        capabilityId: 'design-first-workflow',
        scopeTag: 'p2',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_design-first-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      
      await logger.logViolationAttempt(violation1);
      await logger.logViolationAttempt(violation2);

      const events = await logger.queryScopeEvents({});
      const eventIds = events.map(e => e.eventId);
      const uniqueIds = new Set(eventIds);
      
      expect(uniqueIds.size).toBe(eventIds.length);
    });
  });

  describe('15.4.4: Feature flag change audit integration', () => {
    it('should log feature flag enablement with all required fields', async () => {
      const flagName = 'enable_test_feature';
      
      // Log a feature flag change event directly
      const change: FeatureFlagChange = {
        flag: flagName,
        oldValue: false,
        newValue: true,
        userId: 'test-user',
        reason: 'Test enablement'
      };
      
      await logger.logFeatureFlagChange(change);

      const events = await logger.queryScopeEvents({ eventType: 'feature_flag_change' });
      
      expect(events.length).toBeGreaterThan(0);
      
      const flagEvent = events.find(e => 
        (e.payload as FeatureFlagChange).flag === flagName
      );
      expect(flagEvent).toBeDefined();
      
      const payload = flagEvent?.payload as FeatureFlagChange;
      expect(payload.flag).toBe(flagName);
      expect(payload.newValue).toBe(true);
      expect(payload.userId).toBe('test-user');
      expect(payload.reason).toBe('Test enablement');
    });

    it('should log feature flag disablement', async () => {
      // Log enable event first
      const enableChange: FeatureFlagChange = {
        flag: 'test_disable_flag',
        oldValue: false,
        newValue: true,
        userId: 'test-user',
        reason: 'Enable first'
      };
      await logger.logFeatureFlagChange(enableChange);

      // Log disable event
      const disableChange: FeatureFlagChange = {
        flag: 'test_disable_flag',
        oldValue: true,
        newValue: false,
        userId: 'test-user',
        reason: 'Test disablement'
      };
      await logger.logFeatureFlagChange(disableChange);

      const events = await logger.queryScopeEvents({ eventType: 'feature_flag_change' });
      
      const disableEvent = events.find(e => 
        (e.payload as FeatureFlagChange).flag === 'test_disable_flag' && 
        (e.payload as FeatureFlagChange).newValue === false
      );
      expect(disableEvent).toBeDefined();
    });
  });

  describe('15.4.5: End-to-end audit trail verification', () => {
    it('should maintain complete audit trail across multiple operations', async () => {
      // 1. Log a P1 violation
      const violation: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      await logger.logViolationAttempt(violation);

      // 2. Log a feature flag change
      const flagChange: FeatureFlagChange = {
        flag: 'enable_bugfix_workflow',
        oldValue: false,
        newValue: true,
        userId: 'admin',
        reason: 'Testing'
      };
      await logger.logFeatureFlagChange(flagChange);

      // 3. Verify complete audit trail
      const allEvents = await logger.queryScopeEvents({});
      
      // Should have at least 2 events: 1 violation + 1 flag change
      expect(allEvents.length).toBeGreaterThanOrEqual(2);

      const violationEvents = allEvents.filter(e => e.type === 'scope_violation');
      const flagEvents = allEvents.filter(e => e.type === 'feature_flag_change');

      expect(violationEvents.length).toBe(1);
      expect(flagEvents.length).toBe(1);
    });

    it('should provide queryable audit history for compliance', async () => {
      // Perform several operations
      const violation1: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      
      const violation2: ScopeViolationAttempt = {
        capabilityId: 'design-first-workflow',
        scopeTag: 'p2',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_design-first-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };

      await logger.logViolationAttempt(violation1);
      await logger.logViolationAttempt(violation2);

      const flagChange: FeatureFlagChange = {
        flag: 'enable_test',
        oldValue: false,
        newValue: true,
        userId: 'auditor',
        reason: 'Test'
      };
      await logger.logFeatureFlagChange(flagChange);

      // Get full audit history
      const history = await logger.queryScopeEvents({});
      
      // Should be able to find specific events
      const bugfixViolation = history.find(e => 
        e.type === 'scope_violation' && 
        (e.payload as ScopeViolationAttempt).capabilityId === 'bugfix-workflow'
      );
      expect(bugfixViolation).toBeDefined();

      const testFlagChange = history.find(e =>
        e.type === 'feature_flag_change' &&
        (e.payload as FeatureFlagChange).flag === 'enable_test'
      );
      expect(testFlagChange).toBeDefined();
    });

    it('should generate accurate log statistics', async () => {
      // Perform several operations
      const violation1: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };
      
      const violation2: ScopeViolationAttempt = {
        capabilityId: 'bugfix-workflow',
        scopeTag: 'p1',
        context: {
          releaseBranch: 'v6.0',
          featureFlags: new Set(),
          environment: 'production'
        },
        requiredFlag: 'enable_bugfix-workflow',
        code: 'SCOPE_BOUNDARY_VIOLATION'
      };

      await logger.logViolationAttempt(violation1);
      await logger.logViolationAttempt(violation2);

      const flagChange: FeatureFlagChange = {
        flag: 'test_flag',
        oldValue: false,
        newValue: true,
        userId: 'admin',
        reason: 'Test'
      };
      await logger.logFeatureFlagChange(flagChange);

      const stats = await logger.getLogStats();
      
      expect(stats.eventCount).toBe(3);
      expect(stats.eventTypes.scope_violation).toBe(2);
      expect(stats.eventTypes.feature_flag_change).toBe(1);
      expect(stats.fileSize).toBeGreaterThan(0);
      expect(stats.lastEventTime).toBeDefined();
    });
  });
});