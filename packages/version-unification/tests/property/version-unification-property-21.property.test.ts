/**
 * Property test for Manifest_Migrator legacy detection.
 *
 * Feature: version-unification, Property 21: Manifest_Migrator legacy detection
 * Derived-From: v6-architecture-overview Property 21
 * Validates: Requirements 11.1
 *
 * Property: When the SpecForge_System reads a manifest, the Manifest_Migrator
 * identifies the manifest as legacy if and only if its key set intersects
 * `LEGACY_FIELDS_USER ∪ LEGACY_FIELDS_PROJECT`.
 *
 * Sub-properties tested:
 *   P1. Presence: any rawJson containing at least one legacy field key → isLegacy === true
 *   P2. Absence:  any rawJson containing no legacy field keys → isLegacy === false
 *   P3. Value-independence: the verdict depends only on key names, not on the
 *       associated values (replacing all values with arbitrary data must not
 *       change isLegacy).
 *
 * numRuns: 200 (per fast-check property block)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isLegacy } from '../../src/legacy/detector';
import {
  LEGACY_FIELDS_USER,
  LEGACY_FIELDS_PROJECT,
} from '../../src/manifest/types';

// =============================================================================
// Constants & Helpers
// =============================================================================

/**
 * Union of all legacy field names recognized by the detector.
 * Mirrors the `ALL_LEGACY_FIELDS` set built inside detector.ts.
 */
const ALL_LEGACY_FIELDS: readonly string[] = Array.from(
  new Set<string>([...LEGACY_FIELDS_USER, ...LEGACY_FIELDS_PROJECT]),
);

/**
 * Arbitrary that never produces a known legacy field name.
 * Constrained to a small key alphabet to keep object shapes realistic.
 */
const nonLegacyKeyArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !(ALL_LEGACY_FIELDS as readonly string[]).includes(s));

/**
 * Arbitrary that picks one of the legacy field names.
 */
const legacyKeyArb = fc.constantFrom(...ALL_LEGACY_FIELDS);

/**
 * Arbitrary value the field may carry. The detector must ignore values
 * entirely; we throw a wide variety of shapes at it on purpose.
 */
const anyValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: false }),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.string(), { maxLength: 5 }),
  fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.string(), {
    maxKeys: 3,
  }),
);

/**
 * Build a rawJson object from key/value pairs.
 * Later entries overwrite earlier ones, matching JS object semantics.
 */
function buildObject(
  pairs: ReadonlyArray<readonly [string, unknown]>,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of pairs) {
    obj[k] = v;
  }
  return obj;
}

// =============================================================================
// Property Tests
// =============================================================================

describe('Property 21: Manifest_Migrator legacy detection (R11.1)', () => {
  // -------------------------------------------------------------------------
  // P1. Presence: any object containing at least one legacy field → true
  // -------------------------------------------------------------------------
  it('P1. isLegacy returns true whenever the object contains at least one legacy field', () => {
    fc.assert(
      fc.property(
        // At least one legacy field guaranteed
        fc.array(
          fc.tuple(legacyKeyArb, anyValueArb),
          { minLength: 1, maxLength: 5 },
        ),
        // Optional non-legacy noise fields
        fc.array(
          fc.tuple(nonLegacyKeyArb, anyValueArb),
          { maxLength: 8 },
        ),
        (legacyPairs, noisePairs) => {
          // Interleave: noise first, then legacy → legacy keys end up in the object
          const rawJson = buildObject([...noisePairs, ...legacyPairs]);

          // Sanity guard: the constructed object must actually contain a
          // legacy key after the merge (a noise key cannot collide with a
          // legacy key by construction of nonLegacyKeyArb).
          const hasLegacy = Object.keys(rawJson).some((k) =>
            (ALL_LEGACY_FIELDS as readonly string[]).includes(k),
          );
          expect(hasLegacy).toBe(true);

          expect(isLegacy(rawJson)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // P2. Absence: an object with zero legacy fields → false
  // -------------------------------------------------------------------------
  it('P2. isLegacy returns false whenever the object contains no legacy fields', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(nonLegacyKeyArb, anyValueArb),
          { maxLength: 10 },
        ),
        (pairs) => {
          const rawJson = buildObject(pairs);

          // Sanity guard: no legacy key should be present.
          const hasLegacy = Object.keys(rawJson).some((k) =>
            (ALL_LEGACY_FIELDS as readonly string[]).includes(k),
          );
          expect(hasLegacy).toBe(false);

          expect(isLegacy(rawJson)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // P3. Value-independence: replacing values must not change verdict
  // -------------------------------------------------------------------------
  it('P3. isLegacy verdict depends only on keys, not on values', () => {
    fc.assert(
      fc.property(
        // Any mix of legacy and non-legacy keys (deduped via object construction)
        fc.array(
          fc.tuple(
            fc.oneof(legacyKeyArb, nonLegacyKeyArb),
            anyValueArb,
          ),
          { maxLength: 12 },
        ),
        // A second batch of arbitrary values to swap in
        fc.array(anyValueArb, { minLength: 0, maxLength: 12 }),
        (pairs, replacementValues) => {
          const original = buildObject(pairs);
          const keys = Object.keys(original);

          // Build a sibling object with the SAME keys but different values.
          // Cycle through replacementValues to cover every key; if the
          // replacement list is empty, fall back to a constant sentinel.
          const altered: Record<string, unknown> = {};
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i]!;
            const v =
              replacementValues.length > 0
                ? replacementValues[i % replacementValues.length]
                : '__REPLACEMENT_SENTINEL__';
            altered[k] = v;
          }

          // Verdict must be identical for both objects.
          expect(isLegacy(altered)).toBe(isLegacy(original));
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // Additional grounding cases (concrete examples derived from R1.5 / R2.4)
  // -------------------------------------------------------------------------
  describe('Concrete grounding cases', () => {
    it('detects every individual legacy field name from LEGACY_FIELDS_USER', () => {
      for (const field of LEGACY_FIELDS_USER) {
        expect(isLegacy({ [field]: 'whatever' })).toBe(true);
      }
    });

    it('detects every individual legacy field name from LEGACY_FIELDS_PROJECT', () => {
      for (const field of LEGACY_FIELDS_PROJECT) {
        expect(isLegacy({ [field]: 0 })).toBe(true);
      }
    });

    it('returns false for an empty object', () => {
      expect(isLegacy({})).toBe(false);
    });

    it('returns false for a modern user manifest with no legacy keys', () => {
      // Note: the detector treats `code_version` as a legacy key (it appears
      // in LEGACY_FIELDS_PROJECT). A modern user manifest stripped of that
      // field would also be free of legacy keys.
      const modern = {
        min_supported_data_schema: 0,
        installed_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        files: [],
      };
      expect(isLegacy(modern)).toBe(false);
    });

    it('returns true for a modern-looking user manifest that still carries `code_version`', () => {
      // This documents the intentional behavior: detection is purely by
      // field-name intersection; `code_version` belongs to the legacy union
      // (via LEGACY_FIELDS_PROJECT), so its presence flips the verdict.
      const withCodeVersion = {
        code_version: '6.0.0',
        min_supported_data_schema: 0,
        installed_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        files: [],
      };
      expect(isLegacy(withCodeVersion)).toBe(true);
    });
  });
});
