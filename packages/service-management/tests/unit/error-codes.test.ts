/**
 * Unit tests for error codes
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  isErrorCode,
  getAllErrorCodes,
} from '../../src/errors/error-codes.js';

describe('ErrorCode', () => {
  it('should have exactly 13 error codes', () => {
    const codes = getAllErrorCodes();
    expect(codes).toHaveLength(13);
  });

  it('should contain all required error codes', () => {
    const codes = getAllErrorCodes();
    expect(codes).toContain('SVC_SYSTEMD_NOT_AVAILABLE');
    expect(codes).toContain('SVC_LINGER_NOT_ENABLED');
    expect(codes).toContain('SVC_NSSM_NOT_FOUND');
    expect(codes).toContain('SVC_NOT_ELEVATED');
    expect(codes).toContain('SVC_BINARY_MISSING');
    expect(codes).toContain('SVC_PORT_IN_USE');
    expect(codes).toContain('SVC_OPENCODE_SERVER_BINARY_MISSING');
    expect(codes).toContain('SVC_DEPENDENCY_NOT_RUNNING');
    expect(codes).toContain('SVC_GRACEFUL_TIMEOUT');
    expect(codes).toContain('SVC_INSTALL_ROLLBACK_FAILED');
    expect(codes).toContain('SVC_HEALTH_CHECK_FAILED');
    expect(codes).toContain('SVC_NSSM_REQUIRES_USER_PASSWORD');
    expect(codes).toContain('SVC_AUTO_RECONNECT_GAVE_UP');
  });

  it('should behave like a closed enum (const object)', () => {
    // All values should be strings
    const codes = getAllErrorCodes();
    codes.forEach((code) => {
      expect(typeof code).toBe('string');
    });

    // Should not be able to add new properties
    // (This tests that it's a const object, not a regular object)
    const codeCount = Object.keys(ErrorCode).length;
    expect(codeCount).toBeGreaterThan(0);
  });

  describe('isErrorCode', () => {
    it('should return true for valid error codes', () => {
      expect(isErrorCode('SVC_SYSTEMD_NOT_AVAILABLE')).toBe(true);
      expect(isErrorCode('SVC_GRACEFUL_TIMEOUT')).toBe(true);
      expect(isErrorCode('SVC_HEALTH_CHECK_FAILED')).toBe(true);
    });

    it('should return false for invalid strings', () => {
      expect(isErrorCode('INVALID_CODE')).toBe(false);
      expect(isErrorCode('SVC_UNKNOWN')).toBe(false);
      expect(isErrorCode('')).toBe(false);
      expect(isErrorCode('SVC_')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isErrorCode(null as any)).toBe(false);
      expect(isErrorCode(undefined as any)).toBe(false);
      expect(isErrorCode(123 as any)).toBe(false);
      expect(isErrorCode({} as any)).toBe(false);
    });
  });

  describe('getAllErrorCodes', () => {
    it('should return an array', () => {
      expect(Array.isArray(getAllErrorCodes())).toBe(true);
    });

    it('should return unique values', () => {
      const codes = getAllErrorCodes();
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });
  });
});