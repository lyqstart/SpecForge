/**
 * scripts/ci/version-guard/__test__/schema-introduction-rule.test.ts
 *
 * Unit tests for `schema-introduction-rule.ts`
 * (Requirements 8.1, 8.2).
 *
 * The rule is exercised against a fully in-memory `VersionGuardContext`
 * plus an injected `readPreImage` stub — no git, no fs. The tests
 * encode the contract from design.md §"Property 17":
 *
 *   - Detect new schema introductions via either:
 *       (a) HIGHEST_KNOWN_SCHEMA bumped in constants.ts
 *       (b) a brand-new packages/.../migration/scripts/<N>.ts file
 *   - For each new N, collect EVERY missing artifact; never break on
 *     the first miss (R8.2).
 *   - When all four artifacts exist, emit no violation.
 *   - When multiple Ns are introduced, emit one violation per N.
 *   - When the PR doesn't introduce any schema, emit no violation.
 *
 * Run with:
 *   bun test scripts/ci/version-guard/__test__/schema-introduction-rule.test.ts
 *
 * schema_version: 1.0
 */

import { describe, it, expect } from 'bun:test';

import { createSchemaIntroductionRule } from '../schema-introduction-rule';
import type { VersionGuardContext } from '../types';

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

const CONSTANTS_FILE = 'packages/version-unification/src/constants.ts';

/** Render a constants.ts body around a given HIGHEST_KNOWN_SCHEMA value. */
function constantsSrc(highestKnown: number, minSupported = 0): string {
  return [
    '/** sample constants.ts */',
    `export const MIN_SUPPORTED_DATA_SCHEMA: number = ${minSupported};`,
    `export const HIGHEST_KNOWN_SCHEMA: number = ${highestKnown};`,
    '',
  ].join('\n');
}

function migrationScriptPath(n: number): string {
  return `packages/version-unification/src/migration/scripts/${n}.ts`;
}
function forwardTestPath(n: number): string {
  return `packages/version-unification/tests/unit/migrations/${n}.test.ts`;
}
function idempotenceTestPath(n: number): string {
  return `packages/version-unification/tests/unit/migrations/${n}.idempotence.test.ts`;
}
function decisionRecordPath(n: number): string {
  return `docs/schema-versions/${n}.md`;
}

interface MakeCtxArgs {
  /** Files in the post-image (PR HEAD). path → content. `null` content
   *  simulates "missing". */
  readonly postImage: Record<string, string | null>;
  /** Repo-relative paths returned by getChangedFiles(). */
  readonly changedFiles?: ReadonlyArray<string>;
}

/** Build a minimal VersionGuardContext driven by a Map of post-image
 *  files. `getFileHunks` is unused by this rule but kept stubbed. */
function makeCtx(args: MakeCtxArgs): VersionGuardContext {
  return {
    diffBase: 'origin/main',
    repoRoot: '/test/repo',
    getChangedFiles: () =>
      Promise.resolve([...(args.changedFiles ?? [])]),
    getFileHunks: () => Promise.resolve({ added: [], removed: [] }),
    readFileWithSizeLimit: (file) =>
      Promise.resolve(args.postImage[file] ?? null),
  };
}

/** Build an in-memory `readPreImage` from an explicit map of pre-image
 *  contents. Files absent from the map resolve to null (= file did not
 *  exist in the pre-image, i.e. was added in this PR). */
