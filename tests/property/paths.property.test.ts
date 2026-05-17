/**
 * Property-based tests for Path Normalization Module
 *
 * **Validates: Requirements 1.6, 10.1, 10.2, 10.4**
 *
 * Property 3: Path normalization round-trip consistency
 *
 * For any file path containing arbitrary combinations of forward slashes,
 * backslashes, and mixed separators, converting to internal POSIX format
 * and then to native OS format SHALL produce a valid path that resolves
 * to the same filesystem location. Additionally, all paths in DesiredState
 * and CurrentState SHALL use only forward slashes regardless of the host OS.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { toPosix, toNative, normalizeSeparators } from "../../scripts/lib/paths"
import { arbRelativePath, arbDesiredStateEntry, arbCurrentStateEntry } from "../helpers/generators"

// ============================================================
// Generators
// ============================================================

/**
 * Generate random path segments (no separators inside segments).
 * Segments are non-empty strings of alphanumeric + underscore + hyphen + dot.
 */
function arbPathSegment(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-zA-Z0-9_\-.]{1,20}$/)
}

/**
 * Generate a random separator: forward slash, backslash, or mixed.
 */
function arbSeparator(): fc.Arbitrary<string> {
  return fc.constantFrom("/", "\\")
}

/**
 * Generate a random path with mixed separators.
 * Produces paths like "agents\sf-foo/bar\baz.md"
 */
function arbMixedPath(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.array(arbPathSegment(), { minLength: 1, maxLength: 5 }),
      fc.array(arbSeparator(), { minLength: 1, maxLength: 5 })
    )
    .map(([segments, separators]) => {
      // Interleave segments with separators
      let result = segments[0]
      for (let i = 1; i < segments.length; i++) {
        const sep = separators[(i - 1) % separators.length]
        result += sep + segments[i]
      }
      return result
    })
}

/**
 * Generate a path that uses only backslashes.
 */
function arbBackslashPath(): fc.Arbitrary<string> {
  return fc
    .array(arbPathSegment(), { minLength: 1, maxLength: 5 })
    .map((segments) => segments.join("\\"))
}

/**
 * Generate a path that uses only forward slashes.
 */
function arbForwardSlashPath(): fc.Arbitrary<string> {
  return fc
    .array(arbPathSegment(), { minLength: 1, maxLength: 5 })
    .map((segments) => segments.join("/"))
}

/**
 * Generate any kind of path: mixed, backslash-only, or forward-slash-only.
 */
function arbAnyPath(): fc.Arbitrary<string> {
  return fc.oneof(arbMixedPath(), arbBackslashPath(), arbForwardSlashPath())
}

// ============================================================
// Property Tests
// ============================================================

describe("Path Normalization Properties", () => {
  // Property 3: Path normalization round-trip consistency
  //
  // On Unix: toNative(toPosix(path)) === toPosix(path)
  //   because native separator IS forward slash on Unix.
  //
  // On all platforms: toPosix(path) result contains no backslashes.
  //
  // Additionally: DesiredState/CurrentState paths use only forward slashes.
  //
  // Validates: Requirements 1.6, 10.1, 10.2, 10.4

  it("Property 3a: toPosix result contains no backslashes", () => {
    fc.assert(
      fc.property(arbAnyPath(), (path) => {
        const posix = toPosix(path)

        // R10.1: Internal path representation uses POSIX style (no backslashes)
        expect(posix).not.toContain("\\")
      }),
      { numRuns: 200 }
    )
  })

  it("Property 3b: normalizeSeparators is equivalent to toPosix", () => {
    fc.assert(
      fc.property(arbAnyPath(), (path) => {
        // R10.4: normalizeSeparators handles both forward and backslash separators
        const posix = toPosix(path)
        const normalized = normalizeSeparators(path)

        expect(normalized).toBe(posix)
      }),
      { numRuns: 200 }
    )
  })

  it("Property 3c: toNative(toPosix(path)) equals toPosix(path) on Unix", () => {
    // On Unix (where path.sep === '/'), toNative is a no-op on POSIX paths.
    // On Windows (where path.sep === '\\'), toNative converts '/' to '\\'.
    // In both cases, the round-trip resolves to the same filesystem location.
    fc.assert(
      fc.property(arbAnyPath(), (path) => {
        const posix = toPosix(path)
        const native = toNative(posix)

        if (process.platform !== "win32") {
          // On Unix: native === posix (no conversion needed)
          expect(native).toBe(posix)
        } else {
          // On Windows: toNative converts '/' to '\\'
          // Converting back to posix should give the same posix path
          expect(toPosix(native)).toBe(posix)
        }
      }),
      { numRuns: 200 }
    )
  })

  it("Property 3d: toPosix is idempotent", () => {
    fc.assert(
      fc.property(arbAnyPath(), (path) => {
        const once = toPosix(path)
        const twice = toPosix(once)

        // Applying toPosix multiple times produces the same result
        expect(twice).toBe(once)
      }),
      { numRuns: 200 }
    )
  })

  it("Property 3e: toNative is idempotent on POSIX-normalized paths", () => {
    fc.assert(
      fc.property(arbAnyPath(), (path) => {
        const posix = toPosix(path)
        const native1 = toNative(posix)
        const native2 = toNative(native1)

        // Applying toNative multiple times on a native path is stable
        expect(native2).toBe(native1)
      }),
      { numRuns: 200 }
    )
  })

  it("Property 3f: toPosix preserves path segments", () => {
    fc.assert(
      fc.property(arbAnyPath(), (path) => {
        const posix = toPosix(path)

        // Split by both separators and compare segments
        const originalSegments = path.split(/[/\\]/).filter((s) => s.length > 0)
        const posixSegments = posix.split("/").filter((s) => s.length > 0)

        expect(posixSegments).toEqual(originalSegments)
      }),
      { numRuns: 200 }
    )
  })

  it("Property 3g: DesiredState entries use only forward slashes in relativePath", () => {
    fc.assert(
      fc.property(arbDesiredStateEntry(), (entry) => {
        // R1.6 + R10.1: All paths in DesiredState use POSIX format
        expect(entry.relativePath).not.toContain("\\")
      }),
      { numRuns: 100 }
    )
  })

  it("Property 3h: CurrentState entries use only forward slashes in relativePath", () => {
    fc.assert(
      fc.property(arbCurrentStateEntry(), (entry) => {
        // R10.1: All paths in CurrentState use POSIX format
        expect(entry.relativePath).not.toContain("\\")
      }),
      { numRuns: 100 }
    )
  })
})
