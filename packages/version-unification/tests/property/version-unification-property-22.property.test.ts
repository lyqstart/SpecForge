/**
 * Property test for release-cycle behavior of ManifestMigrator.
 *
 * Feature: version-unification, Property 22: Release-cycle behavior;
 * Derived-From: v6-architecture-overview Property 22
 * Validates: Requirements 11.2, 11.3, 11.4
 *
 * Property: ManifestMigrator's read/write behavior is fully determined by the
 * current release cycle as reported by `getCurrentReleaseCycle()`:
 *   - Cycle 1 (DUAL_WRITE):           decorateOnWrite produces an object
 *                                     containing every "new" field plus every
 *                                     legacy field; reading legacy never emits
 *                                     a deprecation warning.
 *   - Cycle 2 (READ_OLD_WRITE_NEW):   decorateOnWrite produces an object whose
 *                                     keyset equals exactly the new field set
 *                                     (no legacy fields); reading a legacy
 *                                     manifest emits exactly one deprecation
 *                                     warning per unique manifest path per
 *                                     process invocation.
 *   - Cycle 3 (IN_PLACE_CONVERT):     decorateOnWrite behaves identically to
 *                                     Cycle 2 (only new fields).
 *
 * The cycle itself is selected by mocking `getCurrentReleaseCycle()` (which is
 * normally derived from `getCodeVersion()`); deprecation warning state is
 * tracked by the migrator's module-level `warnedPaths` set, exposed for tests
 * via `_resetWarnedPaths()` / `_getWarnedPaths()`.
 *
 * numRuns: 200
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// =============================================================================
// Module mocks - control the release cycle without changing code_version
// =============================================================================

// vi.hoisted lets the mock factory below close over a mutable cell that we can
// flip at runtime to drive the migrator into each cycle.
const cycleState = vi.hoisted(() => ({
  current: 'DUAL_WRITE' as 'DUAL_WRITE' | 'READ_OLD_WRITE_NEW' | 'IN_PLACE_CONVERT',
}));

vi.mock('../../src/legacy/release-cycle-policy', () => ({
  getCurrentReleaseCycle: () => cycleState.current,
  ReleaseCyclePolicy: class {
    current() {
      return cycleState.current;
    }
  },
}));

// Imports must come AFTER vi.mock for the mock to apply.
import {
  ManifestMigrator,
  _resetWarnedPaths,
  _getWarnedPaths,
} from '../../src/legacy/migrator';
import {
  USER_MANIFEST_FIELDS,
  PROJECT_MANIFEST_FIELDS,
  LEGACY_FIELDS_USER,
  LEGACY_FIELDS_PROJECT,
  type UserManifest,
  type ProjectManifest,
} from '../../src/manifest/types';

// =============================================================================
// Arbitraries
// =============================================================================

/**
 * A canonical (new-format) user manifest. Field set is exactly
 * USER_MANIFEST_FIELDS so the test can assert key-set equality afterwards.
 */
function arbUserManifest(): fc.Arbitrary<UserManifest> {
  return fc.record({
    code_version: fc.constantFrom('6.0.0', '6.1.0', '6.2.0', '7.0.0', '6.0.0-dev'),
    min_supported_data_schema: fc.integer({ min: 0, max: 99 }),
    installed_at: fc.constant('2025-01-01T00:00:00.000Z'),
    updated_at: fc.constant('2025-01-01T00:00:00.000Z'),
    files: fc.array(
      fc.record({
        path: fc.string({ minLength: 1, maxLength: 32 }),
        sha256: fc
          .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
            minLength: 64,
            maxLength: 64,
          })
          .map((chars) => chars.join('')),
        size: fc.integer({ min: 0, max: 1_000_000 }),
      }),
      { maxLength: 3 }
    ),
  }) as fc.Arbitrary<UserManifest>;
}

/**
 * A canonical (new-format) project manifest.
 */
function arbProjectManifest(): fc.Arbitrary<ProjectManifest> {
  return fc.record({
    data_schema_version: fc.integer({ min: 0, max: 99 }),
    initialized_at: fc.constant('2025-01-01T00:00:00.000Z'),
    updated_at: fc.constant('2025-01-01T00:00:00.000Z'),
  }) as fc.Arbitrary<ProjectManifest>;
}

