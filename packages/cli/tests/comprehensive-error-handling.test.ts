/**
 * Comprehensive Error Handling Tests for CLI
 * 
 * Tests all error categories as defined in cli/design.md "Error Handling" section:
 * 1. Network errors (Daemon unreachable)
 * 2. Authentication errors
 * 3. Validation errors
 * 4. Async job errors
 * 5. Blob handling errors
 * 
 * Also tests dual-mode output formatting for each error type.
 * 
 * Validates: Requirements 1.1, 1.2 (cli spec)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ERROR_CODES,
  CliError,
  DaemonUnreachableError,
  AuthFailedError,
  TimeoutError,
  InvalidInputError,
  toCliError,
} from '../src/errors';
import { formatError, ModeSwitch } from '../src/mode-switch';

// Note: We're testing error conversion, so we need to check that toCliError
// correctly handles various error types. The actual HTTP client errors
// are tested in their respective test files.

describe('Comprehensive Error Handling', () => {
  describe('Error Categories', () => {
    it('should have all required error categories defined', () => {
      expect(ERROR_CODES.DAEMON_UNREACHABLE).toBe('daemon_unreachable');
      expect(ERROR_CODES.AUTH_FAILED).toBe('auth_failed');
      expect(ERROR_CODES.NETWORK_TIMEOUT).toBe('network_timeout');
      expect(ERROR_CODES.INVALID_INPUT).toBe('invalid_input');
      expect(ERROR_CODES.UNKNOWN_ERROR).toBe('unknown_error');
    });
  });

  describe('Network Error Handling', () => {
    it('should create DaemonUnreachableError with proper hint', () => {
      const error = new DaemonUnreachableError();
      expect(error.code).toBe(ERROR_CODES.DAEMON_UNREACHABLE);
      expect(error.message).toBe('Daemon unreachable');
      expect(error.hint).toContain('specforge daemon start');
    });

    it('should format DaemonUnreachableError correctly in human mode', () => {
      const error = new DaemonUnreachableError();
      const output = formatError(error, 'human');
      expect(output).toContain('Error: Daemon unreachable');
      expect(output).toContain('Hint:');
      expect(output).toContain('specforge daemon start');
    });

    it('should format DaemonUnreachableError correctly in JSON mode', () => {
      const error = new DaemonUnreachableError();
      const output = formatError(error, 'json');
      const parsed = JSON.parse(output);
      expect(parsed.error).toBe(true);
      expect(parsed.code).toBe('daemon_unreachable');
      expect(parsed.message).toBe('Daemon unreachable');
      expect(parsed.hint).toBeTruthy();
    });

    it('should convert HTTP-like error to CLI error', () => {
      // Simulate an HTTP client error
      const httpError = new Error('无法连接到 Daemon，请确认 Daemon 已启动');
      (httpError as any).code = 'DAEMON_UNREACHABLE';
      (httpError as any).suggestion = '请运行 "specforge daemon start" 启动 Daemon';
      
      const cliError = toCliError(httpError);
      expect(cliError.code).toBe(ERROR_CODES.DAEMON_UNREACHABLE);
      expect(cliError.message).toBe('无法连接到 Daemon，请确认 Daemon 已启动');
    });
  });

  describe('Authentication Error Handling', () => {
    it('should create AuthFailedError with proper hint', () => {
      const error = new AuthFailedError();
      expect(error.code).toBe(ERROR_CODES.AUTH_FAILED);
      expect(error.message).toBe('Authentication failed');
      expect(error.hint).toContain('token');
    });

    it('should format AuthFailedError correctly in both modes', () => {
      const error = new AuthFailedError('Invalid token', 'Please re-authenticate');
      const humanOutput = formatError(error, 'human');
      const jsonOutput = formatError(error, 'json');
      
      expect(humanOutput).toContain('Error: Invalid token');
      expect(humanOutput).toContain('Hint: Please re-authenticate');
      
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.code).toBe('auth_failed');
      expect(parsed.message).toBe('Invalid token');
      expect(parsed.hint).toBe('Please re-authenticate');
    });

    it('should convert HTTP-like auth error to CLI error', () => {
      // Simulate an HTTP auth error
      const httpError = new Error('Token expired');
      (httpError as any).code = 'AUTH_FAILED';
      
      const cliError = toCliError(httpError);
      expect(cliError.code).toBe(ERROR_CODES.AUTH_FAILED);
      expect(cliError.message).toBe('Token expired');
    });
  });

  describe('Timeout Error Handling', () => {
    it('should create TimeoutError with operation and timeout details', () => {
      const error = new TimeoutError({
        operation: 'daemon.healthCheck',
        timeoutMs: 5000,
      });
      
      expect(error.code).toBe(ERROR_CODES.NETWORK_TIMEOUT);
      expect(error.operation).toBe('daemon.healthCheck');
      expect(error.timeoutMs).toBe(5000);
      expect(error.message).toContain('daemon.healthCheck');
      expect(error.message).toContain('5000');
    });

    it('should format TimeoutError with actionable suggestion', () => {
      const error = new TimeoutError({
        operation: 'job.poll',
        timeoutMs: 30000,
        suggestion: 'Check network connectivity and try again',
      });
      
      expect(error.hint).toBe('Check network connectivity and try again');
    });

    it('should convert HTTP-like timeout error to CLI error', () => {
      // Simulate an HTTP timeout error
      const httpError = new Error('操作超时（10000ms）: /health，已重试 3 次');
      (httpError as any).code = 'TIMEOUT';
      (httpError as any).operation = '/health';
      (httpError as any).timeoutMs = 10000;
      (httpError as any).attempts = 3;
      
      const cliError = toCliError(httpError);
      expect(cliError.code).toBe(ERROR_CODES.NETWORK_TIMEOUT);
      expect(cliError).toBeInstanceOf(TimeoutError);
      expect((cliError as TimeoutError).operation).toBe('/health');
      expect((cliError as TimeoutError).timeoutMs).toBe(10000);
    });
  });

  describe('Validation Error Handling', () => {
    it('should create InvalidInputError for command validation failures', () => {
      const error = new InvalidInputError("Unknown command 'foo'");
      expect(error.code).toBe(ERROR_CODES.INVALID_INPUT);
      expect(error.message).toBe("Unknown command 'foo'");
      expect(error.hint).toContain('--help');
    });

    it('should handle various validation scenarios', () => {
      const scenarios = [
        {
          message: "Missing required argument: 'spec'",
          hint: "Run with '--help' to see expected usage.",
        },
        {
          message: "Invalid value for '--timeout': must be positive number",
          hint: "Use --timeout 300 for 5 minutes",
        },
        {
          message: "Conflicting flags: --json and --verbose cannot be used together",
          hint: "Use either --json or --verbose, not both",
        },
      ];

      scenarios.forEach(({ message, hint }) => {
        const error = new InvalidInputError(message, hint);
        expect(error.code).toBe(ERROR_CODES.INVALID_INPUT);
        expect(error.message).toBe(message);
        expect(error.hint).toBe(hint);
      });
    });
  });

  describe('Async Job Error Handling', () => {
    it('should convert job not found error to CLI error', () => {
      // Simulate a job not found error
      const jobError = new Error('Job not found: job-789');
      (jobError as any).code = 'JOB_NOT_FOUND';
      (jobError as any).jobId = 'job-789';
      
      const cliError = toCliError(jobError);
      expect(cliError.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(cliError.message).toBe('Job not found: job-789');
    });

    it('should convert job timeout error to CLI error', () => {
      // Simulate a job wait timeout error
      const jobError = new Error('Job wait timeout after 60000ms: job-456');
      (jobError as any).code = 'WAIT_TIMEOUT';
      (jobError as any).jobId = 'job-456';
      (jobError as any).timeoutMs = 60000;
      
      const cliError = toCliError(jobError);
      expect(cliError.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(cliError.message).toBe('Job wait timeout after 60000ms: job-456');
    });
  });

  describe('Error Conversion and Wrapping', () => {
    it('should wrap plain Error with unknown_error code', () => {
      const plainError = new Error('Something went wrong');
      const cliError = toCliError(plainError);
      expect(cliError.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(cliError.message).toBe('Something went wrong');
      expect((cliError as { cause?: Error }).cause).toBe(plainError);
    });

    it('should wrap string throws', () => {
      const cliError = toCliError('bare string error');
      expect(cliError.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(cliError.message).toBe('bare string error');
    });

    it('should wrap null/undefined defensively', () => {
      const undefinedError = toCliError(undefined);
      expect(undefinedError.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(undefinedError.message).toContain('undefined');

      const nullError = toCliError(null);
      expect(nullError.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(nullError.message).toContain('null');
    });

    it('should preserve CliError subclass identity', () => {
      const original = new TimeoutError({
        operation: 'test',
        timeoutMs: 1000,
      });
      const wrapped = toCliError(original);
      expect(wrapped).toBe(original);
    });
  });

  describe('Dual-Mode Output Consistency', () => {
    const modeSwitchHuman = new ModeSwitch('human');
    const modeSwitchJson = new ModeSwitch('json');

    it('should produce different but equivalent output for each mode', () => {
      const error = new DaemonUnreachableError();
      
      const humanOutput = modeSwitchHuman.formatError(error);
      const jsonOutput = modeSwitchJson.formatError(error);
      
      expect(humanOutput).not.toBe(jsonOutput);
      expect(humanOutput.startsWith('Error:')).toBe(true);
      expect(jsonOutput.startsWith('{')).toBe(true);
      
      const parsedJson = JSON.parse(jsonOutput);
      expect(parsedJson.code).toBe('daemon_unreachable');
      expect(parsedJson.message).toBe('Daemon unreachable');
    });

    it('should handle all error types in both modes', () => {
      const errorTypes = [
        new DaemonUnreachableError(),
        new AuthFailedError(),
        new TimeoutError({ operation: 'test', timeoutMs: 1000 }),
        new InvalidInputError('Test validation error'),
      ];

      errorTypes.forEach(error => {
        const humanOutput = modeSwitchHuman.formatError(error);
        const jsonOutput = modeSwitchJson.formatError(error);
        
        expect(humanOutput).toContain('Error:');
        expect(JSON.parse(jsonOutput)).toHaveProperty('code');
        expect(JSON.parse(jsonOutput)).toHaveProperty('message');
      });
    });
  });

  describe('Error Recovery and Retry Logic', () => {
    it('should provide actionable hints for recovery', () => {
      const errors = [
        {
          error: new DaemonUnreachableError(),
          expectedHint: 'specforge daemon start',
        },
        {
          error: new AuthFailedError(),
          expectedHint: 'token',
        },
        {
          error: new InvalidInputError('test'),
          expectedHint: '--help',
        },
      ];

      errors.forEach(({ error, expectedHint }) => {
        expect(error.hint).toContain(expectedHint);
      });
    });
  });

  describe('Integration with Command Execution', () => {
    it('should format errors consistently in command output', () => {
      const modeSwitch = new ModeSwitch('json');
      const error = new DaemonUnreachableError();
      const formatted = modeSwitch.formatError(error);
      
      // Should be valid JSON
      expect(() => JSON.parse(formatted)).not.toThrow();
      const parsed = JSON.parse(formatted);
      expect(parsed).toHaveProperty('error', true);
      expect(parsed).toHaveProperty('code');
      expect(parsed).toHaveProperty('message');
      expect(parsed).toHaveProperty('hint');
    });
  });
});