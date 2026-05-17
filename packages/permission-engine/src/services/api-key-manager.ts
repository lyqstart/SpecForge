/**
 * API Key Manager Service
 * 
 * Implements long-term API key management for remote access as required by
 * Property 26: Remote Access Guard
 * 
 * Manages API keys used for remote access (distinct from local Bearer Tokens).
 * Supports creation, validation, revocation, and expiration.
 * 
 * @specforge/permission-engine
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// Schema for API key metadata
export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(32),           // The actual API key (hashed)
  keyHash: z.string(),               // SHA-256 hash of the key
  name: z.string().min(1),           // User-friendly name for the key
  userId: z.string().min(1),         // Bound user ID
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  lastUsedAt: z.string().datetime().optional(),
  ipWhitelist: z.array(z.string()).optional(),  // Optional IP whitelist
  enabled: z.boolean().default(true),
  permissions: z.array(z.string()).default([])  // Optional specific permissions
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

// Schema for API keys storage file
export const ApiKeysStorageSchema = z.object({
  schema_version: z.string().default('1.0'),
  keys: z.array(ApiKeySchema)
});

export type ApiKeysStorage = z.infer<typeof ApiKeysStorageSchema>;

export interface ApiKeyManagerConfig {
  /** Path to store API keys (optional, for persistence) */
  storagePath?: string;
  /** Project ID for event logging */
  projectId: string;
  /** Default key expiration in milliseconds (optional) */
  defaultExpiration?: number;
  /** Whether to persist keys to disk */
  persistKeys?: boolean;
}

export interface CreateApiKeyOptions {
  /** User-friendly name for the key */
  name: string;
  /** User ID to bind the key to */
  userId: string;
  /** Optional IP whitelist for this key */
  ipWhitelist?: string[];
  /** Optional expiration time */
  expiresAt?: Date;
  /** Optional specific permissions */
  permissions?: string[];
}

export interface ValidateApiKeyResult {
  /** Whether the key is valid */
  valid: boolean;
  /** The API key metadata if valid */
  apiKey?: ApiKey;
  /** Reason for denial if invalid */
  reason: string;
  /** Error code for programmatic handling */
  errorCode: 'key_not_found' | 'key_disabled' | 'key_expired' | 'valid';
}

/**
 * API Key Manager
 * 
 * Manages long-term API keys for remote access.
 * Keys are stored as hashes for security.
 */
export class ApiKeyManager {
  private config: Required<ApiKeyManagerConfig>;
  private keys: Map<string, ApiKey> = new Map();  // id -> ApiKey
  private keyHashes: Map<string, string> = new Map();  // keyHash -> keyId

  constructor(config: ApiKeyManagerConfig) {
    this.config = {
      storagePath: config.storagePath ?? '',
      projectId: config.projectId,
      defaultExpiration: config.defaultExpiration ?? 365 * 24 * 60 * 60 * 1000, // 1 year default
      persistKeys: config.persistKeys ?? true
    };

    // Load existing keys if storage path is provided
    if (this.config.storagePath) {
      this.loadKeys();
    }
  }

  /**
   * Generate a new API key
   * 
   * @param options - Options for creating the key
   * @returns The full API key (only returned once) and metadata
   */
  createKey(options: CreateApiKeyOptions): { key: string; apiKey: ApiKey } {
    // Generate a secure random key (256-bit)
    const key = crypto.randomBytes(32).toString('hex');
    const keyHash = this.hashKey(key);
    
    const now = new Date().toISOString();
    const apiKey: ApiKey = {
      id: crypto.randomUUID(),
      key,  // Note: In production, store only hash
      keyHash,
      name: options.name,
      userId: options.userId,
      createdAt: now,
      expiresAt: options.expiresAt?.toISOString() ?? 
        new Date(Date.now() + this.config.defaultExpiration).toISOString(),
      ipWhitelist: options.ipWhitelist,
      enabled: true,
      permissions: options.permissions ?? []
    };

    // Store the key
    this.keys.set(apiKey.id, apiKey);
    this.keyHashes.set(keyHash, apiKey.id);

    // Persist if enabled
    if (this.config.persistKeys && this.config.storagePath) {
      this.saveKeys();
    }

    // Return the full key (only time it's accessible)
    return { key, apiKey };
  }

