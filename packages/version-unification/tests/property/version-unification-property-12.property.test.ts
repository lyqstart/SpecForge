/**
 * Property test for Read-only degraded mode rejecting every write.
 *
 * Feature: version-unification, Property 12: Read-only degraded mode rejects every write
 * Derived-From: v6-architecture-overview Property 12
 * Validates: Requirements 13.3
 *
 * Property: For any sequence of write operations attempted while the process is in
 * Read_Only_Degraded_Mode (regardless of cause), every operation that would mutate
 * project data, project metadata, the Project_Manifest, the User_Manifest, or create
 * a new project throws ReadOnlyDegradedError. Read operations against the unchanged
 * project data continue to succeed.
 *
 * The implementation under test:
 * - `enterReadOnly(cause)` flips module-level state into degraded mode
 * - `requireWritable()` is the single guard every write site must call; in degraded
 *   mode it throws `ReadOnlyDegradedError` carrying the cause discriminator
 * - `writeIfAllowed(fn)` wraps a write operation behind the same guard
 * - `canWrite()` / `getDegradedState()` / `isDegraded()` are read-only inspections
 *   and must keep working
 *
 * numRuns: 200
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  enterReadOnly,
  exitReadOnly,
  requireWritable,
  canWrite,
  isDegraded,
  getDegradedState,
  writeIfAllowed,
  type DegradedCause,
} from '../../src/degraded-mode/read-only-mode';
import { ReadOnlyDegradedError } from '../../src/manifest/types';

// =============================================================================
// Module-level state hygiene
// =============================================================================
//
// `enterReadOnly` mutates module-level state. afterEach MUST reset to NORMAL
// to prevent cross-test pollution (T1: clean-up symmetric to set-up).

afterEach(() => {
  exitReadOnly();
});

// =============================================================================
// Arbitraries
// =============================================================================

/** All cause discriminators per `DegradedCause` union. */
const causeArb: fc.Arbitrary<DegradedCause> = fc.constantFrom<DegradedCause>(
  'MIGRATION_FAILED',
  'HIGHER_THAN_KNOWN',
  'OTHER',
);

// =============================================================================
// Property tests (numRuns: 200)
// =============================================================================

