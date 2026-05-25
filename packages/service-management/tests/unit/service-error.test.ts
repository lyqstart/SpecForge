/**
 * Unit tests for service error factory
 */

import { describe, it, expect } from 'vitest';
import {
  ServiceError,
  createServiceError,
  wrapServiceError,
  isServiceError,
} from '../../src/errors/index.js';

describe('ServiceError', () => {
  it('should create error with code, message, and suggestion', () => {
    const error = createServiceError('SVC_SYSTEMD_NOT_AVAILABLE');

    expect(error.code).toBe('SVC_SYSTEMD_NOT_AVAILABLE');
    expect(error.message).toContain('systemd');
    expect(error.suggestion).toContain('systemd');
    expect(error.exitCode).toBe(2);
  });

  it('should include context in message', () => {
    const error = createServiceError('SVC_BINARY_MISSING', {
      binaryPath: '/usr/bin/specforged',
    });

    expect(error.message).toContain('/usr/bin/specforged');
  });

  it('should include service name in message', () => {
    const error = createServiceError('SVC_HEALTH_CHECK_FAILED', {
      serviceName: 'specforge-daemon',
      logPath: '~/.specforge/logs/daemon.err',
    });

    expect(error.message).toContain('specforge-daemon');
    expect(error.suggestion).toContain('~/.specforge/logs/daemon.err');
  });

  it('should include dependency info in message', () => {
    const error = createServiceError('SVC_DEPENDENCY_NOT_RUNNING', {
      dependencyName: 'opencode-server',
    });

    expect(error.message).toContain('opencode-server');
  });

  it('should include port info in message', () => {
    const error = createServiceError('SVC_PORT_IN_USE', {
      port: 3000,
    });

    expect(error.message).toContain('3000');
  });

  describe('timeout error details (lessons-injected C3)', () => {
    it('should include operation, timeoutMs, attempts, lastError for SVC_GRACEFUL_TIMEOUT', () => {
      const error = createServiceError('SVC_GRACEFUL_TIMEOUT', {
        operation: 'service.start(specforge-daemon)',
        timeoutMs: 30000,
        attempts: 1,
        lastError: 'ECONNREFUSED 127.0.0.1:3000',
      });

      expect(error.operation).toBe('service.start(specforge-daemon)');
      expect(error.timeoutMs).toBe(30000);
      expect(error.attempts).toBe(1);
      expect(error.lastError).toBe('ECONNREFUSED 127.0.0.1:3000');
    });

    it('should include all C3 required fields in timeout errors', () => {
      const error = createServiceError('SVC_GRACEFUL_TIMEOUT', {
        operation: 'systemctl start',
        timeoutMs: 30000,
        attempts: 3,
        lastError: 'Command timed out',
      });

      // Check all required fields per lessons-injected C3
      expect(error.operation).toBeDefined();
      expect(error.timeoutMs).toBeDefined();
      expect(error.attempts).toBeDefined();
      expect(error.lastError).toBeDefined();
      expect(error.suggestion).toContain('timed out');
    });
  });

  describe('ServiceError.toJSON()', () => {
    it('should serialize to JSON correctly', () => {
      const error = createServiceError('SVC_NSSM_NOT_FOUND');
      const json = error.toJSON();

      expect(json.code).toBe('SVC_NSSM_NOT_FOUND');
      expect(json.message).toBeDefined();
      expect(json.suggestion).toBeDefined();
      expect(json.exitCode).toBe(2);
    });

    it('should include timeout fields in JSON when present', () => {
      const error = createServiceError('SVC_GRACEFUL_TIMEOUT', {
        operation: 'test',
        timeoutMs: 5000,
        attempts: 1,
        lastError: 'error',
      });
      const json = error.toJSON();

      expect(json.operation).toBe('test');
      expect(json.timeoutMs).toBe(5000);
      expect(json.attempts).toBe(1);
      expect(json.lastError).toBe('error');
    });
  });

  describe('wrapServiceError', () => {
    it('should wrap Error instance', () => {
      const original = new Error('Original error message');
      const wrapped = wrapServiceError(original, 'SVC_GRACEFUL_TIMEOUT', {
        operation: 'test',
        timeoutMs: 5000,
      });

      expect(wrapped.code).toBe('SVC_GRACEFUL_TIMEOUT');
      expect(wrapped.lastError).toContain('Original error message');
    });

    it('should wrap non-Error values', () => {
      const wrapped = wrapServiceError('string error', 'SVC_BINARY_MISSING');

      expect(wrapped.code).toBe('SVC_BINARY_MISSING');
      expect(wrapped.lastError).toBe('string error');
    });

    it('should preserve existing lastError if provided', () => {
      const original = new Error('Original');
      const wrapped = wrapServiceError(original, 'SVC_HEALTH_CHECK_FAILED', {
        lastError: 'Custom last error',
      });

      expect(wrapped.lastError).toBe('Custom last error');
    });
  });

  describe('isServiceError', () => {
    it('should return true for ServiceError', () => {
      const error = createServiceError('SVC_SYSTEMD_NOT_AVAILABLE');
      expect(isServiceError(error)).toBe(true);
    });

    it('should return false for plain Error', () => {
      const error = new Error('test');
      expect(isServiceError(error)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isServiceError('string')).toBe(false);
      expect(isServiceError(null)).toBe(false);
      expect(isServiceError(undefined)).toBe(false);
      expect(isServiceError({})).toBe(false);
    });
  });

  describe('exitCode property', () => {
    it('should be 2 for blocking errors', () => {
      const error = createServiceError('SVC_SYSTEMD_NOT_AVAILABLE');
      expect(error.exitCode).toBe(2);
    });

    it('should be 1 for business failures', () => {
      const error = createServiceError('SVC_HEALTH_CHECK_FAILED');
      expect(error.exitCode).toBe(1);
    });

    it('should be 0 for warnings', () => {
      const error = createServiceError('SVC_LINGER_NOT_ENABLED');
      expect(error.exitCode).toBe(0);
    });
  });

  describe('Error messages for all codes', () => {
    const errorCodes = [
      'SVC_SYSTEMD_NOT_AVAILABLE',
      'SVC_LINGER_NOT_ENABLED',
      'SVC_NSSM_NOT_FOUND',
      'SVC_NOT_ELEVATED',
      'SVC_BINARY_MISSING',
      'SVC_PORT_IN_USE',
      'SVC_OPENCODE_SERVER_BINARY_MISSING',
      'SVC_DEPENDENCY_NOT_RUNNING',
      'SVC_GRACEFUL_TIMEOUT',
      'SVC_INSTALL_ROLLBACK_FAILED',
      'SVC_HEALTH_CHECK_FAILED',
      'SVC_NSSM_REQUIRES_USER_PASSWORD',
      'SVC_AUTO_RECONNECT_GAVE_UP',
    ] as const;

    errorCodes.forEach((code) => {
      it(`should create error for ${code}`, () => {
        const error = createServiceError(code);
        expect(error.code).toBe(code);
        expect(error.message).toBeDefined();
        expect(error.message.length).toBeGreaterThan(0);
        expect(error.suggestion).toBeDefined();
        expect(error.suggestion.length).toBeGreaterThan(0);
      });
    });
  });
});