  /**
   * Validate an API key
   * 
   * @param key - The API key to validate
   * @param clientIp - Optional client IP for IP whitelist checking
   * @returns Validation result
   */
  validateKey(key: string, clientIp?: string): ValidateApiKeyResult {
    if (!key || key.length < 32) {
      return {
        valid: false,
        reason: 'Invalid API key format',
        errorCode: 'key_not_found'
      };
    }

    const keyHash = this.hashKey(key);
    const keyId = this.keyHashes.get(keyHash);

    if (!keyId) {
      return {
        valid: false,
        reason: 'API key not found',
        errorCode: 'key_not_found'
      };
    }

    const apiKey = this.keys.get(keyId);
    if (!apiKey) {
      return {
        valid: false,
        reason: 'API key not found',
        errorCode: 'key_not_found'
      };
    }

    // Check if key is enabled
    if (!apiKey.enabled) {
      return {
        valid: false,
        reason: 'API key is disabled',
        errorCode: 'key_disabled'
      };
    }

    // Check if key is expired
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return {
        valid: false,
        reason: 'API key has expired',
        errorCode: 'key_expired'
      };
    }

    // Check IP whitelist if configured
    if (apiKey.ipWhitelist && apiKey.ipWhitelist.length > 0 && clientIp) {
      if (!this.isIpAllowed(clientIp, apiKey.ipWhitelist)) {
        return {
          valid: false,
          reason: `Client IP ${clientIp} not in whitelist`,
          errorCode: 'key_not_found'
        };
      }
    }

    // Update last used timestamp
    apiKey.lastUsedAt = new Date().toISOString();
    this.keys.set(apiKey.id, apiKey);

