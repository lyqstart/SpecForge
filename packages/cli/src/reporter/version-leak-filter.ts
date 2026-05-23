/**
 * Version leak filter — reporter layer for the SpecForge CLI.
 *
 * Implements task 12.5 of `version-unification`:
 *
 *   In NORMAL_RW mode, business commands' stdout/stderr MUST NOT contain
 *   the literal field names `code_version`, `data_schema_version`, or
 *   `min_supported_data_schema`.
 *
 * The `wrapWriter` higher-order function wraps an underlying writer so that
 * any line containing one of the version-surface tokens is dropped before
 * reaching the underlying writer. In any non-NORMAL_RW mode (degraded /
 * migrate / unknown), the wrapper is functionally transparent — the user
 * needs to see diagnostic information, so we never filter it.
 *
 * **Doctor / `--version` own the version surface concern themselves** — those
 * subcommand entry points must NOT route their writes through `wrapWriter`.
 *
 * @see Requirement 10.1 — "in NORMAL_RW mode, business-command stdout/stderr
 *      does not contain a string matching the literal value of `code_version`,
 *      `data_schema_version`, or `min_supported_data_schema`"
 * @see Property 19 — Version surface visibility
 * @see design.md §"业务命令输出过滤"
 */

/**
 * Minimal writer interface compatible with `process.stdout`, `process.stderr`,
 * and any custom writable that exposes a synchronous `write(chunk)` method.
 *
 * Returning `boolean` matches Node's `WriteStream.write` contract — `false`
 * indicates back-pressure. The wrapped writer propagates this faithfully.
 */
export interface Writer {
  write(chunk: string | Uint8Array): boolean;
}

/**
 * Structural shape of `StartupMode` from `@specforge/version-unification`.
 *
 * We intentionally use a structural type rather than importing the concrete
 * type so that this module does not require a workspace dependency until the
 * full CLI integration in task 15.1 — `version-unification`'s `StartupMode`
 * (a discriminated union with `kind: 'NORMAL_RW' | 'MIGRATE' | ...`) satisfies
 * this interface and will plug in seamlessly.
 */
export interface StartupMode {
  readonly kind: string;
}

/**
 * The discriminator value that activates the filter. Mirrors
 * `version-unification`'s `{ kind: 'NORMAL_RW' }` variant.
 */
export const NORMAL_RW_KIND = 'NORMAL_RW' as const;

/**
 * The literal field-name tokens that must not appear in business-command
 * stdout/stderr under NORMAL_RW.
 *
 * Order matters only for diagnostic readability — matching is exhaustive.
 */
export const VERSION_LEAK_TOKENS: readonly string[] = Object.freeze([
  'code_version',
  'data_schema_version',
  'min_supported_data_schema',
]);

/**
 * Returns true if `line` contains any of the version-leak tokens.
 *
 * Exported for testability and reuse by callers that want to validate
 * captured output without re-routing it through a writer.
 */
export function containsVersionLeakToken(line: string): boolean {
  for (const token of VERSION_LEAK_TOKENS) {
    if (line.includes(token)) return true;
  }
  return false;
}

/**
 * Wrap an underlying writer with a line-buffered filter that drops any
 * line containing a version-surface leak token, but only when `mode` is
 * `NORMAL_RW`. In all other modes (`MIGRATE`, `DEGRADED_*`, or any future
 * variant), the returned writer is the original writer unchanged — degraded
 * users need full diagnostics.
 *
 * Behavior contract:
 * - Lines are split on `\n`. Partial trailing content is buffered until a
 *   newline arrives or until `flush()` is called.
 * - A "line" includes its trailing `\n`. If the final chunk has no trailing
 *   newline, the leftover is held in the buffer; callers that close the
 *   stream should call `flush()` to emit any remainder (subject to the same
 *   filter rule).
 * - The wrapper preserves the original `write` return value (back-pressure
 *   signal) — `false` is returned if any forwarded line indicated
 *   back-pressure.
 *
 * @param originalWriter the underlying writer (e.g. `process.stdout`)
 * @param mode the active startup mode; only `NORMAL_RW` enables filtering
 */
export function wrapWriter(originalWriter: Writer, mode: StartupMode): Writer {
  if (mode.kind !== NORMAL_RW_KIND) {
    // Non-NORMAL_RW: pass through untouched. Diagnostic surfaces (degraded
    // reporter, migration progress) own their own format and need every byte.
    return originalWriter;
  }

  return new VersionLeakFilteringWriter(originalWriter);
}

/**
 * Concrete filtering writer. Exported as part of the reporter module's
 * public surface so callers that need to flush a remainder at end-of-stream
 * can do so explicitly.
 */
export class VersionLeakFilteringWriter implements Writer {
  private buffer = '';

  constructor(private readonly underlying: Writer) {}

  write(chunk: string | Uint8Array): boolean {
    const text =
      typeof chunk === 'string'
        ? chunk
        : Buffer.from(chunk).toString('utf-8');

    this.buffer += text;

    let ok = true;
    let newlineIdx = this.buffer.indexOf('\n');
    while (newlineIdx >= 0) {
      const line = this.buffer.slice(0, newlineIdx + 1); // include the '\n'
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (!containsVersionLeakToken(line)) {
        const result = this.underlying.write(line);
        if (!result) ok = false;
      }
      newlineIdx = this.buffer.indexOf('\n');
    }

    return ok;
  }

  /**
   * Emit any buffered partial line through the filter. Callers should invoke
   * this at end-of-stream to avoid silently dropping a final un-newlined
   * fragment.
   */
  flush(): boolean {
    if (this.buffer.length === 0) return true;
    const remainder = this.buffer;
    this.buffer = '';
    if (containsVersionLeakToken(remainder)) return true;
    return this.underlying.write(remainder);
  }
}
