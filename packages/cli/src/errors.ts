/**
 * CLI Error Hierarchy — Stable, machine-readable error contract for SpecForge CLI.
 *
 * Per cli/design.md "Error Handling" section and Implementation Notes #4:
 *   "Define stable error codes for machine consumption"
 *
 * Goals
 * -----
 * 1. Every CLI failure surfaces with a **stable, lower-snake-case `code`** that
 *    OpenClaw and other automation tools can pattern-match on.
 * 2. Every CLI failure carries an actionable `hint` string (constructor-enforced)
 *    so humans always get a next step, never a bare message.
 * 3. Subclasses encode common domains (daemon unreachable, auth failed, timeout,
 *    invalid input) so call-sites can `throw new DaemonUnreachableError()` rather
 *    than threading magic strings.
 * 4. `toCliError(unknown)` wraps third-party / unexpected errors into a
 *    well-formed `CliError`, so the CLI top-level handler can always rely on the
 *    contract.
 *
 * The shape is intentionally kept compatible with the legacy
 * `CliErrorShape` from `mode-switch.ts` (`{ message, code?, hint? }`) — class
 * instances satisfy that interface structurally, and `formatError` normalizes
 * both forms uniformly.
 */

/**
 * Stable, machine-readable error codes.
 *
 * The string values are the contract — never change them lightly. Adding new
 * codes is fine; renaming or removing breaks downstream automation (OpenClaw,
 * webhook consumers, scripts).
 */
export const ERROR_CODES = {
  /** Daemon HTTP/SSE endpoint cannot be reached. */
  DAEMON_UNREACHABLE: 'daemon_unreachable',
  /** Bearer token is missing, malformed, or rejected by the Daemon. */
  AUTH_FAILED: 'auth_failed',
  /** A bounded operation (HTTP, SSE wait, job poll) exceeded its budget. */
  NETWORK_TIMEOUT: 'network_timeout',
  /** User-supplied input failed validation (bad flag, missing arg, etc.). */
  INVALID_INPUT: 'invalid_input',
  /** Catch-all for unexpected errors not matched by another subclass. */
  UNKNOWN_ERROR: 'unknown_error',
} as const;

/**
 * Union of all known error code string literals.
 *
 * Use this in subclasses' `readonly code` field rather than a bare `string` so
 * the type system catches typos.
 */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Base class for every CLI-surfaced error.
 *
 * Concrete subclasses MUST:
 *  - Set `code` to one of the {@link ERROR_CODES} string literals.
 *  - Pass a non-empty `hint` to `super()` so `formatError` can always show
 *    "Error: ...\n  Hint: ..." in human mode without a missing branch.
 *
 * Direct construction is forbidden by `abstract`; if you need a generic wrapper
 * use {@link toCliError} which produces an internal subclass.
 */
export abstract class CliError extends Error {
  /** Stable machine-readable error code. */
  abstract readonly code: ErrorCode;

  /** Actionable next-step suggestion for the user. */
  readonly hint: string;

  protected constructor(message: string, hint: string) {
    super(message);
    // Preserve a useful `.name` for stack traces without relying on the
    // bundler keeping the class name (Bun preserves it; tsc-ESM may not).
    this.name = this.constructor.name;
    this.hint = hint;

    // Restore prototype chain after `super(...)` for ES5-target builds; bun /
    // modern tsc don't strictly need this but it's cheap and prevents
    // `instanceof` surprises across realms.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Daemon HTTP/SSE endpoint cannot be reached (ECONNREFUSED, DNS failure,
 * 502/503, etc.).
 */
export class DaemonUnreachableError extends CliError {
  readonly code = ERROR_CODES.DAEMON_UNREACHABLE;

  constructor(
    message = 'Daemon unreachable',
    hint = "Is the Daemon running? Try 'specforge daemon start'.",
  ) {
    super(message, hint);
  }
}

/**
 * Authentication / authorization failure — bearer token missing, malformed, or
 * rejected by the Daemon (HTTP 401 / 403).
 */
export class AuthFailedError extends CliError {
  readonly code = ERROR_CODES.AUTH_FAILED;

  constructor(
    message = 'Authentication failed',
    hint = 'Check your token in ~/.specforge/runtime/daemon.sock.json or re-run handshake.',
  ) {
    super(message, hint);
  }
}

/**
 * Bounded operation exceeded its time budget.
 *
 * Carries `operation` and `timeoutMs` per the project's
 * `async-resource-coding-standards.md` rule C3 (超时错误必须包含 operation /
 * timeoutMs / suggestion 字段). The user-visible message is auto-composed when
 * the caller doesn't override it.
 */
export class TimeoutError extends CliError {
  readonly code = ERROR_CODES.NETWORK_TIMEOUT;

  /** Logical operation that was waiting (e.g. `daemon.healthCheck`). */
  readonly operation: string;

  /** Configured time budget in milliseconds. */
  readonly timeoutMs: number;

