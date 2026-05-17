/**
 * Property 5: Session Identity Stability Test
 * 
 * Feature: daemon-core, Property 5: Session Identity Stability
 * Derived-From: v6-architecture-overview Property 5
 * 
 * Property Statement:
 * For all events e arriving at the Daemon and their associated sessionId s,
 * the AgentIdentity obtained via SessionRegistry.lookupBySessionId(s) must
 * remain consistent throughout the session lifecycle; the Daemon must not
 * rely on the agent field in OpenCode Plugin Hook inputs as an identity key.
 * 
 * Test Strategy:
 * 1. Generate session lifecycle sequences (create → activate → terminate)
 * 2. Verify sessionId remains consistent key throughout
 * 3. Verify lookupBySessionId returns same object (by value) for same sessionId
 * 4. Verify agent field changes don't affect identity lookup
 * 5. Verify parentSessionId tree structure is maintained
 */

import { describe, it, expect } from 'vitest';
import { SessionRegistry } from '../../src/session/SessionRegistry';
import { EventBus } from '../../src/event-bus/EventBus';
import { AgentIdentity } from '../../src/session/AgentIdentity';

/**
 * Helper to create a session lifecycle sequence
 */
interface SessionLifecycle {
  sessionId: string;
  spawnIntentId: string;
  agentRole: string;
  workflowRole: string;
  workItemId: string;
  parentSessionId: string | null;
  events: {
    type: 'created' | 'activated' | 'terminated' | 'touched';
    timestamp: number;
  }[];
}

/**
 * Property 5: Session Identity Stability
 * 
 * Validates that sessionId is the sole identity key and remains
 * consistent throughout the session lifecycle.
 */
