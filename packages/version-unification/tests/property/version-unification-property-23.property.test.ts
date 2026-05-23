/**
 * Property test for in-place conversion backup.
 *
 * Feature: version-unification, Property 23: In-place conversion creates faithful backup
 * Derived-From: v6-architecture-overview Property 23
 * Validates: Requirements 11.5, 12.3
 *
 * Property: For any legacy manifest content C at path P, after performing an
 * in-place conversion (Manifest_Migrator.inPlaceConvert / createLegacyBackup),
 *   1. there exists a backup file at exactly `<P>.legacy.bak`,
 *   2. the backup file content is byte-identical to C (the original content
 *      before conversion),
 *   3. the backup is written strictly BEFORE the active manifest is overwritten
 *      (order invariant),
 *   4. the backup contains no appended metadata (it is an exact byte-for-byte copy).
 *
 * Test environment:
 *  - real filesystem temp dirs via fs.mkdtemp (tracked + afterEach cleanup)
 *  - One temp dir per `it`, unique filenames per iteration (cheap cleanup)
 *  - numRuns: 1000 (data integrity critical)
 *  - per-test timeout: 60_000 ms (4000 fs round-trips per property worst case)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLegacyBackup } from '../../src/legacy/backup';
import { ManifestMigrator } from '../../src/legacy/migrator';

// ---------------------------------------------------------------------------
// Dynamic temp-dir tracking (T1: 对称清理原则)
//
// Strategy: ONE tracked temp dir per `it`. Each fast-check iteration produces
// a unique filename inside that dir. afterEach removes the dir tree once,
// regardless of how many filenames were created — keeps cleanup O(1) wrt
// numRuns.
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
      /* best effort cleanup */
    });
  }
});

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Build a "legacy-shape" raw manifest as a JSON-serialisable object.
 *
 * The detector treats any object whose top-level keys intersect
 * LEGACY_FIELDS_USER ∪ LEGACY_FIELDS_PROJECT as legacy, regardless of value.
 * We always inject at least one legacy key so the migrator routes the
 * input through `inPlaceConvert` (in IN_PLACE_CONVERT mode).
 */
function arbitraryLegacyManifest(): fc.Arbitrary<Record<string, unknown>> {
  const legacyKeys = [
    'shared_version',
    'required_shared_version_range',
    'schema_version',
    'runtime_schema_version',
    'code_version',
  ] as const;

  return fc
    .record({
      legacyMarker: fc.constantFrom(...legacyKeys),
      legacyValue: fc.string({ minLength: 0, maxLength: 32 }),
      extras: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 12 }).filter(
          (k) => !(legacyKeys as readonly string[]).includes(k),
        ),
        fc.oneof(
          fc.string({ maxLength: 32 }),
          fc.integer({ min: -1000, max: 1000 }),
          fc.boolean(),
          fc.constantFrom(null),
        ),
        { maxKeys: 5 },
      ),
    })
    .map(({ legacyMarker, legacyValue, extras }) => {
      const obj: Record<string, unknown> = { ...extras };
      obj[legacyMarker] = legacyValue;
      return obj;
    });
}

/**
 * Random content for the manifest file (string, encoded as UTF-8 bytes).
 *
 * Mixes JSON-shaped legacy manifests with arbitrary text to exercise the
 * "no metadata appended" / byte-equality invariants on diverse inputs.
 */
function arbitraryFileContent(): fc.Arbitrary<string> {
  return fc.oneof(
    arbitraryLegacyManifest().map((o) => JSON.stringify(o)),
    arbitraryLegacyManifest().map((o) => JSON.stringify(o, null, 2)),
    fc.string({ minLength: 0, maxLength: 256 }),
    // Multi-line text exercises newline handling.
    fc
      .array(fc.string({ minLength: 0, maxLength: 32 }), { minLength: 0, maxLength: 8 })
      .map((arr) => arr.join('\n')),
  );
}

// Monotonically increasing per-iteration suffix to guarantee unique filenames
// within a single test's temp dir, regardless of fast-check's shrinking.
let iterationCounter = 0;
beforeEach(() => {
  iterationCounter = 0;
});

