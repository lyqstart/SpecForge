/**
 * Unit tests for CLI error hierarchy (packages/cli/src/errors.ts).
 *
 * Coverage:
 *  - ERROR_CODES constants exist and are stable strings
 *  - Each concrete subclass surfaces the correct `code` and a non-empty `hint`
 *  - `TimeoutError` carries `operation` + `timeoutMs` (rule C3)
 *  - `toCliError` wraps the four major categories (CliError pass-through,
 *    plain Error, string throw, opaque throw) into a well-formed CliError
 *  - `formatError` (in mode-switch.ts) renders both human + JSON output
 *    correctly when given a CliError class instance
 *
 * Validates: Requirements 1.1, 1.2 (cli spec).
 */

import { describe, it, expect } from 'bun:test';
import {
  ERROR_CODES,
  CliError,
  DaemonUnreachableError,
  AuthFailedError,
  TimeoutError,
  InvalidInputError,
  toCliError,
} from '../src/errors';
import { formatError } from '../src/mode-switch';

describe('ERROR_CODES', () => {
  it('exposes the documented stable string codes', () => {
    expect(ERROR_CODES.DAEMON_UNREACHABLE).toBe('daemon_unreachable');
    expect(ERROR_CODES.AUTH_FAILED).toBe('auth_failed');
    expect(ERROR_CODES.NETWORK_TIMEOUT).toBe('network_timeout');
    expect(ERROR_CODES.INVALID_INPUT).toBe('invalid_input');
    expect(ERROR_CODES.UNKNOWN_ERROR).toBe('unknown_error');
  });

  it('codes are lower_snake_case (machine-friendly contract)', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(code).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe('DaemonUnreachableError', () => {
  it('uses DAEMON_UNREACHABLE code and provides a hint by default', () => {
    const err = new DaemonUnreachableError();
    expect(err).toBeInstanceOf(CliError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(ERROR_CODES.DAEMON_UNREACHABLE);
    expect(err.message).toBe('Daemon unreachable');
    expect(err.hint).toBeTruthy();
    expect(err.hint).toContain('specforge daemon start');
    expect(err.name).toBe('DaemonUnreachableError');
  });

  it('accepts a custom message and hint', () => {
    const err = new DaemonUnreachableError('Custom failure', 'Custom hint');
    expect(err.message).toBe('Custom failure');
    expect(err.hint).toBe('Custom hint');
  });
});

describe('AuthFailedError', () => {
  it('uses AUTH_FAILED code and provides a hint by default', () => {
    const err = new AuthFailedError();
    expect(err).toBeInstanceOf(CliError);
    expect(err.code).toBe(ERROR_CODES.AUTH_FAILED);
    expect(err.message).toBe('Authentication failed');
    expect(err.hint).toBeTruthy();
    expect(err.hint).toContain('token');
  });

  it('accepts a custom message and hint', () => {
    const err = new AuthFailedError('Bad token', 'Refresh handshake');
    expect(err.message).toBe('Bad token');
    expect(err.hint).toBe('Refresh handshake');
  });
});

describe('TimeoutError', () => {
  it('uses NETWORK_TIMEOUT code and exposes operation + timeoutMs (rule C3)', () => {
    const err = new TimeoutError({
      operation: 'daemon.healthCheck',
      timeoutMs: 5000,
    });
    expect(err).toBeInstanceOf(CliError);
    expect(err.code).toBe(ERROR_CODES.NETWORK_TIMEOUT);
    expect(err.operation).toBe('daemon.healthCheck');
    expect(err.timeoutMs).toBe(5000);
    expect(err.message).toContain('daemon.healthCheck');
    expect(err.message).toContain('5000');
    expect(err.hint).toBeTruthy();
  });

  it('honours a custom message override', () => {
    const err = new TimeoutError({
      operation: 'job.poll',
      timeoutMs: 30_000,
      message: 'Custom timeout message',
      suggestion: 'Try again later',
    });
    expect(err.message).toBe('Custom timeout message');
    expect(err.hint).toBe('Try again later');
    expect(err.operation).toBe('job.poll');
    expect(err.timeoutMs).toBe(30_000);
  });
});

describe('InvalidInputError', () => {
  it('uses INVALID_INPUT code and requires a message', () => {
    const err = new InvalidInputError("Unknown command 'foo'");
    expect(err).toBeInstanceOf(CliError);
    expect(err.code).toBe(ERROR_CODES.INVALID_INPUT);
    expect(err.message).toBe("Unknown command 'foo'");
    expect(err.hint).toBeTruthy();
    expect(err.hint).toContain('--help');
  });

  it('accepts a custom hint', () => {
    const err = new InvalidInputError('Bad flag', 'Use --json instead');
    expect(err.hint).toBe('Use --json instead');
  });
});

describe('toCliError', () => {
  it('passes a CliError instance through unchanged', () => {
    const original = new DaemonUnreachableError();
    const wrapped = toCliError(original);
    expect(wrapped).toBe(original);
  });

  it('wraps a plain Error preserving message + setting unknown_error code', () => {
    const original = new Error('boom');
    const wrapped = toCliError(original);
    expect(wrapped).toBeInstanceOf(CliError);
    expect(wrapped.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
    expect(wrapped.message).toBe('boom');
    expect(wrapped.hint).toBeTruthy();
    // `cause` carries the original error for diagnostics.
    expect((wrapped as { cause?: unknown }).cause).toBe(original);
  });

  it('wraps a string throw using the string as the message', () => {
    const wrapped = toCliError('bare string failure');
    expect(wrapped).toBeInstanceOf(CliError);
    expect(wrapped.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
    expect(wrapped.message).toBe('bare string failure');
  });

  it('wraps undefined / null defensively', () => {
    const u = toCliError(undefined);
    expect(u).toBeInstanceOf(CliError);
    expect(u.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
    expect(u.message).toContain('undefined');

    const n = toCliError(null);
    expect(n).toBeInstanceOf(CliError);
    expect(n.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
    expect(n.message).toContain('null');
  });

  it('wraps an opaque object using JSON.stringify', () => {
    const wrapped = toCliError({ random: 'stuff' });
    expect(wrapped).toBeInstanceOf(CliError);
    expect(wrapped.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
    expect(wrapped.message).toContain('random');
  });

  it('preserves CliError subclass identity through toCliError', () => {
    const original = new TimeoutError({ operation: 'x', timeoutMs: 1 });
    const wrapped = toCliError(original);
    expect(wrapped).toBeInstanceOf(TimeoutError);
    expect((wrapped as TimeoutError).operation).toBe('x');
  });
});

describe('formatError integration with CliError class hierarchy', () => {
  it('renders a CliError instance correctly in human mode', () => {
    const err = new DaemonUnreachableError();
    const out = formatError(err, 'human');
    expect(out).toContain('Error: Daemon unreachable');
    expect(out).toContain('Hint:');
    expect(out).toContain('specforge daemon start');
  });

  it('renders a CliError instance correctly in JSON mode', () => {
    const err = new DaemonUnreachableError();
    const parsed = JSON.parse(formatError(err, 'json'));
    expect(parsed).toEqual({
      error: true,
      code: 'daemon_unreachable',
      message: 'Daemon unreachable',
      hint: err.hint,
    });
  });

  it('renders a TimeoutError with operation/timeoutMs visible in JSON mode', () => {
    const err = new TimeoutError({
      operation: 'daemon.healthCheck',
      timeoutMs: 5000,
    });
    const parsed = JSON.parse(formatError(err, 'json'));
    expect(parsed.code).toBe('network_timeout');
    expect(parsed.message).toContain('daemon.healthCheck');
    expect(parsed.message).toContain('5000');
    expect(parsed.hint).toBeTruthy();
  });

  it('routes a plain Error through toCliError automatically', () => {
    const out = formatError(new Error('oops'), 'json');
    const parsed = JSON.parse(out);
    expect(parsed.code).toBe('unknown_error');
    expect(parsed.message).toBe('oops');
    expect(parsed.hint).toBeTruthy();
  });

  it('preserves the legacy plain-object error contract', () => {
    const out = formatError(
      { message: 'legacy', code: 'legacy_code', hint: 'legacy hint' },
      'json',
    );
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      error: true,
      code: 'legacy_code',
      message: 'legacy',
      hint: 'legacy hint',
    });
  });

  it('produces materially different output between modes for a CliError', () => {
    const err = new AuthFailedError();
    const human = formatError(err, 'human');
    const json = formatError(err, 'json');
    expect(human).not.toBe(json);
    expect(human.startsWith('Error:')).toBe(true);
    expect(json.startsWith('{')).toBe(true);
  });
});
