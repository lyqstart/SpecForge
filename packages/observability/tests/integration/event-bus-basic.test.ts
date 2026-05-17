import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/event-bus';

describe('EventBus Basic Integration', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should emit and receive events', async () => {
    const receivedEvents: any[] = [];
    
    // Subscribe to all events
    const subscription = eventBus.subscribe('*.*');
    const iterator = subscription[Symbol.asyncIterator]();
    
    // Start listening in background
    const listenPromise = (async () => {
      const result = await iterator.next();
      if (!result.done) {
        receivedEvents.push(result.value);
      }
    })();

    // Emit an event
    await eventBus.emit({
      projectId: 'test-project',
      workItemId: 'test-workitem',
      actor: { id: 'agent-1', name: 'Test Agent', type: 'agent' },
      category: 'workflow',
      action: 'workflow.started',
      payload: { workflowId: 'test-workflow' }
    });

    // Wait for event
    await listenPromise;
    
    // Clean up
    await iterator.return?.();
    
    expect(receivedEvents).toHaveLength(1);
    const event = receivedEvents[0];
    expect(event.category).toBe('workflow');
    expect(event.action).toBe('workflow.started');
    expect(event.projectId).toBe('test-project');
  });

  it('should support mode switching', () => {
    expect(eventBus.getMode()).toBe('standard');
    
    eventBus.setMode('minimal');
    expect(eventBus.getMode()).toBe('minimal');
    
    eventBus.setMode('deep');
    expect(eventBus.getMode()).toBe('deep');
    
    eventBus.setMode('standard');
    expect(eventBus.getMode()).toBe('standard');
  });

  it('should create events with required properties', async () => {
    const receivedEvents: any[] = [];
    const subscription = eventBus.subscribe('system.*');
    const iterator = subscription[Symbol.asyncIterator]();
    
    const listenPromise = (async () => {
      const result = await iterator.next();
      if (!result.done) {
        receivedEvents.push(result.value);
      }
    })();

    await eventBus.emit({
      projectId: 'test-project',
      workItemId: 'test-workitem',
      actor: null,
      category: 'system',
      action: 'system.test',
      payload: { data: 'test' }
    });

    await listenPromise;
    await iterator.return?.();
    
    expect(receivedEvents).toHaveLength(1);
    const event = receivedEvents[0];
    
    // Verify all required properties are present
    expect(event).toMatchObject({
      schema_version: '1.0',
      projectId: 'test-project',
      workItemId: 'test-workitem',
      category: 'system',
      action: 'system.test',
      payload: { data: 'test' }
    });
    
    // Verify generated properties
    expect(event.eventId).toBeDefined();
    expect(typeof event.eventId).toBe('string');
    expect(event.ts).toBeGreaterThan(0);
    expect(typeof event.monotonicSeq).toBe('number');
  });
});