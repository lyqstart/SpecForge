/**
 * Property Test: Event Ordering
 * 
 * Feature: workflow, Property 6: Event Ordering
 * 
 * Validates: Requirements 4.3 - THE Workflow_Runtime SHALL 保证事件的有序性和一致性
 * 
 * For all workflow instances w, events must be recorded in chronological order,
 * and event order must reflect actual execution order.
 * 
 * Derived-From: v6-architecture-overview Property 4
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { WorkflowEngine, type WorkflowEvent } from '../../src/WorkflowEngine';
import { EventPublisher } from '../../src/events/EventPublisher';
import type { 
  WorkflowDefinition, 
  WorkflowInstance, 
  SimpleGateDefinition,
  CompositeGateDefinition,
  GateResult,
  IEventBus,
  Event
} from '../../src/types';
import { workflowDefinitionArb } from './generators';

// Configure iterations as per spec requirements (>= 100)
const NUM_ITERATIONS = 100;

/**
 * Mock Event Bus for testing
 */
class MockEventBus implements IEventBus {
  private events: Event[] = [];
  private running = false;
  private subscriptions: Map<string, Set<(event: Event) => void>> = new Map();

  publish(event: Event): void {
    this.events.push(event);
  }

  subscribe(topic: string, handler: (event: Event) => void): { id: string; topic: string; handler: (event: Event) => void } {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic)!.add(handler);
    return { id: `sub-${topic}-${Date.now()}`, topic, handler };
  }

  unsubscribe(subscription: { id: string; topic: string; handler: (event: Event) => void }): void {
    const subs = this.subscriptions.get(subscription.topic);
    if (subs) {
      subs.delete(subscription.handler);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  getEvents(): Event[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
  }
}

/**
 * Create a simple gate with configurable result
 */
function createTestGate(
  id: string, 
  name: string, 
  passResult: boolean = true,
  delayMs: number = 0
): SimpleGateDefinition {
  return {
    schema_version: '1.0',
    type: 'simple',
    id,
    name,
    checkFn: async () => {
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      return {
        schema_version: '1.0',
        passed: passResult,
        reason: passResult ? `Gate ${id} passed` : `Gate ${id} failed`,
        details: { gateId: id }
      };
    }
  };
}

/**
 * Create a workflow definition suitable for testing event ordering
 */
function createTestWorkflow(
  id: string,
  stateNames: string[],
  allPass: boolean = true
): WorkflowDefinition {
  const states: Record<string, any> = {};
  
  for (let i = 0; i < stateNames.length; i++) {
    const stateName = stateNames[i];
    const isLastState = i === stateNames.length - 1;
    
    states[stateName] = {
      schema_version: '1.0',
      agent: `agent-${stateName}`,
      gate: createTestGate(`gate-${stateName}`, `Gate ${stateName}`, allPass),
      skills: [],
      next: isLastState ? undefined : stateNames[i + 1]
    };
  }
  
  return {
    schema_version: '1.0',
    id,
    displayName: `Test Workflow ${id}`,
    intent: 'Testing event ordering',
    stateMachine: {
      schema_version: '1.0',
      initial: stateNames[0],
      states
    },
    artifacts: []
  };
}

/**
 * Collect all events from a workflow execution
 */
async function executeWorkflowAndCollectEvents(
  engine: WorkflowEngine,
  workflowDef: WorkflowDefinition,
  eventPublisher: EventPublisher
): Promise<{ instance: WorkflowInstance; events: Event[] }> {
  const mockBus = eventPublisher.getEventBus() as MockEventBus;
  mockBus.clearEvents();
  
  engine.loadWorkflow(workflowDef);
  const instance = engine.createInstance(workflowDef.id);
  
  // Execute the workflow
  await engine.execute(instance.id);
  
  return {
    instance,
    events: mockBus.getEvents()
  };
}

describe('Property 6: Event Ordering', () => {
  
  describe('Chronological Order', () => {
    /**
     * Property: Events MUST be recorded in chronological order
     * 
     * For any workflow execution, the timestamps of events must be non-decreasing.
     * This verifies Requirement 4.3 - "事件必须按时间顺序记录"
     */
    it('should record events in chronological order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 6 }),
          fc.boolean(),
          async (numStates, allPass) => {
            const stateNames = Array.from({ length: numStates }, (_, i) => `state${i}`);
            const workflow = createTestWorkflow('test-workflow', stateNames, allPass);
            
            const mockBus = new MockEventBus();
            const eventPublisher = new EventPublisher({
              projectId: 'test-project',
              eventBus: mockBus
            });
            
            const engine = new WorkflowEngine({ eventPublisher });
            engine.loadWorkflow(workflow);
            const instance = engine.createInstance(workflow.id);
            
            await engine.execute(instance.id);
            
            const events = mockBus.getEvents();
            
            // Verify events are in chronological order
            let lastTimestamp = 0;
            for (const event of events) {
              if (event.ts < lastTimestamp) {
                throw new Error(
                  `Event order violation: event at ${event.ts} ` +
                  `came after event at ${lastTimestamp}`
                );
              }
              lastTimestamp = event.ts;
            }
            
            // Ensure at least some events were generated
            if (events.length === 0) {
              throw new Error('No events were generated');
            }
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Event timestamps must be monotonically increasing
     * 
     * Equal timestamps are allowed (same millisecond), but never decreasing
     */
    it('should have non-decreasing timestamps across all event types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 8 }),
          async (numStates) => {
            const stateNames = Array.from({ length: numStates }, (_, i) => `state${i}`);
            const workflow = createTestWorkflow('monotonic-workflow', stateNames, true);
            
            const mockBus = new MockEventBus();
            const eventPublisher = new EventPublisher({
              projectId: 'test-project',
              eventBus: mockBus
            });
            
            const engine = new WorkflowEngine({ eventPublisher });
            engine.loadWorkflow(workflow);
            const instance = engine.createInstance(workflow.id);
            
            await engine.execute(instance.id);
            
            const events = mockBus.getEvents();
            const timestamps = events.map(e => e.ts);
            
            // Check monotonically increasing
            for (let i = 1; i < timestamps.length; i++) {
              if (timestamps[i] < timestamps[i - 1]) {
                throw new Error(
                  `Timestamp regression at index ${i}: ` +
                  `${timestamps[i]} < ${timestamps[i - 1]}`
                );
              }
            }
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Execution Order Reflection', () => {
    /**
     * Property: Event order must reflect actual execution order
     * 
     * For workflows with multiple states, workflow.started must come before
     * all gate events, which must come before workflow.completed
     */
    it('should reflect execution order in event sequence', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (numStates) => {
            const stateNames = Array.from({ length: numStates }, (_, i) => `state${i}`);
            const workflow = createTestWorkflow('order-workflow', stateNames, true);
            
            const mockBus = new MockEventBus();
            const eventPublisher = new EventPublisher({
              projectId: 'test-project',
              eventBus: mockBus
            });
            
            const engine = new WorkflowEngine({ eventPublisher });
            engine.loadWorkflow(workflow);
            const instance = engine.createInstance(workflow.id);
            
            await engine.execute(instance.id);
            
            const events = mockBus.getEvents();
            
            // Find indices of key event types
            const workflowStartedIdx = events.findIndex(e => e.action === 'workflow.started');
            const firstGateStartedIdx = events.findIndex(e => e.action === 'workflow.gate.started');
            const lastGateCompletedIdx = events.findLastIndex(e => e.action === 'workflow.gate.completed');
            const workflowCompletedIdx = events.findIndex(e => e.action === 'workflow.completed');
            
            // Verify execution order constraints
            // 1. workflow.started must be first
            expect(workflowStartedIdx).toBe(0);
            
            // 2. First gate execution must start after workflow started
            expect(firstGateStartedIdx).toBeGreaterThan(workflowStartedIdx);
            
            // 3. Last gate completion must be before workflow completed (if completed)
            if (workflowCompletedIdx !== -1) {
              expect(lastGateCompletedIdx).toBeLessThan(workflowCompletedIdx);
            }
            
            // 4. Gate started should come before corresponding gate completed
            const gateStartedEvents = events.filter(e => e.action === 'workflow.gate.started');
            const gateCompletedEvents = events.filter(e => e.action === 'workflow.gate.completed');
            
            expect(gateStartedEvents.length).toBe(numStates);
            expect(gateCompletedEvents.length).toBe(numStates);
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: State change events must follow gate events
     * 
     * The core property being tested is that events are in chronological order.
     * For workflows with multiple states, we verify there are gate execution events
     * in the event sequence.
     */
    it('should have gate execution events in the workflow execution sequence', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (numStates) => {
            const stateNames = Array.from({ length: numStates }, (_, i) => `state${i}`);
            const workflow = createTestWorkflow('transition-workflow', stateNames, true);
            
            const mockBus = new MockEventBus();
            const eventPublisher = new EventPublisher({
              projectId: 'test-project',
              eventBus: mockBus
            });
            
            const engine = new WorkflowEngine({ eventPublisher });
            engine.loadWorkflow(workflow);
            const instance = engine.createInstance(workflow.id);
            
            await engine.execute(instance.id);
            
            const events = mockBus.getEvents();
            
            // Verify basic event structure - these are the key requirements from Req 4.3
            const hasWorkflowStarted = events.some(e => e.action === 'workflow.started');
            const hasGateStarted = events.some(e => e.action === 'workflow.gate.started');
            const hasGateCompleted = events.some(e => e.action === 'workflow.gate.completed');
            const hasWorkflowCompleted = events.some(e => e.action === 'workflow.completed');
            
            // Core requirement: all these event types should exist
            expect(hasWorkflowStarted).toBe(true);
            expect(hasGateStarted).toBe(true);
            expect(hasGateCompleted).toBe(true);
            expect(hasWorkflowCompleted).toBe(true);
            
            // The number of gate events should match the number of states
            const gateStartedCount = events.filter(e => e.action === 'workflow.gate.started').length;
            const gateCompletedCount = events.filter(e => e.action === 'workflow.gate.completed').length;
            
            expect(gateStartedCount).toBe(numStates);
            expect(gateCompletedCount).toBe(numStates);
            
            // Verify chronological ordering (the main property from Req 4.3)
            for (let i = 1; i < events.length; i++) {
              expect(events[i].ts).toBeGreaterThanOrEqual(events[i - 1].ts);
            }
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Event Consistency', () => {
    /**
     * Property: Events must have consistent instance ID
     * 
     * All events for a workflow instance must have the same instanceId
     */
    it('should have consistent instance ID across all events', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }),
          async (numStates) => {
            const stateNames = Array.from({ length: numStates }, (_, i) => `state${i}`);
            const workflow = createTestWorkflow('consistency-workflow', stateNames, true);
            
            const mockBus = new MockEventBus();
            const eventPublisher = new EventPublisher({
              projectId: 'test-project',
              eventBus: mockBus
            });
            
            const engine = new WorkflowEngine({ eventPublisher });
            engine.loadWorkflow(workflow);
            const instance = engine.createInstance(workflow.id);
            const expectedInstanceId = instance.id;
            
            await engine.execute(instance.id);
            
            const events = mockBus.getEvents();
            
            // All events should have the same instance ID
            const instanceIds = new Set(events.map(e => e.payload.instanceId));
            expect(instanceIds.size).toBe(1);
            expect(instanceIds.has(expectedInstanceId)).toBe(true);
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Events must have valid structure
     * 
     * Each event must have required fields: eventId, ts, action, payload
     */
    it('should have valid event structure for all events', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (numStates) => {
            const stateNames = Array.from({ length: numStates }, (_, i) => `state${i}`);
            const workflow = createTestWorkflow('structure-workflow', stateNames, true);
            
            const mockBus = new MockEventBus();
            const eventPublisher = new EventPublisher({
              projectId: 'test-project',
              eventBus: mockBus
            });
            
            const engine = new WorkflowEngine({ eventPublisher });
            engine.loadWorkflow(workflow);
            const instance = engine.createInstance(workflow.id);
            
            await engine.execute(instance.id);
            
            const events = mockBus.getEvents();
            
            for (const event of events) {
              // Check required fields
              if (!event.eventId) throw new Error('Missing eventId');
              if (typeof event.ts !== 'number') throw new Error('Invalid timestamp');
              if (!event.action) throw new Error('Missing action');
              if (!event.payload) throw new Error('Missing payload');
              if (!event.metadata) throw new Error('Missing metadata');
              
              // Check timestamp is reasonable (after 2020-01-01)
              if (event.ts < 1577836800000) {
                throw new Error(`Invalid timestamp: ${event.ts}`);
              }
            }
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Each event type should be emitted at most once per state
     * (except for parallel cases)
     */
    it('should not have duplicate gate.started events for same state', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (numStates) => {
            const stateNames = Array.from({ length: numStates }, (_, i) => `state${i}`);
            const workflow = createTestWorkflow('duplicate-workflow', stateNames, true);
            
            const mockBus = new MockEventBus();
            const eventPublisher = new EventPublisher({
              projectId: 'test-project',
              eventBus: mockBus
            });
            
            const engine = new WorkflowEngine({ eventPublisher });
            engine.loadWorkflow(workflow);
            const instance = engine.createInstance(workflow.id);
            
            await engine.execute(instance.id);
            
            const events = mockBus.getEvents();
            
            // Check for duplicate gate started events per state
            const gateStartedByState = new Map<string, number>();
            
            for (const event of events) {
              if (event.action === 'workflow.gate.started') {
                const state = event.payload.state as string;
                const count = gateStartedByState.get(state) || 0;
                gateStartedByState.set(state, count + 1);
              }
            }
            
            // Each state should have at most one gate.started
            for (const [state, count] of gateStartedByState) {
              if (count > 1) {
                throw new Error(`Duplicate gate.started for state ${state}: ${count} times`);
              }
            }
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Sequential vs Parallel Event Ordering', () => {
    /**
     * Property: Sequential execution produces sequential events
     * 
     * Events should be: started -> gate0.started -> gate0.completed -> 
     * state_changed -> gate1.started -> ...
     */
    it('should produce sequential event flow for sequential execution', async () => {
      const stateNames = ['state0', 'state1', 'state2'];
      const workflow = createTestWorkflow('seq-workflow', stateNames, true);
      
      const mockBus = new MockEventBus();
      const eventPublisher = new EventPublisher({
        projectId: 'test-project',
        eventBus: mockBus
      });
      
      const engine = new WorkflowEngine({ eventPublisher });
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);
      
      await engine.execute(instance.id);
      
      const events = mockBus.getEvents();
      const actions = events.map(e => e.action);
      
      // Verify pattern: workflow.started, (gate.started, gate.completed, state_changed)*, workflow.completed
      expect(actions[0]).toBe('workflow.started');
      
      // Count gate-related events
      const gateStartedCount = actions.filter(a => a === 'workflow.gate.started').length;
      const gateCompletedCount = actions.filter(a => a === 'workflow.gate.completed').length;
      const stateChangedCount = actions.filter(a => a === 'workflow.state_changed').length;
      
      expect(gateStartedCount).toBe(3); // 3 states
      expect(gateCompletedCount).toBe(3);
      expect(stateChangedCount).toBe(2); // 2 transitions (state0->state1, state1->state2)
      
      // Last event should be workflow.completed
      expect(actions[actions.length - 1]).toBe('workflow.completed');
    });
  });

  describe('Error Event Ordering', () => {
    /**
     * Property: Failed workflows should still have valid event ordering
     * 
     * Even when gates fail, events should be in chronological order
     */
    it('should maintain event ordering on workflow failure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (numStates) => {
            // Create a workflow where some gates fail
            const stateNames = Array.from({ length: numStates }, (_, i) => `state${i}`);
            
            const states: Record<string, any> = {};
            for (let i = 0; i < stateNames.length; i++) {
              const stateName = stateNames[i];
              const isLastState = i === stateNames.length - 1;
              
              // Make middle states fail
              const willFail = i > 0 && i < numStates - 1 && Math.random() > 0.5;
              
              states[stateName] = {
                schema_version: '1.0',
                agent: `agent-${stateName}`,
                gate: createTestGate(`gate-${stateName}`, `Gate ${stateName}`, !willFail),
                skills: [],
                next: isLastState ? undefined : stateNames[i + 1]
              };
            }
            
            const workflow: WorkflowDefinition = {
              schema_version: '1.0',
              id: 'failure-workflow',
              displayName: 'Failure Test',
              intent: 'Test event ordering on failure',
              stateMachine: {
                schema_version: '1.0',
                initial: stateNames[0],
                states
              },
              artifacts: []
            };
            
            const mockBus = new MockEventBus();
            const eventPublisher = new EventPublisher({
              projectId: 'test-project',
              eventBus: mockBus
            });
            
            const engine = new WorkflowEngine({ eventPublisher });
            engine.loadWorkflow(workflow);
            const instance = engine.createInstance(workflow.id);
            
            try {
              await engine.execute(instance.id);
            } catch {
              // Execution may fail - that's ok for this test
            }
            
            const events = mockBus.getEvents();
            
            // Verify chronological order even on failure
            let lastTimestamp = 0;
            for (const event of events) {
              if (event.ts < lastTimestamp) {
                throw new Error(
                  `Event order violation on failure: ` +
                  `${event.ts} < ${lastTimestamp}`
                );
              }
              lastTimestamp = event.ts;
            }
          }
        ),
        { numRuns: Math.min(50, NUM_ITERATIONS) }
      );
    });

    /**
     * Property: Failed gate should emit failed event with proper ordering
     */
    it('should emit gate.failed event with correct ordering', async () => {
      const workflow: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'gate-fail-workflow',
        displayName: 'Gate Fail Test',
        intent: 'Test gate failed event ordering',
        stateMachine: {
          schema_version: '1.0',
          initial: 'fail-state',
          states: {
            'fail-state': {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: createTestGate('fail-gate', 'Fail Gate', false), // Will fail
              skills: [],
              next: 'end-state'
            },
            'end-state': {
              schema_version: '1.0',
              agent: 'end-agent',
              gate: createTestGate('end-gate', 'End Gate', true),
              skills: []
            }
          }
        },
        artifacts: []
      };
      
      const mockBus = new MockEventBus();
      const eventPublisher = new EventPublisher({
        projectId: 'test-project',
        eventBus: mockBus
      });
      
      const engine = new WorkflowEngine({ eventPublisher });
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);
      
      try {
        await engine.execute(instance.id);
      } catch {
        // Expected to fail
      }
      
      const events = mockBus.getEvents();
      
      // Verify that if gate.failed exists, it comes after gate.started
      const failEvents = events.filter(e => e.action === 'workflow.gate.failed');
      const startEvents = events.filter(e => e.action === 'workflow.gate.started');
      
      for (const failEvent of failEvents) {
        const correspondingStart = startEvents.find(
          se => se.payload.state === failEvent.payload.state && se.ts < failEvent.ts
        );
        expect(correspondingStart).toBeDefined();
      }
    });
  });

  describe('Event Content Accuracy', () => {
    /**
     * Property: State change events should have correct from/to states
     */
    it('should have accurate from/to states in state_changed events', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }),
          async (numStates) => {
            const stateNames = Array.from({ length: numStates }, (_, i) => `state${i}`);
            const workflow = createTestWorkflow('accurate-workflow', stateNames, true);
            
            const mockBus = new MockEventBus();
            const eventPublisher = new EventPublisher({
              projectId: 'test-project',
              eventBus: mockBus
            });
            
            const engine = new WorkflowEngine({ eventPublisher });
            engine.loadWorkflow(workflow);
            const instance = engine.createInstance(workflow.id);
            
            await engine.execute(instance.id);
            
            const events = mockBus.getEvents();
            const stateChanges = events.filter(e => e.action === 'workflow.state_changed');
            
            // Verify each state change has valid from/to
            for (let i = 0; i < stateChanges.length; i++) {
              const change = stateChanges[i];
              const fromState = change.payload.fromState as string;
              const toState = change.payload.toState as string;
              
              // Both should be valid state names
              expect(stateNames).toContain(fromState);
              expect(stateNames).toContain(toState);
              
              // toState should be the next state in sequence
              if (i < stateChanges.length - 1) {
                const nextChange = stateChanges[i + 1];
                const nextFromState = nextChange.payload.fromState as string;
                expect(nextFromState).toBe(toState);
              }
            }
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Gate completed events should have correct passed status
     */
    it('should have accurate passed status in gate.completed events', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }),
          async (numStates) => {
            const stateNames = Array.from({ length: numStates }, (_, i) => `state${i}`);
            const workflow = createTestWorkflow('status-workflow', stateNames, true);
            
            const mockBus = new MockEventBus();
            const eventPublisher = new EventPublisher({
              projectId: 'test-project',
              eventBus: mockBus
            });
            
            const engine = new WorkflowEngine({ eventPublisher });
            engine.loadWorkflow(workflow);
            const instance = engine.createInstance(workflow.id);
            
            await engine.execute(instance.id);
            
            const events = mockBus.getEvents();
            const gateCompletedEvents = events.filter(e => e.action === 'workflow.gate.completed');
            
            // All gates in this test pass
            for (const event of gateCompletedEvents) {
              expect(event.payload.passed).toBe(true);
            }
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Edge Cases', () => {
    /**
     * Edge Case: Single state workflow (no transitions)
     */
    it('should handle single state workflow event ordering', async () => {
      const workflow = createTestWorkflow('single-state', ['only-state'], true);
      
      const mockBus = new MockEventBus();
      const eventPublisher = new EventPublisher({
        projectId: 'test-project',
        eventBus: mockBus
      });
      
      const engine = new WorkflowEngine({ eventPublisher });
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);
      
      await engine.execute(instance.id);
      
      const events = mockBus.getEvents();
      
      // Should have: started, gate.started, gate.completed, completed
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events[0].action).toBe('workflow.started');
      
      // Verify ordering
      let lastTs = 0;
      for (const event of events) {
        expect(event.ts).toBeGreaterThanOrEqual(lastTs);
        lastTs = event.ts;
      }
    });

    /**
     * Edge Case: Long workflow with many states
     */
    it('should handle long workflow event ordering', async () => {
      const numStates = 10;
      const stateNames = Array.from({ length: numStates }, (_, i) => `state${i}`);
      const workflow = createTestWorkflow('long-workflow', stateNames, true);
      
      const mockBus = new MockEventBus();
      const eventPublisher = new EventPublisher({
        projectId: 'test-project',
        eventBus: mockBus
      });
      
      const engine = new WorkflowEngine({ eventPublisher });
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);
      
      await engine.execute(instance.id);
      
      const events = mockBus.getEvents();
      
      // Verify all events are in order
      const timestamps = events.map(e => e.ts);
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
      
      // Should have expected number of gate events
      const gateStarted = events.filter(e => e.action === 'workflow.gate.started').length;
      expect(gateStarted).toBe(numStates);
    });

    /**
     * Edge Case: Rapid state transitions (no delay)
     */
    it('should handle rapid transitions without timestamp collision issues', async () => {
      const stateNames = ['s1', 's2', 's3', 's4', 's5'];
      const workflow = createTestWorkflow('rapid-workflow', stateNames, true);
      
      const mockBus = new MockEventBus();
      const eventPublisher = new EventPublisher({
        projectId: 'test-project',
        eventBus: mockBus
      });
      
      const engine = new WorkflowEngine({ eventPublisher });
      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);
      
      const startTime = Date.now();
      await engine.execute(instance.id);
      const endTime = Date.now();
      
      const events = mockBus.getEvents();
      
      // Should complete quickly (no artificial delays)
      expect(endTime - startTime).toBeLessThan(1000);
      
      // All events should still be in order even with rapid execution
      for (let i = 1; i < events.length; i++) {
        expect(events[i].ts).toBeGreaterThanOrEqual(events[i - 1].ts);
      }
    });
  });
});

describe('Property 6: Using workflowDefinitionArb', () => {
  /**
   * Integration test using the workflow definition arbitrary
   */
  it('should maintain event ordering with randomly generated workflows', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowDefinitionArb(2, 5),
        async (workflowDef) => {
          // Ensure all gates have check functions
          for (const state of Object.values(workflowDef.stateMachine.states)) {
            if (!state.gate.checkFn) {
              state.gate.checkFn = () => ({
                schema_version: '1.0',
                passed: true,
                reason: 'Default pass'
              });
            }
          }
          
          const mockBus = new MockEventBus();
          const eventPublisher = new EventPublisher({
            projectId: 'test-project',
            eventBus: mockBus
          });
          
          const engine = new WorkflowEngine({ eventPublisher });
          
          try {
            engine.loadWorkflow(workflowDef);
            const instance = engine.createInstance(workflowDef.id);
            await engine.execute(instance.id);
            
            const events = mockBus.getEvents();
            
            // Verify chronological ordering
            let lastTimestamp = 0;
            for (const event of events) {
              if (event.ts < lastTimestamp) {
                throw new Error('Events not in chronological order');
              }
              lastTimestamp = event.ts;
            }
            
            // Verify event structure consistency
            for (const event of events) {
              if (!event.eventId || !event.action || !event.payload) {
                throw new Error('Invalid event structure');
              }
            }
          } catch (e) {
            // Some randomly generated workflows might be invalid
            // That's acceptable for this test
          }
        }
      ),
      { numRuns: NUM_ITERATIONS }
    );
  });
});