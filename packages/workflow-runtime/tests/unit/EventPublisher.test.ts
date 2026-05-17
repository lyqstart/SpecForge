/**
 * Unit tests for EventPublisher
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EventPublisher,
  createEventPublisher,
} from '../../src/EventPublisher.js';
import { WorkflowInstance, IEventBus, Event, Subscription } from '../../src/types.js';

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
}));

/**
 * Simple mock EventBus for testing
 */
class MockEventBus implements IEventBus {
  private running = false;
  private subscriptions: Map<string, Map<string, (event: Event) => void>> = new Map();
  private idCounter = 0;

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.subscriptions.clear();
  }

  isRunning(): boolean {
    return this.running;
  }

  publish(event: Event): void {
    if (!this.running) {
      console.warn('[MockEventBus] Cannot publish: bus is stopped');
      return;
    }

    for (const handlersMap of this.subscriptions.values()) {
      for (const handler of handlersMap.values()) {
        try {
          handler(event);
        } catch (error) {
          console.error('[MockEventBus] Error in handler:', error);
        }
      }
    }
  }

  subscribe(topic: string, handler: (event: Event) => void): Subscription {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Map());
    }

    const id = 'sub-' + (++this.idCounter);
    this.subscriptions.get(topic)!.set(id, handler);

    return { id, topic, handler };
  }

  unsubscribe(subscription: Subscription): void {
    const handlers = this.subscriptions.get(subscription.topic);
    if (handlers) {
      handlers.delete(subscription.id);
    }
  }
}

