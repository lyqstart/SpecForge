/**
 * Comprehensive integration tests for workflow event system
 * Tests the complete integration of WorkflowEngine, GateRunner, and EventPublisher with Event Bus
 * 
 * Feature: Workflow Event System Integration
 * Property 6: Event Ordering - For all workflow instances w, events must be ordered by time
 * Validates: Requirements 4.1, 4.2, 4.3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '@specforge/daemon-core/src/event-bus/EventBus';
import { WorkflowEngine } from '../../src/WorkflowEngine.js';
import { EventPublisher } from '../../src/events/EventPublisher.js';
import type {
  WorkflowDefinition,
  WorkflowInstance,
  IEventBus,
  Event,
  GateResult,
} from '../../src/types.js';

/**
 * Create a simple workflow definition for testing
 */
function createSimpleWorkflow(): WorkflowDefinition {
  return {
    id: 'test-workflow-1',
    displayName: 'Test Workflow',
    intent: 'test',
    schema_version: '1.0',
    stateMachine: {
      initial: 'requirements',
      states: {
        requirements: {
          agent: 'requirements-agent',
          gate: {
            id: 'req-gate-1',
            type: 'simple',
            checkFn: async () => ({ schema_version: '1.0', passed: true, reason: 'Requirements passed' }),
          },
          next: 'design',
        },
        design: {
          agent: 'design-agent',
          gate: {
            id: 'design-gate-1',
            type: 'simple',
            checkFn: async () => ({ schema_version: '1.0', passed: true, reason: 'Design passed' }),
          },
          next: 'implementation',
        },
        implementation: {
          agent: 'impl-agent',
          gate: {
            id: 'impl-gate-1',
            type: 'simple',
            checkFn: async () => ({ schema_version: '1.0', passed: true, reason: 'Implementation passed' }),
          },
          next: undefined,
        },
      },
    },
    artifacts: [],
  };
}

/**
 * Create a workflow with conditional branching
 */
function createConditionalWorkflow(): WorkflowDefinition {
  return {
    id: 'test-workflow-conditional',
    displayName: 'Conditional Workflow',
    intent: 'test-conditional',
    schema_version: '1.0',
    stateMachine: {
      initial: 'check',
      states: {
        check: {
          agent: 'check-agent',
          gate: {
            id: 'check-gate',
            type: 'simple',
            checkFn: async () => ({ schema_version: '1.0', passed: false, reason: 'Check failed' }),
          },
          next: {
            pass: 'success',
            fail: 'retry',
          },
        },
        retry: {
          agent: 'retry-agent',
          gate: {
            id: 'retry-gate',
            type: 'simple',
            checkFn: async () => ({ schema_version: '1.0', passed: true, reason: 'Retry passed' }),
          },
          next: 'success',
        },
        success: {
          agent: 'success-agent',
          gate: {
            id: 'success-gate',
            type: 'simple',
            checkFn: async () => ({ schema_version: '1.0', passed: true, reason: 'Success' }),
          },
          next: undefined,
        },
      },
    },
    artifacts: [],
  };
}

