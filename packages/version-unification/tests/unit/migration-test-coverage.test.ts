/**
 * Unit test for migration test coverage.
 *
 * Validates Requirement 4.6:
 *   "THE SpecForge_System SHALL ship an automated test for every Migration_Script
 *    that asserts both forward correctness on representative version `N-1` data
 *    and idempotence when re-applied to version `N` data."
 *
 * Strategy:
 *   - Scan `packages/version-unification/src/migration/scripts/` via
 *     `node:fs/promises.readdir`.
 *   - For each file matching `<N>.ts` (where N is one or more digits), assert
 *     that the corresponding tests exist under
 *     `packages/version-unification/tests/unit/migrations/`:
 *       1. `<N>.test.ts`             — forward-correctness test
 *       2. `<N>.idempotence.test.ts` — idempotence-at-target test
 *   - If the scripts directory is empty (V6.0 starting state where no migrations
 *     have been authored yet, i.e., MIN_SUPPORTED_DATA_SCHEMA ===
 *     HIGHEST_KNOWN_SCHEMA === 0), the requirement is vacuously satisfied.
 *     The test passes and emits a sanity log so a future reader can tell the
 *     test ran (and found nothing) vs. being silently skipped.
 *
 * The migration filename regex `^(\d+)\.ts$` is stricter than the registry's
 * `(\d+)\.ts$` (tail-anchor) on purpose: the task spec mandates `<N>.ts` as
 * the canonical filename, and matching exactly digit-prefix avoids
 * accidentally pulling in helper files like `_shared.ts`.
 *
 * @see requirements.md §Requirement 4.6
 * @see design.md §"Unit Test 列表"
 * @see src/migration/registry.ts (registry filename discovery)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo-relative anchors (resolved from this test file's location).
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS_DIR = path.join(PACKAGE_ROOT, 'src', 'migration', 'scripts');
const MIGRATION_TESTS_DIR = path.join(PACKAGE_ROOT, 'tests', 'unit', 'migrations');

const MIGRATION_FILENAME_RE = /^(\d+)\.ts$/;

interface DiscoveredMigration {
  /** Original filename (e.g., "001.ts" or "2.ts") */
  readonly fileName: string;
  /** The leading-digit token preserved as-is for path construction */
  readonly versionToken: string;
}

async function readDirSafe(dirPath: string): Promise<readonly string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: unknown }).code === 'ENOENT'
    ) {
      // Directory not present — treat as empty (no migrations declared yet).
      return [];
    }
    throw err;
  }
}

async function discoverMigrationScripts(): Promise<readonly DiscoveredMigration[]> {
  const entries = await readDirSafe(SCRIPTS_DIR);
  const matched: DiscoveredMigration[] = [];
  for (const fileName of entries) {
    const m = MIGRATION_FILENAME_RE.exec(fileName);
    if (m) {
      matched.push({ fileName, versionToken: m[1] });
    }
  }
  matched.sort((a, b) => Number(a.versionToken) - Number(b.versionToken));
  return matched;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: unknown }).code === 'ENOENT'
    ) {
      return false;
    }
    throw err;
  }
}

describe('Migration test coverage (R4.6)', () => {
  it('every <N>.ts migration script has both <N>.test.ts and <N>.idempotence.test.ts', async () => {
    const migrations = await discoverMigrationScripts();

    if (migrations.length === 0) {
      // V6.0 starting state: no migrations declared yet, so R4.6 holds
      // vacuously. Sanity log so future readers can tell this test ran and
      // found nothing rather than being silently skipped.
      // eslint-disable-next-line no-console
      console.log(
        `[migration-test-coverage] no migration scripts under ${SCRIPTS_DIR} ` +
          `(V6.0 starting state); R4.6 holds vacuously.`,
      );
      // Make the assertion explicit so the reporter records a passed
      // expectation rather than appearing to assert nothing.
      expect(migrations.length).toBe(0);
      return;
    }

    const missing: { migration: string; expectedTestPaths: string[] }[] = [];

    for (const migration of migrations) {
      const expectedForwardTest = path.join(
        MIGRATION_TESTS_DIR,
        `${migration.versionToken}.test.ts`,
      );
      const expectedIdempotenceTest = path.join(
        MIGRATION_TESTS_DIR,
        `${migration.versionToken}.idempotence.test.ts`,
      );

      const [hasForward, hasIdempotence] = await Promise.all([
        fileExists(expectedForwardTest),
        fileExists(expectedIdempotenceTest),
      ]);

      const missingForThisMigration: string[] = [];
      if (!hasForward) missingForThisMigration.push(expectedForwardTest);
      if (!hasIdempotence) missingForThisMigration.push(expectedIdempotenceTest);

      if (missingForThisMigration.length > 0) {
        missing.push({
          migration: migration.fileName,
          expectedTestPaths: missingForThisMigration,
        });
      }
    }

    if (missing.length > 0) {
      const report = missing
        .map(
          (m) =>
            `  - ${m.migration} is missing:\n${m.expectedTestPaths
              .map((p) => `      ${p}`)
              .join('\n')}`,
        )
        .join('\n');
      throw new Error(
        `R4.6 violation: ${missing.length} migration script(s) lack required ` +
          `coverage. Each <N>.ts must have <N>.test.ts (forward) and ` +
          `<N>.idempotence.test.ts (idempotence) under ` +
          `${MIGRATION_TESTS_DIR}.\n${report}`,
      );
    }

    expect(missing.length).toBe(0);
  });
});
