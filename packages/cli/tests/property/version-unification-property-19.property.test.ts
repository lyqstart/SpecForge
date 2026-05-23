/**
 * Property test for Version surface visibility.
 *
 * Feature: version-unification, Property 19: Version surface visibility
 * Derived-From: v6-architecture-overview Property 19
 * Validates: Requirements 10.1, 10.2
 *
 * Property: The version surface is owned by `--version` and `doctor`, and
 * leaks nowhere else.
 *
 *   1. In NORMAL_RW mode, any business-command output routed through the
 *      reporter `wrapWriter` MUST NOT contain the literal field-name tokens
 *      `code_version`, `data_schema_version`, or `min_supported_data_schema`.
 *      Lines containing such tokens are dropped before they reach the
 *      underlying writer.
 *   2. In any non-NORMAL_RW mode (MIGRATE, DEGRADED_*, future variants),
 *      `wrapWriter` is functionally transparent — it returns the original
 *      writer unchanged so degraded users still see full diagnostics.
 *   3. Lines without tokens pass through `wrapWriter` byte-identically in
 *      NORMAL_RW mode (no over-filtering / no corruption).
 *   4. `--version` (runVersionCommand) owns the version surface: on success
 *      it writes exactly `${getCodeVersion()}\n` to stdout, nothing to
 *      stderr, and returns exit code 0 — meaning when the cli entry passes
 *      raw stdout (NOT a wrapWriter'd one) to runVersionCommand, the version
 *      string reaches stdout unfiltered. On internal error, stdout stays
 *      silent, stderr receives a diagnostic, exit code is non-zero.
 *
 * numRuns: 200 per sub-property
 *
 * Implementation note:
 *   `wrapWriter` is implemented in `packages/cli/src/reporter/version-leak-filter.ts`
 *   and not (yet) re-exported from `@specforge/version-unification`, so this
 *   test file lives under `packages/cli/tests/property/` and imports
 *   directly from the cli reporter module — see the spec task 12.6 escape
 *   hatch in tasks.md.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  wrapWriter,
  containsVersionLeakToken,
  VERSION_LEAK_TOKENS,
  VersionLeakFilteringWriter,
  type Writer,
  type StartupMode,
} from '../../src/reporter/version-leak-filter';
import {
  runVersionCommand,
  _setVersionProvider,
  _resetVersionProvider,
} from '../../src/commands/version';

// =============================================================================
// Capturing writer helper
// =============================================================================

interface CapturingWriter {
  writer: Writer;
  captured: string[];
}

function makeCapturingWriter(): CapturingWriter {
  const captured: string[] = [];
  const writer: Writer = {
    write(chunk: string | Uint8Array): boolean {
      const text =
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
      captured.push(text);
      return true;
    },
  };
  return { writer, captured };
}

// =============================================================================
// Arbitraries
// =============================================================================

/** A leak token literal — drawn from the known set. */
const leakTokenArb = fc.constantFrom(...VERSION_LEAK_TOKENS);

/** Arbitrary string with no embedded newlines — newlines are the line delimiter. */
const noNewlineStringArb = fc
  .string({ maxLength: 60 })
  .map((s) => s.replace(/\n/g, ' '));

/** A line that does NOT contain any leak token (used for pass-through tests). */
const lineWithoutTokenArb = noNewlineStringArb.filter(
  (s) => !containsVersionLeakToken(s),
);

/** A line that DOES contain at least one leak token, in some surrounding context. */
const lineWithTokenArb = fc
  .tuple(noNewlineStringArb, leakTokenArb, noNewlineStringArb)
  .map(([prefix, token, suffix]) => `${prefix}${token}${suffix}`);

/** The NORMAL_RW startup-mode discriminator. */
const normalRwModeArb = fc.constant<StartupMode>({ kind: 'NORMAL_RW' });

/**
 * Any non-NORMAL_RW startup-mode kind. Includes the well-known degraded /
 * migrate variants plus an arbitrary future variant to exercise the "any
 * non-NORMAL_RW kind = identity" contract.
 */