describe('Workflow Event System Integration', () => {
  let eventBus: EventBus;
  let engine: WorkflowEngine;
  let publisher: EventPublisher;
  let publishedEvents: Event[];

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();

    // Capture all published events
    publishedEvents = [];
    eventBus.subscribe('*', (event: Event) => {
      publishedEvents.push(event);
    });

    publisher = new EventPublisher({
      projectId: 'integration-test',
      eventBus: eventBus as unknown as IEventBus,
      source: 'daemon',
    });

    engine = new WorkflowEngine({
      eventPublisher: publisher,
    });
  });

  afterEach(() => {
    eventBus.stop();
    publishedEvents = [];
  });

  describe('WorkflowEngine event publishing', () => {
    it('should publish workflow.started event when creating instance', () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);

      const instance = engine.createInstance(workflow.id);

      const startedEvent = publishedEvents.find(e => e.action === 'workflow.started');
      expect(startedEvent).toBeDefined();
      expect(startedEvent?.payload.instanceId).toBe(instance.id);
      expect(startedEvent?.payload.workflowId).toBe(workflow.id);
      expect(startedEvent?.payload.currentState).toBe('requirements');
    });

    it('should publish workflow.state_changed event on state transition', () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      const transitioned = engine.transition(instance.id, 'requirements', 'design');
      expect(transitioned).toBe(true);

      const stateChangedEvent = publishedEvents.find(e => e.action === 'workflow.state_changed');
      expect(stateChangedEvent).toBeDefined();
      expect(stateChangedEvent?.payload.fromState).toBe('requirements');
      expect(stateChangedEvent?.payload.toState).toBe('design');
    });

    it('should publish workflow.completed event when workflow finishes', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      const completedEvent = publishedEvents.find(e => e.action === 'workflow.completed');
      expect(completedEvent).toBeDefined();
      expect(completedEvent?.payload.instanceId).toBe(instance.id);
      expect(completedEvent?.payload.finalState).toBe('implementation');
    });

    it('should publish gate execution events during workflow execution', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      // Should have gate started and completed events
      const gateStartedEvents = publishedEvents.filter(e => e.action === 'workflow.gate.started');
      const gateCompletedEvents = publishedEvents.filter(e => e.action === 'workflow.gate.completed');

      expect(gateStartedEvents.length).toBeGreaterThan(0);
      expect(gateCompletedEvents.length).toBeGreaterThan(0);
      expect(gateStartedEvents.length).toBe(gateCompletedEvents.length);
    });
  });

  describe('Event ordering and consistency', () => {
    it('should maintain event order during workflow execution', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      // Verify event timestamps are monotonically increasing
      for (let i = 1; i < publishedEvents.length; i++) {
        expect(publishedEvents[i].ts).toBeGreaterThanOrEqual(publishedEvents[i - 1].ts);
      }
    });

    it('should have workflow.started before workflow.completed', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      
      publishedEvents = []; // Clear events before creating instance
      
      const instance = engine.createInstance(workflow.id);

      await engine.execute(instance.id);

      const startedIdx = publishedEvents.findIndex(e => e.action === 'workflow.started');
      const completedIdx = publishedEvents.findIndex(e => e.action === 'workflow.completed');

      expect(startedIdx).toBeGreaterThanOrEqual(0);
      expect(completedIdx).toBeGreaterThanOrEqual(0);
      expect(startedIdx).toBeLessThan(completedIdx);
    });

    it('should have gate.started before gate.completed for each gate', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      const gateStartedEvents = publishedEvents.filter(e => e.action === 'workflow.gate.started');
      const gateCompletedEvents = publishedEvents.filter(e => e.action === 'workflow.gate.completed');

      // For each gate, started should come before completed
      for (const startedEvent of gateStartedEvents) {
        const gateId = startedEvent.payload.gateId;
        const startedIdx = publishedEvents.indexOf(startedEvent);
        const completedEvent = publishedEvents.find(
          e => e.action === 'workflow.gate.completed' && e.payload.gateId === gateId
        );
        const completedIdx = publishedEvents.indexOf(completedEvent!);

        expect(startedIdx).toBeLessThan(completedIdx);
      }
    });

    it('should maintain state transition order', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      const stateChangedEvents = publishedEvents.filter(e => e.action === 'workflow.state_changed');

      // Verify state transitions follow the workflow definition
      const expectedTransitions = [
        { from: 'requirements', to: 'design' },
        { from: 'design', to: 'implementation' },
      ];

      expect(stateChangedEvents.length).toBe(expectedTransitions.length);

      for (let i = 0; i < expectedTransitions.length; i++) {
        expect(stateChangedEvents[i].payload.fromState).toBe(expectedTransitions[i].from);
        expect(stateChangedEvents[i].payload.toState).toBe(expectedTransitions[i].to);
      }
    });
  });

  describe('Event payload correctness', () => {
    it('should include all required fields in workflow.started event', () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      const startedEvent = publishedEvents.find(e => e.action === 'workflow.started');
      expect(startedEvent?.payload).toHaveProperty('instanceId');
      expect(startedEvent?.payload).toHaveProperty('workflowId');
      expect(startedEvent?.payload).toHaveProperty('currentState');
      expect(startedEvent?.payload).toHaveProperty('status');
    });

    it('should include all required fields in gate.started event', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      const gateStartedEvent = publishedEvents.find(e => e.action === 'workflow.gate.started');
      expect(gateStartedEvent?.payload).toHaveProperty('instanceId');
      expect(gateStartedEvent?.payload).toHaveProperty('workflowId');
      expect(gateStartedEvent?.payload).toHaveProperty('state');
      expect(gateStartedEvent?.payload).toHaveProperty('gateId');
      expect(gateStartedEvent?.payload).toHaveProperty('gateType');
      expect(gateStartedEvent?.payload).toHaveProperty('timestamp');
    });

    it('should include gate result in gate.completed event', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      const gateCompletedEvent = publishedEvents.find(e => e.action === 'workflow.gate.completed');
      expect(gateCompletedEvent?.payload).toHaveProperty('passed');
      expect(gateCompletedEvent?.payload).toHaveProperty('reason');
      expect(gateCompletedEvent?.payload).toHaveProperty('timestamp');
    });

    it('should include correct metadata in all events', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      for (const event of publishedEvents) {
        expect(event.metadata).toHaveProperty('schemaVersion');
        expect(event.metadata).toHaveProperty('source');
        expect(event.metadata.schemaVersion).toBe('1.0');
        expect(event.metadata.source).toBe('daemon');
      }
    });
  });

  describe('Event subscription patterns', () => {
    it('should support workflow.* pattern subscription', async () => {
      const workflowEvents: Event[] = [];
      eventBus.subscribe('workflow.*', (event: Event) => {
        workflowEvents.push(event);
      });

      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      // All events should match workflow.* pattern
      for (const event of workflowEvents) {
        expect(event.action).toMatch(/^workflow\./);
      }
    });

    it('should support workflow.gate.* pattern subscription', async () => {
      const gateEvents: Event[] = [];
      eventBus.subscribe('workflow.gate.*', (event: Event) => {
        gateEvents.push(event);
      });

      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      // All events should be gate events
      for (const event of gateEvents) {
        expect(event.action).toMatch(/^workflow\.gate\./);
      }
    });

    it('should support specific action subscription', async () => {
      const completedEvents: Event[] = [];
      eventBus.subscribe('workflow.completed', (event: Event) => {
        completedEvents.push(event);
      });

      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      expect(completedEvents.length).toBe(1);
      expect(completedEvents[0].action).toBe('workflow.completed');
    });
  });

  describe('Conditional workflow event flow', () => {
    it('should publish correct events for conditional branching', async () => {
      const workflow = createConditionalWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      // Should have events for check -> retry -> success path
      const stateChangedEvents = publishedEvents.filter(e => e.action === 'workflow.state_changed');

      // Verify the state transitions follow the conditional path
      const states = stateChangedEvents.map(e => ({ from: e.payload.fromState, to: e.payload.toState }));

      expect(states).toContainEqual({ from: 'check', to: 'retry' });
      expect(states).toContainEqual({ from: 'retry', to: 'success' });
    });

    it('should publish gate events for all executed gates in conditional workflow', async () => {
      const workflow = createConditionalWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance.id);

      const gateStartedEvents = publishedEvents.filter(e => e.action === 'workflow.gate.started');
      const gateIds = gateStartedEvents.map(e => e.payload.gateId);

      // Should have executed check, retry, and success gates
      expect(gateIds).toContain('check-gate');
      expect(gateIds).toContain('retry-gate');
      expect(gateIds).toContain('success-gate');
    });
  });

  describe('Event Bus integration resilience', () => {
    it('should handle EventBus stop gracefully', () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);

      eventBus.stop();

      // Should not throw when creating instance with stopped EventBus
      expect(() => {
        engine.createInstance(workflow.id);
      }).not.toThrow();
    });

    it('should resume publishing after EventBus restart', () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      eventBus.stop();
      publishedEvents = [];

      eventBus.start();
      // Re-subscribe after restart
      eventBus.subscribe('*', (event: Event) => {
        publishedEvents.push(event);
      });

      const transitioned = engine.transition(instance.id, 'requirements', 'design');
      expect(transitioned).toBe(true);

      // Should have published state changed event after restart
      const stateChangedEvent = publishedEvents.find(e => e.action === 'workflow.state_changed');
      expect(stateChangedEvent).toBeDefined();
    });
  });

  describe('Multiple workflow instances event isolation', () => {
    it('should correctly identify events from different workflow instances', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);

      const instance1 = engine.createInstance(workflow.id);
      const instance2 = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      await engine.execute(instance1.id);

      // All events should belong to instance1
      for (const event of publishedEvents) {
        expect(event.payload.instanceId).toBe(instance1.id);
      }
    });

    it('should maintain separate event streams for concurrent workflows', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);

      const instance1 = engine.createInstance(workflow.id);
      const instance2 = engine.createInstance(workflow.id);

      publishedEvents = []; // Clear initial events

      // Execute both instances
      const [result1, result2] = await Promise.all([
        engine.execute(instance1.id),
        engine.execute(instance2.id),
      ]);

      // Verify both instances completed
      expect(result1.status).toBe('completed');
      expect(result2.status).toBe('completed');

      // Verify events are correctly attributed
      const instance1Events = publishedEvents.filter(e => e.payload.instanceId === instance1.id);
      const instance2Events = publishedEvents.filter(e => e.payload.instanceId === instance2.id);

      expect(instance1Events.length).toBeGreaterThan(0);
      expect(instance2Events.length).toBeGreaterThan(0);

      // Verify no cross-contamination
      for (const event of instance1Events) {
        expect(event.payload.instanceId).toBe(instance1.id);
      }
      for (const event of instance2Events) {
        expect(event.payload.instanceId).toBe(instance2.id);
      }
    });
  });

  describe('Event publisher configuration', () => {
    it('should respect custom project ID in events', () => {
      const customPublisher = new EventPublisher({
        projectId: 'custom-project-123',
        eventBus: eventBus as unknown as IEventBus,
        source: 'daemon',
      });

      const customEngine = new WorkflowEngine({
        eventPublisher: customPublisher,
      });

      const workflow = createSimpleWorkflow();
      customEngine.loadWorkflow(workflow);
      customEngine.createInstance(workflow.id);

      const startedEvent = publishedEvents.find(e => e.action === 'workflow.started');
      expect(startedEvent?.projectId).toBe('custom-project-123');
    });

    it('should respect custom source in events', () => {
      const customPublisher = new EventPublisher({
        projectId: 'test-project',
        eventBus: eventBus as unknown as IEventBus,
        source: 'client',
      });

      const customEngine = new WorkflowEngine({
        eventPublisher: customPublisher,
      });

      const workflow = createSimpleWorkflow();
      customEngine.loadWorkflow(workflow);
      customEngine.createInstance(workflow.id);

      const startedEvent = publishedEvents.find(e => e.action === 'workflow.started');
      expect(startedEvent?.metadata.source).toBe('client');
    });
  });
});