describe('Property 12: Read-only degraded mode rejects every write', () => {
  describe('Single requireWritable() guard contract', () => {
    it('Property: any number of requireWritable() calls after enterReadOnly throws ReadOnlyDegradedError carrying the same cause', () => {
      fc.assert(
        fc.property(
          causeArb,
          // sequence length: 1..32 — covers single & batched write attempts
          fc.integer({ min: 1, max: 32 }),
          (cause, n) => {
            // Reset before each run to avoid pollution between fc iterations
            exitReadOnly();
            expect(canWrite()).toBe(true);

            enterReadOnly(cause);
            expect(isDegraded()).toBe(true);
            expect(getDegradedState()).toBe(cause);

            for (let i = 0; i < n; i++) {
              let thrown: unknown;
              try {
                requireWritable();
              } catch (e) {
                thrown = e;
              }
              expect(thrown).toBeInstanceOf(ReadOnlyDegradedError);
              expect((thrown as ReadOnlyDegradedError).cause).toBe(cause);
            }

            // canWrite stays false the whole time
            expect(canWrite()).toBe(false);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('Property: writeIfAllowed mirrors the guard — every write fn is rejected before invocation', () => {
      fc.assert(
        fc.property(
          causeArb,
          fc.integer({ min: 1, max: 32 }),
          (cause, n) => {
            exitReadOnly();
            enterReadOnly(cause);

            for (let i = 0; i < n; i++) {
              let invoked = false;
              expect(() =>
                writeIfAllowed(() => {
                  invoked = true;
                  return 'mutated' as const;
                }),
              ).toThrowError(ReadOnlyDegradedError);
              // The fn body must NOT execute when degraded
              expect(invoked).toBe(false);
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('Read operations remain available', () => {
    it('Property: read-only inspections never throw while in degraded mode', () => {
      fc.assert(
        fc.property(causeArb, (cause) => {
          exitReadOnly();
          enterReadOnly(cause);

          // Read APIs must remain callable (R13.3: read requests continue to succeed)
          expect(() => isDegraded()).not.toThrow();
          expect(() => canWrite()).not.toThrow();
          expect(() => getDegradedState()).not.toThrow();

          expect(isDegraded()).toBe(true);
          expect(canWrite()).toBe(false);
          expect(getDegradedState()).toBe(cause);
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Mode round-trip and idempotence', () => {
    it('Property: exitReadOnly restores writability; subsequent enter/exit sequences preserve the contract', () => {
      fc.assert(
        fc.property(
          fc.array(causeArb, { minLength: 1, maxLength: 8 }),
          (causes) => {
            exitReadOnly();

            // After exit, requireWritable must NOT throw and canWrite must be true
            expect(() => requireWritable()).not.toThrow();
            expect(canWrite()).toBe(true);

            for (const cause of causes) {
              enterReadOnly(cause);
              expect(getDegradedState()).toBe(cause);

              // Guard rejects with the current cause
              let thrown: unknown;
              try {
                requireWritable();
              } catch (e) {
                thrown = e;
              }
              expect(thrown).toBeInstanceOf(ReadOnlyDegradedError);
              expect((thrown as ReadOnlyDegradedError).cause).toBe(cause);

              exitReadOnly();
              // After exit guard must once again pass
              expect(() => requireWritable()).not.toThrow();
              expect(canWrite()).toBe(true);
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    it('Property: re-entering with a different cause updates the cause and the guard error reflects the latest cause', () => {
      fc.assert(
        fc.property(causeArb, causeArb, (first, second) => {
          exitReadOnly();
          enterReadOnly(first);
          expect(getDegradedState()).toBe(first);

          enterReadOnly(second);
          // Implementation contract: while already degraded, the cause is
          // updated to the most recent enterReadOnly invocation.
          expect(getDegradedState()).toBe(second);

          let thrown: unknown;
          try {
            requireWritable();
          } catch (e) {
            thrown = e;
          }
          expect(thrown).toBeInstanceOf(ReadOnlyDegradedError);
          expect((thrown as ReadOnlyDegradedError).cause).toBe(second);
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Sequence-of-writes invariant (R13.3)', () => {
    // Models a sequence of arbitrary "write attempts" against any of the four
    // protected surfaces: Project_Manifest write, User_Manifest write, project
    // data mutation, project metadata mutation. Every site must funnel through
    // requireWritable() (or writeIfAllowed) — Property 12 asserts the guard,
    // not the call sites themselves.

    type WriteSurface =
      | 'project_manifest'
      | 'user_manifest'
      | 'project_data'
      | 'project_metadata'
      | 'create_new_project';

    const surfaceArb: fc.Arbitrary<WriteSurface> = fc.constantFrom(
      'project_manifest',
      'user_manifest',
      'project_data',
      'project_metadata',
      'create_new_project',
    );

    /** Simulated write-site that, like real call sites, gates via the guard. */
    function attemptWrite(_surface: WriteSurface): void {
      requireWritable();
      // unreachable while degraded — the guard throws first
    }

    it('Property: every write across every protected surface throws ReadOnlyDegradedError', () => {
      fc.assert(
        fc.property(
          causeArb,
          fc.array(surfaceArb, { minLength: 1, maxLength: 64 }),
          (cause, surfaces) => {
            exitReadOnly();
            enterReadOnly(cause);

            for (const surface of surfaces) {
              let thrown: unknown;
              try {
                attemptWrite(surface);
              } catch (e) {
                thrown = e;
              }
              expect(thrown).toBeInstanceOf(ReadOnlyDegradedError);
              expect((thrown as ReadOnlyDegradedError).cause).toBe(cause);
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
