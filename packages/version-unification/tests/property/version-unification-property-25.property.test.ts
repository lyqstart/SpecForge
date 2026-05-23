/**
 * Property test for migrate-manifest atomic on failure.
 *
 * Feature: version-unification, Property 25: migrate-manifest atomic on failure
 * Derived-From: v6-architecture-overview Property 25
 * Validates: Requirements 12.4
 *
 * Property 25 statement (from design.md §Correctness Properties / Requirement 12.4):
 *
 *   For any failure injection during the migrate-manifest pipeline (manifest
 *   missing, invalid JSON, JSON root that is not an object, etc.), after
 *   `runMigrateManifestCommand` returns:
 *
 *     1. the active manifest is byte-identical to its pre-command state
 *        (i.e. if it did not exist beforehand it still does not exist; if it
 *        existed with bytes B it still has bytes B), AND
 *     2. `<manifest-dir>/migrate-error.log` exists with at least one JSONL
 *        entry whose first line carries the header field
 *        `schema_version: "1.0"`, AND
 *     3. the returned exit code is non-zero.
 *
 * Test environment:
 *   - real filesystem temp dirs via fs.mkdtemp
 *   - one temp dir per iteration, cleaned up inside the property body via
 *     `try/finally` so 1000 iterations do not pile up inodes
 *   - per-test timeout: 60_000 ms (1000 numRuns × ~6 fs round-trips ≈ < 60s)
 *   - process.stdout / process.stderr writes are silenced for the duration of
 *     the suite to keep test output readable
 *   - numRuns: 1000 (data-integrity critical — Requirement 12.4)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMigrateManifestCommand } from '../../src/legacy/migrate-manifest-command';

// ---------------------------------------------------------------------------
// stdout / stderr silencer
//
// `runMigrateManifestCommand` writes diagnostics directly to process streams.
// Across 1000 iterations that turns into noisy CI logs, so we silence both.
// Restored in afterEach so other tests are unaffected.
// ---------------------------------------------------------------------------

let stdoutSpy: MockInstance | undefined;
let stderrSpy: MockInstance | undefined;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy?.mockRestore();
  stderrSpy?.mockRestore();
});

// ---------------------------------------------------------------------------
// Per-iteration unique filename helper.
//
// We create a fresh temp dir per fast-check iteration (cleaned up in finally),
// but the manifest filename itself is varied to keep paths stable in the face
// of fast-check shrinking sequences that may share a dir.
// ---------------------------------------------------------------------------

let iterationCounter = 0;
beforeEach(() => {
  iterationCounter = 0;
});

function uniqueManifestName(): string {
  iterationCounter += 1;
  return `manifest-${iterationCounter}-${process.pid}.json`;
}

// ---------------------------------------------------------------------------
// Failure scenario arbitraries
//
// We restrict the generator to inputs that are GUARANTEED to fail the
// migrate-manifest pipeline. The three families we cover:
//
//   - `no-manifest`     : manifest path does not exist on disk → readFile
//                         fails with ENOENT (stage='read' in error log).
//   - `invalid-json`    : manifest exists but the bytes do not parse as JSON
//                         (stage='parse' in error log).
//   - `non-object-root` : manifest exists with bytes that parse as JSON, but
//                         the root is null / array / string / number / bool
//                         (stage='parse' in error log per the explicit guard).
//
// We deliberately do NOT include success cases (current-format manifests or
// legacy manifests that convert cleanly) because those would not exercise
// R12.4. They are covered by Property 24.
// ---------------------------------------------------------------------------

interface NoManifestScenario {
  readonly kind: 'no-manifest';
}
interface InvalidJsonScenario {
  readonly kind: 'invalid-json';
  /** Bytes (utf-8 string) that JSON.parse must reject. */
  readonly bytes: string;
}
interface NonObjectRootScenario {
  readonly kind: 'non-object-root';
  /** Bytes (utf-8 string) that JSON.parse accepts but yields a non-object. */
  readonly bytes: string;
}

type FailureScenario = NoManifestScenario | InvalidJsonScenario | NonObjectRootScenario;

/**
 * Strings that JSON.parse is guaranteed to reject.
 *
 * We mix a curated set of boundary cases (empty string, lone braces,
 * truncated objects, JS keywords that are not valid JSON) with a
 * filtered random-string source so fast-check can also explore noisy
 * binary-ish content.
 */
function arbitraryInvalidJsonBytes(): fc.Arbitrary<string> {
  const curated = fc.constantFrom(
    '',
    'not json',
    '{',
    '}',
    '[',
    ']',
    '{"a":',
    '{"a":,}',
    'undefined',
    'NaN',
    'Infinity',
    '{,,}',
    '/* comment */',
    "'single quotes'",
  );
  const random = fc.string({ minLength: 0, maxLength: 32 }).filter((s) => {
    try {
      JSON.parse(s);
      return false; // accidentally valid → reject
    } catch {
      return true;
    }
  });
  return fc.oneof(curated, random);
}