/**
 * Legacy raw JSON that always contains at least one legacy field so
 * `isLegacy(rawJson) === true`. We pick `shared_version` because it is in
 * both LEGACY_FIELDS_USER and LEGACY_FIELDS_PROJECT.
 */
function arbLegacyUserRawJson(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    // legacy marker (forces isLegacy === true)
    shared_version: fc.constantFrom('5.9.0', '5.8.0', '6.0.0-dev'),
    // mix of new + legacy fields
    code_version: fc.constantFrom('5.9.0', '5.8.0'),
    min_supported_data_schema: fc.integer({ min: 0, max: 5 }),
    installed_at: fc.constant('2024-12-01T00:00:00.000Z'),
    updated_at: fc.constant('2024-12-01T00:00:00.000Z'),
    files: fc.constant([]),
  });
}

/**
 * Generates an absolute-ish path string. Two arbitrary paths drawn from this
 * generator are not necessarily distinct; the property tests handle that.
 */
function arbManifestPath(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom('/tmp', '/var', 'C:\\Users\\u', 'D:\\proj'),
      fc.string({ minLength: 1, maxLength: 16 }).filter((s) => !/[\u0000]/.test(s))
    )
    .map(([root, name]) => `${root}/.specforge/${name}/manifest.json`);
}

// =============================================================================
// Property tests
// =============================================================================

