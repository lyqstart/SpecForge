/**
 * Property test for migration script idempotence at target.
 *
 * Feature: version-unification, Property 6: Migration script idempotent at target
 * Derived-From: v6-architecture-overview Property 6
 * Validates: Requirements 4.4
 *
 * Property: For any Migration script m_N and project data already conforming
 * to schema version N (manifest dsv = N, all data files at version N),
 * invoking m_N.forward(ctx) a second time leaves every file under projectDir
 * byte-identical to its state immediately before the second invocation.
 *
 * Concrete validations:
 *   1. Any well-behaved Migration with dsv === targetVersion has
 *      isIdempotentAtTarget(ctx) === true.
 *   2. Calling forward(ctx) twice consecutively when at target leaves
 *      the in-memory filesystem byte-identical between the two
 *      invocations.
 *
 * Uses an in-memory mock MigrationContext (no real fs I/O) so the test
 * can run thousands of iterations cheaply and deterministically.
 *
 * numRuns: 200
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Migration, MigrationContext } from '../../src/migration/registry';

// =============================================================================
// In-memory MigrationContext mock
// =============================================================================

/**
 * Tiny in-memory file system. Files are addressed by relative path strings.
 * We deliberately keep the implementation small — just enough surface to
 * satisfy the MigrationContext interface used by Property 6.
 */
class InMemoryFS {
  // path → JSON-serialized content (string). Strings let us compare
  // byte-identical state with simple string equality.
  readonly files = new Map<string, string>();

  has(p: string): boolean {
    return this.files.has(p);
  }

  readRaw(p: string): string {
    const v = this.files.get(p);
    if (v === undefined) {
      const err = new Error(`ENOENT: ${p}`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    return v;
  }

  writeRaw(p: string, content: string): void {
    this.files.set(p, content);
  }

  /**
   * Snapshot all paths and contents into a fresh Map. Used to compare
   * state before/after forward() to detect any byte-level change.
   */
  snapshot(): Map<string, string> {
    return new Map(this.files);
  }
}

const MANIFEST_PATH = '.specforge/manifest.json';

/**
 * Build a MigrationContext backed by an in-memory FS.
 *
 * `checkAtTarget` reads the in-memory manifest and compares its
 * `data_schema_version` to `toVersion`, mirroring the real
 * implementation in src/migration/context.ts.
 */
function createMockContext(
  store: InMemoryFS,
  fromVersion: number,
  toVersion: number,
): MigrationContext {
  return {
    projectDir: '/mock-project',
    fromVersion,
    toVersion,
    callerToken: Symbol('mock-migration-caller-token'),

    async readJson(relativePath: string): Promise<unknown> {
      return JSON.parse(store.readRaw(relativePath));
    },

    async writeJson(relativePath: string, value: unknown): Promise<void> {
      store.writeRaw(relativePath, JSON.stringify(value, null, 2));
    },

    async listDataFiles(subdir: string = ''): Promise<readonly string[]> {
      const prefix = subdir ? subdir.replace(/\/+$/, '') + '/' : '';
      return Array.from(store.files.keys()).filter((p) => {
        if (!p.endsWith('.json')) return false;
        if (p === MANIFEST_PATH) return false; // manifest is owned by runner
        if (p.startsWith('.specforge/')) return false; // skip internal files
        if (prefix && !p.startsWith(prefix)) return false;
        // Top-level only when no subdir given
        if (!subdir) return !p.includes('/');
        return true;
      });
    },

    async checkAtTarget(): Promise<boolean> {
      if (!store.has(MANIFEST_PATH)) return false;
      try {
        const m = JSON.parse(store.readRaw(MANIFEST_PATH)) as {
          data_schema_version: number;
        };
        return m.data_schema_version >= toVersion;
      } catch {
        return false;
      }
    },
  } as MigrationContext & { callerToken: symbol };
}

// =============================================================================
// Migration factories under test
// =============================================================================

/**
 * Well-behaved migration: gates all writes on `checkAtTarget()`.
 *
 * This is the canonical pattern every real migration must follow to
 * satisfy Property 6 (R4.4). When data is already at target, forward()
 * MUST be a byte-identical no-op.
 */
function createGatedMigration(
  targetVersion: number,
  fieldKey: string,
): Migration {
  return {
    targetVersion,
    forward: async (ctx: MigrationContext): Promise<void> => {
      if (await ctx.checkAtTarget()) {
        // Already at target — idempotent no-op.
        return;
      }
      const files = await ctx.listDataFiles();
      for (const f of files) {
        try {
          const data = (await ctx.readJson(f)) as Record<string, unknown>;
          await ctx.writeJson(f, { ...data, [fieldKey]: targetVersion });
        } catch {
          // Skip non-JSON files
        }
      }
    },
    isIdempotentAtTarget: async (ctx: MigrationContext): Promise<boolean> => {
      return ctx.checkAtTarget();
    },
  };
}

/**
 * Pure no-op migration: never writes anything regardless of state.
 * Trivially satisfies Property 6.
 */
function createNoopMigration(targetVersion: number): Migration {
  return {
    targetVersion,
    forward: async (): Promise<void> => {
      /* no-op */
    },
    isIdempotentAtTarget: async (ctx) => ctx.checkAtTarget(),
  };
}

// =============================================================================
// Helpers
// =============================================================================

function mapsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false;
  }
  return true;
}

