/**
 * Integration tests for EventPublisher with daemon-core Event Bus
 * Tests the integration between workflow-runtime EventPublisher and daemon-core EventBus
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '@specforge/daemon-core/src/event-bus/EventBus';
import {
  EventPublisher,
  createEventPublisher,
} from '../../src/events/EventPublisher.js';
import type { WorkflowInstance, IEventBus, Event } from '../../src/types.js';

/**
 * Mock WorkflowInstance for testing
 */
function createMockInstance(overrides?: Partial<WorkflowInstance>): WorkflowInstance {
  return {
    id: 'instance-123',
    workflowId: 'workflow-456',
    currentState: 'initial-state',
    status: 'running',
    history: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('EventPublisher Integration Tests', () => {
  let eventBus: EventBus;
  let publisher: EventPublisher;
  let publishedEvents: Event[];

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();

    // Subscribe to capture all events for verification
    publishedEvents = [];
    eventBus.subscribe('*', (event: Event) => {
      publishedEvents.push(event);
    });

    publisher = new EventPublisher({
      projectId: 'integration-test-project',
      eventBus: eventBus as unknown as IEventBus,
      source: 'daemon',
    });
  });

  afterEach(() => {
    eventBus.stop();
    publishedEvents = [];
  });

  describe('Event Bus lifecycle integration', () => {
    it('should publish events to running EventBus', () => {
      const instance = createMockInstance();
      publisher.publishWorkflowStarted(instance, 'initial-state');

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].action).toBe('workflow.started');
    });

    it('should handle publishing to stopped EventBus gracefully', () => {
      const instance = createMockInstance();
      eventBus.stop();

      // This should not throw, but won't deliver events
      publisher.publishWorkflowStarted(instance, 'initial-state');

      expect(publishedEvents).toHaveLength(0);
    });

    it('should support re-starting EventBus after stop', () => {
      const instance = createMockInstance();
      eventBus.stop();
      eventBus.start();

      // Re-subscribe after re-start (subscriptions are cleared on stop)
      eventBus.subscribe('*', (event: Event) => {
        publishedEvents.push(event);
      });

      publisher.publishWorkflowStarted(instance, 'initial-state');

      expect(publishedEvents).toHaveLength(1);
    });
  });

  describe('Workflow lifecycle event integration', () => {
    it('should publish and deliver workflow.started event', () => {
      const instance = createMockInstance();
      publisher.publishWorkflowStarted(instance, 'initial-state');

      const event = publishedEvents.find(e => e.action === 'workflow.started');
      expect(event).toBeDefined();
      expect(event?.payload.instanceId).toBe('instance-123');
      expect(event?.payload.workflowId).toBe('workflow-456');
      expect(event?.projectId).toBe('integration-test-project');
    });

    it('should publish and deliver workflow.completed event', () => {
      const instance = createMockInstance();
      publisher.publishWorkflowCompleted(instance, 'final-state');

      const event = publishedEvents.find(e => e.action === 'workflow.completed');
      expect(event).toBeDefined();
      expect(event?.payload.finalState).toBe('final-state');
    });

    it('should publish and deliver workflow.failed event with error', () => {
      const instance = createMockInstance();
      const errorMessage = 'Gate validation failed: requirements not met';
      publisher.publishWorkflowFailed(instance, errorMessage);

      const event = publishedEvents.find(e => e.action === 'workflow.failed');
      expect(event).toBeDefined();
      expect(event?.payload.error).toBe(errorMessage);
    });

    it('should publish and deliver workflow.paused event with reason', () => {
      const instance = createMockInstance();
      publisher.publishWorkflowPaused(instance, 'User requested pause');

      const event = publishedEvents.find(e => e.action === 'workflow.paused');
      expect(event).toBeDefined();
      expect(event?.payload.reason).toBe('User requested pause');
    });

    it('should publish and deliver workflow.resumed event', () => {
      const instance = createMockInstance();
      publisher.publishWorkflowResumed(instance);

      const event = publishedEvents.find(e => e.action === 'workflow.resumed');
      expect(event).toBeDefined();
    });
  });

  describe('Gate event integration', () => {
    it('should publish gate started event with correct payload', () => {
      const instance = createMockInstance();
      publisher.publishGateStarted(instance, 'requirements-gate', 'req-gate-1', 'simple');

      const event = publishedEvents.find(e => e.action === 'workflow.gate.started');
      expect(event).toBeDefined();
      expect(event?.payload.gateId).toBe('req-gate-1');
      expect(event?.payload.gateType).toBe('simple');
    });

    it('should publish gate completed event with result', () => {
      const instance = createMockInstance();
      const result = { passed: true, reason: 'All requirements satisfied', schema_version: '1.0' };
      publisher.publishGateCompleted(instance, 'requirements-gate', 'req-gate-1', 'simple', result);

      const event = publishedEvents.find(e => e.action === 'workflow.gate.completed');
      expect(event).toBeDefined();
      expect(event?.payload.passed).toBe(true);
      expect(event?.payload.reason).toBe('All requirements satisfied');
    });

    it('should publish gate failed event with error', () => {
      const instance = createMockInstance();
      publisher.publishGateFailed(instance, 'design-gate', 'design-gate-1', 'composite', 'Timeout exceeded');

      const event = publishedEvents.find(e => e.action === 'workflow.gate.failed');
      expect(event).toBeDefined();
      expect(event?.payload.error).toBe('Timeout exceeded');
      expect(event?.payload.gateType).toBe('composite');
    });
  });

  describe('Topic pattern matching', () => {
    it('should support wildcard subscription for all workflow events', () => {
      const workflowEvents: Event[] = [];
      const gateEvents: Event[] = [];

      // Create separate subscriptions for different patterns
      eventBus.subscribe('workflow.*', (event: Event) => {
        workflowEvents.push(event);
      });
      eventBus.subscribe('workflow.gate.*', (event: Event) => {
        gateEvents.push(event);
      });

      const instance = createMockInstance();
      publisher.publishWorkflowStarted(instance, 'state1');
      publisher.publishGateStarted(instance, 'state1', 'gate1', 'simple');

      expect(workflowEvents.length).toBeGreaterThanOrEqual(1);
      expect(gateEvents.length).toBe(1); // Only the gate event should match
    });

    it('should support specific topic subscription', () => {
      const startedEvents: Event[] = [];

      eventBus.subscribe('workflow.started', (event: Event) => {
        startedEvents.push(event);
      });

      const instance = createMockInstance();
      publisher.publishWorkflowStarted(instance, 'state1');
      publisher.publishWorkflowCompleted(instance, 'final');

      expect(startedEvents).toHaveLength(1);
      expect(startedEvents[0].action).toBe('workflow.started');
    });
  });

  describe('Event metadata integration', () => {
    it('should include correct schema version in events', () => {
      const instance = createMockInstance();
      publisher.publishWorkflowStarted(instance, 'initial-state');

      const event = publishedEvents[0];
      expect(event.metadata.schemaVersion).toBe('1.0');
    });

    it('should include correct source in events', () => {
      const customPublisher = new EventPublisher({
        projectId: 'test-project',
        eventBus: eventBus as unknown as IEventBus,
        source: 'client',
      });

      const instance = createMockInstance();
      customPublisher.publishWorkflowStarted(instance, 'initial-state');

      expect(publishedEvents[0].metadata.source).toBe('client');
    });

    it('should include timestamp in events', () => {
      const before = Date.now();
      const instance = createMockInstance();
      publisher.publishWorkflowStarted(instance, 'initial-state');
      const after = Date.now();

      const event = publishedEvents[0];
      expect(event.ts).toBeGreaterThanOrEqual(before);
      expect(event.ts).toBeLessThanOrEqual(after);
    });
  });

  describe('createEventPublisher factory', () => {
    it('should create EventPublisher with EventBus integration', () => {
      const newPublisher = createEventPublisher(
        eventBus as unknown as IEventBus,
        'factory-project',
        'adapter'
      );

      const instance = createMockInstance();
      newPublisher.publishWorkflowStarted(instance, 'state');

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].projectId).toBe('factory-project');
    });

    it('should allow retrieving EventBus instance', () => {
      const newPublisher = createEventPublisher(
        eventBus as unknown as IEventBus,
        'test-project'
      );

      const retrievedBus = newPublisher.getEventBus();
      expect(retrievedBus).toBeDefined();
    });
  });

  describe('State change events', () => {
    it('should publish state changed event', () => {
      const instance = createMockInstance();
      publisher.publishStateChanged(instance, 'old-state', 'new-state', true);

      const event = publishedEvents.find(e => e.action === 'workflow.state_changed');
      expect(event).toBeDefined();
      expect(event?.payload.fromState).toBe('old-state');
      expect(event?.payload.toState).toBe('new-state');
      expect(event?.payload.gatePassed).toBe(true);
    });

    it('should publish state changed event with gate failure', () => {
      const instance = createMockInstance();
      publisher.publishStateChanged(instance, 'state1', 'state2', false);

      const event = publishedEvents.find(e => e.action === 'workflow.state_changed');
      expect(event?.payload.gatePassed).toBe(false);
    });
  });
});