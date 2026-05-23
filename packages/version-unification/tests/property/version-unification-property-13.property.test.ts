/**
 * Property test for Degraded-mode output keyed by cause.
 *
 * Feature: version-unification, Property 13: Degraded-mode output keyed by cause
 * Derived-From: v6-architecture-overview Property 13
 * Validates: Requirements 13.4, 13.5
 *
 * Property: For any degraded entry with cause c ∈ {MIGRATION_FAILED, HIGHER_THAN_KNOWN, OTHER},
 * the diagnostic line printed by DegradedReporter satisfies:
 *
 *   - if c === MIGRATION_FAILED: output contains the failed schema-version pair, the absolute
 *     path of the diagnostic log entry, and the recommended next step ("contact support or
 *     roll back SpecForge code"); if the print attempt itself raises, no secondary output is
 *     produced and no retry occurs.
 *   - if c === HIGHER_THAN_KNOWN: output contains the observed data_schema_version, the highest
 *     supported schema version, and an actionable suggestion to upgrade SpecForge code; output
 *     never contains the migration-specific phrase set defined for MIGRATION_FAILED.
 *   - if c === OTHER: output never contains the migration-specific phrase set.
 *
 * numRuns: 200
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { DegradedReporter } from '../../src/degraded-mode/degraded-reporter.js';

// =============================================================================
// Migration-specific phrase set (template-only signatures)
//
// These phrases appear ONLY in the MIGRATION_FAILED template. They MUST NOT
// appear in HIGHER_THAN_KNOWN or OTHER outputs, regardless of details.
// =============================================================================
const MIGRATION_SPECIFIC_PHRASES = [
  'Diagnostic log:',                                           // MIGRATION_FAILED template label
  'contact support or roll back SpecForge code',              // MIGRATION_FAILED recommended next step
] as const;

// Pattern that captures `migration <from>→<to> failed.` template line
const MIGRATION_PAIR_PATTERN = /migration\s+\d+\s*→\s*\d+\s+failed\./;

// =============================================================================
// stderr capture helpers
// =============================================================================
let stderrOutput: string[];
let originalConsoleError: typeof console.error;

beforeEach(() => {
  stderrOutput = [];
  originalConsoleError = console.error;
  console.error = (msg?: unknown) => {
    stderrOutput.push(String(msg));
  };
});

afterEach(() => {
  console.error = originalConsoleError;
});

function captureOutput(fn: () => void): string {
  const before = stderrOutput.length;
  fn();
  return stderrOutput.slice(before).join('\n');
}

function containsAnyMigrationPhrase(output: string): boolean {
  if (MIGRATION_PAIR_PATTERN.test(output)) return true;
  return MIGRATION_SPECIFIC_PHRASES.some((p) => output.includes(p));
}

// =============================================================================
// Arbitraries
// =============================================================================

// A free-form message arbitrary that is *guaranteed* not to accidentally
// contain a migration-specific phrase. Without this filter, an OTHER cause
// whose user-supplied message happens to contain e.g. "Diagnostic log:" would
// produce a false positive that has nothing to do with the property under test.
const safeMessageArb = fc
  .string({ maxLength: 80 })
  .filter((s) => !containsAnyMigrationPhrase(s));

// Schema version pair (from < to) for MIGRATION_FAILED
const schemaPairArb = fc
  .tuple(fc.nat({ max: 50 }), fc.nat({ max: 50 }))
  .filter(([a, b]) => a !== b)
  .map(([a, b]) => (a < b ? ([a, b] as [number, number]) : ([b, a] as [number, number])));

// Plausible absolute path arbitrary for diagnostic log
const logPathArb = fc.oneof(
  fc.constant('/tmp/migration-error.log'),
  fc.constant('C:\\projects\\my-proj\\.specforge\\migration-error.log'),
  fc.constant('/home/user/.specforge/migration-error.log'),
  fc
    .stringMatching(/^[A-Z]:\\[A-Za-z0-9_\\.-]{1,40}\\migration-error\.log$/)
    // fall back to a fixed path if the matcher fails for any reason
    .map((s) => s || 'C:\\fallback\\migration-error.log'),
);

// observed > highest for HIGHER_THAN_KNOWN
const higherThanKnownPairArb = fc
  .tuple(fc.nat({ max: 50 }), fc.nat({ max: 50 }))
  .filter(([a, b]) => a !== b)
  .map(([a, b]) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return { observed: hi, highest: lo };
  });

// =============================================================================
// Property tests
// =============================================================================

describe('Property 13: Degraded-mode output keyed by cause', () => {
  describe('P13.A: MIGRATION_FAILED output contains required fields (R13.4)', () => {
    it('Property: any MIGRATION_FAILED print contains pair, logPath, and recommended next step', () => {
      fc.assert(
        fc.property(schemaPairArb, logPathArb, safeMessageArb, (pair, logPath, message) => {
          const output = captureOutput(() => {
            DegradedReporter.print('MIGRATION_FAILED', { pair, logPath, message });
          });

          // 1. failed schema-version pair appears in template form `<from>→<to>`
          const pairToken = `${pair[0]}→${pair[1]}`;
          expect(output).toContain(pairToken);
          expect(output).toMatch(MIGRATION_PAIR_PATTERN);

          // 2. absolute path of diagnostic log entry appears
          expect(output).toContain(logPath);

          // 3. recommended next step phrase appears
          expect(output).toContain('contact support or roll back SpecForge code');
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('P13.B: HIGHER_THAN_KNOWN output contains required fields (R13.5)', () => {
    it('Property: any HIGHER_THAN_KNOWN print contains observed, highest, and upgrade suggestion', () => {
      fc.assert(
        fc.property(higherThanKnownPairArb, safeMessageArb, ({ observed, highest }, message) => {
          const output = captureOutput(() => {
            DegradedReporter.print('HIGHER_THAN_KNOWN', { observed, highest, message });
          });

          // 1. observed data_schema_version appears
          expect(output).toContain(String(observed));

          // 2. highest supported schema appears
          expect(output).toContain(String(highest));

          // 3. actionable upgrade suggestion appears
          expect(output.toLowerCase()).toContain('upgrade');
        }),
        { numRuns: 200 },
      );
    });

    it('Property: HIGHER_THAN_KNOWN output never contains migration-specific phrase set (R13.5)', () => {
      fc.assert(
        fc.property(higherThanKnownPairArb, safeMessageArb, ({ observed, highest }, message) => {
          const output = captureOutput(() => {
            DegradedReporter.print('HIGHER_THAN_KNOWN', { observed, highest, message });
          });

          // None of the migration-specific template phrases must leak into HIGHER_THAN_KNOWN.
          for (const phrase of MIGRATION_SPECIFIC_PHRASES) {
            expect(output).not.toContain(phrase);
          }
          expect(output).not.toMatch(MIGRATION_PAIR_PATTERN);
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('P13.C: OTHER output never contains migration-specific phrase set (R13.5)', () => {
    it('Property: any OTHER print never contains migration-specific phrase set', () => {
      fc.assert(
        fc.property(safeMessageArb, (message) => {
          const output = captureOutput(() => {
            DegradedReporter.print('OTHER', { message });
          });

          for (const phrase of MIGRATION_SPECIFIC_PHRASES) {
            expect(output).not.toContain(phrase);
          }
          expect(output).not.toMatch(MIGRATION_PAIR_PATTERN);
        }),
        { numRuns: 200 },
      );
    });

    it('Property: OTHER print with arbitrary extra DegradedReporterDetails fields stays migration-free', () => {
      // Defense-in-depth: even if observed / highest / pair / logPath are accidentally
      // populated for an OTHER cause (e.g. caller mistake), the OTHER template must
      // still avoid migration-specific phrases.
      fc.assert(
        fc.property(
          fc.record({
            message: safeMessageArb,
            observed: fc.option(fc.nat({ max: 50 }), { nil: undefined }),
            highest: fc.option(fc.nat({ max: 50 }), { nil: undefined }),
            pair: fc.option(schemaPairArb, { nil: undefined }),
            logPath: fc.option(logPathArb, { nil: undefined }),
          }),
          (details) => {
            const output = captureOutput(() => {
              DegradedReporter.print('OTHER', details);
            });

            for (const phrase of MIGRATION_SPECIFIC_PHRASES) {
              expect(output).not.toContain(phrase);
            }
            expect(output).not.toMatch(MIGRATION_PAIR_PATTERN);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('P13.D: print self-failure is silently swallowed (R13.4)', () => {
    it('Property: when console.error itself throws, DegradedReporter.print never throws', () => {
      // Replace console.error with one that always throws — print() must not propagate.
      const causeArb = fc.constantFrom<'MIGRATION_FAILED' | 'HIGHER_THAN_KNOWN' | 'OTHER'>(
        'MIGRATION_FAILED',
        'HIGHER_THAN_KNOWN',
        'OTHER',
      );

      fc.assert(
        fc.property(
          causeArb,
          schemaPairArb,
          higherThanKnownPairArb,
          logPathArb,
          safeMessageArb,
          (cause, pair, htk, logPath, message) => {
            const captured = console.error;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            console.error = ((..._args: unknown[]) => {
              throw new Error('simulated console.error failure');
            }) as typeof console.error;

            try {
              expect(() => {
                DegradedReporter.print(cause, {
                  pair,
                  logPath,
                  observed: htk.observed,
                  highest: htk.highest,
                  message,
                });
              }).not.toThrow();
            } finally {
              console.error = captured;
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    it('Property: when console.error throws, no secondary output is produced and no retry occurs', () => {
      // After the failing console.error, replace with a counting stub to verify
      // there is no second invocation (no retry) for the same call.
      fc.assert(
        fc.property(safeMessageArb, (message) => {
          let callCount = 0;
          const captured = console.error;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          console.error = ((..._args: unknown[]) => {
            callCount += 1;
            throw new Error('simulated failure');
          }) as typeof console.error;

          try {
            DegradedReporter.print('OTHER', { message });
          } finally {
            console.error = captured;
          }

          // Exactly one attempt was made; no retry.
          expect(callCount).toBe(1);
        }),
        { numRuns: 200 },
      );
    });
  });
});
