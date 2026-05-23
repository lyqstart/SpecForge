/**
 * Property test for Diagnostic output formatter.
 *
 * Feature: version-unification, Property 20: Diagnostic output formatter
 * Derived-From: v6-architecture-overview Property 20
 * Validates: Requirements 10.3, 10.4, 10.5
 *
 * The "diagnostic output formatter" is the union of the user-facing
 * formatters owned by the version-unification package:
 *
 *  - `printMigrationProgress` (src/migration/progress-reporter.ts)
 *      → R10.4: on successful migration, prints a SINGLE line summarizing
 *               source schema, target schema, and elapsed wall-clock ms.
 *
 *  - `DegradedReporter.print('HIGHER_THAN_KNOWN', ...)` (src/degraded-mode/...)
 *      → R10.5: when the system enters read-only degraded mode because the
 *               observed data_schema_version exceeds the highest known schema,
 *               the printed message must include the observed dsv, the highest
 *               supported schema, and an actionable upgrade suggestion.
 *
 *  - protocol-layer exports in `src/index.ts`
 *      → R10.3: the symbols any caller of `doctor` needs to render the six
 *               diagnostic fields (code_version / min_supported_data_schema /
 *               data_schema_version / two manifest paths / mode) MUST be
 *               surfaced through the public API. A property over the public
 *               surface guards the protocol-layer contract.
 *
 * The properties below check INVARIANTS over arbitrary inputs (not single
 * literal examples), per `numRuns: 200`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  printMigrationProgress,
  type MigrationProgress,
} from '../../src/migration/progress-reporter.js';
import { DegradedReporter } from '../../src/degraded-mode/degraded-reporter.js';
import * as VuPublicApi from '../../src/index.js';

// =============================================================================
// stdout / stderr capture
// =============================================================================

let stdoutLines: string[];
let stderrLines: string[];
let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;

beforeEach(() => {
  stdoutLines = [];
  stderrLines = [];
  originalConsoleLog = console.log;
  originalConsoleError = console.error;
  console.log = (msg?: unknown) => {
    stdoutLines.push(String(msg));
  };
  console.error = (msg?: unknown) => {
    stderrLines.push(String(msg));
  };
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

function captureStdout(fn: () => void): string[] {
  const before = stdoutLines.length;
  fn();
  return stdoutLines.slice(before);
}

function captureStderr(fn: () => void): string {
  const before = stderrLines.length;
  fn();
  return stderrLines.slice(before).join('\n');
}

// =============================================================================
// Arbitraries
// =============================================================================

/**
 * Migration progress arbitrary.
 *
 * - fromVersion, toVersion: non-negative integers; in successful migration
 *   typically `to > from`, but the formatter must be invariant w.r.t. the
 *   relative order so we keep the arbitrary general (fc.nat).
 * - durationMs: non-negative integer wall-clock duration in milliseconds.
 *
 * Bounds chosen large enough to exercise multi-digit serialization without
 * provoking 1e21+ scientific-notation behaviour from JS Number.toString.
 */
const migrationProgressArb: fc.Arbitrary<MigrationProgress> = fc.record({
  fromVersion: fc.nat({ max: 1_000_000 }),
  toVersion: fc.nat({ max: 1_000_000 }),
  durationMs: fc.nat({ max: 86_400_000 }), // up to 24h
});

/** observed > highest pair for HIGHER_THAN_KNOWN. */
const higherThanKnownPairArb = fc
  .tuple(fc.nat({ max: 1_000 }), fc.nat({ max: 1_000 }))
  .filter(([a, b]) => a !== b)
  .map(([a, b]) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return { observed: hi, highest: lo };
  });

// =============================================================================
// Reference parser for R10.4 round-trip
// =============================================================================

