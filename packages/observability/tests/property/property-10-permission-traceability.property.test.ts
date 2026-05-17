/**
 * Property 10: Permission Decision Traceability Property-Based Test
 * 
 * **Validates: Requirements 30.10**
 * 
 * Properties:
 * 1. Generate random permission decisions
 * 2. Verify each decision produces a traceable event
 * 3. Verify event contains all six required fields
 * 4. Verify deny decisions can be traced back to rules
 * 
 * Feature: observability, Property 10: Permission Decision Traceability
 * Derived-From: v6-architecture-overview Property 10
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventLogger } from '../../src/event-logger/index.js';
import { QueryAPI } from '../../src/query-api/index.js';
import { CAS } from '../../src/cas/index.js';
import { generateEventId, MonotonicTimestamp, calculateProjectId } from '../../src/types/event-utils.js';
import type { Event, PermissionDecisionEvent, AgentIdentity } from '../../src/types/index.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as fc from 'fast-check';

// Unique identifier to separate test runs
const TEST_RUN_ID = Math.random().toString(36).substring(7);

// Helper to generate random permission decisions
interface PermissionDecisionParams {
  actorId: string;
  actorName: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  matchedRule: string;
  ruleLayer: 'hard' | 'builtin' | 'user';
  reason: string;
  effect: 'allow' | 'deny';
}

// Arbitraries for permission decision parameters
const actorIdArb = fc.string({ minLength: 1, maxLength: 50 });
const actorNameArb = fc.string({ minLength: 1, maxLength: 100 });
const actorTypeArb = fc.oneof(
  fc.constant('agent'),
  fc.constant('user'),
  fc.constant('system'),
  fc.constant('plugin')
);
const actionArb = fc.oneof(
  fc.constant('tool.invoke'),
  fc.constant('tool.read'),
  fc.constant('tool.write'),
  fc.constant('file.read'),
  fc.constant('file.write'),
  fc.constant('file.delete'),
  fc.constant('workflow.execute'),
  fc.constant('skill.invoke'),
  fc.constant('config.modify'),
  fc.constant('api.call')
);
const resourceTypeArb = fc.oneof(
  fc.constant('file'),
  fc.constant('directory'),
  fc.constant('workflow'),
  fc.constant('skill'),
  fc.constant('tool'),
  fc.constant('config'),
  fc.constant('api')
);
const resourceIdArb = fc.string({ minLength: 1, maxLength: 100 });
const matchedRuleArb = fc.string({ minLength: 1, maxLength: 50 });
const ruleLayerArb = fc.oneof(
  fc.constant('hard'),
  fc.constant('builtin'),
  fc.constant('user')
);
const reasonArb = fc.oneof(
  fc.constant('Rule explicitly allows this action'),
  fc.constant('Rule explicitly denies this action'),
  fc.constant('Default permission applied'),
  fc.constant('No matching rule found, defaulting to deny'),
  fc.constant('Actor is in allowed group'),
  fc.constant('Actor is in denied group'),
  fc.constant('Resource matches whitelist'),
  fc.constant('Resource matches blacklist'),
  fc.constant('Action matches permitted list'),
  fc.constant('Action matches forbidden list')
);
const effectArb = fc.oneof(
  fc.constant('allow'),
  fc.constant('deny')
);

describe('Property 10: Permission Decision Traceability', () => {
  let eventLogger: EventLogger;
  let cas: CAS;
  let queryApi: QueryAPI;
  let tempDir: string;
  let timestampGenerator: MonotonicTimestamp;
  let projectId: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'permission-traceability-test-'));
    eventLogger = new EventLogger(tempDir);
    await eventLogger.initialize();
    
    const casDir = join(tempDir, 'cas');
    cas = new CAS(casDir);
    await cas.initialize();
    
    queryApi = new QueryAPI({ eventLogger, cas });
    timestampGenerator = new MonotonicTimestamp();
    // Use test run ID to ensure unique project IDs
    projectId = calculateProjectId(`${tempDir}-${TEST_RUN_ID}`);
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================
  // Property 10.1: Permission decisions produce traceable events
  // ============================================================
  describe('Property 10.1: Permission decisions produce traceable events', () => {
    it('should generate permission decision event with correct action', async () => {
      await fc.assert(
        fc.asyncProperty(
          actorIdArb,
          actorNameArb,
          actorTypeArb,
          actionArb,
          resourceTypeArb,
          resourceIdArb,
          matchedRuleArb,
          ruleLayerArb,
          reasonArb,
          effectArb,
          async (actorId, actorName, actorType, action, resourceType, resourceId, matchedRule, ruleLayer, reason, effect) => {
            // Create the permission decision event
            const { timestamp, sequence } = timestampGenerator.getTimestamp();
            
            const actor: AgentIdentity = { id: actorId, name: actorName, type: actorType };
            
            const event: PermissionDecisionEvent = {
              schema_version: '1.0',
              eventId: generateEventId(),
              ts: timestamp,
              monotonicSeq: sequence,
              projectId,
              workItemId: null,
              actor,
              category: 'permission',
              action: 'permission.evaluated',
              payload: {
                actor,
                action,
                resource: { type: resourceType, id: resourceId },
                matched_rule: matchedRule,
                rule_layer: ruleLayer,
                reason,
                effect
              }
            };

            // Append event to logger
            await eventLogger.append(event);

            // Query the event back filtered by projectId and eventId
            const events = await queryApi.queryEventsSync({
              action: 'permission.evaluated',
              category: 'permission',
              projectId,
              limit: 1000
            });

            // Find our specific event by eventId
            const retrievedEvent = events.find(e => e.eventId === event.eventId);
            expect(retrievedEvent).toBeDefined();
            expect(retrievedEvent!.action).toBe('permission.evaluated');
            expect(retrievedEvent!.category).toBe('permission');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should uniquely identify each permission decision event', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(fc.integer().map(n => `decision-${n}`), { minLength: 5, maxLength: 20 }),
          async (decisionIds) => {
            // Generate multiple unique permission events
            const createdEventIds: string[] = [];
            
            for (const decisionId of decisionIds) {
              const { timestamp, sequence } = timestampGenerator.getTimestamp();
              const actor: AgentIdentity = { id: decisionId, name: `actor-${decisionId}`, type: 'agent' };
              
              const event: PermissionDecisionEvent = {
                schema_version: '1.0',
                eventId: generateEventId(),
                ts: timestamp,
                monotonicSeq: sequence,
                projectId,
                workItemId: null,
                actor,
                category: 'permission',
                action: 'permission.evaluated',
                payload: {
                  actor,
                  action: 'tool.invoke',
                  resource: { type: 'tool', id: 'test-tool' },
                  matched_rule: 'rule-1',
                  rule_layer: 'user',
                  reason: 'Test rule',
                  effect: 'allow'
                }
              };
              
              await eventLogger.append(event);
              createdEventIds.push(event.eventId);
            }

            // Query all permission events for this projectId
            const retrievedEvents = await queryApi.queryEventsSync({
              action: 'permission.evaluated',
              category: 'permission',
              projectId,
              limit: 1000
            });

            // Filter to only events we just created
            const ourEvents = retrievedEvents.filter(e => createdEventIds.includes(e.eventId));
            
            // Verify all our events are present and unique
            expect(ourEvents.length).toBe(createdEventIds.length);
            const uniqueIds = new Set(ourEvents.map(e => e.eventId));
            expect(uniqueIds.size).toBe(createdEventIds.length);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  // ============================================================
  // Property 10.2: Event contains all six required fields
  // ============================================================
  describe('Property 10.2: Event contains all six required fields', () => {
    it('should contain all six required fields: actor, action, resource, matched_rule, rule_layer, reason', async () => {
      await fc.assert(
        fc.asyncProperty(
          actorIdArb,
          actorNameArb,
          actorTypeArb,
          actionArb,
          resourceTypeArb,
          resourceIdArb,
          matchedRuleArb,
          ruleLayerArb,
          reasonArb,
          effectArb,
          async (actorId, actorName, actorType, action, resourceType, resourceId, matchedRule, ruleLayer, reason, effect) => {
            // Create permission decision event
            const { timestamp, sequence } = timestampGenerator.getTimestamp();
            const actor: AgentIdentity = { id: actorId, name: actorName, type: actorType };
            
            const event: PermissionDecisionEvent = {
              schema_version: '1.0',
              eventId: generateEventId(),
              ts: timestamp,
              monotonicSeq: sequence,
              projectId,
              workItemId: null,
              actor,
              category: 'permission',
              action: 'permission.evaluated',
              payload: {
                actor,
                action,
                resource: { type: resourceType, id: resourceId },
                matched_rule: matchedRule,
                rule_layer: ruleLayer,
                reason,
                effect
              }
            };

            await eventLogger.append(event);

            // Retrieve our specific event by eventId
            const events = await queryApi.queryEventsSync({
              action: 'permission.evaluated',
              category: 'permission',
              projectId,
              limit: 1000
            });

            const retrievedEvent = events.find(e => e.eventId === event.eventId);
            expect(retrievedEvent).toBeDefined();
            
            const payload = retrievedEvent!.payload as any;

            // Verify all six required fields exist
            expect(payload).toHaveProperty('actor');
            expect(payload).toHaveProperty('action');
            expect(payload).toHaveProperty('resource');
            expect(payload).toHaveProperty('matched_rule');
            expect(payload).toHaveProperty('rule_layer');
            expect(payload).toHaveProperty('reason');

            // Verify field values match what we stored
            expect(payload.actor.id).toBe(actorId);
            expect(payload.action).toBe(action);
            expect(payload.resource.type).toBe(resourceType);
            expect(payload.resource.id).toBe(resourceId);
            expect(payload.matched_rule).toBe(matchedRule);
            expect(payload.rule_layer).toBe(ruleLayer);
            expect(payload.reason).toBe(reason);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should contain effect field indicating allow or deny', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat().map(n => n % 2 === 0 ? 'allow' : 'deny'),
          async (effect) => {
            const { timestamp, sequence } = timestampGenerator.getTimestamp();
            const actor: AgentIdentity = { id: 'test-actor', name: 'Test Actor', type: 'agent' };
            
            const event: PermissionDecisionEvent = {
              schema_version: '1.0',
              eventId: generateEventId(),
              ts: timestamp,
              monotonicSeq: sequence,
              projectId,
              workItemId: null,
              actor,
              category: 'permission',
              action: 'permission.evaluated',
              payload: {
                actor,
                action: 'tool.invoke',
                resource: { type: 'tool', id: 'test-tool' },
                matched_rule: 'rule-1',
                rule_layer: 'user',
                reason: 'Test reason',
                effect: effect as 'allow' | 'deny'
              }
            };

            await eventLogger.append(event);

            // Query and find our specific event
            const events = await queryApi.queryEventsSync({
              action: 'permission.evaluated',
              category: 'permission',
              projectId,
              limit: 1000
            });

            const retrievedEvent = events.find(e => e.eventId === event.eventId);
            expect(retrievedEvent).toBeDefined();
            
            const payload = retrievedEvent!.payload as any;
            expect(payload.effect).toBe(effect);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================
  // Property 10.3: Deny decisions can be traced back to rules
  // ============================================================
  describe('Property 10.3: Deny decisions can be traced back to rules', () => {
    it('should trace deny decisions to matched_rule and rule_layer', async () => {
      await fc.assert(
        fc.asyncProperty(
          actorIdArb,
          matchedRuleArb,
          ruleLayerArb,
          reasonArb,
          async (actorId, matchedRule, ruleLayer, reason) => {
            // Create a deny decision
            const { timestamp, sequence } = timestampGenerator.getTimestamp();
            const actor: AgentIdentity = { id: actorId, name: 'Test Actor', type: 'agent' };
            
            const event: PermissionDecisionEvent = {
              schema_version: '1.0',
              eventId: generateEventId(),
              ts: timestamp,
              monotonicSeq: sequence,
              projectId,
              workItemId: null,
              actor,
              category: 'permission',
              action: 'permission.evaluated',
              payload: {
                actor,
                action: 'tool.invoke',
                resource: { type: 'tool', id: 'test-tool' },
                matched_rule: matchedRule,
                rule_layer: ruleLayer,
                reason,
                effect: 'deny'
              }
            };

            await eventLogger.append(event);

            // Use getPermissionTrace to trace the decision
            const trace = await queryApi.getPermissionTrace(event.eventId);

            // Verify trace contains rule information
            expect(trace.decision.payload).toBeDefined();
            const payload = trace.decision.payload as any;
            
            expect(payload.matched_rule).toBe(matchedRule);
            expect(payload.rule_layer).toBe(ruleLayer);
            expect(payload.effect).toBe('deny');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow querying deny decisions and tracing them', async () => {
      // Create deny decisions - use a unique prefix to identify our events
      const denyCount = 3;
      const denyEventIds: string[] = [];
      
      for (let i = 0; i < denyCount; i++) {
        const { timestamp, sequence } = timestampGenerator.getTimestamp();
        const actor: AgentIdentity = { id: `actor-deny-${TEST_RUN_ID}-${i}`, name: 'Test Actor', type: 'agent' };
        
        const event: PermissionDecisionEvent = {
          schema_version: '1.0',
          eventId: generateEventId(),
          ts: timestamp,
          monotonicSeq: sequence,
          projectId,
          workItemId: null,
          actor,
          category: 'permission',
          action: 'permission.evaluated',
          payload: {
            actor,
            action: 'tool.invoke',
            resource: { type: 'tool', id: `tool-deny-${TEST_RUN_ID}-${i}` },
            matched_rule: `rule-deny-${TEST_RUN_ID}-${i}`,
            rule_layer: 'user',
            reason: 'Denied',
            effect: 'deny'
          }
        };
        
        await eventLogger.append(event);
        denyEventIds.push(event.eventId);
      }

      // Create some allow decisions
      for (let i = 0; i < 2; i++) {
        const { timestamp, sequence } = timestampGenerator.getTimestamp();
        const actor: AgentIdentity = { id: `actor-allow-${TEST_RUN_ID}-${i}`, name: 'Test Actor', type: 'agent' };
        
        const event: PermissionDecisionEvent = {
          schema_version: '1.0',
          eventId: generateEventId(),
          ts: timestamp,
          monotonicSeq: sequence,
          projectId,
          workItemId: null,
          actor,
          category: 'permission',
          action: 'permission.evaluated',
          payload: {
            actor,
            action: 'tool.invoke',
            resource: { type: 'tool', id: `tool-allow-${TEST_RUN_ID}-${i}` },
            matched_rule: `rule-allow-${TEST_RUN_ID}-${i}`,
            rule_layer: 'user',
            reason: 'Allowed',
            effect: 'allow'
          }
        };
        
        await eventLogger.append(event);
      }

      // Query deny decisions by projectId
      const allDecisions = await queryApi.queryPermissionDecisions({ projectId });
      const denyDecisions = allDecisions.filter(d => 
        (d.payload as any).effect === 'deny' && 
        denyEventIds.includes(d.eventId)
      );
      
      expect(denyDecisions.length).toBe(denyCount);

      // Verify each deny decision can be traced
      for (const decision of denyDecisions) {
        const trace = await queryApi.getPermissionTrace(decision.eventId);
        expect(trace.decision).toBeDefined();
        expect((trace.decision.payload as any).matched_rule).toBeDefined();
        expect((trace.decision.payload as any).rule_layer).toBeDefined();
      }
    });
  });

  // ============================================================
  // Property 10.4: Query API provides permission trace capability
  // ============================================================
  describe('Property 10.4: Query API permission trace capability', () => {
    it('should getPermissionTrace return complete trace for permission decision', async () => {
      await fc.assert(
        fc.asyncProperty(
          actorIdArb,
          actionArb,
          resourceTypeArb,
          resourceIdArb,
          matchedRuleArb,
          ruleLayerArb,
          async (actorId, action, resourceType, resourceId, matchedRule, ruleLayer) => {
            const { timestamp, sequence } = timestampGenerator.getTimestamp();
            const actor: AgentIdentity = { id: actorId, name: 'Test Actor', type: 'agent' };
            
            const event: PermissionDecisionEvent = {
              schema_version: '1.0',
              eventId: generateEventId(),
              ts: timestamp,
              monotonicSeq: sequence,
              projectId,
              workItemId: 'workitem-123',
              actor,
              category: 'permission',
              action: 'permission.evaluated',
              payload: {
                actor,
                action,
                resource: { type: resourceType, id: resourceId },
                matched_rule: matchedRule,
                rule_layer: ruleLayer,
                reason: 'Test trace',
                effect: 'allow'
              }
            };

            await eventLogger.append(event);

            // Get the trace
            const trace = await queryApi.getPermissionTrace(event.eventId);

            // Verify trace structure
            expect(trace.decision).toBeDefined();
            expect(trace.context).toBeDefined();
            expect(trace.context.projectId).toBe(projectId);
            expect(trace.context.workItemId).toBe('workitem-123');
            expect(trace.context.timestamp).toBeDefined();

            // Verify trace contains rule info
            const payload = trace.decision.payload as any;
            expect(payload.matched_rule).toBe(matchedRule);
            expect(payload.rule_layer).toBe(ruleLayer);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should queryPermissionDecisions filter by criteria', async () => {
      // Create permission events with different actions
      const actions = ['tool.invoke', 'file.read', 'workflow.execute'];
      
      for (const action of actions) {
        const { timestamp, sequence } = timestampGenerator.getTimestamp();
        const actor: AgentIdentity = { id: 'actor-1', name: 'Test Actor', type: 'agent' };
        
        const event: PermissionDecisionEvent = {
          schema_version: '1.0',
          eventId: generateEventId(),
          ts: timestamp,
          monotonicSeq: sequence,
          projectId,
          workItemId: null,
          actor,
          category: 'permission',
          action: 'permission.evaluated',
          payload: {
            actor,
            action,
            resource: { type: 'tool', id: 'test-tool' },
            matched_rule: 'rule-1',
            rule_layer: 'user',
            reason: 'Test',
            effect: 'allow'
          }
        };
        
        await eventLogger.append(event);
      }

      // Query by specific action in payload
      const allDecisions = await queryApi.queryPermissionDecisions();
      expect(allDecisions.length).toBe(actions.length);

      // Verify we can filter decisions
      const decisions = await queryApi.queryPermissionDecisions({ limit: 100 });
      expect(decisions.length).toBeGreaterThanOrEqual(3);

      // Each decision should have all required fields
      for (const decision of decisions) {
        const payload = decision.payload as any;
        expect(payload.actor).toBeDefined();
        expect(payload.action).toBeDefined();
        expect(payload.resource).toBeDefined();
        expect(payload.matched_rule).toBeDefined();
        expect(payload.rule_layer).toBeDefined();
        expect(payload.reason).toBeDefined();
        expect(payload.effect).toBeDefined();
      }
    });
  });

  // ============================================================
  // Property 10.5: Edge cases
  // ============================================================
  describe('Property 10.5: Edge cases', () => {
    it('should handle empty resource ID', async () => {
      const { timestamp, sequence } = timestampGenerator.getTimestamp();
      const actor: AgentIdentity = { id: 'actor-1', name: 'Test Actor', type: 'agent' };
      
      const event: PermissionDecisionEvent = {
        schema_version: '1.0',
        eventId: generateEventId(),
        ts: timestamp,
        monotonicSeq: sequence,
        projectId,
        workItemId: null,
        actor,
        category: 'permission',
        action: 'permission.evaluated',
        payload: {
          actor,
          action: 'file.read',
          resource: { type: 'file', id: '' },
          matched_rule: 'rule-1',
          rule_layer: 'builtin',
          reason: 'Empty resource test',
          effect: 'deny'
        }
      };

      await eventLogger.append(event);

      const trace = await queryApi.getPermissionTrace(event.eventId);
      expect(trace.decision.payload).toBeDefined();
      expect((trace.decision.payload as any).resource.id).toBe('');
    });

    it('should handle special characters in reason', async () => {
      const specialReasons = [
        'Reason with "quotes"',
        'Reason with <angle> brackets',
        'Reason with newlines\nand\ttabs',
        'Reason with emoji 🚀',
        'Reason with unicode: 中文한국어',
        'Reason with special chars: !@#$%^&*()'
      ];

      for (const reason of specialReasons) {
        const { timestamp, sequence } = timestampGenerator.getTimestamp();
        const actor: AgentIdentity = { id: 'actor-1', name: 'Test Actor', type: 'agent' };
        
        const event: PermissionDecisionEvent = {
          schema_version: '1.0',
          eventId: generateEventId(),
          ts: timestamp,
          monotonicSeq: sequence,
          projectId,
          workItemId: null,
          actor,
          category: 'permission',
          action: 'permission.evaluated',
          payload: {
            actor,
            action: 'tool.invoke',
            resource: { type: 'tool', id: 'test' },
            matched_rule: 'rule-special',
            rule_layer: 'user',
            reason,
            effect: 'allow'
          }
        };

        await eventLogger.append(event);

        const events = await queryApi.queryEventsSync({
          action: 'permission.evaluated',
          limit: 100
        });

        const savedReason = (events[events.length - 1].payload as any).reason;
        expect(savedReason).toBe(reason);
      }
    });

    it('should handle all rule layers', async () => {
      const ruleLayers: Array<'hard' | 'builtin' | 'user'> = ['hard', 'builtin', 'user'];

      for (const layer of ruleLayers) {
        const { timestamp, sequence } = timestampGenerator.getTimestamp();
        const actor: AgentIdentity = { id: 'actor-1', name: 'Test Actor', type: 'agent' };
        
        const event: PermissionDecisionEvent = {
          schema_version: '1.0',
          eventId: generateEventId(),
          ts: timestamp,
          monotonicSeq: sequence,
          projectId,
          workItemId: null,
          actor,
          category: 'permission',
          action: 'permission.evaluated',
          payload: {
            actor,
            action: 'tool.invoke',
            resource: { type: 'tool', id: 'test' },
            matched_rule: `rule-${layer}`,
            rule_layer: layer,
            reason: `Test ${layer} layer`,
            effect: 'allow'
          }
        };

        await eventLogger.append(event);

        const trace = await queryApi.getPermissionTrace(event.eventId);
        expect((trace.decision.payload as any).rule_layer).toBe(layer);
      }
    });
  });
});