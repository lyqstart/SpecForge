/**
 * Event Bus unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from './EventBus';
import { Event } from '../types';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should start and stop', () => {
    expect(() => eventBus.start()).not.toThrow();
    expect(eventBus.isRunning()).toBe(true);

    expect(() => eventBus.stop()).not.toThrow();
    expect(eventBus.isRunning()).toBe(false);
  });

  it('should publish and subscribe to events', async () => {
    let handlerCalled = false;
    let receivedEvent: Event | null = null;

    eventBus.start();

    eventBus.subscribe('test.event', event => {
      handlerCalled = true;
      receivedEvent = event;
    });

    const event: Event = {
      eventId: '1',
      ts: Date.now(),
      projectId: 'test',
      action: 'test.event',
      payload: { key: 'value' },
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };

    await eventBus.publish(event);
    expect(handlerCalled).toBe(true);
    expect(receivedEvent).toEqual(event);
  });

  it('should not publish when stopped', async () => {
    let handlerCalled = false;

    eventBus.subscribe('test.event', () => {
      handlerCalled = true;
    });

    const event: Event = {
      eventId: '1',
      ts: Date.now(),
      projectId: 'test',
      action: 'test.event',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };

    await eventBus.publish(event);
    expect(handlerCalled).toBe(false);
  });

  it('should support topic pattern matching with wildcard', async () => {
    let handlerCalled = false;

    eventBus.start();
    eventBus.subscribe('session.*', () => {
      handlerCalled = true;
    });

    // Should match
    const event1: Event = {
      eventId: '1',
      ts: Date.now(),
      projectId: 'test',
      action: 'session.created',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };

    await eventBus.publish(event1);
    expect(handlerCalled).toBe(true);
  });

  it('should support multiple wildcard levels', async () => {
    const events: Event[] = [];

    eventBus.start();
    eventBus.subscribe('project.*.*', event => {
      events.push(event);
    });

    // Should match
    const event1: Event = {
      eventId: '1',
      ts: Date.now(),
      projectId: 'test',
      action: 'project.created',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };

    const event2: Event = {
      eventId: '2',
      ts: Date.now(),
      projectId: 'test',
      action: 'project.updated',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };

    await eventBus.publish(event1);
    await eventBus.publish(event2);

    expect(events.length).toBe(2);
  });

  it('should support global wildcard *', async () => {
    const events: Event[] = [];

    eventBus.start();
    eventBus.subscribe('*', event => {
      events.push(event);
    });

    const event1: Event = {
      eventId: '1',
      ts: Date.now(),
      projectId: 'test',
      action: 'session.created',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };

    const event2: Event = {
      eventId: '2',
      ts: Date.now(),
      projectId: 'test',
      action: 'project.updated',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };

    await eventBus.publish(event1);
    await eventBus.publish(event2);

    expect(events.length).toBe(2);
  });

  it('should support unsubscribe', async () => {
    let handlerCalled = false;

    eventBus.start();
    const subscription = eventBus.subscribe('test.event', () => {
      handlerCalled = true;
    });

    await eventBus.publish({
      eventId: '1',
      ts: Date.now(),
      projectId: 'test',
      action: 'test.event',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    });

    expect(handlerCalled).toBe(true);

    // Reset and unsubscribe
    handlerCalled = false;
    eventBus.unsubscribe(subscription);

    await eventBus.publish({
      eventId: '2',
      ts: Date.now(),
      projectId: 'test',
      action: 'test.event',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    });

    expect(handlerCalled).toBe(false);
  });

  it('should support multiple handlers for same topic', async () => {
    let handler1Called = false;
    let handler2Called = false;

    eventBus.start();

    eventBus.subscribe('test.event', () => {
      handler1Called = true;
    });

    eventBus.subscribe('test.event', () => {
      handler2Called = true;
    });

    await eventBus.publish({
      eventId: '1',
      ts: Date.now(),
      projectId: 'test',
      action: 'test.event',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    });

    expect(handler1Called).toBe(true);
    expect(handler2Called).toBe(true);
  });

  it('should handle errors in handlers gracefully', async () => {
    let handler1Called = false;
    let handler2Called = false;

    eventBus.start();

    eventBus.subscribe('test.event', () => {
      handler1Called = true;
      throw new Error('Test error');
    });

    eventBus.subscribe('test.event', () => {
      handler2Called = true;
    });

    await expect(
      eventBus.publish({
        eventId: '1',
        ts: Date.now(),
        projectId: 'test',
        action: 'test.event',
        payload: {},
        metadata: {
          schemaVersion: '1.0',
          source: 'daemon',
        },
      })
    ).resolves.toBeUndefined();

    expect(handler1Called).toBe(true);
    expect(handler2Called).toBe(true);
  });

  it('should support observability hooks', async () => {
    const logs: string[] = [];

    eventBus.addObservabilityHook({
      onPublish: event => {
        logs.push(`publish:${event.action}`);
      },
      onSubscribe: topic => {
        logs.push(`subscribe:${topic}`);
      },
      onUnsubscribe: topic => {
        logs.push(`unsubscribe:${topic}`);
      },
    });

    eventBus.start();

    const subscription = eventBus.subscribe('test.event', () => {});

    await eventBus.publish({
      eventId: '1',
      ts: Date.now(),
      projectId: 'test',
      action: 'test.event',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    });

    eventBus.unsubscribe(subscription);

    expect(logs).toContain('publish:test.event');
    expect(logs).toContain('subscribe:test.event');
    expect(logs).toContain('unsubscribe:test.event');
  });
});