function uniqueFileName(): string {
  iterationCounter += 1;
  return `manifest-${iterationCounter}-${process.pid}.json`;
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 23: In-place conversion creates faithful backup', () => {
  describe('createLegacyBackup byte-equality (R11.5, R12.3)', () => {
    it(
      'Property: backup is byte-identical to source for any content',
      async () => {
        const dir = await makeTrackedTempDir('prop-test-23-eq-');

        await fc.assert(
          fc.asyncProperty(arbitraryFileContent(), async (content) => {
            const manifestPath = join(dir, uniqueFileName());

            // Write source bytes.
            const sourceBuf = Buffer.from(content, 'utf-8');
            await fs.writeFile(manifestPath, sourceBuf);

            // Snapshot exact source bytes from disk.
            const before = await fs.readFile(manifestPath);

            const backupPath = await createLegacyBackup(manifestPath);

            // Invariant 1: backup path is exactly `<P>.legacy.bak`.
            expect(backupPath).toBe(`${manifestPath}.legacy.bak`);

            // Invariant 2: backup exists.
            const stat = await fs.stat(backupPath);
            expect(stat.isFile()).toBe(true);

            // Invariant 3: backup bytes equal original bytes (no metadata,
            // no transformation).
            const backup = await fs.readFile(backupPath);
            expect(backup.equals(before)).toBe(true);
            expect(backup.length).toBe(before.length);

            // Invariant 4: source must be untouched by the backup step
            // (createLegacyBackup is a copy, never a move).
            const afterSource = await fs.readFile(manifestPath);
            expect(afterSource.equals(before)).toBe(true);
          }),
          { numRuns: 1000 },
        );
      },
      60_000,
    );
  });

  describe('inPlaceConvert ordering invariant (R11.5)', () => {
    it(
      'Property: backup is created BEFORE active manifest is overwritten',
      async () => {
        // For the ordering invariant we observe two facts:
        //  - The backup file exists after inPlaceConvert returns.
        //  - The backup file contains the ORIGINAL bytes, not the rewritten
        //    bytes.
        // Together those imply the backup was taken while the original was
        // still on disk, i.e. strictly before the in-place rewrite.
        const dir = await makeTrackedTempDir('prop-test-23-order-');

        await fc.assert(
          fc.asyncProperty(arbitraryLegacyManifest(), async (legacyObj) => {
            const manifestPath = join(dir, uniqueFileName());

            const originalContent = JSON.stringify(legacyObj, null, 2);
            const originalBytes = Buffer.from(originalContent, 'utf-8');
            await fs.writeFile(manifestPath, originalBytes);

            await ManifestMigrator.inPlaceConvert(manifestPath);

            const backupPath = `${manifestPath}.legacy.bak`;

            // The backup must exist and equal the ORIGINAL bytes.
            const backupBytes = await fs.readFile(backupPath);
            expect(backupBytes.equals(originalBytes)).toBe(true);

            // The active manifest must have been rewritten — i.e. NOT equal
            // to the original anymore (the migrator strips legacy fields).
            // This is the second half of the ordering proof: original was
            // preserved BEFORE rewrite happened.
            const activeBytes = await fs.readFile(manifestPath);
            expect(activeBytes.equals(originalBytes)).toBe(false);

            // Active manifest must still be parseable JSON post-rewrite.
            const reparsed = JSON.parse(activeBytes.toString('utf-8'));
            expect(typeof reparsed).toBe('object');
            expect(reparsed).not.toBeNull();
          }),
          { numRuns: 1000 },
        );
      },
      60_000,
    );
  });

  describe('Backup path correctness (R11.5)', () => {
    it(
      'Property: backup is always located at `<manifestPath>.legacy.bak`',
      async () => {
        const dir = await makeTrackedTempDir('prop-test-23-path-');

        await fc.assert(
          fc.asyncProperty(fc.constant(null), async () => {
            const baseName = uniqueFileName();
            const manifestPath = join(dir, baseName);
            await fs.writeFile(manifestPath, '{}');

            const returned = await createLegacyBackup(manifestPath);

            expect(returned).toBe(`${manifestPath}.legacy.bak`);

            // The backup sibling must exist and be the only `.bak` for this
            // base name (we don't list the entire dir because other iterations
            // share it; we only assert *this* iteration's bak file exists).
            const stat = await fs.stat(`${manifestPath}.legacy.bak`);
            expect(stat.isFile()).toBe(true);
          }),
          { numRuns: 1000 },
        );
      },
      60_000,
    );
  });

  describe('No metadata appended (R12.3)', () => {
    it(
      'Property: backup file size equals source file size exactly',
      async () => {
        const dir = await makeTrackedTempDir('prop-test-23-meta-');

        await fc.assert(
          fc.asyncProperty(arbitraryFileContent(), async (content) => {
            const manifestPath = join(dir, uniqueFileName());
            const buf = Buffer.from(content, 'utf-8');
            await fs.writeFile(manifestPath, buf);

            const sourceStat = await fs.stat(manifestPath);

            const backupPath = await createLegacyBackup(manifestPath);
            const backupStat = await fs.stat(backupPath);

            // Same byte length — proves nothing was appended/prepended/wrapped.
            expect(backupStat.size).toBe(sourceStat.size);
          }),
          { numRuns: 1000 },
        );
      },
      60_000,
    );
  });
});