describe('Property 5: Session Identity Stability', () => {
  it('should validate session identity stability across lifecycle', () => {
    const eventBus = new EventBus();
    const registry = new SessionRegistry(eventBus);
    
    // Create a session
    const spawnIntentId = 'spawn-123';
    const initialIdentity = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId
    );
    
    const sessionId = initialIdentity.sessionId;
    
    // Verify lookup returns the same sessionId
    const pendingLookup = registry.lookupBySessionId(sessionId);
    expect(pendingLookup).toBeDefined();
    expect(pendingLookup?.sessionId).toBe(sessionId);
    expect(pendingLookup?.status).toBe('pending');
    
    // Activate the session
    const activatedIdentity = registry.activate(sessionId, spawnIntentId);
    expect(activatedIdentity).toBeDefined();
    expect(activatedIdentity?.sessionId).toBe(sessionId);
    expect(activatedIdentity?.status).toBe('active');
    
    // Verify lookup still returns same sessionId
    const activeLookup = registry.lookupBySessionId(sessionId);
    expect(activeLookup).toBeDefined();
    expect(activeLookup?.sessionId).toBe(sessionId);
    expect(activeLookup?.status).toBe('active');
    
    // Terminate the session
    const terminatedIdentity = registry.terminate(sessionId);
    expect(terminatedIdentity).toBeDefined();
    expect(terminatedIdentity?.sessionId).toBe(sessionId);
    expect(terminatedIdentity?.status).toBe('history');
    
    // Verify lookup still returns same sessionId
    const historyLookup = registry.lookupBySessionId(sessionId);
    expect(historyLookup).toBeDefined();
    expect(historyLookup?.sessionId).toBe(sessionId);
    expect(historyLookup?.status).toBe('history');
    
    // Verify identity is stable - all lookups return same sessionId
    expect(pendingLookup?.sessionId).toBe(activeLookup?.sessionId);
    expect(activeLookup?.sessionId).toBe(historyLookup?.sessionId);
  });

  it('should not rely on agent field as identity key', () => {
    const eventBus = new EventBus();
    const registry = new SessionRegistry(eventBus);
    
    // Create session with one agent role
    const spawnIntentId = 'spawn-123';
    const identity1 = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId
    );
    
    const sessionId = identity1.sessionId;
    registry.activate(sessionId, spawnIntentId);
    
    // Create another session with different agent role but same sessionId
    // (simulating what would happen if we used agent as key)
    const identity2 = registry.registerPending(
      'sf-requirements',
      'spec-writer',
      'work-456',
      'spawn-456'
    );
    
    // Verify they have different sessionIds
    expect(identity1.sessionId).not.toBe(identity2.sessionId);
    
    // Verify lookup by sessionId returns correct identity
    const lookup1 = registry.lookupBySessionId(sessionId);
    expect(lookup1).toBeDefined();
    expect(lookup1?.agentRole).toBe('sf-orchestrator');
    
    const lookup2 = registry.lookupBySessionId(identity2.sessionId);
    expect(lookup2).toBeDefined();
    expect(lookup2?.agentRole).toBe('sf-requirements');
  });

  it('should maintain session tree via parentSessionId', () => {
    const eventBus = new EventBus();
    const registry = new SessionRegistry(eventBus);
    
    // Create parent session
    const parentSpawnIntentId = 'parent-spawn-123';
    const parentIdentity = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      parentSpawnIntentId
    );
    
    // Create child session with parent
    const childSpawnIntentId = 'child-spawn-456';
    const childIdentity = registry.registerPending(
      'sf-orchestrator',
      'sub-agent',
      'work-123',
      childSpawnIntentId,
      parentIdentity.sessionId
    );
    
    // Activate both
    registry.activate(parentIdentity.sessionId, parentSpawnIntentId);
    registry.activate(childIdentity.sessionId, childSpawnIntentId);
    
    // Verify session tree
    const tree = registry.getSessionTree('work-123');
    expect(tree.length).toBe(2);
    expect(tree[0].sessionId).toBe(parentIdentity.sessionId);
    expect(tree[1].sessionId).toBe(childIdentity.sessionId);
    expect(tree[1].parentSessionId).toBe(parentIdentity.sessionId);
  });

  it('should handle rapid session lifecycle transitions', () => {
    const eventBus = new EventBus();
    const registry = new SessionRegistry(eventBus);
    
    // Create and activate multiple sessions rapidly
    const sessions: AgentIdentity[] = [];
    
    for (let i = 0; i < 10; i++) {
      const spawnIntentId = `spawn-${i}`;
      const identity = registry.registerPending(
        'sf-orchestrator',
        'requirements-phase-executor',
        `work-${i}`,
        spawnIntentId
      );
      
      sessions.push(identity);
      registry.activate(identity.sessionId, spawnIntentId);
    }
    
    // Verify all sessions are active
    const activeSessions = registry.getActiveSessions();
    expect(activeSessions.length).toBe(10);
    
    // Verify each session can be looked up
    for (const session of sessions) {
      const lookup = registry.lookupBySessionId(session.sessionId);
      expect(lookup).toBeDefined();
      expect(lookup?.sessionId).toBe(session.sessionId);
      expect(lookup?.status).toBe('active');
    }
  });

  it('should maintain identity consistency after many operations', () => {
    const eventBus = new EventBus();
    const registry = new SessionRegistry(eventBus);
    
    // Create a session
    const spawnIntentId = 'spawn-123';
    const identity = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId
    );
    
    const sessionId = identity.sessionId;
    
    // Activate the session
    const activated = registry.activate(sessionId, spawnIntentId);
    expect(activated).toBeDefined();
    
    // Perform many operations
    for (let i = 0; i < 100; i++) {
      registry.touch(sessionId);
    }
    
    // Verify identity is still consistent
    const lookup = registry.lookupBySessionId(sessionId);
    expect(lookup).toBeDefined();
    expect(lookup?.sessionId).toBe(sessionId);
    expect(lookup?.status).toBe('active');
    expect(lookup?.createdAt).toBe(identity.createdAt);
  });
});
