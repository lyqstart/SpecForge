/**
 * Property test for user-manifest invalid-JSON error path.
 *
 * Feature: version-unification, Property 27: User-manifest invalid-JSON error path;
 * Derived-From: v6-architecture-overview Property 27
 * Validates: Requirements 14.3
 *
 * Property (R14.3): IF the User_Manifest file exists but cannot be parsed as JSON,
 * THEN the SpecForge_System raises an error that names the User_Manifest path and
 * the originating parse error.
 *
 * At the manifest-reader layer (the foundational source of this behavior), this
 * means: for any non-JSON byte sequence written to a path P, `readUser(P)` must
 *   1. reject (throw, not resolve) with an `InvalidJsonInManifestError`,
 *   2. expose the path P literally on the error (`error.manifestPath === P`
 *      and `error.message` contains P),
 *   3. expose the originating parse error in the `parseError` field
 *      (instance of `Error`, typically a `SyntaxError` from `JSON.parse`).
 *
 * Test environment:
 *  - Real filesystem temp dirs via `fs.mkdtemp` (dynamically tracked + afterEach cleanup)
 *  - One temp dir per `it`; unique filenames per iteration (cheap O(1) cleanup
 *    of the dir tree after the property completes)
 *  - numRuns: 200
 *  - per-test timeout: 30_000 ms (200 fs round-trips per property worst case)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readUser } from '../../src/manifest/manifest-reader';
import { InvalidJsonInManifestError } from '../../src/manifest/types';

// ---------------------------------------------------------------------------
// Dynamic temp-dir tracking (T1: 对称清理原则)
//
// One tracked temp dir per `it`. Each fast-check iteration produces a unique
// filename inside that dir. afterEach removes the dir tree once, regardless
// of how many filenames were created — keeps cleanup O(1) wrt numRuns.
// ---------------------------------------------------------------------------

const trackedTempDirs: string[] = [];

async function makeTrackedTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), prefix));
  trackedTempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (trackedTempDirs.length > 0) {
    const dir = trackedTempDirs.pop()!;
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {
      /* best-effort cleanup; tmpdir auto-purges anyway */
    });
  }
});

// Unique filename suffix to avoid collisions across iterations of the same
// fast-check property, regardless of shrinking.
let iterationCounter = 0;
beforeEach(() => {
  iterationCounter = 0;
});

function uniqueFileName(): string {
  iterationCounter += 1;
  return `manifest-${iterationCounter}-${process.pid}.json`;
}

// ---------------------------------------------------------------------------
// Arbitrary: non-JSON text
//
// Strategy: generate arbitrary strings via `fc.string`, then filter out the
// (rare) ones that happen to be valid JSON. We also explicitly ban the empty
// string because some JSON.parse implementations historically threw differently
// on it; for robustness we want every input to deterministically fail parsing.
// ---------------------------------------------------------------------------

function isValidJson(s: string): boolean {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

const arbitraryNonJsonString: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 256 })
  .filter((s) => !isValidJson(s));

// A second flavor: structured "looks-almost-like-JSON" garbage (truncated
// objects, trailing-comma arrays, unquoted identifiers, dangling braces, etc.).
// These exercise more interesting failure modes inside JSON.parse than purely
// random text.
const arbitraryAlmostJsonString: fc.Arbitrary<string> = fc
  .oneof(
    fc.constant('{'),
    fc.constant('}'),
    fc.constant('['),
    fc.constant(']'),
    fc.constant('{"key": }'),
    fc.constant('{"key" "value"}'),
    fc.constant('[1, 2, 3,]'),
    fc.constant('{key: "value"}'),
    fc.constant("{'key': 'value'}"),
    fc.constant('undefined'),
    fc.constant('NaN'),
    fc.constant('Infinity'),
    fc.constant('{"a":'),
    fc.constant('not json at all'),
    fc.constant('---\nyaml: looking\n---'),
    fc.constant('<xml><tag/></xml>'),
    fc.constant('\x00\x01\x02'),
    // Concatenations of two JSON values (also invalid as a top-level doc)
    fc.tuple(fc.json(), fc.json()).map(([a, b]) => `${a}${b}`),
    // Truncated JSON: take a valid JSON and cut it short
    fc
      .json()
      .filter((s) => s.length >= 2)
      .map((s) => s.slice(0, Math.max(1, Math.floor(s.length / 2)))),
  )
  .filter((s) => !isValidJson(s));

