/**
 * Property-based tests for Downgrade Detection
 *
 * **Validates: Requirements 15.1**
 *
 * Property 13: Downgrade detection correctness
 *
 * For any pair of semver version strings (source version, manifest version),
 * the downgrade detector SHALL return `true` if and only if the source version
 * is strictly less than the manifest version according to semver comparison rules.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { checkDowngrade } from "../../scripts/lib/downgrade"
import { parseVersion, compareVersions } from "../../scripts/lib/semver"

// ============================================================
// Generators
// ============================================================

/**
 * Generate a valid semver version string (major.minor.patch)
 * Constrained to reasonable ranges to ensure meaningful comparisons.
 */
function arbSemver(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.nat({ max: 99 }),
      fc.nat({ max: 99 }),
      fc.nat({ max: 99 })
    )
    .map(([major, minor, patch]) => `${major}.${minor}.${patch}`)
}

/**
 * Generate a pair of distinct semver versions where source < manifest (downgrade case)
 */
function arbDowngradePair(): fc.Arbitrary<{ source: string; manifest: string }> {
  return fc
    .tuple(
      fc.nat({ max: 99 }),
      fc.nat({ max: 99 }),
      fc.nat({ max: 99 }),
      fc.nat({ max: 99 }),
      fc.nat({ max: 99 }),
      fc.nat({ max: 99 })
    )
    .filter(([sMaj, sMin, sPat, mMaj, mMin, mPat]) => {
      // source must be strictly less than manifest
      if (sMaj < mMaj) return true
      if (sMaj === mMaj && sMin < mMin) return true
      if (sMaj === mMaj && sMin === mMin && sPat < mPat) return true
      return false
    })
    .map(([sMaj, sMin, sPat, mMaj, mMin, mPat]) => ({
      source: `${sMaj}.${sMin}.${sPat}`,
      manifest: `${mMaj}.${mMin}.${mPat}`,
    }))
}

/**
 * Generate a pair of semver versions where source >= manifest (non-downgrade case)
 */
function arbNonDowngradePair(): fc.Arbitrary<{ source: string; manifest: string }> {
  return fc
    .tuple(
      fc.nat({ max: 99 }),
      fc.nat({ max: 99 }),
      fc.nat({ max: 99 }),
      fc.nat({ max: 99 }),
      fc.nat({ max: 99 }),
      fc.nat({ max: 99 })
    )
    .filter(([sMaj, sMin, sPat, mMaj, mMin, mPat]) => {
      // source must be >= manifest
      if (sMaj > mMaj) return true
      if (sMaj === mMaj && sMin > mMin) return true
      if (sMaj === mMaj && sMin === mMin && sPat >= mPat) return true
      return false
    })
    .map(([sMaj, sMin, sPat, mMaj, mMin, mPat]) => ({
      source: `${sMaj}.${sMin}.${sPat}`,
      manifest: `${mMaj}.${mMin}.${mPat}`,
    }))
}

// ============================================================
// Property Tests
// ============================================================

describe("Downgrade Detection Properties", () => {
  // Property 13: Downgrade detection correctness
  //
  // For any pair of semver version strings (source version, manifest version),
  // the downgrade detector SHALL return `true` if and only if the source version
  // is strictly less than the manifest version according to semver comparison rules.
  //
  // Validates: Requirements 15.1

  it("Property 13a: isDowngrade === true iff source < manifest (biconditional)", () => {
    fc.assert(
      fc.property(
        arbSemver(),
        arbSemver(),
        (sourceVersion, manifestVersion) => {
          const result = checkDowngrade(sourceVersion, manifestVersion)

          // Independent semver comparison
          const sourceParsed = parseVersion(sourceVersion)
          const manifestParsed = parseVersion(manifestVersion)
          const cmp = compareVersions(sourceParsed, manifestParsed)

          const expectedIsDowngrade = cmp < 0

          // Biconditional: isDowngrade === true iff source < manifest
          expect(result.isDowngrade).toBe(expectedIsDowngrade)
        }
      ),
      { numRuns: 200 }
    )
  })

  it("Property 13b: downgrade detected for all source < manifest pairs", () => {
    fc.assert(
      fc.property(
        arbDowngradePair(),
        ({ source, manifest }) => {
          const result = checkDowngrade(source, manifest)

          expect(result.isDowngrade).toBe(true)
          expect(result.previousVersion).toBe(manifest)
          expect(result.targetVersion).toBe(source)
        }
      ),
      { numRuns: 200 }
    )
  })

  it("Property 13c: no downgrade detected for source >= manifest pairs", () => {
    fc.assert(
      fc.property(
        arbNonDowngradePair(),
        ({ source, manifest }) => {
          const result = checkDowngrade(source, manifest)

          expect(result.isDowngrade).toBe(false)
          expect(result.previousVersion).toBe(manifest)
          expect(result.targetVersion).toBe(source)
        }
      ),
      { numRuns: 200 }
    )
  })

  it("Property 13d: equal versions are never a downgrade", () => {
    fc.assert(
      fc.property(
        arbSemver(),
        (version) => {
          const result = checkDowngrade(version, version)

          expect(result.isDowngrade).toBe(false)
          expect(result.previousVersion).toBe(version)
          expect(result.targetVersion).toBe(version)
        }
      ),
      { numRuns: 200 }
    )
  })

  it("Property 13e: downgrade comparison is strictly by major > minor > patch", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        (major, minor, patch) => {
          // Incrementing major always makes it non-downgrade
          if (major < 99) {
            const source = `${major + 1}.0.0`
            const manifest = `${major}.${minor}.${patch}`
            const result = checkDowngrade(source, manifest)
            expect(result.isDowngrade).toBe(false)
          }

          // Decrementing major always makes it a downgrade
          if (major > 0) {
            const source = `${major - 1}.99.99`
            const manifest = `${major}.${minor}.${patch}`
            const result = checkDowngrade(source, manifest)
            expect(result.isDowngrade).toBe(true)
          }
        }
      ),
      { numRuns: 200 }
    )
  })
})
