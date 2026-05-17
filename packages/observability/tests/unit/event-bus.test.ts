import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/event-bus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('Mode Management', () => {
    it('should have standard mode by default', () => {
      expect(eventBus.getMode()).toBe('standard');
    });

    it('should allow mode switching', () => {
      eventBus.setMode('minimal');
      expect(eventBus.getMode()).toBe('minimal');
      
      eventBus.setMode('deep');
      expect(eventBus.getMode()).toBe('deep');
      
      eventBus.setMode('standard');
      expect(eventBus.getMode()).toBe('standard');
    });
  });

  describe('Event Emission', () => {
    it('should emit events without throwing', async () => {
      await expect(eventBus.emit({
        projectId: 'test-project',
        workItemId: 'test-workitem',
        actor: { id: 'test-agent', name: 'Test Agent', type: 'agent' },
        category: 'workflow',
        action: 'workflow.started',
        payload: { workflowId: 'test-workflow' }
      })).resolves.not.toThrow();
    });
  });

  describe('Event Subscription', () => {
    it('should allow subscribing to events', async () => {
      const subscription = eventBus.subscribe('workflow.*');
      expect((eventBus as any)._getSubscriberCount()).toBe(1);
      
      // Clean up subscription
      await subscription[Symbol.asyncIterator]().return?.();
      expect((eventBus as any)._getSubscriberCount()).toBe(0);
    });

    it('should receive matching events', async () => {
      const receivedEvents: any[] = [];
      const subscription = eventBus.subscribe('workflow.*');
      
      // Start listening
      const iterator = subscription[Symbol.asyncIterator]();
      const listenPromise = (async () => {
        const result = await iterator.next();
        if (!result.done) {
          receivedEvents.push(result.value);
        }
      })();

      // Emit matching event
      await eventBus.emit({
        projectId: 'test-project',
        workItemId: 'test-workitem',
        actor: null,
        category: 'workflow',
        action: 'workflow.started',
        payload: { workflowId: 'test-workflow' }
      });

      // Wait for event
      await listenPromise;
      
      expect(receivedEvents).toHaveLength(1);
      
      // Clean up
      await iterator.return?.();
    });
  });
});