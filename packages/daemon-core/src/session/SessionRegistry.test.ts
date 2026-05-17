/**
 * Session Registry unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionRegistry } from './SessionRegistry';
import { EventBus } from '../event-bus/EventBus';

describe('SessionRegistry', () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry(new EventBus());
  });

  it('should register pending sessions', () => {
    const spawnIntentId = 'spawn-123';
    const identity = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId
    );
    
    expect(identity.sessionId).toBeDefined();
    expect(identity.spawnIntentId).toBe(spawnIntentId);
    expect(identity.status).toBe('pending');
    expect(identity.agentRole).toBe('sf-orchestrator');
    expect(identity.workflowRole).toBe('requirements-phase-executor');
    expect(identity.workItemId).toBe('work-123');
    expect(identity.parentSessionId).toBeNull();
  });

  it('should register pending sessions with parent', () => {
    const parentId = 'parent-123';
    const spawnIntentId = 'spawn-456';
    const identity = registry.registerPending(
      'sf-orchestrator',
      'sub-agent',
      'work-456',
      spawnIntentId,
      parentId
    );
    
    expect(identity.parentSessionId).toBe(parentId);
  });

  it('should activate pending sessions', () => {
    const spawnIntentId = 'spawn-123';
    const identity = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId
    );
    
    const activated = registry.activate(identity.sessionId, spawnIntentId);
    
    expect(activated).toBeDefined();
    expect(activated?.status).toBe('active');
    expect(activated?.sessionId).toBe(identity.sessionId);
    expect(registry.lookupBySessionId(identity.sessionId)).toBeDefined();
  });

  it('should not activate with wrong spawnIntentId', () => {
    const spawnIntentId = 'spawn-123';
    const identity = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId
    );
    
    const activated = registry.activate(identity.sessionId, 'wrong-id');
    
    expect(activated).toBeNull();
    // Session should still be in pending state
    const lookup = registry.lookupBySessionId(identity.sessionId);
    expect(lookup).toBeDefined();
    expect(lookup?.status).toBe('pending');
  });

  it('should lookup sessions by sessionId', () => {
    const spawnIntentId = 'spawn-123';
    const identity = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId
    );
    registry.activate(identity.sessionId, spawnIntentId);
    
    const found = registry.lookupBySessionId(identity.sessionId);
    
    expect(found).toBeDefined();
    expect(found?.sessionId).toBe(identity.sessionId);
    expect(found?.status).toBe('active');
  });

  it('should return null for non-existent session', () => {
    const found = registry.lookupBySessionId('non-existent');
    expect(found).toBeNull();
  });

  it('should terminate active sessions', () => {
    const spawnIntentId = 'spawn-123';
    const identity = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId
    );
    const activated = registry.activate(identity.sessionId, spawnIntentId);
    
    const terminated = registry.terminate(activated!.sessionId);
    
    expect(terminated).toBeDefined();
    expect(terminated?.status).toBe('history');
    expect(registry.lookupBySessionId(activated!.sessionId)).toBeDefined();
    expect(registry.lookupBySessionId(activated!.sessionId)?.status).toBe('history');
  });

  it('should not terminate non-existent session', () => {
    const terminated = registry.terminate('non-existent');
    expect(terminated).toBeNull();
  });

  it('should update last active timestamp', async () => {
    const spawnIntentId = 'spawn-123';
    const identity = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId
    );
    const activated = registry.activate(identity.sessionId, spawnIntentId);
    const firstActive = activated!.lastActiveAt;
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const touched = registry.touch(activated!.sessionId);
    
    expect(touched).toBeDefined();
    expect(touched!.lastActiveAt).toBeGreaterThan(firstActive);
  });

  it('should get session counts', () => {
    const spawnIntentId1 = 'spawn-123';
    const spawnIntentId2 = 'spawn-456';
    
    registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId1
    );
    registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-456',
      spawnIntentId2
    );
    
    const counts = registry.getCounts();
    
    expect(counts.pending).toBe(2);
    expect(counts.active).toBe(0);
    expect(counts.history).toBe(0);
  });

  it('should get session tree for work item', () => {
    const spawnIntentId1 = 'spawn-123';
    const spawnIntentId2 = 'spawn-456';
    
    const parent = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId1
    );
    const child = registry.registerPending(
      'sf-orchestrator',
      'sub-agent',
      'work-123',
      spawnIntentId2,
      parent.sessionId
    );
    
    registry.activate(parent.sessionId, spawnIntentId1);
    registry.activate(child.sessionId, spawnIntentId2);
    
    // Debug: log all active sessions
    const activeSessions = registry.getActiveSessions();
    console.log('Active sessions:', activeSessions.map(s => ({ 
      sessionId: s.sessionId, 
      workItemId: s.workItemId,
      parentSessionId: s.parentSessionId 
    })));
    
    const tree = registry.getSessionTree('work-123');
    
    // Should have 2 sessions: parent + child
    expect(tree.length).toBeGreaterThan(0);
    expect(tree[0]?.sessionId).toBe(parent.sessionId);
    expect(tree[1]?.sessionId).toBe(child.sessionId);
    expect(tree[1]?.parentSessionId).toBe(parent.sessionId);
  });

  it('should check if session exists', () => {
    const spawnIntentId = 'spawn-123';
    const identity = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId
    );
    
    expect(registry.hasSession(identity.sessionId)).toBe(true);
    expect(registry.hasSession('non-existent')).toBe(false);
  });

  it('should move session from pending to history via termination', () => {
    const spawnIntentId = 'spawn-123';
    const identity = registry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-123',
      spawnIntentId
    );
    
    // Try to terminate pending session (should fail)
    const terminated = registry.terminate(identity.sessionId);
    expect(terminated).toBeNull();
    
    // Activate first
    const activated = registry.activate(identity.sessionId, spawnIntentId);
    expect(activated).toBeDefined();
    
    // Now terminate
    const history = registry.terminate(activated!.sessionId);
    expect(history).toBeDefined();
    expect(history?.status).toBe('history');
  });
});