describe('EventPublisher', () => {
  let eventBus: MockEventBus;
  let publisher: EventPublisher;
  let publishedEvents: Event[] = [];

  beforeEach(() => {
    eventBus = new MockEventBus();
    eventBus.start();

    // Subscribe to capture events
    eventBus.subscribe('*', (event: Event) => {
      publishedEvents.push(event);
    });

    publisher = new EventPublisher({
      projectId: 'test-project',
      eventBus,
    });
  });

  afterEach(() => {
    eventBus.stop();
    publishedEvents = [];
  });

  describe('Workflow lifecycle events', () => {
    const createMockInstance = (): WorkflowInstance => ({
      id: 'instance-123',
      workflowId: 'workflow-123',
      currentState: 'state-1',
      status: 'running',
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('should publish workflow started event', () => {
      const instance = createMockInstance();

      publisher.publishWorkflowStarted(instance, 'state-1');

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].action).toBe('workflow.started');
      expect(publishedEvents[0].payload.instanceId).toBe('instance-123');
      expect(publishedEvents[0].payload.workflowId).toBe('workflow-123');
      expect(publishedEvents[0].payload.currentState).toBe('state-1');
    });

    it('should publish workflow paused event', () => {
      const instance = createMockInstance();

      publisher.publishWorkflowPaused(instance, 'User requested pause');

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].action).toBe('workflow.paused');
      expect(publishedEvents[0].payload.reason).toBe('User requested pause');
    });

    it('should publish workflow resumed event', () => {
      const instance = createMockInstance();

      publisher.publishWorkflowResumed(instance);

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].action).toBe('workflow.resumed');
    });

    it('should publish workflow completed event', () => {
      const instance = createMockInstance();

      publisher.publishWorkflowCompleted(instance, 'final-state');

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].action).toBe('workflow.completed');
      expect(publishedEvents[0].payload.finalState).toBe('final-state');
    });

    it('should publish workflow failed event', () => {
      const instance = createMockInstance();

      publisher.publishWorkflowFailed(instance, 'Gate validation failed');

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].action).toBe('workflow.failed');
      expect(publishedEvents[0].payload.error).toBe('Gate validation failed');
    });
  });

  describe('Gate execution events', () => {
    const createMockInstance = (): WorkflowInstance => ({
      id: 'instance-123',
      workflowId: 'workflow-123',
      currentState: 'gate-state',
      status: 'running',
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('should publish gate started event', () => {
      const instance = createMockInstance();

      publisher.publishGateStarted(instance, 'gate-state', 'test-gate', 'simple');

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].action).toBe('workflow.gate.started');
      expect(publishedEvents[0].payload.gateId).toBe('test-gate');
      expect(publishedEvents[0].payload.gateType).toBe('simple');
    });

    it('should publish gate completed event with pass result', () => {
      const instance = createMockInstance();
      const gateResult = { passed: true, reason: 'Validation passed' };

      publisher.publishGateCompleted(
        instance,
        'gate-state',
        'test-gate',
        'simple',
        gateResult
      );

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].action).toBe('workflow.gate.completed');
      expect(publishedEvents[0].payload.passed).toBe(true);
      expect(publishedEvents[0].payload.reason).toBe('Validation passed');
    });

    it('should publish gate completed event with fail result', () => {
      const instance = createMockInstance();
      const gateResult = { passed: false, reason: 'Validation failed' };

      publisher.publishGateCompleted(
        instance,
        'gate-state',
        'test-gate',
        'simple',
        gateResult
      );

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].action).toBe('workflow.gate.completed');
      expect(publishedEvents[0].payload.passed).toBe(false);
    });

    it('should publish gate failed event', () => {
      const instance = createMockInstance();

      publisher.publishGateFailed(
        instance,
        'gate-state',
        'test-gate',
        'composite',
        'Execution error: timeout'
      );

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].action).toBe('workflow.gate.failed');
      expect(publishedEvents[0].payload.gateType).toBe('composite');
      expect(publishedEvents[0].payload.error).toBe('Execution error: timeout');
    });
  });

  describe('State change events', () => {
    const createMockInstance = (): WorkflowInstance => ({
      id: 'instance-123',
      workflowId: 'workflow-123',
      currentState: 'new-state',
      status: 'running',
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('should publish state changed event', () => {
      const instance = createMockInstance();

      publisher.publishStateChanged(instance, 'old-state', 'new-state', true);

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].action).toBe('workflow.state_changed');
      expect(publishedEvents[0].payload.fromState).toBe('old-state');
      expect(publishedEvents[0].payload.toState).toBe('new-state');
      expect(publishedEvents[0].payload.gatePassed).toBe(true);
    });
  });

  describe('Event metadata', () => {
    it('should include schema version in event metadata', () => {
      const instance: WorkflowInstance = {
        id: 'instance-123',
        workflowId: 'workflow-123',
        currentState: 'state-1',
        status: 'running',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      publisher.publishWorkflowStarted(instance, 'state-1');

      expect(publishedEvents[0].metadata.schemaVersion).toBe('1.0');
    });

    it('should use configured source in event metadata', () => {
      const customPublisher = new EventPublisher({
        projectId: 'test-project',
        eventBus,
        source: 'client',
      });

      const instance: WorkflowInstance = {
        id: 'instance-123',
        workflowId: 'workflow-123',
        currentState: 'state-1',
        status: 'running',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      customPublisher.publishWorkflowStarted(instance, 'state-1');

      expect(publishedEvents[0].metadata.source).toBe('client');
    });

    it('should use default source when not configured', () => {
      // publisher was created with default source in beforeEach
      expect(publishedEvents).toHaveLength(0);

      const instance: WorkflowInstance = {
        id: 'instance-123',
        workflowId: 'workflow-123',
        currentState: 'state-1',
        status: 'running',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      publisher.publishWorkflowStarted(instance, 'state-1');

      expect(publishedEvents[0].metadata.source).toBe('daemon');
    });

    it('should include project ID in all events', () => {
      const instance: WorkflowInstance = {
        id: 'instance-123',
        workflowId: 'workflow-123',
        currentState: 'state-1',
        status: 'running',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      publisher.publishWorkflowStarted(instance, 'state-1');
      publisher.publishGateStarted(instance, 'state-1', 'test-gate', 'simple');

      expect(publishedEvents[0].projectId).toBe('test-project');
      expect(publishedEvents[1].projectId).toBe('test-project');
    });

    it('should generate unique event IDs', () => {
      const instance: WorkflowInstance = {
        id: 'instance-123',
        workflowId: 'workflow-123',
        currentState: 'state-1',
        status: 'running',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      publisher.publishWorkflowStarted(instance, 'state-1');
      publisher.publishWorkflowCompleted(instance, 'final-state');

      expect(publishedEvents[0].eventId).toBeDefined();
      expect(publishedEvents[1].eventId).toBeDefined();
      expect(publishedEvents[0].eventId).not.toBe(publishedEvents[1].eventId);
    });

    it('should include timestamp in events', () => {
      const instance: WorkflowInstance = {
        id: 'instance-123',
        workflowId: 'workflow-123',
        currentState: 'state-1',
        status: 'running',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      publisher.publishWorkflowStarted(instance, 'state-1');

      expect(publishedEvents[0].ts).toBeDefined();
      expect(typeof publishedEvents[0].ts).toBe('number');
    });
  });

  describe('createEventPublisher factory', () => {
    it('should create EventPublisher with default source', () => {
      const newPublisher = createEventPublisher(eventBus, 'factory-project');

      expect(newPublisher).toBeInstanceOf(EventPublisher);
      expect(newPublisher.getProjectId()).toBe('factory-project');
    });

    it('should create EventPublisher with custom source', () => {
      const newPublisher = createEventPublisher(
        eventBus,
        'factory-project',
        'adapter'
      );

      expect(newPublisher).toBeInstanceOf(EventPublisher);
    });

    it('should return the EventBus instance', () => {
      const newPublisher = createEventPublisher(eventBus, 'factory-project');

      expect(newPublisher.getEventBus()).toBe(eventBus);
    });
  });
});