/**
 * Strict format per design §"Doctor / --version 输出格式" and progress-reporter
 * implementation:
 *
 *   `[migration] data_schema_version <from> → <to> in <ms> ms`
 *
 * The arrow is the literal U+2192 RIGHTWARDS ARROW (→), not '->' nor '\u2192'
 * escape sequence. Whitespace is exactly one space between tokens. Numbers are
 * decimal integer strings without separators.
 */
const MIGRATION_PROGRESS_REGEX =
  /^\[migration\] data_schema_version (\d+) → (\d+) in (\d+) ms$/;

function parseMigrationProgress(line: string): MigrationProgress | null {
  const m = MIGRATION_PROGRESS_REGEX.exec(line);
  if (!m) return null;
  const fromVersion = Number(m[1]);
  const toVersion = Number(m[2]);
  const durationMs = Number(m[3]);
  if (
    !Number.isInteger(fromVersion) ||
    !Number.isInteger(toVersion) ||
    !Number.isInteger(durationMs)
  ) {
    return null;
  }
  return { fromVersion, toVersion, durationMs };
}

// =============================================================================
// Property tests
// =============================================================================

describe('Property 20: Diagnostic output formatter', () => {
  // ---------------------------------------------------------------------------
  // R10.4 — Migration progress formatter
  // ---------------------------------------------------------------------------

  describe('P20.A: migration progress is exactly one stdout line (R10.4)', () => {
    it('Property: every printMigrationProgress call emits exactly one line', () => {
      fc.assert(
        fc.property(migrationProgressArb, (progress) => {
          const lines = captureStdout(() => {
            printMigrationProgress(progress);
          });
          // Exactly one console.log call → exactly one captured "line entry".
          expect(lines.length).toBe(1);
          // And the captured entry itself contains no embedded newline.
          expect(lines[0]).not.toMatch(/\r|\n/);
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('P20.B: migration progress matches the strict format (R10.4)', () => {
    it('Property: output strictly matches `[migration] data_schema_version <from> → <to> in <ms> ms`', () => {
      fc.assert(
        fc.property(migrationProgressArb, (progress) => {
          const [line] = captureStdout(() => {
            printMigrationProgress(progress);
          });
          expect(line).toMatch(MIGRATION_PROGRESS_REGEX);
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('P20.C: migration progress contains all three input values (R10.4)', () => {
    it('Property: output contains the literal decimal forms of fromVersion, toVersion, durationMs', () => {
      fc.assert(
        fc.property(migrationProgressArb, (progress) => {
          const [line] = captureStdout(() => {
            printMigrationProgress(progress);
          });
          // Each value must appear at least once in the line. Because the
          // strict format is a fixed template with these three slots and no
          // other numeric content, this is a stronger guarantee than substring
          // appearance alone — but we phrase it as substring for resilience to
          // future cosmetic punctuation.
          expect(line).toContain(String(progress.fromVersion));
          expect(line).toContain(String(progress.toVersion));
          expect(line).toContain(String(progress.durationMs));
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('P20.D: migration progress is round-trip parseable back to inputs (R10.4)', () => {
    it('Property: parseMigrationProgress(printMigrationProgress(p)) === p for any p', () => {
      fc.assert(
        fc.property(migrationProgressArb, (progress) => {
          const [line] = captureStdout(() => {
            printMigrationProgress(progress);
          });
          const parsed = parseMigrationProgress(line);
          expect(parsed).not.toBeNull();
          expect(parsed).toEqual(progress);
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('P20.E: migration progress uses the literal U+2192 arrow, not ASCII or escape (R10.4)', () => {
    it('Property: output contains exactly one U+2192 and zero ASCII "->" arrows', () => {
      fc.assert(
        fc.property(migrationProgressArb, (progress) => {
          const [line] = captureStdout(() => {
            printMigrationProgress(progress);
          });
          // Exactly one occurrence of the rightwards-arrow character.
          const arrowCount = (line.match(/→/g) ?? []).length;
          expect(arrowCount).toBe(1);
          // And no ASCII surrogate forms that would defeat downstream parsers.
          expect(line).not.toContain('->');
          expect(line).not.toContain('\\u2192');
        }),
        { numRuns: 200 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // R10.5 — Degraded HIGHER_THAN_KNOWN formatter
  // ---------------------------------------------------------------------------

  describe('P20.F: degraded HIGHER_THAN_KNOWN print contains observed, highest, upgrade suggestion (R10.5)', () => {
    it('Property: any HIGHER_THAN_KNOWN print includes observed dsv, highest schema, and "upgrade"', () => {
      fc.assert(
        fc.property(higherThanKnownPairArb, ({ observed, highest }) => {
          const out = captureStderr(() => {
            DegradedReporter.print('HIGHER_THAN_KNOWN', { observed, highest });
          });
          // 1) observed data_schema_version appears as a token
          expect(out).toContain(String(observed));
          // 2) highest schema appears as a token
          expect(out).toContain(String(highest));
          // 3) actionable suggestion: the word "upgrade" must appear (case-insensitive)
          expect(out.toLowerCase()).toContain('upgrade');
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('P20.G: degraded HIGHER_THAN_KNOWN print is non-empty for every input (R10.5)', () => {
    it('Property: print produces at least one stderr write for every (observed, highest) pair', () => {
      fc.assert(
        fc.property(higherThanKnownPairArb, ({ observed, highest }) => {
          const before = stderrLines.length;
          DegradedReporter.print('HIGHER_THAN_KNOWN', { observed, highest });
          const after = stderrLines.length;
          // At least one console.error invocation.
          expect(after).toBeGreaterThan(before);
        }),
        { numRuns: 200 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // R10.3 — Doctor protocol-layer exports
  // ---------------------------------------------------------------------------
  //
  // The doctor command (in packages/cli) renders six fields. To do so, it
  // pulls a fixed set of symbols from the version-unification public API.
  // R10.3 is satisfied by the doctor implementation, but the version-
  // unification package owns the *protocol surface* the doctor depends on.
  // The property below is a structural invariant: no matter how index.ts is
  // refactored, these symbols must remain on the public API or the doctor
  // command breaks.

  describe('P20.H: doctor protocol-layer exports are present on the public API (R10.3)', () => {
    // The set of doctor-required protocol exports. This list mirrors what the
    // doctor command imports from `@specforge/version-unification`. If the
    // doctor command grows new fields it must amend this list (and the test
    // will catch a missing export).
    const REQUIRED_EXPORT_NAMES = [
      'getCodeVersion',
      'MIN_SUPPORTED_DATA_SCHEMA',
      'HIGHEST_KNOWN_SCHEMA',
      'StartupCompatibilityChecker',
    ] as const;

    it('Property: every required doctor symbol is exported and non-undefined', () => {
      fc.assert(
        fc.property(fc.constantFrom(...REQUIRED_EXPORT_NAMES), (name) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const api = VuPublicApi as unknown as Record<string, unknown>;
          expect(name in api).toBe(true);
          expect(api[name]).toBeDefined();
        }),
        { numRuns: 200 },
      );
    });

    it('Property: StartupCompatibilityChecker.check is callable and returns a discriminated mode', () => {
      fc.assert(
        fc.property(
          fc.record({
            dataSchemaVersion: fc.nat({ max: 50 }),
            minSupportedDataSchema: fc.nat({ max: 50 }),
            highestKnownSchema: fc.nat({ max: 50 }),
          }),
          ({ dataSchemaVersion, minSupportedDataSchema, highestKnownSchema }) => {
            const result = VuPublicApi.StartupCompatibilityChecker.check({
              dataSchemaVersion,
              minSupportedDataSchema,
              highestKnownSchema,
            });
            // The discriminated union must always carry a string `kind` so
            // the doctor command can render it as the `mode` field.
            expect(result).toBeDefined();
            expect(typeof (result as { kind?: unknown }).kind).toBe('string');
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
