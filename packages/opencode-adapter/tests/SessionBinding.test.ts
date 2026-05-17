/**
 * Tests for session binding integration in OpenCodeAdapter
 *
 * Tests:
 * - First-contact binding strategy
 * - spawnIntentId to sessionId mapping
 * - Session registry integration
 *
 * Requirements: 4.2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpenCodeAdapter } from '../src/OpenCodeAdapter';

describe('OpenCodeAdapter - Session Binding (Requirements: 4.2)', () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.0.0 <2.0.0',
      communicationTimeout: 5000,
    });
  });

  describe('registerSpawnIntent', () => {
    it('should register a pending spawn intent', () => {
      const result = adapter.registerSpawnIntent('spawn-123', 'developer');
      
      expect(result.success).toBe(true);
      expect(adapter.getSessionBindingStats().pending).toBe(1);
    });

    it('should store metadata with registration', () => {
      const result = adapter.registerSpawnIntent('spawn-123', 'developer', {
        projectId: 'proj-1',
        userId: 'user-1',
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('bindSession (first-contact binding)', () => {
    it('should bind spawn intent to session ID', () => {
      adapter.registerSpawnIntent('spawn-123', 'developer');
      
      const result = adapter.bindSession('spawn-123', 'session-abc');
      
      expect(result.success).toBe(true);
      expect(adapter.getSessionBindingStats().bound).toBe(1);
      expect(adapter.getSessionBindingStats().pending).toBe(0);
    });

    it('should allow auto-binding without prior registration', () => {
      const result = adapter.bindSession('spawn-new', 'session-new');
      
      expect(result.success).toBe(true);
      expect(adapter.getSessionBindingStats().bound).toBe(1);
    });
  });

  describe('findSessionBySpawnIntent', () => {
    it('should find session by spawn intent ID after binding', () => {
      adapter.registerSpawnIntent('spawn-123', 'developer');
      adapter.bindSession('spawn-123', 'session-abc');
      
      const sessionId = adapter.findSessionBySpawnIntent('spawn-123');
      
      expect(sessionId).toBe('session-abc');
    });

    it('should return undefined for pending (not yet bound) spawn intent', () => {
      adapter.registerSpawnIntent('spawn-123', 'developer');
      
      const sessionId = adapter.findSessionBySpawnIntent('spawn-123');
      
      expect(sessionId).toBeUndefined();
    });

    it('should return undefined for non-existent spawn intent', () => {
      const sessionId = adapter.findSessionBySpawnIntent('non-existent');
      
      expect(sessionId).toBeUndefined();
    });
  });

  describe('spawnAgent with session binding', () => {
    it('should register spawn intent when spawning agent', async () => {
      const result = await adapter.spawnAgent({
        agentRole: 'developer',
        spawnIntentId: 'spawn-test-1',
      });
      
      // Verify spawn intent is registered (pending)
      const stats = adapter.getSessionBindingStats();
      expect(stats.pending).toBe(1);
      expect(stats.bound).toBe(0);
      
      // The session should be active
      expect(result.sessionId).toBeDefined();
    });

    it('should maintain binding state after session is active', async () => {
      await adapter.spawnAgent({
        agentRole: 'developer',
        spawnIntentId: 'spawn-test-2',
      });
      
      const stats = adapter.getSessionBindingStats();
      expect(stats.total).toBe(1);
    });
  });

  describe('releaseSessionBinding', () => {
    it('should release a bound session', () => {
      adapter.registerSpawnIntent('spawn-123', 'developer');
      adapter.bindSession('spawn-123', 'session-abc');
      
      const result = adapter.releaseSessionBinding('session-abc');
      
      expect(result).toBe(true);
      expect(adapter.getSessionBindingStats().bound).toBe(0);
    });

    it('should return false for non-existent session', () => {
      const result = adapter.releaseSessionBinding('non-existent');
      
      expect(result).toBe(false);
    });
  });

  describe('getSessionBindingStats', () => {
    it('should return correct statistics', () => {
      expect(adapter.getSessionBindingStats()).toEqual({
        total: 0,
        pending: 0,
        bound: 0,
        released: 0,
      });

      adapter.registerSpawnIntent('spawn-1', 'dev');
      adapter.registerSpawnIntent('spawn-2', 'reviewer');
      adapter.bindSession('spawn-1', 'session-1');
      
      expect(adapter.getSessionBindingStats()).toEqual({
        total: 2,
        pending: 1,
        bound: 1,
        released: 0,
      });
    });
  });

  describe('first-contact binding flow', () => {
    it('should complete full first-contact binding flow', async () => {
      // Step 1: Daemon pre-registers spawn intent
      const registerResult = adapter.registerSpawnIntent('intent-abc', 'developer', {
        projectId: 'proj-1',
      });
      expect(registerResult.success).toBe(true);
      
      let stats = adapter.getSessionBindingStats();
      expect(stats.pending).toBe(1);
      expect(stats.bound).toBe(0);

      // Step 2: First event arrives from OpenCode
      // (In production, this would be from Thin Plugin)
      const bindResult = adapter.bindSession('intent-abc', 'oc-session-xyz');
      expect(bindResult.success).toBe(true);
      
      stats = adapter.getSessionBindingStats();
      expect(stats.pending).toBe(0);
      expect(stats.bound).toBe(1);

      // Step 3: Look up by spawn intent
      const sessionId = adapter.findSessionBySpawnIntent('intent-abc');
      expect(sessionId).toBe('oc-session-xyz');

      // Step 4: Session completes
      const releaseResult = adapter.releaseSessionBinding('oc-session-xyz');
      expect(releaseResult).toBe(true);
      
      stats = adapter.getSessionBindingStats();
      expect(stats.bound).toBe(0);
    });

    it('should handle spawnAgent then bind flow', async () => {
      // Using spawnAgent which internally registers the spawn intent
      const spawnResult = await adapter.spawnAgent({
        agentRole: 'developer',
        spawnIntentId: 'spawn-from-agent',
        model: 'gpt-4',
      });
      
      expect(spawnResult.sessionId).toBeDefined();
      
      // The spawn intent should be registered
      const sessionId = adapter.findSessionBySpawnIntent('spawn-from-agent');
      // After spawnAgent, the session is active but not yet "bound" via bindSession
      // The binding happens on first contact from OpenCode
      expect(sessionId).toBeUndefined(); // Not bound yet, just registered
    });
  });
});