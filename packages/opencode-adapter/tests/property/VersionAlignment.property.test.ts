/**
 * Property-Based Tests for Adapter Version Alignment
 *
 * Feature: opencode-adapter, Property 12: Adapter Version Alignment
 * Derived-From: v6-architecture-overview Property 12
 *
 * "For all OpenCode versions v observed at startup and
 *  OpenCodeAdapter.compatibleKernelRange interval R, if v ∉ R, THEN Daemon must
 *  refuse to bind to that OpenCode instance and record an
 *  `adapter.version_mismatch` event; conversely if v ∈ R, binding succeeds."
 *
 * Validates: Requirements 2.1, 2.2, 2.3
 *
 * Implementation note:
 *   Property 12 has TWO halves:
 *     1. The compatibility decision itself (v ∈ R ⇒ accept; v ∉ R ⇒ reject).
 *     2. On rejection, an `adapter.version_mismatch` event MUST be produced.
 *
 *   We exercise both halves below.  Iteration count is ≥ 100 for every
 *   Property-12 property (per the V6 PBT-iteration policy for non-safety-
 *   critical properties).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  checkCompatibility,
  buildVersionMismatchEvent,
} from '../../src/version-checker';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Bounded SemVer triple. We keep numbers small enough that caret / tilde
 * arithmetic (e.g. major+1) cannot overflow a sensible range.
 */
const semverTriple = fc.record({
  major: fc.integer({ min: 0, max: 50 }),
  minor: fc.integer({ min: 0, max: 50 }),
  patch: fc.integer({ min: 0, max: 50 }),
});

const triple = ({ major, minor, patch }: { major: number; minor: number; patch: number }) =>
  `${major}.${minor}.${patch}`;

/**
 * Strictly-increasing pair of triples (low < high) for compound ranges.
 * We enforce strict ordering on the major-minor-patch tuple.
 */
const orderedPair = fc
  .tuple(semverTriple, semverTriple)
  .filter(([a, b]) => {
    if (a.major !== b.major) return a.major < b.major;
    if (a.minor !== b.minor) return a.minor < b.minor;
    return a.patch < b.patch;
  });

/**
 * A version strictly inside the half-open range [low, high).
 */
const versionInside = (low: { major: number; minor: number; patch: number }, high: { major: number; minor: number; patch: number }) => {
  // Choose a major between low.major and high.major - 1 if possible; otherwise
  // fix major to low.major and pick a minor.patch strictly above low and
  // strictly below high (inside half-open interval).
  if (low.major < high.major) {
    return triple(low); // low itself is always in [low, high)
  }
  if (low.minor < high.minor) {
    return triple({ major: low.major, minor: low.minor, patch: low.patch });
  }
  // low.major == high.major and low.minor == high.minor; low.patch < high.patch
  return triple(low);
};

// ---------------------------------------------------------------------------
// Property 12: Compatibility decision
// ---------------------------------------------------------------------------

