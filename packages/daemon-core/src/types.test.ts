/**
 * Type definitions tests
 */

import { describe, it, expect } from 'vitest';
import { AgentIdentity, Event, ProjectState, HandshakeFile, Lock, Subscription } from './types';

describe('Types', () => {
  it('should create AgentIdentity', () => {
    const identity: AgentIdentity = {
      sessionId: 'session-123',
      agentRole: 'sf-orchestrator',
      workflowRole: 'requirements-phase-executor',
      parentSessionId: null,
      workItemId: 'work-item-123',
      spawnIntentId: 'spawn-123',
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      status: 'active',
    };
    
    expect(identity.sessionId).toBe('session-123');
    expect(identity.status).toBe('active');
  });

  it('should create Event', () => {
    const event: Event = {
      eventId: 'event-123',
      ts: Date.now(),
      projectId: 'project-123',
      action: 'session.activated',
      payload: { sessionId: 'session-123' },
      metadata: {
        schemaVersion: '1.0',
        source: 'client',
      },
    };
    
    expect(event.eventId).toBe('event-123');
    expect(event.action).toBe('session.activated');
  });

  it('should create ProjectState', () => {
    const state: ProjectState = {
      projectPath: '/path/to/project',
      schemaVersion: '1.0',
      activeSessions: ['session-1', 'session-2'],
      workItems: [],
      lastEventId: 'event-123',
      lastEventTs: Date.now(),
    };
    
    expect(state.projectPath).toBe('/path/to/project');
    expect(state.activeSessions).toHaveLength(2);
  });

  it('should create HandshakeFile', () => {
    const handshake: HandshakeFile = {
      pid: 12345,
      port: 8080,
      token: 'random-token-123',
      startedAt: Date.now(),
      schema_version: '1.0',
      version: '1.0.0',
      serviceMode: false,
    };
    
    expect(handshake.pid).toBe(12345);
    expect(handshake.schema_version).toBe('1.0');
  });

  it('should create Lock', () => {
    const lock: Lock = {
      id: 'lock-123',
      projectPath: '/path/to/project',
      acquiredAt: Date.now(),
      expiresAt: Date.now() + 30_000,
    };
    
    expect(lock.id).toBe('lock-123');
    expect(lock.projectPath).toBe('/path/to/project');
  });

  it('should create Subscription', () => {
    const subscription: Subscription = {
      id: 'sub-123',
      topic: 'test.event',
      handler: () => {},
    };
    
    expect(subscription.id).toBe('sub-123');
    expect(subscription.topic).toBe('test.event');
  });
});
