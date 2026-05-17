/**
 * API Key Manager Unit Tests
 * 
 * Tests for the ApiKeyManager service implementing long-term API key management
 * for remote access as required by Property 26: Remote Access Guard
 * 
 * @specforge/permission-engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ApiKeyManager, createApiKeyManager } from '../../src/services/api-key-manager';

describe('ApiKeyManager', () => {
  let manager: ApiKeyManager;

  beforeEach(() => {
    manager = createApiKeyManager({
      projectId: 'test-project',
      persistKeys: false // In-memory for tests
    });
  });

  describe('createKey', () => {
    it('should create a new API key with all required fields', () => {
      const { key, apiKey } = manager.createKey({
        name: 'Test Key',
        userId: 'user-123'
      });

      expect(key).toBeDefined();
      expect(key.length).toBe(64); // 256-bit hex = 64 chars
      expect(apiKey.id).toBeDefined();
      expect(apiKey.name).toBe('Test Key');
      expect(apiKey.userId).toBe('user-123');
      expect(apiKey.enabled).toBe(true);
      expect(apiKey.keyHash).toBeDefined();
      expect(apiKey.createdAt).toBeDefined();
      expect(apiKey.expiresAt).toBeDefined();
    });

    it('should create key with optional IP whitelist', () => {
      const { apiKey } = manager.createKey({
        name: 'IP Whitelisted Key',
        userId: 'user-123',
        ipWhitelist: ['192.168.1.0/24', '10.0.0.1']
      });

      expect(apiKey.ipWhitelist).toEqual(['192.168.1.0/24', '10.0.0.1']);
    });

    it('should create key with custom expiration', () => {
      const expiresAt = new Date('2025-12-31');
      const { apiKey } = manager.createKey({
        name: 'Custom Expiry Key',
        userId: 'user-123',
        expiresAt
      });

      expect(apiKey.expiresAt).toBe(expiresAt.toISOString());
    });

    it('should create key with custom permissions', () => {
      const { apiKey } = manager.createKey({
        name: 'Limited Key',
        userId: 'user-123',
        permissions: ['read', 'write']
      });

      expect(apiKey.permissions).toEqual(['read', 'write']);
    });
  });

  describe('validateKey', () => {
    it('should reject invalid key format', () => {
      const result = manager.validateKey('short');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('key_not_found');
    });

    it('should reject unknown key', () => {
      const result = manager.validateKey('a'.repeat(64));
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('key_not_found');
    });

    it('should accept valid key', () => {
      const { key } = manager.createKey({
        name: 'Valid Key',
        userId: 'user-123'
      });

      const result = manager.validateKey(key);
      expect(result.valid).toBe(true);
      expect(result.errorCode).toBe('valid');
      expect(result.apiKey).toBeDefined();
      expect(result.apiKey!.name).toBe('Valid Key');
    });

    it('should reject disabled key', () => {
      const { key, apiKey } = manager.createKey({
        name: 'To Be Disabled',
        userId: 'user-123'
      });

      manager.revokeKey(apiKey.id);

      const result = manager.validateKey(key);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('key_disabled');
    });

    it('should reject expired key', () => {
      const { key } = manager.createKey({
        name: 'Expired Key',
        userId: 'user-123',
        expiresAt: new Date(Date.now() - 1000) // Past date
      });

      const result = manager.validateKey(key);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('key_expired');
    });

    it('should enforce IP whitelist', () => {
      const { key } = manager.createKey({
        name: 'IP Restricted Key',
        userId: 'user-123',
        ipWhitelist: ['192.168.1.0/24']
      });

      // IP not in whitelist
      const result1 = manager.validateKey(key, '10.0.0.1');
      expect(result1.valid).toBe(false);
      expect(result1.reason).toContain('not in whitelist');

      // IP in whitelist
      const result2 = manager.validateKey(key, '192.168.1.50');
      expect(result2.valid).toBe(true);
    });

    it('should allow exact IP match in whitelist', () => {
      const { key } = manager.createKey({
        name: 'Exact IP Key',
        userId: 'user-123',
        ipWhitelist: ['192.168.1.100']
      });

      const result = manager.validateKey(key, '192.168.1.100');
      expect(result.valid).toBe(true);
    });
  });

  describe('revokeKey', () => {
    it('should revoke an existing key', () => {
      const { apiKey } = manager.createKey({
        name: 'Revokable Key',
        userId: 'user-123'
      });

      const revoked = manager.revokeKey(apiKey.id);
      expect(revoked).toBe(true);

      // Key should now be disabled
      const keys = manager.getAllKeys();
      const key = keys.find(k => k.id === apiKey.id);
      expect(key!.enabled).toBe(false);
    });

    it('should return false for non-existent key', () => {
      const revoked = manager.revokeKey('non-existent-id');
      expect(revoked).toBe(false);
    });
  });

  describe('getAllKeys', () => {
    it('should return all keys without exposing actual key values', () => {
      manager.createKey({ name: 'Key 1', userId: 'user-1' });
      manager.createKey({ name: 'Key 2', userId: 'user-2' });

      const keys = manager.getAllKeys();
      expect(keys.length).toBe(2);
      expect(keys[0].key).toBeUndefined(); // Key should not be exposed
    });
  });

  describe('getKeysForUser', () => {
    it('should return only keys for specified user', () => {
      manager.createKey({ name: 'User 1 Key 1', userId: 'user-1' });
      manager.createKey({ name: 'User 1 Key 2', userId: 'user-1' });
      manager.createKey({ name: 'User 2 Key', userId: 'user-2' });

      const user1Keys = manager.getKeysForUser('user-1');
      expect(user1Keys.length).toBe(2);
    });
  });

  describe('updateIpWhitelist', () => {
    it('should update IP whitelist for existing key', () => {
      const { apiKey } = manager.createKey({
        name: 'Updateable Key',
        userId: 'user-123'
      });

      const updated = manager.updateIpWhitelist(apiKey.id, ['10.0.0.0/8']);
      expect(updated).toBe(true);

      const keys = manager.getAllKeys();
      const key = keys.find(k => k.id === apiKey.id);
      expect(key!.ipWhitelist).toEqual(['10.0.0.0/8']);
    });

    it('should return false for non-existent key', () => {
      const updated = manager.updateIpWhitelist('non-existent', ['10.0.0.0/8']);
      expect(updated).toBe(false);
    });
  });

  describe('CIDR matching', () => {
    it('should correctly match /24 subnet', () => {
      const { key } = manager.createKey({
        name: 'CIDR Key',
        userId: 'user-123',
        ipWhitelist: ['192.168.1.0/24']
      });

      // Within subnet
      expect(manager.validateKey(key, '192.168.1.1').valid).toBe(true);
      expect(manager.validateKey(key, '192.168.1.255').valid).toBe(true);

      // Outside subnet
      expect(manager.validateKey(key, '192.168.2.1').valid).toBe(false);
    });

    it('should correctly match /16 subnet', () => {
      const { key } = manager.createKey({
        name: 'CIDR /16 Key',
        userId: 'user-123',
        ipWhitelist: ['10.0.0.0/16']
      });

      expect(manager.validateKey(key, '10.0.1.1').valid).toBe(true);
      expect(manager.validateKey(key, '10.1.0.1').valid).toBe(false);
    });
  });
});