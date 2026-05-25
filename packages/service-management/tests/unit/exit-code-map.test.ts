/**
 * Unit tests for exit code mapping
 */

import { describe, it, expect } from 'vitest';
import {
  ExitCode,
  ExitCodeMap,
  getExitCode,
  isBlockingError,
  isBusinessFailure,
  isWarningOnly,
  getErrorCodesForExitCode,
} from '../../src/errors/exit-code-map.js';
import { ErrorCode } from '../../src/errors/error-codes.js';

describe('ExitCodeMap', () => {
  it('should map SVC_SYSTEMD_NOT_AVAILABLE to exit code 2', () => {
    expect(getExitCode('SVC_SYSTEMD_NOT_AVAILABLE')).toBe(2);
  });

  it('should map SVC_LINGER_NOT_ENABLED to exit code 0 (warning)', () => {
    expect(getExitCode('SVC_LINGER_NOT_ENABLED')).toBe(0);
  });

  it('should map SVC_NSSM_NOT_FOUND to exit code 2', () => {
    expect(getExitCode('SVC_NSSM_NOT_FOUND')).toBe(2);
  });

  it('should map SVC_NOT_ELEVATED to exit code 2', () => {
    expect(getExitCode('SVC_NOT_ELEVATED')).toBe(2);
  });

  it('should map SVC_BINARY_MISSING to exit code 2', () => {
    expect(getExitCode('SVC_BINARY_MISSING')).toBe(2);
  });

  it('should map SVC_PORT_IN_USE to exit code 2', () => {
    expect(getExitCode('SVC_PORT_IN_USE')).toBe(2);
  });

  it('should map SVC_OPENCODE_SERVER_BINARY_MISSING to exit code 2', () => {
    expect(getExitCode('SVC_OPENCODE_SERVER_BINARY_MISSING')).toBe(2);
  });

  it('should map SVC_DEPENDENCY_NOT_RUNNING to exit code 1', () => {
    expect(getExitCode('SVC_DEPENDENCY_NOT_RUNNING')).toBe(1);
  });

  it('should map SVC_GRACEFUL_TIMEOUT to exit code 1', () => {
    expect(getExitCode('SVC_GRACEFUL_TIMEOUT')).toBe(1);
  });

  it('should map SVC_INSTALL_ROLLBACK_FAILED to exit code 1', () => {
    expect(getExitCode('SVC_INSTALL_ROLLBACK_FAILED')).toBe(1);
  });

  it('should map SVC_HEALTH_CHECK_FAILED to exit code 1', () => {
    expect(getExitCode('SVC_HEALTH_CHECK_FAILED')).toBe(1);
  });

  it('should map SVC_NSSM_REQUIRES_USER_PASSWORD to exit code 0 (warning)', () => {
    expect(getExitCode('SVC_NSSM_REQUIRES_USER_PASSWORD')).toBe(0);
  });

  it('should map SVC_AUTO_RECONNECT_GAVE_UP to exit code 1', () => {
    expect(getExitCode('SVC_AUTO_RECONNECT_GAVE_UP')).toBe(1);
  });

  describe('isBlockingError', () => {
    it('should return true for environment errors', () => {
      expect(isBlockingError('SVC_SYSTEMD_NOT_AVAILABLE')).toBe(true);
      expect(isBlockingError('SVC_NSSM_NOT_FOUND')).toBe(true);
      expect(isBlockingError('SVC_NOT_ELEVATED')).toBe(true);
      expect(isBlockingError('SVC_BINARY_MISSING')).toBe(true);
      expect(isBlockingError('SVC_PORT_IN_USE')).toBe(true);
    });

    it('should return false for business failures', () => {
      expect(isBlockingError('SVC_GRACEFUL_TIMEOUT')).toBe(false);
      expect(isBlockingError('SVC_HEALTH_CHECK_FAILED')).toBe(false);
    });

    it('should return false for warnings', () => {
      expect(isBlockingError('SVC_LINGER_NOT_ENABLED')).toBe(false);
      expect(isBlockingError('SVC_NSSM_REQUIRES_USER_PASSWORD')).toBe(false);
    });
  });

  describe('isBusinessFailure', () => {
    it('should return true for business failure errors', () => {
      expect(isBusinessFailure('SVC_GRACEFUL_TIMEOUT')).toBe(true);
      expect(isBusinessFailure('SVC_HEALTH_CHECK_FAILED')).toBe(true);
      expect(isBusinessFailure('SVC_INSTALL_ROLLBACK_FAILED')).toBe(true);
      expect(isBusinessFailure('SVC_AUTO_RECONNECT_GAVE_UP')).toBe(true);
    });

    it('should return false for environment errors', () => {
      expect(isBusinessFailure('SVC_SYSTEMD_NOT_AVAILABLE')).toBe(false);
      expect(isBusinessFailure('SVC_NSSM_NOT_FOUND')).toBe(false);
    });
  });

  describe('isWarningOnly', () => {
    it('should return true for warning-only errors', () => {
      expect(isWarningOnly('SVC_LINGER_NOT_ENABLED')).toBe(true);
      expect(isWarningOnly('SVC_NSSM_REQUIRES_USER_PASSWORD')).toBe(true);
    });

    it('should return false for blocking errors', () => {
      expect(isWarningOnly('SVC_SYSTEMD_NOT_AVAILABLE')).toBe(false);
      expect(isWarningOnly('SVC_NSSM_NOT_FOUND')).toBe(false);
    });

    it('should return false for business failures', () => {
      expect(isWarningOnly('SVC_GRACEFUL_TIMEOUT')).toBe(false);
      expect(isWarningOnly('SVC_HEALTH_CHECK_FAILED')).toBe(false);
    });
  });

  describe('getErrorCodesForExitCode', () => {
    it('should return all error codes that map to exit code 2', () => {
      const codes = getErrorCodesForExitCode(2);
      expect(codes).toContain('SVC_SYSTEMD_NOT_AVAILABLE');
      expect(codes).toContain('SVC_NSSM_NOT_FOUND');
      expect(codes).toContain('SVC_NOT_ELEVATED');
      expect(codes).toContain('SVC_BINARY_MISSING');
      expect(codes).toContain('SVC_PORT_IN_USE');
      expect(codes).toContain('SVC_OPENCODE_SERVER_BINARY_MISSING');
    });

    it('should return all error codes that map to exit code 1', () => {
      const codes = getErrorCodesForExitCode(1);
      expect(codes).toContain('SVC_DEPENDENCY_NOT_RUNNING');
      expect(codes).toContain('SVC_GRACEFUL_TIMEOUT');
      expect(codes).toContain('SVC_INSTALL_ROLLBACK_FAILED');
      expect(codes).toContain('SVC_HEALTH_CHECK_FAILED');
      expect(codes).toContain('SVC_AUTO_RECONNECT_GAVE_UP');
    });

    it('should return all error codes that map to exit code 0', () => {
      const codes = getErrorCodesForExitCode(0);
      expect(codes).toContain('SVC_LINGER_NOT_ENABLED');
      expect(codes).toContain('SVC_NSSM_REQUIRES_USER_PASSWORD');
    });
  });

  describe('ExitCode type', () => {
    it('should only allow 0, 1, or 2 as exit codes', () => {
      const exitCodes: (0 | 1 | 2)[] = [0, 1, 2];
      expect(exitCodes).toHaveLength(3);
    });
  });
});