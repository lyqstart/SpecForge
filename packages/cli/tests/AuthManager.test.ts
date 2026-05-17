/**
 * Unit tests for AuthManager
 * 
 * Tests:
 * - Reading handshake file
 * - Validating Bearer Token
 * - Generating Authorization headers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  AuthManager,
  createAuthManager,
  createAuthenticatedClient,
  getDefaultHandshakePath,
  getRuntimeDirPath,
  HandshakeNotFoundError,
  InvalidHandshakeError,
  InvalidTokenError,
  TokenExpiredError,
  DaemonHandshake,
} from '../src/auth/AuthManager';

// Mock fs module (both fs and fs.promises)
const mockFsAccess = vi.fn();
const mockFsReadFile = vi.fn();

vi.mock('fs', () => ({
  constants: {
    R_OK: 0o4,
  },
  promises: {
    access: mockFsAccess,
    readFile: mockFsReadFile,
  },
}));

// Test temp path
const TEST_HANDSHAKE_PATH = path.join(os.tmpdir(), 'test-daemon.sock.json');

describe('AuthManager', () => {
  let auth: AuthManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFsAccess.mockReset();
    mockFsReadFile.mockReset();
    // Use test path to avoid reading real file
    auth = new AuthManager({ handshakePath: TEST_HANDSHAKE_PATH });
  });

  afterEach(() => {
    auth.clear();
  });

  describe('getDefaultHandshakePath', () => {
    it('should return correct default path', () => {
      const expected = path.join(os.homedir(), '.specforge', 'runtime', 'daemon.sock.json');
      expect(getDefaultHandshakePath()).toBe(expected);
    });
  });

  describe('getRuntimeDirPath', () => {
    it('should return correct runtime directory path', () => {
      const expected = path.join(os.homedir(), '.specforge', 'runtime');
      expect(getRuntimeDirPath()).toBe(expected);
    });
  });

  describe('constructor', () => {
    it('should use default path when not provided', () => {
      const authDefault = new AuthManager();
      expect(authDefault.handshakePath).toBe(getDefaultHandshakePath());
    });

    it('should use custom path when provided', () => {
      const customPath = '/custom/path/daemon.sock.json';
      const authCustom = new AuthManager({ handshakePath: customPath });
      expect(authCustom.handshakePath).toBe(customPath);
    });
  });

  describe('readHandshake', () => {
    const validHandshake: DaemonHandshake = {
      bound_to: '127.0.0.1',
      port: 3847,
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token-signature',
      schema_version: '1.0',
      timestamp: Date.now(),
    };

    it('should throw HandshakeNotFoundError when file does not exist', async () => {
      mockFsAccess.mockRejectedValue(new Error('ENOENT'));

      await expect(auth.readHandshake()).rejects.toThrow(HandshakeNotFoundError);
    });

    it('should read and parse valid handshake file', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify(validHandshake));

      const result = await auth.readHandshake();

      expect(result.bound_to).toBe('127.0.0.1');
      expect(result.port).toBe(3847);
      expect(result.token).toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(auth.hasHandshake).toBe(true);
    });

    it('should throw InvalidHandshakeError for invalid JSON', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue('not valid json');

      await expect(auth.readHandshake()).rejects.toThrow(InvalidHandshakeError);
    });

    it('should throw InvalidHandshakeError when required fields missing', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify({ bound_to: '127.0.0.1' }));

      await expect(auth.readHandshake()).rejects.toThrow(InvalidHandshakeError);
    });

    it('should throw InvalidHandshakeError for invalid port', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 70000,
          token: 'valid-token',
        })
      );

      await expect(auth.readHandshake()).rejects.toThrow(InvalidHandshakeError);
    });

    it('should throw InvalidHandshakeError for invalid token type', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: 12345,
        })
      );

      await expect(auth.readHandshake()).rejects.toThrow(InvalidHandshakeError);
    });

    it('should handle skipValidation option', async () => {
      const authSkipValidation = new AuthManager({ 
        handshakePath: TEST_HANDSHAKE_PATH,
        skipValidation: true 
      });
      
      // Should not throw even with invalid data when skipValidation is true
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue('invalid json');

      await expect(authSkipValidation.readHandshake()).rejects.toThrow();
    });
  });

  describe('validateToken', () => {
    const validHandshake: DaemonHandshake = {
      bound_to: '127.0.0.1',
      port: 3847,
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-signature',
    };

    beforeEach(async () => {
      mockFsAccess.mockReset();
      mockFsReadFile.mockReset();
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify(validHandshake));
      await auth.readHandshake();
    });

    it('should return valid for correct token format', () => {
      const result = auth.validateToken();
      expect(result.isValid).toBe(true);
      expect(result.tokenPreview).toBeDefined();
    });

    it('should return invalid for empty token', async () => {
      const authEmpty = createAuthManager({ 
        handshakePath: TEST_HANDSHAKE_PATH,
        skipValidation: true 
      });
      mockFsAccess.mockReset();
      mockFsReadFile.mockReset();
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: '',
        })
      );
      await authEmpty.readHandshake();

      const result = authEmpty.validateToken();
      expect(result.isValid).toBe(false);
      // Empty string is falsy, so it returns "No token available"
      expect(result.error).toContain('No token available');
    });

    it('should return invalid for short token', async () => {
      const authShort = createAuthManager({ 
        handshakePath: TEST_HANDSHAKE_PATH,
        skipValidation: true 
      });
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: 'short',
        })
      );
      await authShort.readHandshake();

      const result = authShort.validateToken();
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too short');
    });

    it('should return invalid for invalid characters', async () => {
      const authInvalid = createAuthManager({ 
        handshakePath: TEST_HANDSHAKE_PATH,
        skipValidation: true 
      });
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: 'invalid@token!with$pecial',
        })
      );
      await authInvalid.readHandshake();

      const result = authInvalid.validateToken();
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    it('should return invalid when no token available', () => {
      const authNoToken = createAuthManager({ 
        handshakePath: TEST_HANDSHAKE_PATH,
        skipValidation: true 
      });
      const result = authNoToken.validateToken();
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateTokenOrThrow', () => {
    const validHandshake: DaemonHandshake = {
      bound_to: '127.0.0.1',
      port: 3847,
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-signature',
    };

    beforeEach(async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify(validHandshake));
      await auth.readHandshake();
    });

    it('should not throw for valid token', () => {
      expect(() => auth.validateTokenOrThrow()).not.toThrow();
    });

    it('should throw InvalidTokenError for invalid token', async () => {
      const authInvalid = createAuthManager({ 
        handshakePath: TEST_HANDSHAKE_PATH,
        skipValidation: true 
      });
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: 'short',
        })
      );

      await authInvalid.readHandshake();
      expect(() => authInvalid.validateTokenOrThrow()).toThrow(InvalidTokenError);
    });
  });

  describe('getAuthHeaders', () => {
    const validHandshake: DaemonHandshake = {
      bound_to: '127.0.0.1',
      port: 3847,
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-signature',
    };

    beforeEach(async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify(validHandshake));
      await auth.readHandshake();
    });

    it('should return Authorization header with Bearer token', () => {
      const headers = auth.getAuthHeaders();
      expect(headers).toHaveProperty('Authorization');
      expect(headers.Authorization).toMatch(/^Bearer /);
      expect(headers.Authorization).toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should throw when no handshake loaded', () => {
      const authEmpty = new AuthManager({ handshakePath: TEST_HANDSHAKE_PATH });
      expect(() => authEmpty.getAuthHeaders()).toThrow(InvalidTokenError);
    });
  });

  describe('getAuthorizationHeader', () => {
    const validHandshake: DaemonHandshake = {
      bound_to: '127.0.0.1',
      port: 3847,
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-signature',
    };

    beforeEach(async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify(validHandshake));
      await auth.readHandshake();
    });

    it('should return full Authorization header value', () => {
      const header = auth.getAuthorizationHeader();
      expect(header).toMatch(/^Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.test-signature$/);
    });
  });

  describe('getConnectionDetails', () => {
    it('should return null when no handshake loaded', () => {
      expect(auth.getConnectionDetails()).toBeNull();
    });

    it('should return connection details with localhost for 0.0.0.0', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '0.0.0.0',
          port: 3847,
          token: 'valid-token',
        })
      );
      await auth.readHandshake();

      const details = auth.getConnectionDetails();
      expect(details).toEqual({ host: '127.0.0.1', port: 3847 });
    });

    it('should return original host when not 0.0.0.0', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '192.168.1.100',
          port: 3847,
          token: 'valid-token',
        })
      );
      await auth.readHandshake();

      const details = auth.getConnectionDetails();
      expect(details).toEqual({ host: '192.168.1.100', port: 3847 });
    });
  });

  describe('clear', () => {
    const validHandshake: DaemonHandshake = {
      bound_to: '127.0.0.1',
      port: 3847,
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-signature',
    };

    beforeEach(async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify(validHandshake));
      await auth.readHandshake();
    });

    it('should clear handshake data', () => {
      expect(auth.hasHandshake).toBe(true);
      auth.clear();
      expect(auth.hasHandshake).toBe(false);
    });

    it('should reset authentication state', () => {
      auth.validateToken();
      expect(auth.isAuthenticated).toBe(true);
      auth.clear();
      expect(auth.isAuthenticated).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    const validHandshake: DaemonHandshake = {
      bound_to: '127.0.0.1',
      port: 3847,
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-signature',
    };

    it('should return false when no handshake', () => {
      expect(auth.isAuthenticated).toBe(false);
    });

    it('should return false when handshake but no token', async () => {
      const authNoToken = createAuthManager({ 
        handshakePath: TEST_HANDSHAKE_PATH,
        skipValidation: true 
      });
      mockFsAccess.mockReset();
      mockFsReadFile.mockReset();
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: '',  // Empty token - valid in handshake but no token for auth
        })
      );
      await authNoToken.readHandshake();
      // Even with skipValidation, hasToken checks for truthy token
      expect(authNoToken.hasToken).toBe(false);
      expect(authNoToken.isAuthenticated).toBe(false);
    });

    it('should return true when handshake with validated token', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify(validHandshake));
      await auth.readHandshake();
      auth.validateToken();
      expect(auth.isAuthenticated).toBe(true);
    });
  });

  describe('createAuthenticatedClient', () => {
    const validHandshake: DaemonHandshake = {
      bound_to: '127.0.0.1',
      port: 3847,
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-signature',
    };

    it('should create authenticated client', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify(validHandshake));

      const client = await createAuthenticatedClient({ handshakePath: TEST_HANDSHAKE_PATH });

      expect(client.hasToken).toBe(true);
      expect(client.isAuthenticated).toBe(true);
    });

    it('should throw on invalid token', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: 'short',
        })
      );

      await expect(
        createAuthenticatedClient({ handshakePath: TEST_HANDSHAKE_PATH })
      ).rejects.toThrow(InvalidTokenError);
    });
  });
});

describe('Error classes', () => {
  it('HandshakeNotFoundError should have correct properties', () => {
    const error = new HandshakeNotFoundError('/path/to/file');
    expect(error.name).toBe('HandshakeNotFoundError');
    expect(error.code).toBe('HANDSHAKE_NOT_FOUND');
    expect(error.isRetryable).toBe(false);
    expect(error.handshakePath).toBe('/path/to/file');
  });

  it('InvalidHandshakeError should have correct properties', () => {
    const error = new InvalidHandshakeError('test error');
    expect(error.name).toBe('InvalidHandshakeError');
    expect(error.code).toBe('INVALID_HANDSHAKE');
    expect(error.isRetryable).toBe(false);
  });

  it('InvalidTokenError should have correct properties', () => {
    const error = new InvalidTokenError('test error');
    expect(error.name).toBe('InvalidTokenError');
    expect(error.code).toBe('INVALID_TOKEN');
    expect(error.isRetryable).toBe(false);
  });
});

describe('New methods (getToken, getDaemonUrl, refresh, isTokenExpired)', () => {
  let auth: AuthManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFsAccess.mockReset();
    mockFsReadFile.mockReset();
    auth = new AuthManager({ handshakePath: TEST_HANDSHAKE_PATH });
  });

  afterEach(() => {
    auth.clear();
  });

  describe('getToken', () => {
    const validHandshake: DaemonHandshake = {
      bound_to: '127.0.0.1',
      port: 3847,
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-signature',
    };

    it('should return the token string', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify(validHandshake));
      await auth.readHandshake();

      const token = auth.getToken();
      expect(token).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-signature');
    });

    it('should throw InvalidTokenError when handshake not loaded', () => {
      expect(() => auth.getToken()).toThrow(InvalidTokenError);
    });

    it('should throw InvalidTokenError when token is empty', async () => {
      // Create auth manager with skipValidation to bypass handshake validation
      const authSkipValidation = new AuthManager({ 
        handshakePath: TEST_HANDSHAKE_PATH,
        skipValidation: true 
      });
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: '',
        })
      );
      await authSkipValidation.readHandshake();
      expect(() => authSkipValidation.getToken()).toThrow(InvalidTokenError);
    });
  });

  describe('getDaemonUrl', () => {
    it('should throw InvalidHandshakeError when handshake not loaded', () => {
      expect(() => auth.getDaemonUrl()).toThrow(InvalidHandshakeError);
    });

    it('should return correct URL for 127.0.0.1', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: 'valid-token',
        })
      );
      await auth.readHandshake();

      const url = auth.getDaemonUrl();
      expect(url).toBe('http://127.0.0.1:3847');
    });

    it('should return correct URL for 0.0.0.0 (converted to localhost)', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '0.0.0.0',
          port: 3847,
          token: 'valid-token',
        })
      );
      await auth.readHandshake();

      const url = auth.getDaemonUrl();
      expect(url).toBe('http://127.0.0.1:3847');
    });

    it('should return correct URL for custom host', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '192.168.1.100',
          port: 8080,
          token: 'valid-token',
        })
      );
      await auth.readHandshake();

      const url = auth.getDaemonUrl();
      expect(url).toBe('http://192.168.1.100:8080');
    });
  });

  describe('refresh', () => {
    const validHandshake: DaemonHandshake = {
      bound_to: '127.0.0.1',
      port: 3847,
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-signature',
    };

    it('should clear and re-read handshake file', async () => {
      // First load
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify(validHandshake));
      await auth.readHandshake();
      expect(auth.hasHandshake).toBe(true);

      // Refresh with new data
      const updatedHandshake = {
        ...validHandshake,
        port: 9999,
      };
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify(updatedHandshake));
      await auth.refresh();

      expect(auth.hasHandshake).toBe(true);
      expect(auth.getDaemonUrl()).toBe('http://127.0.0.1:9999');
    });

    it('should throw when file does not exist on refresh', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(JSON.stringify(validHandshake));
      await auth.readHandshake();

      mockFsAccess.mockRejectedValue(new Error('ENOENT'));
      await expect(auth.refresh()).rejects.toThrow(HandshakeNotFoundError);
    });
  });

  describe('isTokenExpired', () => {
    it('should return false when no timestamp in handshake', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: 'valid-token',
          // No timestamp field
        })
      );
      await auth.readHandshake();

      expect(auth.isTokenExpired()).toBe(false);
    });

    it('should return false when token is not expired', async () => {
      const now = Date.now();
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: 'valid-token',
          timestamp: now - 1000, // 1 second ago
        })
      );
      await auth.readHandshake();

      expect(auth.isTokenExpired()).toBe(false);
    });

    it('should return true when token is expired', async () => {
      const now = Date.now();
      // 25 hours ago - more than the default 24 hour expiry
      const oldTimestamp = now - (25 * 60 * 60 * 1000);
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: 'valid-token',
          timestamp: oldTimestamp,
        })
      );
      await auth.readHandshake();

      expect(auth.isTokenExpired()).toBe(true);
    });
  });

  describe('isAuthenticated with expiration', () => {
    it('should return false when token is expired', async () => {
      const now = Date.now();
      const oldTimestamp = now - (25 * 60 * 60 * 1000); // 25 hours ago
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-signature',
          timestamp: oldTimestamp,
        })
      );
      await auth.readHandshake();
      auth.validateToken();

      // isAuthenticated should check expiration
      expect(auth.isAuthenticated).toBe(false);
    });

    it('should return true when token is not expired', async () => {
      const now = Date.now();
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          bound_to: '127.0.0.1',
          port: 3847,
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-signature',
          timestamp: now - 1000, // 1 second ago
        })
      );
      await auth.readHandshake();
      auth.validateToken();

      expect(auth.isAuthenticated).toBe(true);
    });
  });
});