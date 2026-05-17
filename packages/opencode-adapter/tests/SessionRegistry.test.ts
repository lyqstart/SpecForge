/**
 * Unit tests for SessionRegistry
 *
 * Tests the session binding logic including:
 * - First-contact binding strategy
 * - spawnIntentId to sessionId mapping
 * - Session registry operations
 *
 * Requirements: 4.2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionRegistry, SessionRegistryError } from '../src/integration/SessionRegistry';

describe('SessionRegistry', () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry({ bindingTimeout: 60000, maxBindings: 100 });
  });

  describe('registerPending', () => {
    it('should register a pending spawn intent', () => {
      const result = registry.registerPending({
        spawnIntentId: 'spawn-123',
        agentRole: 'developer',
      });

      expect(result.success).toBe(true);
      expect(result.spawnIntentId).toBe('spawn-123');
      expect(result.sessionId).toBeUndefined();

      // Verify it's stored
      const binding = registry.findBySpawnIntentId('spawn-123');
      expect(binding).toBeDefined();
      expect(binding?.state).toBe('pending');
      expect(binding?.agentRole).toBe('developer');
    });

    it('should allow re-registration of same spawn intent', () => {
      const result1 = registry.registerPending({
        spawnIntentId: 'spawn-123',
        agentRole: 'developer',
      });

      const result2 = registry.registerPending({
        spawnIntentId: 'spawn-123',
        agentRole: 'developer',
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(registry.getPendingCount()).toBe(1);
    });

    it('should return bound session if already bound', () => {
      // First register
      registry.registerPending({ spawnIntentId: 'spawn-123', agentRole: 'dev' });
      
      // Then bind
      registry.bind('spawn-123', 'session-abc');

      // Re-register should return bound session
      const result = registry.registerPending({
        spawnIntentId: 'spawn-123',
        agentRole: 'dev',
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('session-abc');
    });

    it('should enforce max bindings limit', () => {
      const smallRegistry = new SessionRegistry({ maxBindings: 2 });
      
      smallRegistry.registerPending({ spawnIntentId: 'spawn-1', agentRole: 'dev' });
      smallRegistry.registerPending({ spawnIntentId: 'spawn-2', agentRole: 'dev' });
      
      const result = smallRegistry.registerPending({ spawnIntentId: 'spawn-3', agentRole: 'dev' });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum bindings');
    });

    it('should store metadata', () => {
      const result = registry.registerPending({
        spawnIntentId: 'spawn-123',
        agentRole: 'developer',
        metadata: { projectId: 'proj-1', userId: 'user-1' },
      });

      expect(result.success).toBe(true);
      
      const binding = registry.findBySpawnIntentId('spawn-123');
      expect(binding?.metadata).toEqual({ projectId: 'proj-1', userId: 'user-1' });
    });
  });

  describe('bind (first-contact binding)', () => {
    it('should bind spawn intent to session ID', () => {
      // First register pending
      registry.registerPending({ spawnIntentId: 'spawn-123', agentRole: 'dev' });
      
      // Then bind on first contact
      const result = registry.bind('spawn-123', 'session-abc');

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('session-abc');
      expect(result.spawnIntentId).toBe('spawn-123');

      // Verify both lookups work
      expect(registry.findBySpawnIntentId('spawn-123')?.sessionId).toBe('session-abc');
      expect(registry.findBySessionId('session-abc')?.spawnIntentId).toBe('spawn-123');
    });

    it('should auto-register if spawn intent not found', () => {
      const result = registry.bind('spawn-new', 'session-new');

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('session-new');
      
      const binding = registry.findBySpawnIntentId('spawn-new');
      expect(binding?.state).toBe('bound');
    });

    it('should reject binding to different session if already bound', () => {
      registry.registerPending({ spawnIntentId: 'spawn-123', agentRole: 'dev' });
      registry.bind('spawn-123', 'session-abc');

      const result = registry.bind('spawn-123', 'session-def');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already bound');
    });

    it('should track binding timestamps', () => {
      registry.registerPending({ spawnIntentId: 'spawn-123', agentRole: 'dev' });
      
      const beforeBind = new Date();
      registry.bind('spawn-123', 'session-abc');
      const afterBind = new Date();

      const binding = registry.findBySpawnIntentId('spawn-123')!;
      expect(binding.createdAt.getTime()).toBeLessThanOrEqual(beforeBind.getTime() + 1000);
      expect(binding.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeBind.getTime());
      expect(binding.updatedAt.getTime()).toBeLessThanOrEqual(afterBind.getTime() + 1000);
    });
  });

  describe('find operations', () => {
    beforeEach(() => {
      registry.registerPending({ spawnIntentId: 'spawn-1', agentRole: 'dev' });
      registry.registerPending({ spawnIntentId: 'spawn-2', agentRole: 'reviewer' });
      registry.bind('spawn-1', 'session-1');
    });

    it('should find by spawn intent ID', () => {
      const binding = registry.findBySpawnIntentId('spawn-1');
      expect(binding?.spawnIntentId).toBe('spawn-1');
      expect(binding?.sessionId).toBe('session-1');
    });

    it('should find by session ID', () => {
      const binding = registry.findBySessionId('session-1');
      expect(binding?.spawnIntentId).toBe('spawn-1');
      expect(binding?.sessionId).toBe('session-1');
    });

    it('should return undefined for non-existent spawn intent', () => {
      const binding = registry.findBySpawnIntentId('non-existent');
      expect(binding).toBeUndefined();
    });

    it('should return undefined for non-existent session', () => {
      const binding = registry.findBySessionId('non-existent');
      expect(binding).toBeUndefined();
    });

    it('should find by either ID using find()', () => {
      expect(registry.find({ spawnIntentId: 'spawn-1' })?.sessionId).toBe('session-1');
      expect(registry.find({ sessionId: 'session-1' })?.spawnIntentId).toBe('spawn-1');
    });

    it('should find all matching bindings', () => {
      const pending = registry.findAll({ state: 'pending' });
      expect(pending.length).toBe(1);
      expect(pending[0].spawnIntentId).toBe('spawn-2');

      const bound = registry.findAll({ state: 'bound' });
      expect(bound.length).toBe(1);
      expect(bound[0].spawnIntentId).toBe('spawn-1');
    });
  });

  describe('release', () => {
    it('should release a bound session', () => {
      registry.registerPending({ spawnIntentId: 'spawn-1', agentRole: 'dev' });
      registry.bind('spawn-1', 'session-1');

      const result = registry.release('session-1');

      expect(result).toBe(true);
      expect(registry.findBySessionId('session-1')).toBeUndefined();
      expect(registry.findBySpawnIntentId('spawn-1')).toBeUndefined();
    });

    it('should return false for non-existent session', () => {
      const result = registry.release('non-existent');
      expect(result).toBe(false);
    });

    it('should update state to released before deletion', () => {
      let binding: any;
      registry.registerPending({ spawnIntentId: 'spawn-1', agentRole: 'dev' });
      registry.bind('spawn-1', 'session-1');

      // Capture state before release
      binding = registry.findBySessionId('session-1');
      expect(binding?.state).toBe('bound');

      registry.release('session-1');
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      registry.registerPending({ spawnIntentId: 'spawn-1', agentRole: 'dev' });
      registry.registerPending({ spawnIntentId: 'spawn-2', agentRole: 'reviewer' });
      registry.bind('spawn-1', 'session-1');
    });

    it('should count pending bindings', () => {
      expect(registry.getPendingCount()).toBe(1);
    });

    it('should count bound sessions', () => {
      expect(registry.getBoundCount()).toBe(1);
    });

    it('should count total bindings', () => {
      expect(registry.getTotalCount()).toBe(2);
    });

    it('should check if spawn intent is bound', () => {
      expect(registry.isBound('spawn-1')).toBe(true);
      expect(registry.isBound('spawn-2')).toBe(false);
    });

    it('should check if session exists', () => {
      expect(registry.hasSession('session-1')).toBe(true);
      expect(registry.hasSession('session-2')).toBe(false);
    });

    it('should get statistics', () => {
      const stats = registry.getStats();
      
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.bound).toBe(1);
      expect(stats.released).toBe(0);
    });

    it('should clear all bindings', () => {
      registry.clear();
      
      expect(registry.getTotalCount()).toBe(0);
      expect(registry.getPendingCount()).toBe(0);
      expect(registry.getBoundCount()).toBe(0);
    });
  });

  describe('cleanupExpired', () => {
    it('should clean up old pending bindings', () => {
      // Create registry with short timeout
      const quickRegistry = new SessionRegistry({ bindingTimeout: 10, maxBindings: 100 });
      
      quickRegistry.registerPending({ spawnIntentId: 'spawn-1', agentRole: 'dev' });
      
      // Wait for timeout
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const cleaned = quickRegistry.cleanupExpired();
          expect(cleaned).toBe(1);
          expect(quickRegistry.getTotalCount()).toBe(0);
          resolve();
        }, 20);
      });
    });

    it('should not clean up bound sessions', () => {
      const quickRegistry = new SessionRegistry({ bindingTimeout: 10, maxBindings: 100 });
      
      quickRegistry.registerPending({ spawnIntentId: 'spawn-1', agentRole: 'dev' });
      quickRegistry.bind('spawn-1', 'session-1');
      
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const cleaned = quickRegistry.cleanupExpired();
          expect(cleaned).toBe(0);
          expect(quickRegistry.getBoundCount()).toBe(1);
          resolve();
        }, 20);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle full first-contact binding flow', () => {
      // Step 1: Daemon pre-registers spawn intent
      const registerResult = registry.registerPending({
        spawnIntentId: 'intent-abc',
        agentRole: 'developer',
        metadata: { projectId: 'proj-1' },
      });
      expect(registerResult.success).toBe(true);
      expect(registry.getPendingCount()).toBe(1);

      // Step 2: First event arrives from OpenCode with sessionId
      const bindResult = registry.bind('intent-abc', 'oc-session-xyz');
      expect(bindResult.success).toBe(true);
      expect(bindResult.sessionId).toBe('oc-session-xyz');
      expect(registry.getPendingCount()).toBe(0);
      expect(registry.getBoundCount()).toBe(1);

      // Step 3: Look up by either ID
      const bySpawnIntent = registry.findBySpawnIntentId('intent-abc');
      expect(bySpawnIntent?.sessionId).toBe('oc-session-xyz');
      expect(bySpawnIntent?.agentRole).toBe('developer');
      expect(bySpawnIntent?.metadata).toEqual({ projectId: 'proj-1' });

      const bySession = registry.findBySessionId('oc-session-xyz');
      expect(bySession?.spawnIntentId).toBe('intent-abc');

      // Step 4: Session completes
      const releaseResult = registry.release('oc-session-xyz');
      expect(releaseResult).toBe(true);
      expect(registry.getBoundCount()).toBe(0);
    });

    it('should handle multiple concurrent sessions', () => {
      const sessions = [
        { spawnIntentId: 'intent-1', sessionId: 'session-1', role: 'dev' },
        { spawnIntentId: 'intent-2', sessionId: 'session-2', role: 'reviewer' },
        { spawnIntentId: 'intent-3', sessionId: 'session-3', role: 'dev' },
      ];

      // Register all
      for (const s of sessions) {
        registry.registerPending({ spawnIntentId: s.spawnIntentId, agentRole: s.role });
      }
      expect(registry.getPendingCount()).toBe(3);

      // Bind all
      for (const s of sessions) {
        const result = registry.bind(s.spawnIntentId, s.sessionId);
        expect(result.success).toBe(true);
      }
      expect(registry.getBoundCount()).toBe(3);

      // Verify all lookups work
      for (const s of sessions) {
        expect(registry.findBySpawnIntentId(s.spawnIntentId)?.sessionId).toBe(s.sessionId);
        expect(registry.findBySessionId(s.sessionId)?.spawnIntentId).toBe(s.spawnIntentId);
      }

      // Get all bound
      const allBound = registry.findAll({ state: 'bound' });
      expect(allBound.length).toBe(3);
    });
  });
});