/**
 * User Binding Manager Unit Tests
 * 
 * Tests for the UserBindingManager service implementing user binding
 * for OpenClaw requests as required by Property 26: Remote Access Guard
 * 
 * @specforge/permission-engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  UserBindingManager, 
  createUserBindingManager 
} from '../../src/services/user-binding';

describe('UserBindingManager', () => {
  let manager: UserBindingManager;

  beforeEach(() => {
    manager = createUserBindingManager({
      sessionTimeout: 5000, // 5 seconds for testing
      maxSessionsPerUser: 5
    });
  });

  describe('registerUser', () => {
    it('should register a new user with all required fields', () => {
      const user = manager.registerUser({
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: ['editor'],
        permissions: ['read', 'write']
      });

      expect(user.id).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.displayName).toBe('Test User');
      expect(user.email).toBe('test@example.com');
      expect(user.roles).toEqual(['editor']);
      expect(user.permissions).toEqual(['read', 'write']);
      expect(user.createdAt).toBeDefined();
    });

    it('should register user with minimal fields', () => {
      const user = manager.registerUser({
        username: 'minimaluser'
      });

      expect(user.id).toBeDefined();
      expect(user.username).toBe('minimaluser');
      expect(user.roles).toEqual([]);
      expect(user.permissions).toEqual([]);
    });
  });

  describe('lookupUser', () => {
    it('should find user by ID', () => {
      const registered = manager.registerUser({
        username: 'lookupuser',
        email: 'lookup@test.com'
      });

      const result = manager.lookupUser(registered.id);
      expect(result.found).toBe(true);
      expect(result.user?.username).toBe('lookupuser');
      expect(result.errorCode).toBe('valid');
    });

    it('should return not found for non-existent user', () => {
      const result = manager.lookupUser('non-existent-id');
      expect(result.found).toBe(false);
      expect(result.errorCode).toBe('user_not_found');
    });

    it('should return disabled for disabled user', () => {
      const user = manager.registerUser({ username: 'disableme' });
      manager.disableUser(user.id);

      const result = manager.lookupUser(user.id);
      expect(result.found).toBe(false);
      expect(result.errorCode).toBe('user_disabled');
    });

    it('should update lastActiveAt on lookup', () => {
      const user = manager.registerUser({ username: 'activeuser' });
      const before = user.lastActiveAt;

      manager.lookupUser(user.id);
      const result = manager.lookupUser(user.id);

      expect(result.user?.lastActiveAt).toBeDefined();
    });
  });

  describe('lookupByUsername', () => {
    it('should find user by username', () => {
      manager.registerUser({ username: 'findme', email: 'find@test.com' });

      const result = manager.lookupByUsername('findme');
      expect(result.found).toBe(true);
      expect(result.user?.email).toBe('find@test.com');
    });

    it('should return not found for non-existent username', () => {
      const result = manager.lookupByUsername('nonexistent');
      expect(result.found).toBe(false);
    });
  });

  describe('bindUser', () => {
    it('should bind user to session', () => {
      const user = manager.registerUser({ username: 'sessionuser' });

      const result = manager.bindUser(user.id, 'session-123', '192.168.1.1', 'TestAgent/1.0');
      
      expect(result.success).toBe(true);
      expect(result.bindingId).toBeDefined();
    });

    it('should bind user without optional parameters', () => {
      const user = manager.registerUser({ username: 'minimalbind' });

      const result = manager.bindUser(user.id, 'session-456');
      
      expect(result.success).toBe(true);
    });

    it('should reject binding for non-existent user', () => {
      const result = manager.bindUser('non-existent', 'session-789');
      
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('user_not_found');
    });

    it('should reject binding for disabled user', () => {
      const user = manager.registerUser({ username: 'disabledbind' });
      manager.disableUser(user.id);

      const result = manager.bindUser(user.id, 'session-000');
      
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('user_disabled');
    });

    it('should reject when max sessions exceeded', () => {
      const user = manager.registerUser({ username: 'manysessions' });

      // Create max sessions
      for (let i = 0; i < 5; i++) {
        manager.bindUser(user.id, `session-${i}`);
      }

      const result = manager.bindUser(user.id, 'session-extra');
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('max_sessions_exceeded');
    });
  });

  describe('getBindingForSession', () => {
    it('should retrieve binding for session', () => {
      const user = manager.registerUser({ username: 'bindingtest' });
      const bindResult = manager.bindUser(user.id, 'test-session');

      const binding = manager.getBindingForSession('test-session');
      
      expect(binding).toBeDefined();
      expect(binding?.userId).toBe(user.id);
      expect(binding?.sessionId).toBe('test-session');
    });

    it('should return undefined for non-existent session', () => {
      const binding = manager.getBindingForSession('non-existent');
      expect(binding).toBeUndefined();
    });
  });

  describe('getBinding', () => {
    it('should retrieve binding by ID', () => {
      const user = manager.registerUser({ username: 'byid' });
      const bindResult = manager.bindUser(user.id, 'session-byid');

      const binding = manager.getBinding(bindResult.bindingId!);
      
      expect(binding).toBeDefined();
      expect(binding?.userId).toBe(user.id);
    });
  });

  describe('updateActivity', () => {
    it('should update last activity time', async () => {
      const user = manager.registerUser({ username: 'activity' });
      const bindResult = manager.bindUser(user.id, 'activity-session');

      const before = manager.getBinding(bindResult.bindingId!)?.lastActivityAt;
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));
      
      manager.updateActivity(bindResult.bindingId!);
      
      const after = manager.getBinding(bindResult.bindingId!)?.lastActivityAt;
      expect(new Date(after!).getTime()).toBeGreaterThan(new Date(before!).getTime());
    });
  });

  describe('unbindUser', () => {
    it('should unbind user from session', () => {
      const user = manager.registerUser({ username: 'unbind' });
      const bindResult = manager.bindUser(user.id, 'unbind-session');

      const unbound = manager.unbindUser(bindResult.bindingId!);
      expect(unbound).toBe(true);

      const binding = manager.getBinding(bindResult.bindingId!);
      expect(binding).toBeUndefined();
    });

    it('should return false for non-existent binding', () => {
      const unbound = manager.unbindUser('non-existent');
      expect(unbound).toBe(false);
    });
  });

  describe('unbindAllUserSessions', () => {
    it('should unbind all sessions for user', () => {
      const user = manager.registerUser({ username: 'unbindall' });

      manager.bindUser(user.id, 'session-1');
      manager.bindUser(user.id, 'session-2');
      manager.bindUser(user.id, 'session-3');

      const count = manager.unbindAllUserSessions(user.id);
      expect(count).toBe(3);

      const activeBindings = manager.getActiveBindingsForUser(user.id);
      expect(activeBindings.length).toBe(0);
    });
  });

  describe('getActiveBindingsForUser', () => {
    it('should return active bindings for user', () => {
      const user = manager.registerUser({ username: 'activebindings' });

      manager.bindUser(user.id, 'active-1');
      manager.bindUser(user.id, 'active-2');

      const bindings = manager.getActiveBindingsForUser(user.id);
      expect(bindings.length).toBe(2);
    });

    it('should not return expired bindings', async () => {
      const shortTimeoutManager = createUserBindingManager({
        sessionTimeout: 50 // Very short
      });

      const user = shortTimeoutManager.registerUser({ username: 'expiry' });
      const bindResult = shortTimeoutManager.bindUser(user.id, 'expiring-session');

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 100));
      shortTimeoutManager.cleanupExpired();

      const bindings = shortTimeoutManager.getActiveBindingsForUser(user.id);
      expect(bindings.length).toBe(0);
    });
  });

  describe('userHasPermission', () => {
    it('should return true for user with direct permission', () => {
      const user = manager.registerUser({ 
        username: 'hasperms', 
        permissions: ['tool.execute'] 
      });

      expect(manager.userHasPermission(user.id, 'tool.execute')).toBe(true);
    });

    it('should return true for user with role that has permission', () => {
      const user = manager.registerUser({ 
        username: 'roleperms', 
        roles: ['editor'] 
      });

      expect(manager.userHasPermission(user.id, 'tool.execute')).toBe(true);
    });

    it('should return false for user without permission', () => {
      const user = manager.registerUser({ 
        username: 'noperms', 
        permissions: [] 
      });

      expect(manager.userHasPermission(user.id, 'admin.action')).toBe(false);
    });

    it('should return false for non-existent user', () => {
      expect(manager.userHasPermission('non-existent', 'any')).toBe(false);
    });

    it('should return false for disabled user', () => {
      const user = manager.registerUser({ username: 'disabledperm' });
      manager.disableUser(user.id);

      expect(manager.userHasPermission(user.id, 'any')).toBe(false);
    });
  });

  describe('getSessionCount', () => {
    it('should return correct session count', () => {
      const user = manager.registerUser({ username: 'sessioncount' });

      manager.bindUser(user.id, 'count-1');
      manager.bindUser(user.id, 'count-2');
      manager.bindUser(user.id, 'count-3');

      expect(manager.getSessionCount(user.id)).toBe(3);
    });
  });

  describe('updateUser', () => {
    it('should update user fields', () => {
      const user = manager.registerUser({ username: 'updateable' });

      const updated = manager.updateUser(user.id, {
        displayName: 'Updated Name',
        email: 'updated@test.com'
      });

      expect(updated).toBe(true);

      const result = manager.lookupUser(user.id);
      expect(result.user?.displayName).toBe('Updated Name');
      expect(result.user?.email).toBe('updated@test.com');
    });

    it('should return false for non-existent user', () => {
      const updated = manager.updateUser('non-existent', { displayName: 'Test' });
      expect(updated).toBe(false);
    });
  });

  describe('enableUser', () => {
    it('should re-enable disabled user', () => {
      const user = manager.registerUser({ username: 'reenable' });
      manager.disableUser(user.id);

      const enabled = manager.enableUser(user.id);
      expect(enabled).toBe(true);

      const result = manager.lookupUser(user.id);
      expect(result.found).toBe(true);
      expect(result.errorCode).toBe('valid');
    });
  });
});