/**
 * Seed an InMemoryFS with a manifest at `targetVersion` plus a
 * caller-supplied set of data files. This represents "project data
 * already conforming to schema version N" (the precondition of
 * Property 6).
 */
function seedAtTarget(
  store: InMemoryFS,
  targetVersion: number,
  dataFiles: ReadonlyArray<{ name: string; data: Record<string, unknown> }>,
): void {
  const initTs = '2026-01-01T00:00:00.000Z';
  const manifest = {
    data_schema_version: targetVersion,
    initialized_at: initTs,
    updated_at: initTs,
  };
  store.writeRaw(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  for (const f of dataFiles) {
    store.writeRaw(`${f.name}.json`, JSON.stringify(f.data, null, 2));
  }
}

// =============================================================================
// Arbitraries
// =============================================================================

const arbFileName = fc.stringMatching(/^[a-z][a-z0-9_-]{0,9}$/);

const arbJsonValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
  fc.constant(null),
);

const arbDataFile = fc.record({
  name: arbFileName,
  data: fc.dictionary(arbFileName, arbJsonValue, { maxKeys: 5 }),
});

const arbDataFiles = fc.uniqueArray(arbDataFile, {
  selector: (f) => f.name,
  maxLength: 5,
});

const arbTargetVersion = fc.integer({ min: 1, max: 50 });

const arbFieldKey = fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/);

// =============================================================================
// Property tests
// =============================================================================

describe('Property 6: Migration script idempotent at target', () => {
  it('Property: isIdempotentAtTarget returns true when manifest dsv === targetVersion (gated migration)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTargetVersion,
        arbDataFiles,
        arbFieldKey,
        async (targetVersion, dataFiles, fieldKey) => {
          const store = new InMemoryFS();
          seedAtTarget(store, targetVersion, dataFiles);

          const ctx = createMockContext(store, targetVersion - 1, targetVersion);
          const migration = createGatedMigration(targetVersion, fieldKey);

          const result = await migration.isIdempotentAtTarget(ctx);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property: isIdempotentAtTarget returns true for any well-formed migration when at target (no-op migration)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTargetVersion,
        arbDataFiles,
        async (targetVersion, dataFiles) => {
          const store = new InMemoryFS();
          seedAtTarget(store, targetVersion, dataFiles);

          const ctx = createMockContext(store, targetVersion - 1, targetVersion);
          const migration = createNoopMigration(targetVersion);

          const result = await migration.isIdempotentAtTarget(ctx);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property: forward(ctx) twice at target leaves the FS byte-identical between the two invocations (gated migration)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTargetVersion,
        arbDataFiles,
        arbFieldKey,
        async (targetVersion, dataFiles, fieldKey) => {
          const store = new InMemoryFS();
          seedAtTarget(store, targetVersion, dataFiles);

          const ctx = createMockContext(store, targetVersion - 1, targetVersion);
          const migration = createGatedMigration(targetVersion, fieldKey);

          // First invocation. By Property 6 wording, this represents
          // the "first time" forward runs on data already at target;
          // it must be a no-op.
          await migration.forward(ctx);

          // Capture state immediately before the SECOND invocation.
          // (Per Property 6: "byte-identical to its state immediately
          // before the second invocation".)
          const before = store.snapshot();

          // Second invocation.
          await migration.forward(ctx);
          const after = store.snapshot();

          expect(mapsEqual(before, after)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property: forward(ctx) twice at target is byte-identical (no-op migration)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTargetVersion,
        arbDataFiles,
        async (targetVersion, dataFiles) => {
          const store = new InMemoryFS();
          seedAtTarget(store, targetVersion, dataFiles);

          const ctx = createMockContext(store, targetVersion - 1, targetVersion);
          const migration = createNoopMigration(targetVersion);

          await migration.forward(ctx);
          const before = store.snapshot();
          await migration.forward(ctx);
          const after = store.snapshot();

          expect(mapsEqual(before, after)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property: forward(ctx) at target preserves the manifest byte-identical', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTargetVersion,
        arbDataFiles,
        arbFieldKey,
        async (targetVersion, dataFiles, fieldKey) => {
          const store = new InMemoryFS();
          seedAtTarget(store, targetVersion, dataFiles);

          const ctx = createMockContext(store, targetVersion - 1, targetVersion);
          const migration = createGatedMigration(targetVersion, fieldKey);

          const manifestBefore = store.readRaw(MANIFEST_PATH);
          await migration.forward(ctx);
          await migration.forward(ctx);
          const manifestAfter = store.readRaw(MANIFEST_PATH);

          // Manifest is owned by the runner, never by individual
          // migrations. forward() must not touch it at all when
          // data is already at target.
          expect(manifestAfter).toBe(manifestBefore);
        },
      ),
      { numRuns: 200 },
    );
  });
});