    return {
      valid: true,
      apiKey,
      reason: 'Valid API key',
      errorCode: 'valid'
    };
  }

  /**
   * Check if an IP is in the whitelist
   * Supports CIDR notation and exact matches
   */
  private isIpAllowed(clientIp: string, whitelist: string[]): boolean {
    return whitelist.some(entry => {
      // Exact match
      if (entry === clientIp) {
        return true;
      }

      // CIDR notation check (e.g., "192.168.1.0/24")
      if (entry.includes('/')) {
        return this.checkCidrMatch(clientIp, entry);
      }

      return false;
    });
  }

  /**
   * Check if an IP matches a CIDR range
   */
  private checkCidrMatch(ip: string, cidr: string): boolean {
    try {
      const [network, maskStr] = cidr.split('/');
      const mask = parseInt(maskStr, 10);
      
      if (isNaN(mask) || mask < 0 || mask > 32) {
        return false;
      }

      const ipParts = ip.split('.').map(Number);
      const networkParts = network.split('.').map(Number);

      if (ipParts.length !== 4 || networkParts.length !== 4) {
        return false;
      }

      const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
      const networkNum = (networkParts[0] << 24) | (networkParts[1] << 16) | (networkParts[2] << 8) | networkParts[3];

      const maskNum = ~((1 << (32 - mask)) - 1) >>> 0;
      
      return (ipNum & maskNum) === (networkNum & maskNum);
    } catch {
      return false;
    }
  }

  /**
   * Revoke an API key
   * 
   * @param keyId - The ID of the key to revoke
   * @returns Whether the key was revoked
   */
  revokeKey(keyId: string): boolean {
    const apiKey = this.keys.get(keyId);
    if (!apiKey) {
      return false;
    }

    apiKey.enabled = false;
    this.keys.set(keyId, apiKey);

    if (this.config.persistKeys && this.config.storagePath) {
      this.saveKeys();
    }

    return true;
  }

  /**
   * Delete an API key permanently
   * 
   * @param keyId - The ID of the key to delete
   * @returns Whether the key was deleted
   */
  deleteKey(keyId: string): boolean {
    const apiKey = this.keys.get(keyId);
    if (!apiKey) {
      return false;
    }

    this.keyHashes.delete(apiKey.keyHash);
    this.keys.delete(keyId);

    if (this.config.persistKeys && this.config.storagePath) {
      this.saveKeys();
    }

    return true;
  }

  /**
   * Get all API keys (without the actual key value)
   * 
   * @returns Array of API key metadata
   */
  getAllKeys(): Omit<ApiKey, 'key'>[] {
    return Array.from(this.keys.values()).map(({ key, ...rest }) => rest);
  }

  /**
   * Get a specific API key by ID (without the actual key value)
   * 
   * @param keyId - The ID of the key
   * @returns API key metadata or undefined
   */
  getKey(keyId: string): Omit<ApiKey, 'key'> | undefined {
    const apiKey = this.keys.get(keyId);
    if (!apiKey) {
      return undefined;
    }
    const { key, ...rest } = apiKey;
    return rest;
  }

  /**
   * Get keys for a specific user
   * 
   * @param userId - The user ID
   * @returns Array of API key metadata
   */
  getKeysForUser(userId: string): Omit<ApiKey, 'key'>[] {
    return Array.from(this.keys.values())
      .filter(k => k.userId === userId)
      .map(({ key, ...rest }) => rest);
  }

  /**
   * Hash an API key using SHA-256
   */
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Load keys from storage
   */
  private loadKeys(): void {
    try {
      if (!this.config.storagePath || !fs.existsSync(this.config.storagePath)) {
        return;
      }

      const data = fs.readFileSync(this.config.storagePath, 'utf-8');
      const storage = ApiKeysStorageSchema.parse(JSON.parse(data));

      for (const apiKey of storage.keys) {
        // Note: When loading from storage, we don't have the original key
        // Only store the hash and a placeholder
        const { key, ...metadata } = apiKey;
        this.keys.set(metadata.id, { ...metadata, key: '' });  // Empty key since we only store hash
        this.keyHashes.set(metadata.keyHash, metadata.id);
      }
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  }

  /**
   * Save keys to storage
   */
  private saveKeys(): void {
    try {
      if (!this.config.storagePath) {
        return;
      }

      // Ensure directory exists
      const dir = path.dirname(this.config.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const storage: ApiKeysStorage = {
        schema_version: '1.0',
        keys: Array.from(this.keys.values()).map(({ key, ...rest }) => ({
          ...rest,
          key: ''  // Don't persist the actual key
        }))
      };

      fs.writeFileSync(this.config.storagePath, JSON.stringify(storage, null, 2));
    } catch (error) {
      console.error('Failed to save API keys:', error);
    }
  }

  /**
   * Update IP whitelist for a key
   * 
   * @param keyId - The ID of the key
   * @param ipWhitelist - New IP whitelist
   * @returns Whether the update was successful
   */
  updateIpWhitelist(keyId: string, ipWhitelist: string[]): boolean {
    const apiKey = this.keys.get(keyId);
    if (!apiKey) {
      return false;
    }

    apiKey.ipWhitelist = ipWhitelist;
    this.keys.set(keyId, apiKey);

    if (this.config.persistKeys && this.config.storagePath) {
      this.saveKeys();
    }

    return true;
  }

  /**
   * Check if manager has any keys
   */
  hasKeys(): boolean {
    return this.keys.size > 0;
  }

  /**
   * Get key count
   */
  getKeyCount(): number {
    return this.keys.size;
  }
}

/**
 * Create an ApiKeyManager instance
 * 
 * @param config - Manager configuration
 * @returns Configured instance
 */
export function createApiKeyManager(config: ApiKeyManagerConfig): ApiKeyManager {
  return new ApiKeyManager(config);
}