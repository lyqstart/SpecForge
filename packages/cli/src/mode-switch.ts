/**
 * ModeSwitch — Dual-mode output (human vs JSON) for SpecForge CLI.
 *
 * Per requirements 1.1 / 1.2 of the cli spec:
 * - WHEN user does not specify --json, THE CLI SHALL default to colorful interactive (human) output.
 * - THE CLI SHALL support --json for every command, outputting structured JSON without colors / prompts.
 *
 * This module is intentionally framework-free (no chalk / yargs imports) so it
 * can be unit-tested in isolation and reused by command handlers as a simple
 * pure-function layer over `process.argv` parsing.
 *
 * Error formatting integrates with the {@link CliError} hierarchy in `./errors`:
 * - `CliError` instances are normalized via their own `code` / `hint` fields.
 * - Plain `Error` (and other thrown values) flow through `toCliError` first,
 *   guaranteeing every formatted error has a stable `code`.
 * - Legacy plain-object errors (`{ message, code?, hint? }`) still work for
 *   backward compatibility with existing call-sites.
 */
import { CliError, toCliError } from './errors';

/**
 * Output mode the CLI is currently producing.
 *
 * - `'human'`  — colorful, interactive, hint-rich output for terminals.
 * - `'json'`   — structured, parseable, machine-friendly output for OpenClaw and friends.
 */
export type Mode = 'human' | 'json';

/**
 * Detect the output mode from a set of CLI arguments.
 *
 * The default is `'human'`. Any of `--json` / `-j` switches it to `'json'`.
 *
 * Note: yargs-style `--json=false` is intentionally treated as still requesting
 * JSON because the very presence of the long-form flag is unambiguous in scripts.
 * If a future caller needs three-state semantics they can parse explicitly.
 *
 * @param argv argument list to inspect (defaults to `process.argv.slice(2)`).
 */
export function detectMode(
  argv: readonly string[] = process.argv.slice(2),
): Mode {
  for (const arg of argv) {
    if (arg === '--json' || arg === '-j' || arg.startsWith('--json=')) {
      return 'json';
    }
  }
  return 'human';
}

/**
 * Plain-object shape for errors that don't extend the {@link CliError} class.
 *
 * Aligns with the parent design's "Error Output Format" section. Kept as a
 * structural type so legacy call-sites can `throw { message, code, hint }`-like
 * literals (e.g. inside Daemon HTTP error parsers) without creating a class.
 *
 * Prefer constructing a {@link CliError} subclass for new code.
 */
export interface CliErrorShape {
  /** Short human-readable description (always required). */
  message: string;
  /** Stable machine-readable code (e.g. `daemon_unreachable`). */
  code?: string;
  /** Actionable next-step suggestion. */
  hint?: string;
}

/**
 * Anything `formatError` can accept:
 *  - a {@link CliError} class instance (preferred — has guaranteed code+hint)
 *  - a legacy {@link CliErrorShape} plain object
 *  - an arbitrary thrown value (`unknown`) — we route it through `toCliError`
 */
export type FormattableError = CliError | CliErrorShape | unknown;

/**
 * Internal: extract `{ message, code, hint }` from any of the accepted error
 * forms. `CliError` instances win immediately (they encode the contract); plain
 * objects with at least a string `message` are treated as the legacy shape;
 * everything else flows through `toCliError` to be wrapped uniformly.
 */