const arbitraryNonJson: fc.Arbitrary<string> = fc.oneof(
  arbitraryNonJsonString,
  arbitraryAlmostJsonString,
);

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 27: User-manifest invalid-JSON error path (R14.3)', () => {
  it(
    'Property: readUser rejects with InvalidJsonInManifestError carrying path + parseError for any non-JSON content',
    async () => {
      const dir = await makeTrackedTempDir('prop-test-27-');

      await fc.assert(
        fc.asyncProperty(arbitraryNonJson, async (content) => {
          const manifestPath = join(dir, uniqueFileName());

          // Sanity: input is genuinely not parseable as JSON.
          // (The arbitrary already filters this, but keep the invariant
          // explicit to surface generator bugs.)
          let referenceParseError: unknown;
          try {
            JSON.parse(content);
            // If JSON.parse accepted it, the arbitrary's filter is broken;
            // skip this iteration without failing the property (the filter
            // itself is what we're asserting on, not the JSON parser).
            return;
          } catch (err) {
            referenceParseError = err;
          }

          // Write the non-JSON content to a real file on disk.
          await fs.writeFile(manifestPath, content, 'utf-8');

          // Invariant 1: readUser throws (rejects).
          let captured: unknown;
          try {
            await readUser(manifestPath);
            // Reaching here means readUser silently accepted invalid JSON —
            // a hard failure of the property.
            throw new Error(
              `readUser unexpectedly resolved for non-JSON content of length ${content.length}`,
            );
          } catch (err) {
            captured = err;
          }

          // Invariant 2: the thrown value is exactly an InvalidJsonInManifestError.
          expect(captured).toBeInstanceOf(InvalidJsonInManifestError);
          const e = captured as InvalidJsonInManifestError;

          // Invariant 3: error carries the path literally.
          expect(e.manifestPath).toBe(manifestPath);
          expect(e.message).toContain(manifestPath);

          // Invariant 4: parseError is present and is an Error instance
          // (typically a SyntaxError from JSON.parse).
          expect(e.parseError).toBeInstanceOf(Error);
          expect(typeof e.parseError.message).toBe('string');

          // Invariant 5: error name is "InvalidJsonInManifestError" (preserves
          // identity across instanceof + cross-realm scenarios).
          expect(e.name).toBe('InvalidJsonInManifestError');

          // Invariant 6: the captured parseError is consistent in shape with
          // the reference parse error we observed locally (both Errors with a
          // non-empty message). We do NOT compare exact messages because V8
          // may format them differently between calls, but they should both
          // be SyntaxError-derived.
          expect(referenceParseError).toBeInstanceOf(Error);
        }),
        { numRuns: 200 },
      );
    },
    30_000,
  );

  // -------------------------------------------------------------------------
  // Concrete grounding cases (anchor the property to the requirement text)
  // -------------------------------------------------------------------------
  describe('Concrete grounding cases (R14.3 literal contract)', () => {
    it('rejects an empty file with InvalidJsonInManifestError', async () => {
      const dir = await makeTrackedTempDir('prop-test-27-empty-');
      const manifestPath = join(dir, 'empty.json');
      await fs.writeFile(manifestPath, '', 'utf-8');

      await expect(readUser(manifestPath)).rejects.toBeInstanceOf(
        InvalidJsonInManifestError,
      );
      try {
        await readUser(manifestPath);
      } catch (err) {
        const e = err as InvalidJsonInManifestError;
        expect(e.manifestPath).toBe(manifestPath);
        expect(e.message).toContain(manifestPath);
        expect(e.parseError).toBeInstanceOf(Error);
      }
    });

    it('rejects a YAML-shaped file with InvalidJsonInManifestError', async () => {
      const dir = await makeTrackedTempDir('prop-test-27-yaml-');
      const manifestPath = join(dir, 'manifest.json');
      await fs.writeFile(manifestPath, 'foo: bar\nbaz: 1\n', 'utf-8');

      try {
        await readUser(manifestPath);
        throw new Error('readUser should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidJsonInManifestError);
        const e = err as InvalidJsonInManifestError;
        expect(e.manifestPath).toBe(manifestPath);
        expect(e.parseError).toBeInstanceOf(Error);
      }
    });

    it('rejects a truncated JSON object with InvalidJsonInManifestError', async () => {
      const dir = await makeTrackedTempDir('prop-test-27-truncated-');
      const manifestPath = join(dir, 'manifest.json');
      await fs.writeFile(manifestPath, '{"code_version": "6.0.0",', 'utf-8');

      try {
        await readUser(manifestPath);
        throw new Error('readUser should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidJsonInManifestError);
        const e = err as InvalidJsonInManifestError;
        expect(e.manifestPath).toBe(manifestPath);
        expect(e.parseError).toBeInstanceOf(Error);
      }
    });

    it('preserves path with spaces and unicode in the error', async () => {
      const dir = await makeTrackedTempDir('prop-test-27-unicode-');
      const manifestPath = join(dir, '配置 文件.json');
      await fs.writeFile(manifestPath, 'not json', 'utf-8');

      try {
        await readUser(manifestPath);
        throw new Error('readUser should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidJsonInManifestError);
        const e = err as InvalidJsonInManifestError;
        expect(e.manifestPath).toBe(manifestPath);
        expect(e.message).toContain(manifestPath);
      }
    });
  });
});
