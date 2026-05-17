/**
 * Session Registry unit tests - Simplified
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionRegistry } from '../../src/session/SessionRegistry';
import { 
  createPendingIdentity, 
  activateIdentity, 
  terminateIdentity, 
} from '../../src/session/AgentIdentity';
import { EventBus } from '../../src/event-bus/EventBus';

describe('SessionRegistry', () => {
  let sessionRegistry: SessionRegistry;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();
    sessionRegistry = new SessionRegistry(eventBus);
    sessionRegistry.start();
  });

  afterEach(() => {
    sessionRegistry.stop();
    eventBus.stop();
  });

  describe('registerPending', () => {
    it('should register a pending session', () => {
      const identity = sessionRegistry.registerPending(
        'agent',
        'workflow',
        'workItem-1',
        'spawnIntent-1'
      );
      
      expect(identity).toBeDefined();
      expect(identity.status).toBe('pending');
      expect(identity.agentRole).toBe('agent');
    });

    it('should register with parent session ID', () => {
      const parent = sessionRegistry.registerPending('parent', 'workflow', 'item', 'parent-spawn');
      const child = sessionRegistry.registerPending('child', 'workflow', 'item', 'child-spawn', parent.sessionId);
      
      expect(child.parentSessionId).toBe(parent.sessionId);
    });
  });

  describe('lookupBySessionId', () => {
    it('should lookup session by session ID', () => {
      const pending = sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');
      
      const found = sessionRegistry.lookupBySessionId(pending.sessionId);
      
      expect(found).toBeDefined();
      expect(found?.sessionId).toBe(pending.sessionId);
    });

    it('should return null for non-existent session', () => {
      const found = sessionRegistry.lookupBySessionId('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('getCounts', () => {
    it('should return correct counts', () => {
      sessionRegistry.registerPending('agent1', 'workflow', 'item', 'spawn-1');
      sessionRegistry.registerPending('agent2', 'workflow', 'item', 'spawn-2');
      
      const counts = sessionRegistry.getCounts();
      
      expect(counts.pending).toBe(2);
      expect(counts.active).toBe(0);
      expect(counts.history).toBe(0);
    });
  });

  describe('hasSession', () => {
    it('should return true for existing session', () => {
      const pending = sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');
      
      expect(sessionRegistry.hasSession(pending.sessionId)).toBe(true);
    });

    it('should return false for non-existent session', () => {
      expect(sessionRegistry.hasSession('non-existent')).toBe(false);
    });
  });

  describe('activate', () => {
    it('should activate a pending session', () => {
      const pending = sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');
      
      const activated = sessionRegistry.activate(pending.sessionId, 'spawn-1');
      
      expect(activated).toBeDefined();
      expect(activated?.status).toBe('active');
    });

    it('should return null with wrong spawn intent', () => {
      const pending = sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');
      
      const activated = sessionRegistry.activate(pending.sessionId, 'wrong-intent');
      
      expect(activated).toBeNull();
    });
  });

  describe('terminate', () => {
    it('should terminate an active session', () => {
      const pending = sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');
      sessionRegistry.activate(pending.sessionId, 'spawn-1');
      
      const terminated = sessionRegistry.terminate(pending.sessionId);
      
      expect(terminated).toBeDefined();
      expect(terminated?.status).toBe('history');
    });

    it('should return null when terminating non-existent session', () => {
      const terminated = sessionRegistry.terminate('non-existent');
      expect(terminated).toBeNull();
    });
  });

  describe('getActiveSessions', () => {
    it('should return active sessions', () => {
      const s1 = sessionRegistry.registerPending('agent1', 'workflow', 'item', 'spawn-1');
      const s2 = sessionRegistry.registerPending('agent2', 'workflow', 'item', 'spawn-2');
      
      sessionRegistry.activate(s1.sessionId, 'spawn-1');
      sessionRegistry.activate(s2.sessionId, 'spawn-2');
      
      const active = sessionRegistry.getActiveSessions();
      
      expect(active.length).toBe(2);
    });
  });

  describe('getPendingSessions', () => {
    it('should return pending sessions', () => {
      sessionRegistry.registerPending('agent1', 'workflow', 'item', 'spawn-1');
      sessionRegistry.registerPending('agent2', 'workflow', 'item', 'spawn-2');
      
      const pending = sessionRegistry.getPendingSessions();
      
      expect(pending.length).toBe(2);
    });
  });
});

describe('AgentIdentity functions', () => {
  describe('createPendingIdentity', () => {
    it('should create a pending identity', () => {
      const identity = createPendingIdentity('agent', 'workflow', 'workItem', 'spawnIntent');
      
      expect(identity.status).toBe('pending');
      expect(identity.sessionId).toBeDefined();
    });

    it('should create with parent session ID', () => {
      const parentIdentity = createPendingIdentity('parent', 'workflow', 'workItem', 'parentSpawn');
      const childIdentity = createPendingIdentity(
        'child', 
        'workflow', 
        'workItem', 
        'childSpawn',
        parentIdentity.sessionId
      );
      
      expect(childIdentity.parentSessionId).toBe(parentIdentity.sessionId);
    });
  });

  describe('activateIdentity', () => {
    it('should activate a pending identity', () => {
      const pending = createPendingIdentity('agent', 'workflow', 'workItem', 'spawnIntent');
      const activated = activateIdentity(pending);
      
      expect(activated.status).toBe('active');
    });
  });

  describe('terminateIdentity', () => {
    it('should terminate an active identity', () => {
      const pending = createPendingIdentity('agent', 'workflow', 'workItem', 'spawnIntent');
      const active = activateIdentity(pending);
      const terminated = terminateIdentity(active);
      
      expect(terminated.status).toBe('history');
    });
  });
});