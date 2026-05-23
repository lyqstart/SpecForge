/**
 * Property test for migrate-manifest command idempotence.
 *
 * Feature: version-unification, Property 24: migrate-manifest command idempotence;
 * Derived-From: v6-architecture-overview Property 24
 * Validates: Requirements 12.2, 12.5
 *
 * Property: For any input manifest M (already-current OR legacy, user-style OR
 * project-style), invoking `runMigrateManifestCommand` repeatedly on the same
 * manifest path satisfies:
 *
 *   (1) Every successful invocation returns exit code 0.
 *   (2) From the second invocation onward, the manifest file bytes are
 *       byte-identical to those produced by the first invocation
 *       (R12.5 — idempotence beyond the first successful conversion).
 *   (3) When the input is already in the current format, the very first
 *       invocation also leaves the manifest byte-identical to the original
 *       on-disk bytes (R12.2 — no-op path).
 *
 * Notes on test setup:
 *   - We use real filesystem temp dirs (fs.mkdtemp) with dynamic tracking +
 *     afterEach cleanup so the entire dir tree is removed once per `it`,
 *     keeping cleanup O(1) with respect to numRuns (T1 / D3).
 *   - numRuns: 1000 (data integrity + idempotence is safety-critical).
 *   - per-test timeout: 60_000 ms (1000 runs × ≥3 invocations × disk I/O).
 *   - stdout/stderr writes from the command are silenced inside the property
 *     to keep CI output legible (3000+ writes per `it` would flood logs).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runMigrateManifestCommand } from '../../src/legacy/migrate-manifest-command';
import {
  LEGACY_FIELDS_USER,
  LEGACY_FIELDS_PROJECT,
} from '../../src/manifest/types';

// ---------------------------------------------------------------------------
// Dynamic temp-dir tracking (T1: 对称清理原则 / D3: 动态 ID 追踪)
//
// One tracked temp dir per `it`. Each fast-check iteration produces a unique
// filename inside that dir; afterEach removes the entire dir tree once.
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
      /* best-effort cleanup */
    });
  }
});

// Monotonically increasing per-iteration counter — guarantees unique
// filenames within a single test's tracked temp dir even across fast-check
// shrinking, so iterations cannot collide on the same path.
let iterationCounter = 0;
beforeEach(() => {
  iterationCounter = 0;
});

function uniqueManifestPath(dir: string): string {
  iterationCounter += 1;
  return join(dir, `manifest-${iterationCounter}-${process.pid}.json`);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** ISO-8601-ish timestamp arbitrary (purely structural — content does not matter
 *  for idempotence; the converter only carries it forward). */
function arbitraryTimestamp(): fc.Arbitrary<string> {
  return fc
    .integer({ min: 0, max: 4_102_444_800_000 }) // ≤ year 2100
    .map((ms) => new Date(ms).toISOString());
}

/** Arbitrary scalar values for "extra" / future fields the migrator should
 *  carry forward unchanged. */
function arbitraryScalar(): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.string({ maxLength: 24 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean(),
    fc.constantFrom(null),
  );
}

/**
 * Manifest_File_Entry shape (R1.5). Used as a value inside a `files` array of
 * a user-style manifest. Content does not need to be cryptographically
 * meaningful — only its byte-stable serialisation matters for idempotence.
 */
function arbitraryHexString(length: number): fc.Arbitrary<string> {
  // Modern fast-check no longer ships `fc.hexaString`; build hex via an array
  // of hex chars joined. Stable across fast-check 3.x / 4.x.
  return fc
    .array(
      fc.constantFrom(
        '0', '1', '2', '3', '4', '5', '6', '7',
        '8', '9', 'a', 'b', 'c', 'd', 'e', 'f',
      ),
      { minLength: length, maxLength: length },
    )
    .map((chars) => chars.join(''));
}

function arbitraryFileEntry(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    path: fc.string({ minLength: 1, maxLength: 32 }),
    sha256: arbitraryHexString(64),
    size: fc.integer({ min: 0, max: 1_000_000 }),
  });
}

/**
 * Already-current user-style manifest:
 *   - Contains only fields from USER_MANIFEST_FIELDS plus the `format` meta key.
 *   - Has no LEGACY_FIELDS_USER keys → detector classifies as non-legacy →
 *     R12.2 no-op path is exercised.
 */
function arbitraryCurrentUserManifest(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    format: fc.constant('CURRENT'),
    code_version: fc.string({ minLength: 1, maxLength: 16 }),
    min_supported_data_schema: fc.integer({ min: 0, max: 100 }),
    installed_at: arbitraryTimestamp(),
    updated_at: arbitraryTimestamp(),
    files: fc.array(arbitraryFileEntry(), { maxLength: 4 }),
  });
}