function normalizeError(err: FormattableError): {
  message: string;
  code: string;
  hint?: string;
} {
  if (err instanceof CliError) {
    return { message: err.message, code: err.code, hint: err.hint };
  }

  // Plain `Error` (and other built-in subclasses) lack `code`/`hint`, so route
  // them through `toCliError` to gain the contract — checked BEFORE the legacy
  // duck-type so `Error.message` doesn't mis-route.
  if (err instanceof Error) {
    const wrapped = toCliError(err);
    return {
      message: wrapped.message,
      code: wrapped.code,
      hint: wrapped.hint,
    };
  }

  // Duck-type the legacy `CliErrorShape`: plain object with a string message.
  if (
    err !== null &&
    typeof err === 'object' &&
    typeof (err as { message?: unknown }).message === 'string'
  ) {
    const shape = err as CliErrorShape;
    return {
      message: shape.message,
      code: shape.code ?? 'unknown_error',
      hint: shape.hint,
    };
  }

  // Last resort: route unexpected throws through the normalizer.
  const wrapped = toCliError(err);
  return { message: wrapped.message, code: wrapped.code, hint: wrapped.hint };
}

/**
 * Format an error for the given output mode.
 *
 * Human mode produces the conventional two-line `Error: ...\n  Hint: ...`
 * shape; JSON mode produces a stable object that downstream tools can parse.
 *
 * Accepts {@link CliError} instances, legacy `{ message, code?, hint? }` plain
 * objects, and arbitrary thrown values (which are wrapped via `toCliError`).
 */
export function formatError(err: FormattableError, mode: Mode): string {
  const { message, code, hint } = normalizeError(err);

  if (mode === 'json') {
    const payload: Record<string, unknown> = {
      error: true,
      code,
      message,
    };
    if (hint !== undefined) payload.hint = hint;
    return JSON.stringify(payload);
  }

  let out = `Error: ${message}`;
  if (hint) out += `\n  Hint: ${hint}`;
  return out;
}

/**
 * Format arbitrary data for the given output mode.
 *
 * - In JSON mode, always returns a single-line `JSON.stringify` of the value.
 *   Strings are quoted (which is the contract scripts rely on).
 * - In human mode, strings pass through unchanged; everything else is
 *   pretty-printed JSON for readability.
 */
export function formatData(data: unknown, mode: Mode): string {
  if (mode === 'json') return JSON.stringify(data);
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}

/**
 * Format a success message for the given output mode.
 */
export function formatSuccess(message: string, mode: Mode): string {
  if (mode === 'json') {
    return JSON.stringify({ success: true, message });
  }
  return `✓ ${message}`;
}

/**
 * Lightweight wrapper providing a small, stateful API over the pure helpers.
 * Construct once per CLI invocation and pass it down to command handlers.
 */
export class ModeSwitch {
  /** The resolved output mode for this invocation. */
  public readonly mode: Mode;

  /**
   * @param modeOrArgv either a literal mode (`'human'` / `'json'`), an
   *  argv-like array to detect the mode from, or a yargs arguments object
   *  with a `json` property. Defaults to the current process argv
   *  (minus the runtime + script args).
   */
  constructor(
    modeOrArgv: Mode | readonly string[] | { json?: boolean } | { [key: string]: unknown } = process.argv.slice(2),
  ) {
    if (typeof modeOrArgv === 'string') {
      this.mode = modeOrArgv;
    } else if (Array.isArray(modeOrArgv)) {
      this.mode = detectMode(modeOrArgv);
    } else if (modeOrArgv && typeof modeOrArgv === 'object') {
      // Handle yargs arguments object or any object with json property
      const jsonValue = (modeOrArgv as { json?: boolean }).json;
      this.mode = jsonValue ? 'json' : 'human';
    } else {
      // Fallback to human mode
      this.mode = 'human';
    }
  }

  /** True when the active mode is `'json'`. */
  isJson(): boolean {
    return this.mode === 'json';
  }

  /** True when the active mode is `'human'`. */
  isHuman(): boolean {
    return this.mode === 'human';
  }

  /** See {@link formatError}. */
  formatError(err: FormattableError): string {
    return formatError(err, this.mode);
  }

  /** See {@link formatData}. */
  formatData(data: unknown): string {
    return formatData(data, this.mode);
  }

  /** See {@link formatSuccess}. */
  formatSuccess(message: string): string {
    return formatSuccess(message, this.mode);
  }
}