/**
 * Bytes that JSON.parse accepts but whose root is NOT a plain object.
 *
 * The migrate-manifest command rejects these explicitly per R12.4 (the
 * "stage='parse'" branch in {@link runMigrateManifestCommand}).
 */
function arbitraryNonObjectRootBytes(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.array(fc.integer({ min: -1000, max: 1000 }), { maxLength: 5 }).map((a) => JSON.stringify(a)),
    fc.string({ maxLength: 32 }).map((s) => JSON.stringify(s)),
    fc.integer({ min: -1_000_000, max: 1_000_000 }).map((n) => String(n)),
    fc.boolean().map((b) => String(b)),
    fc.constant('null'),
  );
}

function arbitraryFailureScenario(): fc.Arbitrary<FailureScenario> {
  return fc.oneof(
    fc.constant<NoManifestScenario>({ kind: 'no-manifest' }),
    arbitraryInvalidJsonBytes().map<InvalidJsonScenario>((bytes) => ({
      kind: 'invalid-json',
      bytes,
    })),
    arbitraryNonObjectRootBytes().map<NonObjectRootScenario>((bytes) => ({
      kind: 'non-object-root',
      bytes,
    })),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Capture the pre-state of the manifest path. Returns:
 *   - `null` if the file does not exist (the "byte-identical" target is then
 *     "still does not exist after the command")
 *   - a `Buffer` of the exact pre-command bytes otherwise.
 */
async function snapshotPreState(manifestPath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(manifestPath);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Property 25 — main PBT
// ---------------------------------------------------------------------------

describe('Property 25: migrate-manifest atomic on failure', () => {
  it(
    'Property: any failure injection → byte-identical pre-state, log entry recorded, exit ≠ 0',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryFailureScenario(), async (scenario) => {
          // One fresh temp dir per iteration. Cleanup in finally so we do not
          // accumulate 1000 dirs even if assertions fail.
          const dir = await fs.mkdtemp(join(tmpdir(), 'prop-test-25-'));
          try {
            const manifestPath = join(dir, uniqueManifestName());

            // ---- Setup pre-state ---------------------------------------
            //
            // For 'no-manifest' we leave the file absent. For the other two
            // failure modes we write the failing bytes verbatim.
            if (scenario.kind === 'invalid-json' || scenario.kind === 'non-object-root') {
              await fs.writeFile(manifestPath, Buffer.from(scenario.bytes, 'utf-8'));
            }

            const preStateBytes = await snapshotPreState(manifestPath);

            // ---- Run the command ---------------------------------------
            const result = await runMigrateManifestCommand([
              '--manifest-path',
              manifestPath,
            ]);

            // ---- (1) exit code ≠ 0 -------------------------------------
            expect(result.exitCode).not.toBe(0);

            // ---- (2) active manifest byte-identical to pre-state -------
            const postStateBytes = await snapshotPreState(manifestPath);
            if (preStateBytes === null) {
              // Did not exist before → must still not exist after.
              expect(postStateBytes).toBeNull();
            } else {
              expect(postStateBytes).not.toBeNull();
              // Type narrowing for TS while keeping the assertion explicit.
              if (postStateBytes !== null) {
                expect(postStateBytes.equals(preStateBytes)).toBe(true);
                expect(postStateBytes.length).toBe(preStateBytes.length);
              }
            }

            // ---- (3) migrate-error.log present + first entry header ----
            const logPath = join(dir, 'migrate-error.log');
            expect(await fileExists(logPath)).toBe(true);

            const logContent = await fs.readFile(logPath, 'utf-8');
            const lines = logContent.split('\n').filter((l) => l.length > 0);
            expect(lines.length).toBeGreaterThanOrEqual(1);

            // First entry must carry the schema_version header per R12.4.
            const firstEntry = JSON.parse(lines[0]) as Record<string, unknown>;
            expect(firstEntry.schema_version).toBe('1.0');

            // The first entry must also document the failure: it should
            // reference the manifest path it was operating on and contain a
            // textual error description. These are the per-entry contract.
            expect(firstEntry.manifest_path).toBe(manifestPath);
            expect(typeof firstEntry.err).toBe('string');
            expect((firstEntry.err as string).length).toBeGreaterThan(0);
          } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {
              /* best-effort cleanup */
            });
          }
        }),
        { numRuns: 1000 },
      );
    },
    60_000,
  );
});