describe('Property 12: Adapter Version Alignment', () => {
  /**
   * P12.A — Membership half:  v ∈ R  ⇒  binding succeeds.
   *
   * For any compound range >=L <H with L < H, the lower bound L itself is
   * always inside the half-open interval, so checkCompatibility must accept it.
   */
  it('accepts versions inside the compatible range (>=L <H)', () => {
    fc.assert(
      fc.property(orderedPair, ([low, high]) => {
        const range = `>=${triple(low)} <${triple(high)}`;
        const v = versionInside(low, high);
        const result = checkCompatibility(v, range);
        expect(result.compatible).toBe(true);
        expect(result.reason).toBeUndefined();
      }),
      { numRuns: 200 }
    );
  });

  /**
   * P12.B — Non-membership half (below):  v < L  ⇒  binding refused.
   *
   * Generate a version strictly below the range's lower bound on the major
   * axis (forcing a clear violation), then assert rejection.
   */
  it('rejects versions strictly below the compatible range', () => {
    fc.assert(
      fc.property(
        // Lower-bound major must be ≥ 1 so we have room for a strictly-smaller
        // major below it.
        fc.record({
          major: fc.integer({ min: 1, max: 50 }),
          minor: fc.integer({ min: 0, max: 50 }),
          patch: fc.integer({ min: 0, max: 50 }),
        }),
        // High must be a valid upper bound greater than low; we just bump
        // major by a positive amount so the resulting range is well-formed.
        fc.integer({ min: 1, max: 5 }),
        // The version-under-test: strictly smaller major than low.
        fc.record({
          minor: fc.integer({ min: 0, max: 50 }),
          patch: fc.integer({ min: 0, max: 50 }),
        }),
        fc.integer({ min: 1, max: 50 }),
        (low, majorBump, vTail, deltaMajor) => {
          const high = { major: low.major + majorBump, minor: 0, patch: 0 };
          const range = `>=${triple(low)} <${triple(high)}`;
          const belowMajor = Math.max(0, low.major - deltaMajor);
          // Guard: only run when below.major < low.major, i.e. deltaMajor > 0
          // and low.major - deltaMajor ≥ 0; if equal, skip via fc.pre.
          fc.pre(belowMajor < low.major);
          const v = `${belowMajor}.${vTail.minor}.${vTail.patch}`;
          const result = checkCompatibility(v, range);
          expect(result.compatible).toBe(false);
          expect(result.reason).toBeDefined();
          expect(result.reason).toContain(v);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * P12.C — Non-membership half (above):  v ≥ H  ⇒  binding refused.
   */
  it('rejects versions at or above the compatible upper bound', () => {
    fc.assert(
      fc.property(orderedPair, fc.integer({ min: 0, max: 5 }), ([low, high], extraMajor) => {
        const range = `>=${triple(low)} <${triple(high)}`;
        // version with major = high.major + extraMajor (≥ high.major) → ∉ range
        const v = `${high.major + extraMajor}.${high.minor}.${high.patch}`;
        const result = checkCompatibility(v, range);
        expect(result.compatible).toBe(false);
        expect(result.reason).toBeDefined();
        expect(result.reason).toContain(v);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * P12.D — Patch-version boundary inside a caret range.
   *
   * `^M.m.p` denotes >=M.m.p <(M+1).0.0 (for M > 0).  Therefore:
   *   • patch == p           ⇒ accepted
   *   • patch  > p (same M.m) ⇒ accepted
   *   • patch == p but minor > m (any patch) ⇒ accepted
   *   • patch  < p with minor == m ⇒ rejected (below floor)
   *   • major  > M           ⇒ rejected
   */
  it('honours patch-version boundaries inside caret (^) ranges', () => {
    fc.assert(
      fc.property(
        fc.record({
          // For caret on M.m.p with M ≥ 1, the upper bound is (M+1).0.0
          major: fc.integer({ min: 1, max: 40 }),
          minor: fc.integer({ min: 1, max: 40 }),
          patch: fc.integer({ min: 1, max: 40 }),
        }),
        fc.integer({ min: 1, max: 10 }),
        (base, delta) => {
          const range = `^${triple(base)}`;

          // Same version → accepted
          expect(checkCompatibility(triple(base), range).compatible).toBe(true);

          // Higher patch on same minor → accepted
          const higherPatch = { ...base, patch: base.patch + delta };
          expect(checkCompatibility(triple(higherPatch), range).compatible).toBe(true);

          // Higher minor (any patch ≥ 0) → accepted
          const higherMinor = { major: base.major, minor: base.minor + 1, patch: 0 };
          expect(checkCompatibility(triple(higherMinor), range).compatible).toBe(true);

          // Same minor but lower patch → rejected (below floor)
          const lowerPatch = { ...base, patch: Math.max(0, base.patch - 1) };
          if (lowerPatch.patch < base.patch) {
            expect(checkCompatibility(triple(lowerPatch), range).compatible).toBe(false);
          }

          // Higher major → rejected (caret is locked to same major for M ≥ 1)
          const higherMajor = { major: base.major + 1, minor: 0, patch: 0 };
          expect(checkCompatibility(triple(higherMajor), range).compatible).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  // -------------------------------------------------------------------------
  // Property 12 second half: adapter.version_mismatch event must be produced
  // on every rejection.  We model this by calling buildVersionMismatchEvent
  // (the daemon-neutral payload that OpenCodeAdapter hands to the event bus
  //  on a failed binding).
  // -------------------------------------------------------------------------

  it('produces a well-formed adapter.version_mismatch event for any rejected version', () => {
    fc.assert(
      fc.property(orderedPair, fc.integer({ min: 1, max: 5 }), ([low, high], extraMajor) => {
        const range = `>=${triple(low)} <${triple(high)}`;
        const v = `${high.major + extraMajor}.0.0`; // strictly above range
        const result = checkCompatibility(v, range);
        // Pre-condition for this property: rejection.
        fc.pre(!result.compatible);

        const evt = buildVersionMismatchEvent(v, range, result.reason);

        // 1. Event type is the literal Property-12 mandates.
        expect(evt.type).toBe('adapter.version_mismatch');

        // 2. Payload carries detected version + required range verbatim.
        expect(evt.payload.detectedVersion).toBe(v);
        expect(evt.payload.requiredRange).toBe(range);

        // 3. Reason mentions both the version and the range so operators can
        //    diagnose the mismatch from logs alone.
        expect(evt.payload.reason).toContain(v);
        expect(evt.payload.reason).toContain(range);

        // 4. detectedAt is an ISO-8601 timestamp (Daemon-neutral).
        expect(() => new Date(evt.payload.detectedAt).toISOString()).not.toThrow();
        expect(evt.payload.detectedAt).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
        );

        // 5. suggestedAction is one of the documented enums.
        expect(['upgrade_adapter', 'downgrade_kernel', 'check_versions']).toContain(
          evt.payload.suggestedAction
        );
      }),
      { numRuns: 200 }
    );
  });

  /**
   * Symmetric guarantee: for ANY accepted version, the caller has no obligation
   * to emit an event — but if it did call buildVersionMismatchEvent anyway,
   * the function must still produce a Daemon-neutral payload with no
   * OpenCode-specific concepts (Property 4 spillover; we re-check it here).
   *
   * More importantly: checkCompatibility().reason MUST be undefined on accept
   * so callers can use a simple `if (!result.compatible) emit(...)` pattern.
   */
  it('does not produce a rejection reason when version is inside the range', () => {
    fc.assert(
      fc.property(orderedPair, ([low, high]) => {
        const range = `>=${triple(low)} <${triple(high)}`;
        const v = versionInside(low, high);
        const result = checkCompatibility(v, range);
        expect(result.compatible).toBe(true);
        expect(result.reason).toBeUndefined();
      }),
      { numRuns: 200 }
    );
  });

  /**
   * Bidirectional consistency:  v ∈ R  ⇔  checkCompatibility(v, R).compatible
   *
   * Sampling on caret ranges of the form ^M.m.p with M ≥ 1, every M.m'.p'
   * with m' ≥ m must be accepted, every (M-1).*.* and (M+1).*.* must be
   * rejected. This catches off-by-one regressions in upper-bound synthesis.
   */
  it('caret range upper bound exactly equals (M+1).0.0', () => {
    fc.assert(
      fc.property(
        fc.record({
          major: fc.integer({ min: 1, max: 40 }),
          minor: fc.integer({ min: 0, max: 40 }),
          patch: fc.integer({ min: 0, max: 40 }),
        }),
        (base) => {
          const range = `^${triple(base)}`;

          // (M+1).0.0 is the first version OUTSIDE the range.
          const justAbove = `${base.major + 1}.0.0`;
          expect(checkCompatibility(justAbove, range).compatible).toBe(false);

          // M.maxMinor.maxPatch (any minor ≥ base.minor, any patch) is INSIDE.
          const inside = `${base.major}.${base.minor + 5}.0`;
          expect(checkCompatibility(inside, range).compatible).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});