/**
 * Already-current project-style manifest:
 *   - Has no legacy markers; routes through the no-op path.
 *   - The detector falls back to `project` when only project-style fields are
 *     present.
 */
function arbitraryCurrentProjectManifest(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    format: fc.constant('CURRENT'),
    data_schema_version: fc.integer({ min: 0, max: 100 }),
    initialized_at: arbitraryTimestamp(),
    updated_at: arbitraryTimestamp(),
  });
}

/**
 * Legacy user-style manifest:
 *   - Always contains at least one user-legacy marker (so detection flips to
 *     legacy and the conversion path runs).
 *   - May additionally carry valid user fields that should be preserved.
 *   - May carry unrelated extra keys to exercise the "carry forward unknown
 *     fields" path of `convertToCurrentFormat`.
 */
function arbitraryLegacyUserManifest(): fc.Arbitrary<Record<string, unknown>> {
  // We must inject at least one legacy USER marker AND avoid project-only
  // discriminators (`data_schema_version`, `initialized_at`) so the detector
  // routes to the user branch — otherwise legacy detection is skipped because
  // `code_version` is allowed under user but legacy under project.
  return fc
    .record({
      legacyMarker: fc.constantFrom(...LEGACY_FIELDS_USER),
      legacyValue: fc.string({ maxLength: 16 }),
      // User-discriminator field forces type detection to "user".
      installed_at: arbitraryTimestamp(),
      // Optional valid user fields.
      code_version: fc.option(fc.string({ minLength: 1, maxLength: 16 }), {
        nil: undefined,
      }),
      min_supported_data_schema: fc.option(fc.integer({ min: 0, max: 100 }), {
        nil: undefined,
      }),
      updated_at: fc.option(arbitraryTimestamp(), { nil: undefined }),
      files: fc.option(fc.array(arbitraryFileEntry(), { maxLength: 4 }), {
        nil: undefined,
      }),
      extras: fc.dictionary(
        fc
          .string({ minLength: 1, maxLength: 12 })
          .filter((k) => {
            const blocked = new Set<string>([
              ...LEGACY_FIELDS_USER,
              ...LEGACY_FIELDS_PROJECT,
              'format',
              'code_version',
              'min_supported_data_schema',
              'installed_at',
              'updated_at',
              'files',
              'data_schema_version',
              'initialized_at',
            ]);
            return !blocked.has(k);
          }),
        arbitraryScalar(),
        { maxKeys: 3 },
      ),
    })
    .map(
      ({
        legacyMarker,
        legacyValue,
        installed_at,
        code_version,
        min_supported_data_schema,
        updated_at,
        files,
        extras,
      }) => {
        const obj: Record<string, unknown> = { ...extras, installed_at };
        obj[legacyMarker] = legacyValue;
        if (code_version !== undefined) obj.code_version = code_version;
        if (min_supported_data_schema !== undefined)
          obj.min_supported_data_schema = min_supported_data_schema;
        if (updated_at !== undefined) obj.updated_at = updated_at;
        if (files !== undefined) obj.files = files;
        return obj;
      },
    );
}

/**
 * Legacy project-style manifest:
 *   - Contains a project discriminator (`data_schema_version` /
 *     `initialized_at`) and at least one legacy marker (the project legacy
 *     set is a superset of the user legacy set, so any user-legacy key counts
 *     here too — including `code_version`, which is legacy in projects).
 */
function arbitraryLegacyProjectManifest(): fc.Arbitrary<Record<string, unknown>> {
  return fc
    .record({
      legacyMarker: fc.constantFrom(...LEGACY_FIELDS_PROJECT),
      legacyValue: fc.string({ maxLength: 16 }),
      // Project-discriminator field forces type detection to "project".
      data_schema_version: fc.integer({ min: 0, max: 100 }),
      initialized_at: fc.option(arbitraryTimestamp(), { nil: undefined }),
      updated_at: fc.option(arbitraryTimestamp(), { nil: undefined }),
      extras: fc.dictionary(
        fc
          .string({ minLength: 1, maxLength: 12 })
          .filter((k) => {
            const blocked = new Set<string>([
              ...LEGACY_FIELDS_USER,
              ...LEGACY_FIELDS_PROJECT,
              'format',
              'code_version',
              'min_supported_data_schema',
              'installed_at',
              'updated_at',
              'files',
              'data_schema_version',
              'initialized_at',
            ]);
            return !blocked.has(k);
          }),
        arbitraryScalar(),
        { maxKeys: 3 },
      ),
    })
    .map(
      ({
        legacyMarker,
        legacyValue,
        data_schema_version,
        initialized_at,
        updated_at,
        extras,
      }) => {
        const obj: Record<string, unknown> = { ...extras, data_schema_version };
        obj[legacyMarker] = legacyValue;
        if (initialized_at !== undefined) obj.initialized_at = initialized_at;
        if (updated_at !== undefined) obj.updated_at = updated_at;
        return obj;
      },
    );
}