describe('Property 22: Release-cycle behavior', () => {
  beforeEach(() => {
    _resetWarnedPaths();
  });

  // -------------------------------------------------------------------------
  // R11.2 — Cycle 1: DUAL_WRITE
  // -------------------------------------------------------------------------
  describe('R11.2 (DUAL_WRITE / Cycle 1): writes contain both new and legacy fields', () => {
    beforeEach(() => {
      cycleState.current = 'DUAL_WRITE';
    });

    it('Property: decorateOnWrite(user) preserves every new field AND adds every user-legacy field', () => {
      fc.assert(
        fc.property(arbUserManifest(), (manifest) => {
          const decorated = ManifestMigrator.decorateOnWrite(manifest);

          // Every new-format field is preserved with its original value.
          for (const f of USER_MANIFEST_FIELDS) {
            expect(decorated).toHaveProperty(f);
            expect(decorated[f]).toEqual((manifest as unknown as Record<string, unknown>)[f]);
          }

          // Every legacy user field is added (DUAL_WRITE = "double-write").
          for (const lf of LEGACY_FIELDS_USER) {
            expect(decorated).toHaveProperty(lf);
          }
        }),
        { numRuns: 200 }
      );
    });

    it('Property: decorateOnWrite(project) preserves every new field AND adds every project-legacy field', () => {
      fc.assert(
        fc.property(arbProjectManifest(), (manifest) => {
          const decorated = ManifestMigrator.decorateOnWrite(manifest);

          for (const f of PROJECT_MANIFEST_FIELDS) {
            expect(decorated).toHaveProperty(f);
            expect(decorated[f]).toEqual(
              (manifest as unknown as Record<string, unknown>)[f]
            );
          }

          // LEGACY_FIELDS_PROJECT = LEGACY_FIELDS_USER ∪ {'code_version'}.
          for (const lf of LEGACY_FIELDS_PROJECT) {
            expect(decorated).toHaveProperty(lf);
          }
        }),
        { numRuns: 200 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // R11.3 — Cycle 2: READ_OLD_WRITE_NEW (writes only new; warns once per path)
  // R11.4 — Cycle 3: IN_PLACE_CONVERT (writes only new)
  // -------------------------------------------------------------------------
  for (const cycle of ['READ_OLD_WRITE_NEW', 'IN_PLACE_CONVERT'] as const) {
    describe(`R11.${cycle === 'READ_OLD_WRITE_NEW' ? '3' : '4'} (${cycle}): writes contain only new fields`, () => {
      beforeEach(() => {
        cycleState.current = cycle;
      });

      it(`Property: in ${cycle}, decorateOnWrite(user) keyset === USER_MANIFEST_FIELDS`, () => {
        fc.assert(
          fc.property(arbUserManifest(), (manifest) => {
            const decorated = ManifestMigrator.decorateOnWrite(manifest);

            // Keyset equality (no extra legacy keys, no missing new keys).
            const decoratedKeys = Object.keys(decorated).sort();
            const expectedKeys = [...USER_MANIFEST_FIELDS].sort();
            expect(decoratedKeys).toEqual(expectedKeys);

            // No legacy field of any kind.
            for (const lf of LEGACY_FIELDS_USER) {
              expect(decorated).not.toHaveProperty(lf);
            }
          }),
          { numRuns: 200 }
        );
      });

      it(`Property: in ${cycle}, decorateOnWrite(project) keyset === PROJECT_MANIFEST_FIELDS`, () => {
        fc.assert(
          fc.property(arbProjectManifest(), (manifest) => {
            const decorated = ManifestMigrator.decorateOnWrite(manifest);

            const decoratedKeys = Object.keys(decorated).sort();
            const expectedKeys = [...PROJECT_MANIFEST_FIELDS].sort();
            expect(decoratedKeys).toEqual(expectedKeys);

            for (const lf of LEGACY_FIELDS_PROJECT) {
              expect(decorated).not.toHaveProperty(lf);
            }
          }),
          { numRuns: 200 }
        );
      });
    });
  }

  // -------------------------------------------------------------------------
  // R11.3 — Cycle 2: single deprecation warning per (path, process) pair
  // -------------------------------------------------------------------------
  describe('R11.3 (READ_OLD_WRITE_NEW): emits exactly one deprecation warning per unique path', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      cycleState.current = 'READ_OLD_WRITE_NEW';
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* swallow during the property test */
      });
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('Property: N consecutive migrateOnRead calls on the SAME legacy path emit exactly 1 warning', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbLegacyUserRawJson(),
          arbManifestPath(),
          fc.integer({ min: 1, max: 6 }),
          async (legacyJson, path, callCount) => {
            // Reset state per iteration so warnedPaths and the spy start clean.
            _resetWarnedPaths();
            warnSpy.mockClear();

            for (let i = 0; i < callCount; i++) {
              await ManifestMigrator.migrateOnRead(legacyJson, path);
            }

            // Exactly one warning regardless of how many calls happened.
            expect(warnSpy).toHaveBeenCalledTimes(1);
            // And the path is now recorded.
            expect(_getWarnedPaths().has(path)).toBe(true);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('Property: K distinct legacy paths each emit exactly 1 warning => total K warnings', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbLegacyUserRawJson(),
          fc
            .uniqueArray(arbManifestPath(), { minLength: 1, maxLength: 5 })
            .filter((arr) => arr.length >= 1),
          async (legacyJson, paths) => {
            _resetWarnedPaths();
            warnSpy.mockClear();

            // Visit every distinct path twice; warnings must equal #distinct paths.
            for (const p of paths) {
              await ManifestMigrator.migrateOnRead(legacyJson, p);
              await ManifestMigrator.migrateOnRead(legacyJson, p);
            }

            expect(warnSpy).toHaveBeenCalledTimes(paths.length);
            for (const p of paths) {
              expect(_getWarnedPaths().has(p)).toBe(true);
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // R11.2 — Cycle 1 must NOT emit a deprecation warning (warning is Cycle 2 only)
  // -------------------------------------------------------------------------
  describe('R11.2 (DUAL_WRITE): reading a legacy manifest does NOT emit a deprecation warning', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      cycleState.current = 'DUAL_WRITE';
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* swallow */
      });
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('Property: in DUAL_WRITE, repeated migrateOnRead on a legacy manifest never warns', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbLegacyUserRawJson(),
          arbManifestPath(),
          fc.integer({ min: 1, max: 6 }),
          async (legacyJson, path, callCount) => {
            _resetWarnedPaths();
            warnSpy.mockClear();

            for (let i = 0; i < callCount; i++) {
              await ManifestMigrator.migrateOnRead(legacyJson, path);
            }

            expect(warnSpy).toHaveBeenCalledTimes(0);
            expect(_getWarnedPaths().size).toBe(0);
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