function preImage(map: Record<string, string | null>) {
  return async (_diffBase: string, file: string, _cwd: string) =>
    file in map ? map[file]! : null;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

describe('schemaIntroductionRule', () => {
  it('emits no violation when HIGHEST_KNOWN bump has all 4 artifacts present', async () => {
    // Old highest = 0, new highest = 1. New schema N=1 is introduced.
    const N = 1;
    const rule = createSchemaIntroductionRule({
      readPreImage: preImage({ [CONSTANTS_FILE]: constantsSrc(0) }),
    });
    const ctx = makeCtx({
      postImage: {
        [CONSTANTS_FILE]: constantsSrc(N),
        [migrationScriptPath(N)]: 'export default {};\n',
        [forwardTestPath(N)]: '// forward test\n',
        [idempotenceTestPath(N)]: '// idempotence test\n',
        [decisionRecordPath(N)]: '# schema 1\n',
      },
      changedFiles: [CONSTANTS_FILE, migrationScriptPath(N)],
    });

    const violations = await rule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('flags SCHEMA_INTRODUCTION_INCOMPLETE with only the missing migration script when other 3 artifacts exist', async () => {
    const N = 1;
    const rule = createSchemaIntroductionRule({
      readPreImage: preImage({ [CONSTANTS_FILE]: constantsSrc(0) }),
    });
    const ctx = makeCtx({
      postImage: {
        [CONSTANTS_FILE]: constantsSrc(N),
        // Migration script intentionally omitted.
        [forwardTestPath(N)]: '// forward test\n',
        [idempotenceTestPath(N)]: '// idempotence test\n',
        [decisionRecordPath(N)]: '# schema 1\n',
      },
      changedFiles: [CONSTANTS_FILE],
    });

    const violations = await rule.check(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      ruleId: 'SCHEMA_INTRODUCTION_INCOMPLETE',
      details: {
        schema: N,
        missingArtifacts: [migrationScriptPath(N)],
      },
    });
  });

  it('aggregates ALL 4 missing artifacts for a single new schema (R8.2: no first-miss exit)', async () => {
    const N = 2;
    const rule = createSchemaIntroductionRule({
      readPreImage: preImage({ [CONSTANTS_FILE]: constantsSrc(1) }),
    });
    const ctx = makeCtx({
      postImage: {
        // Bump but no artifacts at all.
        [CONSTANTS_FILE]: constantsSrc(N),
      },
      changedFiles: [CONSTANTS_FILE],
    });

    const violations = await rule.check(ctx);
    expect(violations).toHaveLength(1);
    const v = violations[0]!;
    expect(v.ruleId).toBe('SCHEMA_INTRODUCTION_INCOMPLETE');
    expect((v.details as { schema: number }).schema).toBe(N);
    const missing = (v.details as { missingArtifacts: string[] })
      .missingArtifacts;
    // Order is required[]-stable: script, forward test, idempotence, doc.
    expect(missing).toEqual([
      migrationScriptPath(N),
      forwardTestPath(N),
      idempotenceTestPath(N),
      decisionRecordPath(N),
    ]);
  });

  it('emits one violation per schema when multiple schemas are introduced at once', async () => {
    // Old highest = 0, new highest = 2. Two new schemas: 1 and 2.
    // Provide every artifact for N=1 but none for N=2.
    const rule = createSchemaIntroductionRule({
      readPreImage: preImage({ [CONSTANTS_FILE]: constantsSrc(0) }),
    });
    const ctx = makeCtx({
      postImage: {
        [CONSTANTS_FILE]: constantsSrc(2),
        // Schema 1 — fully complete.
        [migrationScriptPath(1)]: 'export default {};\n',
        [forwardTestPath(1)]: '// forward test\n',
        [idempotenceTestPath(1)]: '// idempotence test\n',
        [decisionRecordPath(1)]: '# schema 1\n',
        // Schema 2 — nothing.
      },
      changedFiles: [CONSTANTS_FILE, migrationScriptPath(1)],
    });

    const violations = await rule.check(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.details).toMatchObject({
      schema: 2,
      missingArtifacts: [
        migrationScriptPath(2),
        forwardTestPath(2),
        idempotenceTestPath(2),
        decisionRecordPath(2),
      ],
    });
  });

  it('detects a new schema via a brand-new migration-script file even if HIGHEST_KNOWN was not bumped', async () => {
    // Constants unchanged but a new migration script appears in the diff.
    // The rule should still fire because signal (b) is satisfied.
    const N = 1;
    const rule = createSchemaIntroductionRule({
      readPreImage: preImage({
        [CONSTANTS_FILE]: constantsSrc(0),
        // Migration script absent in pre-image (so it's a new file).
      }),
    });
    const ctx = makeCtx({
      postImage: {
        [CONSTANTS_FILE]: constantsSrc(0), // unchanged
        [migrationScriptPath(N)]: 'export default {};\n',
        // Three artifacts missing — should aggregate.
      },
      changedFiles: [migrationScriptPath(N)],
    });

    const violations = await rule.check(ctx);
    expect(violations).toHaveLength(1);
    const v = violations[0]!;
    expect((v.details as { schema: number }).schema).toBe(N);
    expect(
      (v.details as { missingArtifacts: string[] }).missingArtifacts,
    ).toEqual([
      forwardTestPath(N),
      idempotenceTestPath(N),
      decisionRecordPath(N),
    ]);
  });

  it('emits no violation when the PR introduces no new schema', async () => {
    // Constants unchanged, no migration scripts added.
    const rule = createSchemaIntroductionRule({
      readPreImage: preImage({ [CONSTANTS_FILE]: constantsSrc(2) }),
    });
    const ctx = makeCtx({
      postImage: { [CONSTANTS_FILE]: constantsSrc(2) },
      changedFiles: [
        // Some unrelated file change.
        'README.md',
        'packages/version-unification/src/manifest/types.ts',
      ],
    });

    const violations = await rule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('does not double-count when both signals fire for the same N', async () => {
    // HIGHEST_KNOWN bumped 0 → 1 AND a new scripts/1.ts file added.
    // We expect exactly one violation entry for N=1, not two.
    const N = 1;
    const rule = createSchemaIntroductionRule({
      readPreImage: preImage({ [CONSTANTS_FILE]: constantsSrc(0) }),
    });
    const ctx = makeCtx({
      postImage: {
        [CONSTANTS_FILE]: constantsSrc(N),
        [migrationScriptPath(N)]: 'export default {};\n',
        // Other 3 artifacts missing.
      },
      changedFiles: [CONSTANTS_FILE, migrationScriptPath(N)],
    });

    const violations = await rule.check(ctx);
    expect(violations).toHaveLength(1);
    expect((violations[0]!.details as { schema: number }).schema).toBe(N);
  });

  it('ignores migration scripts that already existed before the PR', async () => {
    // Files that match the migration-script pattern but were already
    // present (modified, not added) should NOT trigger introduction.
    const N = 1;
    const rule = createSchemaIntroductionRule({
      readPreImage: preImage({
        [CONSTANTS_FILE]: constantsSrc(N),
        [migrationScriptPath(N)]: '// pre-existing\n',
      }),
    });
    const ctx = makeCtx({
      postImage: {
        [CONSTANTS_FILE]: constantsSrc(N), // unchanged
        [migrationScriptPath(N)]: '// modified\n',
      },
      changedFiles: [migrationScriptPath(N)],
    });

    const violations = await rule.check(ctx);
    expect(violations).toEqual([]);
  });
});