  constructor(opts: {
    operation: string;
    timeoutMs: number;
    /** Override the default `Operation 'X' timed out after Yms` message. */
    message?: string;
    /** Actionable suggestion. Defaults to a generic retry/diagnose hint. */
    suggestion?: string;
  }) {
    const message =
      opts.message ??
      `Operation '${opts.operation}' timed out after ${opts.timeoutMs}ms`;
    const hint =
      opts.suggestion ??
      `Retry the command, or increase the timeout. Check Daemon health with 'specforge daemon status'.`;
    super(message, hint);
    this.operation = opts.operation;
    this.timeoutMs = opts.timeoutMs;
  }
}

/**
 * User-supplied input failed validation — unknown command, bad flag combo,
 * missing required arg, malformed value, etc.
 */
export class InvalidInputError extends CliError {
  readonly code = ERROR_CODES.INVALID_INPUT;

  constructor(
    message: string,
    hint = "Run with '--help' to see expected usage.",
  ) {
    super(message, hint);
  }
}

/**
 * Internal fallback used by {@link toCliError} to wrap unexpected, third-party,
 * or non-Error throws into a well-formed `CliError`.
 *
 * Not exported because the only legitimate way to produce one is via
 * `toCliError` — direct callers should pick a more specific subclass.
 */
class UnknownCliError extends CliError {
  readonly code = ERROR_CODES.UNKNOWN_ERROR;

  constructor(
    message: string,
    hint = 'An unexpected error occurred. Re-run with --json or check the Daemon log for details.',
  ) {
    super(message, hint);
  }
}

/**
 * Normalize an arbitrary thrown value into a `CliError`.
 *
 * Behavior:
 *  - `CliError` instances pass through unchanged (preserving their subclass).
 *  - HTTP client errors (DaemonClientError and subclasses) are converted to
 *    appropriate CLI error types.
 *  - Plain `Error` instances are wrapped in `UnknownCliError`, copying the
 *    `.message` so the user still sees the original cause.
 *  - `string` throws are wrapped using the string as the message.
 *  - Anything else (numbers, objects without `.message`, `null`, `undefined`)
 *    is wrapped with a generic "Unknown error" message.
 *
 * The original throw is attached as `.cause` (per the standard `Error.cause`
 * convention) when applicable, so logging frameworks can still surface stacks.
 */
export function toCliError(err: unknown): CliError {
  if (err instanceof CliError) return err;

  // Check for HTTP client errors and convert them to appropriate CLI errors
  if (err instanceof Error) {
    // Try to import DaemonClientError dynamically to avoid circular dependencies
    // Check by constructor name as a fallback
    const errName = err.constructor.name;
    const errAny = err as any;
    
    // Check for DaemonUnreachableError
    if (errName === 'DaemonUnreachableError' || errAny.code === 'DAEMON_UNREACHABLE') {
      return new DaemonUnreachableError(err.message, errAny.suggestion || undefined);
    }
    
    // Check for DaemonAuthError
    if (errName === 'DaemonAuthError' || errAny.code === 'AUTH_FAILED') {
      return new AuthFailedError(err.message, 'Check your token in ~/.specforge/runtime/daemon.sock.json or re-run handshake.');
    }
    
    // Check for DaemonTimeoutError
    if (errName === 'DaemonTimeoutError' || errAny.code === 'TIMEOUT') {
      return new TimeoutError({
        operation: errAny.operation || 'unknown',
        timeoutMs: errAny.timeoutMs || 0,
        message: err.message,
        suggestion: 'Retry the command, or increase the timeout. Check Daemon health with "specforge daemon status".',
      });
    }
    
    // Check for DaemonClientError (generic HTTP error)
    if (errName === 'DaemonClientError' || errAny.isNetworkError !== undefined) {
      // For network errors, convert to DaemonUnreachableError
      if (errAny.isNetworkError) {
        return new DaemonUnreachableError(err.message, 'Check network connectivity and ensure Daemon is running.');
      }
      // For other HTTP errors, wrap as unknown error with original message
      const wrapped = new UnknownCliError(err.message);
      (wrapped as { cause?: unknown }).cause = err;
      return wrapped;
    }
    
    // Check for JobTracker errors
    if (errName === 'JobNotFoundError' || errAny.code === 'JOB_NOT_FOUND' || errAny.code === 'WAIT_TIMEOUT') {
      // For job errors, preserve the message but use appropriate CLI error code
      const wrapped = new UnknownCliError(err.message);
      (wrapped as { cause?: unknown }).cause = err;
      return wrapped;
    }
    
    // Plain Error - wrap in UnknownCliError
    const wrapped = new UnknownCliError(err.message);
    (wrapped as { cause?: unknown }).cause = err;
    return wrapped;
  }

  if (typeof err === 'string' && err.length > 0) {
    return new UnknownCliError(err);
  }

  // Last resort: opaque throw (number, null, undefined, plain object without
  // .message, etc.). Stringify defensively so we never lose context entirely.
  let message: string;
  try {
    message =
      err === undefined
        ? 'Unknown error (undefined was thrown)'
        : err === null
          ? 'Unknown error (null was thrown)'
          : `Unknown error: ${typeof err === 'object' ? JSON.stringify(err) : String(err)}`;
  } catch {
    message = 'Unknown error';
  }
  return new UnknownCliError(message);
}
