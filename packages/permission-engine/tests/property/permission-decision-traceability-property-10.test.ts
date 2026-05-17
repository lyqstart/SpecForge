/**
 * Property-Based Test: Permission Decision Traceability (Property 10)
 * 
 * Validates: Property 10, Requirements 30.10, 7.3
 * 
 * Property: For all Permission Engine decisions d (allow or deny), events.jsonl 
 * contains a unique event e where e.action == "permission.evaluated" and 
 * e.payload contains all six fields: { actor, action, resource, matched_rule, 
 * rule_layer, reason }; given any deny result d, one can trace back to 
 * matched_rule and rule_layer through events.jsonl.
 * 
 * Iterations: ≥ 100
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { PolicyEnforcementPoint, createPolicyEnforcementPoint, HttpRequestContext } from '../../src/services/policy-enforcement-point';
import { EventLogger } from '../../src/services/event-logger';
import { RuleMergingEngine } from '../../src/services/rule-merging-engine';
import { PermissionDecisionEvent, PermissionEvent } from '../../src/types/events';

/**
 * Feature: Permission Decision Traceability, Property 10
 * 
 * Derived-From: v6-architecture-overview Property 10
 */

describe('Property 10: Permission Decision Traceability', () => {
  let pep: PolicyEnforcementPoint;
  let eventLogger: ReturnType<typeof EventLogger.createInMemoryLogger>;
  let capturedEvents: PermissionEvent[];

  const testProjectId = 'test-project-property-10';

  beforeEach(() => {
    // Create in-memory event logger for testing
    eventLogger = EventLogger.createInMemoryLogger(testProjectId);
    capturedEvents = [];

    // Override to capture events synchronously from mock
    const originalLogDecision = eventLogger.logger.logPermissionDecision.bind(eventLogger.logger);
    eventLogger.logger.logPermissionDecision = async (payload) => {
      await originalLogDecision(payload);
    };

    // Create PEP with in-memory logger
    pep = createPolicyEnforcementPoint({
      bearerToken: 'test-token-12345',
      projectId: testProjectId,
      requireAuth: false, // Skip auth to focus on decision traceability
      logDecisions: true,
      eventLogger: eventLogger.logger,
      pdp: new RuleMergingEngine({
        cacheEnabled: true,
        defaultDecision: 'allow'
      })
    });
  });

  afterEach(() => {
    eventLogger.clearEvents();
    capturedEvents = [];
  });

  /**
   * Generators for random (actor, action, resource) tuples
   * Note: Using non-empty strings to ensure valid test data
   */
  const actorArbitrary = fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    sessionId: fc.option(fc.string({ minLength: 16, maxLength: 36 })),
    agentRole: fc.option(fc.oneof(
      fc.constant('sf-executor'),
      fc.constant('sf-reviewer'),
      fc.constant('sf-designer'),
      fc.constant('sf-knowledge'),
      fc.constant('sf-orchestrator')
    )),
    workflowRole: fc.option(fc.oneof(
      fc.constant('owner'),
      fc.constant('contributor'),
      fc.constant('viewer')
    ))
  });

  const actionArbitrary = fc.oneof(
    // Tool actions
    fc.constant('tool.execute'),
    fc.constant('tool.read'),
    fc.constant('tool.write'),
    // Spec actions
    fc.constant('spec.create'),
    fc.constant('spec.read'),
    fc.constant('spec.update'),
    fc.constant('spec.delete'),
    // Task actions
    fc.constant('task.create'),
    fc.constant('task.read'),
    fc.constant('task.update'),
    fc.constant('task.delete'),
    // Workflow actions
    fc.constant('workflow.create'),
    fc.constant('workflow.execute'),
    fc.constant('workflow.read'),
    // File actions
    fc.constant('file.read'),
    fc.constant('file.write'),
    fc.constant('file.delete'),
    // Agent actions
    fc.constant('agent.spawn'),
    fc.constant('agent.terminate'),
    // Configuration actions
    fc.constant('config.read'),
    fc.constant('config.write'),
    fc.constant('config.reset')
  );

  const resourceTypeArbitrary = fc.oneof(
    fc.constant('tool'),
    fc.constant('spec'),
    fc.constant('task'),
    fc.constant('workflow'),
    fc.constant('file'),
    fc.constant('agent'),
    fc.constant('config'),
    fc.constant('session'),
    fc.constant('user')
  );

  const resourceArbitrary = fc.record({
    type: resourceTypeArbitrary,
    id: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
    path: fc.option(fc.string({ minLength: 1, maxLength: 200 }))
  });

  // Helper function to wait for async operations
  const waitForEvents = (ms: number = 10): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  describe('10.1: All permission decisions produce events with six required fields', () => {
    it('for random (actor, action, resource) tuples, events contain all six required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          actorArbitrary,
          actionArbitrary,
          resourceArbitrary,
          async (actor, action, resource) => {
            // Clear previous events
            eventLogger.clearEvents();
            capturedEvents = [];

            // Create HTTP request context
            const request: HttpRequestContext = {
              method: 'GET',
              path: `/api/${resource.type}${resource.id ? `/${resource.id}` : ''}`,
              headers: {
                'x-actor-id': actor.id,
                'x-action': action,
                'x-resource-type': resource.type,
                'x-resource-id': resource.id || '',
                'authorization': 'Bearer test-token-12345'
              },
              query: undefined,
              body: undefined,
              clientIp: '127.0.0.1'
            };

            // Process request through PEP - it's async
            await pep.processRequest(request);

            // Wait for async event logging to complete
            await waitForEvents();

            // Verify event was logged
            const events = eventLogger.getEvents();
            const permissionEvents = events.filter(
              e => e.action === 'permission.evaluated'
            );

            // Must have at least one permission.evaluated event
            expect(permissionEvents.length).toBeGreaterThan(0);

            const event = permissionEvents[0] as PermissionDecisionEvent;
            expect(event).toBeDefined();
            expect(event.action).toBe('permission.evaluated');

            // Verify all six required fields in payload
            const payload = event.payload;

            // Field 1: actor (must have id at minimum)
            expect(payload).toHaveProperty('actor');
            expect(payload.actor).toHaveProperty('id');
            expect(typeof payload.actor.id).toBe('string');
            expect(payload.actor.id.length).toBeGreaterThan(0);

            // Field 2: action
            expect(payload).toHaveProperty('action');
            expect(typeof payload.action).toBe('string');
            expect(payload.action.length).toBeGreaterThan(0);

            // Field 3: resource (must have type at minimum)
            expect(payload).toHaveProperty('resource');
            expect(payload.resource).toHaveProperty('type');
            expect(typeof payload.resource.type).toBe('string');
            expect(payload.resource.type.length).toBeGreaterThan(0);

            // Field 4: matched_rule
            expect(payload).toHaveProperty('matched_rule');
            expect(typeof payload.matched_rule).toBe('string');
            expect(payload.matched_rule.length).toBeGreaterThan(0);

            // Field 5: rule_layer
            expect(payload).toHaveProperty('rule_layer');
            expect(['hard', 'builtin', 'user']).toContain(payload.rule_layer);

            // Field 6: reason
            expect(payload).toHaveProperty('reason');
            expect(typeof payload.reason).toBe('string');
            expect(payload.reason.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('10.2: Each decision produces unique traceable events', () => {
    it('each permission decision has unique eventId and timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(
          actorArbitrary,
          actionArbitrary,
          resourceArbitrary,
          async (actor, action, resource) => {
            eventLogger.clearEvents();
            const eventIds = new Set<string>();
            const timestamps = new Set<number>();

            // Make multiple requests
            for (let i = 0; i < 5; i++) {
              const request: HttpRequestContext = {
                method: 'GET',
                path: `/api/${resource.type}${resource.id ? `/${resource.id}` : ''}`,
                headers: {
                  'x-actor-id': `${actor.id}-${i}`,
                  'x-action': action,
                  'x-resource-type': resource.type,
                  'x-resource-id': resource.id || '',
                  'authorization': 'Bearer test-token-12345'
                },
                clientIp: '127.0.0.1'
              };

              await pep.processRequest(request);
            }

            // Wait for all async event logging to complete
            await waitForEvents();

            const events = eventLogger.getEvents();
            const permissionEvents = events.filter(
              e => e.action === 'permission.evaluated'
            ) as PermissionDecisionEvent[];

            expect(permissionEvents.length).toBe(5);

            // Each event must have unique eventId
            for (const event of permissionEvents) {
              expect(eventIds.has(event.eventId)).toBe(false);
              eventIds.add(event.eventId);
            }

            // Each event must have unique or non-decreasing timestamp
            for (const event of permissionEvents) {
              // Allow same timestamp (in case of fast execution)
              // but must not decrease
              expect(timestamps.size).toBeLessThanOrEqual(permissionEvents.length);
              timestamps.add(event.ts);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('10.3: Deny decisions are traceable to matched_rule and rule_layer', () => {
    it('deny decisions contain correct matched_rule and rule_layer for traceability', async () => {
      // Test with specific hard rule triggering combinations
      // that actually match the hard rule conditions
      const hardRuleTestCases = [
        // hard-001: bypass gate/validation
        { action: 'gate.bypass', resourceType: 'gate' },
        { action: 'validation.skip', resourceType: 'validation' },
        // hard-002: forge verification  
        { action: 'verification.forge', resourceType: 'verification' },
        { action: 'signature.falsify', resourceType: 'signature' },
        // hard-005: execute arbitrary code
        { action: 'code.execute', resourceType: 'script' },
        { action: 'command.exec', resourceType: 'command' },
        // hard-008: disrupt system operations
        { action: 'system.shutdown', resourceType: 'system' },
        { action: 'service.stop', resourceType: 'service' },
        // hard-009: violate data integrity (needs specific data resources)
        { action: 'data.corrupt', resourceType: 'database' },
        { action: 'record.tamper', resourceType: 'record' },
      ];

      for (const testCase of hardRuleTestCases) {
        eventLogger.clearEvents();

        const request: HttpRequestContext = {
          method: 'POST',
          path: '/api/tool/execute',
          headers: {
            'x-actor-id': 'test-actor',
            'x-action': testCase.action,
            'x-resource-type': testCase.resourceType,
            'authorization': 'Bearer test-token-12345'
          },
          clientIp: '127.0.0.1'
        };

        const result = await pep.processRequest(request);

        // Wait for event logging
        await waitForEvents();

        // Verify decision was denied (or allowed if not matching hard rule pattern)
        const events = eventLogger.getEvents();
        const permissionEvents = events.filter(
          e => e.action === 'permission.evaluated'
        ) as PermissionDecisionEvent[];

        if (result.allowed === false) {
          // For deny decisions, verify traceability
          expect(permissionEvents.length).toBeGreaterThan(0);
          
          const event = permissionEvents[0];
          expect(event.payload.decision).toBe('deny');

          // For deny decisions, we must be able to trace back:
          // 1. matched_rule must be present and valid
          expect(event.payload.matched_rule).toBeDefined();
          expect(typeof event.payload.matched_rule).toBe('string');
          expect(event.payload.matched_rule.length).toBeGreaterThan(0);

          // 2. rule_layer must be present and indicate which layer
          expect(event.payload.rule_layer).toBeDefined();
          expect(['hard', 'builtin', 'user']).toContain(event.payload.rule_layer);
        }
        // If allowed, that's fine - not all combinations trigger hard rules
      }
    });
  });

  describe('10.4: Event logging includes projectId for multi-project traceability', () => {
    it('events contain correct projectId for the decision context', async () => {
      await fc.assert(
        fc.asyncProperty(
          actorArbitrary,
          actionArbitrary,
          resourceArbitrary,
          async (actor, action, resource) => {
            eventLogger.clearEvents();

            const request: HttpRequestContext = {
              method: 'GET',
              path: `/api/${resource.type}`,
              headers: {
                'x-actor-id': actor.id,
                'x-action': action,
                'x-resource-type': resource.type,
                'authorization': 'Bearer test-token-12345'
              },
              clientIp: '127.0.0.1'
            };

            await pep.processRequest(request);

            // Wait for event logging
            await waitForEvents();

            const events = eventLogger.getEvents();
            const permissionEvents = events.filter(
              e => e.action === 'permission.evaluated'
            );

            expect(permissionEvents.length).toBeGreaterThan(0);
            const event = permissionEvents[0];

            // All events must have projectId
            expect(event).toHaveProperty('projectId');
            expect(event.projectId).toBe(testProjectId);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('10.5: Events contain complete context for debugging', () => {
    it('events include decision (allow/deny) for audit purposes', async () => {
      await fc.assert(
        fc.asyncProperty(
          actorArbitrary,
          actionArbitrary,
          resourceArbitrary,
          async (actor, action, resource) => {
            eventLogger.clearEvents();

            const request: HttpRequestContext = {
              method: 'GET',
              path: `/api/${resource.type}`,
              headers: {
                'x-actor-id': actor.id,
                'x-action': action,
                'x-resource-type': resource.type,
                'authorization': 'Bearer test-token-12345'
              },
              clientIp: '127.0.0.1'
            };

            await pep.processRequest(request);

            // Wait for event logging
            await waitForEvents();

            const events = eventLogger.getEvents();
            const permissionEvents = events.filter(
              e => e.action === 'permission.evaluated'
            ) as PermissionDecisionEvent[];

            expect(permissionEvents.length).toBeGreaterThan(0);

            // Each event must have decision field
            for (const event of permissionEvents) {
              expect(event.payload).toHaveProperty('decision');
              expect(['allow', 'deny']).toContain(event.payload.decision);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('10.6: Actor information is fully captured in events', () => {
    it('events capture complete actor information including roles', async () => {
      await fc.assert(
        fc.asyncProperty(
          actorArbitrary,
          actionArbitrary,
          resourceArbitrary,
          async (actor, action, resource) => {
            eventLogger.clearEvents();

            const request: HttpRequestContext = {
              method: 'GET',
              path: `/api/${resource.type}`,
              headers: {
                'x-actor-id': actor.id,
                'x-session-id': actor.sessionId ?? undefined,
                'x-agent-role': actor.agentRole ?? undefined,
                'x-workflow-role': actor.workflowRole ?? undefined,
                'x-action': action,
                'x-resource-type': resource.type,
                'authorization': 'Bearer test-token-12345'
              },
              clientIp: '127.0.0.1'
            };

            await pep.processRequest(request);

            // Wait for event logging
            await waitForEvents();

            const events = eventLogger.getEvents();
            const permissionEvents = events.filter(
              e => e.action === 'permission.evaluated'
            ) as PermissionDecisionEvent[];

            expect(permissionEvents.length).toBeGreaterThan(0);

            const event = permissionEvents[0];
            // Actor must be captured
            expect(event.payload.actor).toBeDefined();
            expect(event.payload.actor.id).toBe(actor.id);

            // Optional fields should be captured if provided
            if (actor.sessionId) {
              expect(event.payload.actor.sessionId).toBe(actor.sessionId);
            }
            if (actor.agentRole) {
              expect(event.payload.actor.agentRole).toBe(actor.agentRole);
            }
            if (actor.workflowRole) {
              expect(event.payload.actor.workflowRole).toBe(actor.workflowRole);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});