/** Any manifest the command should accept and successfully process (exit 0). */
function arbitraryAnyManifest(): fc.Arbitrary<Record<string, unknown>> {
  return fc.oneof(
    arbitraryCurrentUserManifest(),
    arbitraryCurrentProjectManifest(),
    arbitraryLegacyUserManifest(),
    arbitraryLegacyProjectManifest(),
  );
}

// ---------------------------------------------------------------------------
// Helpers for invoking the command silently
// ---------------------------------------------------------------------------

/**
 * Run the command N times against the given manifest path, returning the
 * exit codes and the byte-snapshots taken AFTER each invocation.
 *
 * stdout/stderr are silenced for the duration so 3000+ verbose writes do not
 * flood test output.
 */
async function runNTimes(
  manifestPath: string,
  n: number,
): Promise<{ exitCodes: number[]; bytesAfter: Buffer[] }> {
  const exitCodes: number[] = [];
  const bytesAfter: Buffer[] = [];

  for (let i = 0; i < n; i++) {
    const result = await runMigrateManifestCommand(['--manifest-path', manifestPath]);
    exitCodes.push(result.exitCode);
    // The R12.5 contract is about the *active manifest*, which exists on
    // success regardless of which branch (no-op vs convert) ran.
    const buf = await fs.readFile(manifestPath);
    bytesAfter.push(buf);
  }

  return { exitCodes, bytesAfter };
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 24: migrate-manifest command idempotence (R12.2, R12.5)', () => {
  // Silence the command's stdout/stderr writes for the entire suite.
  // The command writes a single line per success / no-op path; over 1000
  // iterations × 3 invocations that's >3000 lines we don't want in CI logs.
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(((..._args: unknown[]) => true) as never);
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(((..._args: unknown[]) => true) as never);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('Idempotence across repeated invocations (R12.5)', () => {
    it(
      'Property: from the 2nd invocation onward the manifest is byte-identical and exit is 0',
      async () => {
        const dir = await makeTrackedTempDir('prop-test-24-idem-');

        await fc.assert(
          fc.asyncProperty(arbitraryAnyManifest(), async (manifest) => {
            const manifestPath = uniqueManifestPath(dir);
            const initialContent = JSON.stringify(manifest, null, 2);
            await fs.writeFile(manifestPath, initialContent, 'utf-8');

            // Three invocations is sufficient to demonstrate idempotence:
            //   - run 1: legacy → convert OR current → no-op
            //   - run 2: must be no-op (bytes equal run 1's tail bytes)
            //   - run 3: must be no-op (bytes equal run 2's tail bytes)
            const { exitCodes, bytesAfter } = await runNTimes(manifestPath, 3);

            // (1) All three invocations succeed with exit code 0.
            expect(exitCodes).toEqual([0, 0, 0]);

            // (2) From the second invocation onward, bytes are byte-identical
            //     to the first invocation's resulting bytes.
            expect(bytesAfter[1].equals(bytesAfter[0])).toBe(true);
            expect(bytesAfter[2].equals(bytesAfter[0])).toBe(true);

            // (3) Bonus: the active manifest after run 1 must be valid JSON
            //     (proves the converter never wrote garbage that the second
            //     run would reject).
            expect(() => JSON.parse(bytesAfter[0].toString('utf-8'))).not.toThrow();
          }),
          { numRuns: 1000 },
        );
      },
      60_000,
    );
  });

  describe('Already-current manifests are byte-identical no-ops (R12.2)', () => {
    it(
      'Property: a manifest already in current format is unchanged on every invocation',
      async () => {
        const dir = await makeTrackedTempDir('prop-test-24-noop-');

        await fc.assert(
          fc.asyncProperty(
            fc.oneof(arbitraryCurrentUserManifest(), arbitraryCurrentProjectManifest()),
            async (currentManifest) => {
              const manifestPath = uniqueManifestPath(dir);
              const originalContent = JSON.stringify(currentManifest, null, 2);
              const originalBytes = Buffer.from(originalContent, 'utf-8');
              await fs.writeFile(manifestPath, originalBytes);

              // Run 4 times for the no-op path; every read should match the
              // pristine original bytes (R12.2 — byte-identical, including
              // run 1).
              const { exitCodes, bytesAfter } = await runNTimes(manifestPath, 4);

              expect(exitCodes).toEqual([0, 0, 0, 0]);
              for (const snap of bytesAfter) {
                expect(snap.equals(originalBytes)).toBe(true);
              }

              // No backup must have leaked on the no-op path.
              await expect(fs.access(`${manifestPath}.legacy.bak`)).rejects.toThrow();
            },
          ),
          { numRuns: 1000 },
        );
      },
      60_000,
    );
  });
});