const nonNormalRwModeArb: fc.Arbitrary<StartupMode> = fc.oneof(
  fc.constant<StartupMode>({ kind: 'MIGRATE' }),
  fc.constant<StartupMode>({ kind: 'DEGRADED_HIGHER_THAN_KNOWN' }),
  fc.constant<StartupMode>({ kind: 'DEGRADED_MIGRATION_FAILED' }),
  fc
    .stringMatching(/^[A-Z][A-Z_0-9]{0,20}$/)
    .filter((s) => s !== 'NORMAL_RW' && s.length > 0)
    .map((kind) => ({ kind })),
);

/** Plausible semver `code_version` strings — never contain leak tokens. */
const semverArb = fc
  .tuple(
    fc.nat({ max: 99 }),
    fc.nat({ max: 99 }),
    fc.nat({ max: 99 }),
  )
  .map(([maj, min, pat]) => `${maj}.${min}.${pat}`);

// =============================================================================
// P19.A — NORMAL_RW filters out leak-token lines (R10.1)
// =============================================================================

describe('Property 19: Version surface visibility', () => {
  describe('P19.A: NORMAL_RW filters lines containing leak tokens (R10.1)', () => {
    it('Property: any line containing a leak token is dropped before reaching the underlying writer', () => {
      fc.assert(
        fc.property(lineWithTokenArb, (line) => {
          const { writer, captured } = makeCapturingWriter();
          const wrapped = wrapWriter(writer, { kind: 'NORMAL_RW' });
          wrapped.write(line + '\n');
          const out = captured.join('');
          for (const token of VERSION_LEAK_TOKENS) {
            expect(out).not.toContain(token);
          }
        }),
        { numRuns: 200 },
      );
    });

    it('Property: across mixed batches of token / non-token lines, no leak token reaches the underlying writer in NORMAL_RW', () => {
      fc.assert(
        fc.property(
          fc.array(fc.oneof(lineWithoutTokenArb, lineWithTokenArb), {
            minLength: 1,
            maxLength: 8,
          }),
          (lines) => {
            const text = lines.map((l) => l + '\n').join('');
            const { writer, captured } = makeCapturingWriter();
            const wrapped = wrapWriter(writer, { kind: 'NORMAL_RW' });
            wrapped.write(text);
            // Flush any trailing partial line so this property covers both
            // newline-terminated and unterminated remainders.
            if (wrapped instanceof VersionLeakFilteringWriter) {
              wrapped.flush();
            }
            const out = captured.join('');
            for (const token of VERSION_LEAK_TOKENS) {
              expect(out).not.toContain(token);
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    it('Property: lines without leak tokens pass through unchanged in NORMAL_RW (no over-filtering)', () => {
      fc.assert(
        fc.property(lineWithoutTokenArb, (line) => {
          const { writer, captured } = makeCapturingWriter();
          const wrapped = wrapWriter(writer, { kind: 'NORMAL_RW' });
          wrapped.write(line + '\n');
          expect(captured.join('')).toBe(line + '\n');
        }),
        { numRuns: 200 },
      );
    });
  });

  // ===========================================================================
  // P19.B — Non-NORMAL_RW modes do not filter (degraded users see everything)
  // ===========================================================================

  describe('P19.B: Non-NORMAL_RW mode is functionally transparent (R10.1 boundary)', () => {
    it('Property: in any non-NORMAL_RW mode, wrapWriter returns the same writer instance', () => {
      fc.assert(
        fc.property(nonNormalRwModeArb, (mode) => {
          const { writer } = makeCapturingWriter();
          const wrapped = wrapWriter(writer, mode);
          expect(wrapped).toBe(writer);
        }),
        { numRuns: 200 },
      );
    });

    it('Property: in non-NORMAL_RW mode, content containing leak tokens is forwarded byte-identically (no filtering)', () => {
      fc.assert(
        fc.property(nonNormalRwModeArb, lineWithTokenArb, (mode, line) => {
          const { writer, captured } = makeCapturingWriter();
          const wrapped = wrapWriter(writer, mode);
          wrapped.write(line + '\n');
          expect(captured.join('')).toBe(line + '\n');
        }),
        { numRuns: 200 },
      );
    });
  });

  // ===========================================================================
  // P19.C — --version owns the version surface (R10.2)
  // ===========================================================================

  describe('P19.C: --version owns the version surface; bypasses filter layer (R10.2)', () => {
    afterEach(() => {
      _resetVersionProvider();
    });

    it('Property: runVersionCommand on success writes exactly `${codeVersion}\\n` to stdout, nothing to stderr, exit 0', async () => {
      await fc.assert(
        fc.asyncProperty(semverArb, async (version) => {
          _setVersionProvider(() => version);
          const stdoutChunks: string[] = [];
          const stderrChunks: string[] = [];
          const code = await runVersionCommand({
            write: (s) => {
              stdoutChunks.push(s);
            },
            writeErr: (s) => {
              stderrChunks.push(s);
            },
          });
          expect(code).toBe(0);
          expect(stdoutChunks.join('')).toBe(`${version}\n`);
          expect(stderrChunks.join('')).toBe('');
        }),
        { numRuns: 200 },
      );
    });

    it('Property: even when accidentally routed through wrapWriter NORMAL_RW, runVersionCommand output reaches the writer unchanged (semver values never contain leak tokens)', async () => {
      await fc.assert(
        fc.asyncProperty(semverArb, async (version) => {
          _setVersionProvider(() => version);
          const { writer: rawStdout, captured: stdoutCaptured } =
            makeCapturingWriter();
          const { writer: rawStderr, captured: stderrCaptured } =
            makeCapturingWriter();
          const wrappedStdout = wrapWriter(rawStdout, { kind: 'NORMAL_RW' });
          const wrappedStderr = wrapWriter(rawStderr, { kind: 'NORMAL_RW' });
          const code = await runVersionCommand({
            write: (s) => {
              wrappedStdout.write(s);
            },
            writeErr: (s) => {
              wrappedStderr.write(s);
            },
          });
          if (wrappedStdout instanceof VersionLeakFilteringWriter) {
            wrappedStdout.flush();
          }
          if (wrappedStderr instanceof VersionLeakFilteringWriter) {
            wrappedStderr.flush();
          }
          expect(code).toBe(0);
          // Even after passing through the filter, the semver value reaches
          // stdout because semver strings never contain leak tokens. This
          // demonstrates the design assumption "version values are
          // self-evidently non-leaky" and confirms the filter is harmless
          // when the version surface accidentally crosses it.
          expect(stdoutCaptured.join('')).toBe(`${version}\n`);
          expect(stderrCaptured.join('')).toBe('');
        }),
        { numRuns: 200 },
      );
    });

    it('Property: when the version provider fails, runVersionCommand emits a non-empty stderr diagnostic, leaves stdout silent, returns non-zero', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).map((s) =>
            // Avoid a degenerate case where the random message happens to
            // include a leak token literal — we want to assert stderr is
            // non-empty regardless, but stripping it keeps later assertions
            // focused on the failure semantics rather than filter behavior.
            VERSION_LEAK_TOKENS.reduce((acc, t) => acc.split(t).join('X'), s),
          ),
          async (errorMsg) => {
            _setVersionProvider(() => {
              throw new Error(errorMsg);
            });
            const stdoutChunks: string[] = [];
            const stderrChunks: string[] = [];
            const code = await runVersionCommand({
              write: (s) => {
                stdoutChunks.push(s);
              },
              writeErr: (s) => {
                stderrChunks.push(s);
              },
            });
            expect(code).not.toBe(0);
            expect(stdoutChunks.join('')).toBe('');
            expect(stderrChunks.join('').length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
