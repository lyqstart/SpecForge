/**
 * scripts/ci/version-guard/__test__/min-schema-rule.test.ts
 *
 * Unit tests for `min-schema-rule.ts` (Requirements 6.2, 6.3, 6.4, 8.3).
 *
 * The rule is tested against a fully in-memory `VersionGuardContext`
 * plus an injected `readPreImage` stub — no git, no fs. The point is
 * to nail the decision table from design.md §"Property 15":
 *
 *   | Condition                | Expected                      |
 *   |--------------------------|-------------------------------|
 *   | new <  old               | MIN_SCHEMA_DECREASED          |
 *   | new >  old, no dep doc   | MIN_SCHEMA_NO_DEPRECATION_DOC |
 *   | new >  old, all dep docs | (no violation)                |
 *   | new === old              | (no violation)                |
 *
 * Run with:
 *   bun test scripts/ci/version-guard/__test__/min-schema-rule.test.ts
 *
 * schema_version: 1.0
 */

import { describe, it, expect } from 'bun:test';

import { createMinSchemaRule } from '../min-schema-rule';
import type { VersionGuardContext } from '../types';

const CONSTANTS_FILE = 'packages/version-unification/src/constants.ts';

/** Render a constants.ts body around a given MIN_SUPPORTED_DATA_SCHEMA value. */
function constantsSrc(value: number): string {
  return [
    '/** sample constants.ts */',
    `export const MIN_SUPPORTED_DATA_SCHEMA: number = ${value};`,
    'export const HIGHEST_KNOWN_SCHEMA: number = 0;',
    '',
  ].join('\n');
}

interface MakeCtxArgs {
  /** Files in the post-image (PR HEAD). path → content. `null` content
   *  simulates "missing" so we can test failure-safety. */
  readonly postImage: Record<string, string | null>;
}

/** Build a minimal VersionGuardContext driven by a Map of post-image
 *  files. `getChangedFiles` / `getFileHunks` are unused by this rule
 *  but kept stubbed to satisfy the interface. */
function makeCtx(args: MakeCtxArgs): VersionGuardContext {
  return {
    diffBase: 'origin/main',
    repoRoot: '/test/repo',
    getChangedFiles: () => Promise.resolve([]),
    getFileHunks: () => Promise.resolve({ added: [], removed: [] }),
    readFileWithSizeLimit: (file) =>
      Promise.resolve(args.postImage[file] ?? null),
  };
}

/** Convenience: an in-memory `readPreImage` that yields `oldContent`
 *  for the constants file and null for everything else. */
function preImage(oldContent: string | null) {
  return async (_diffBase: string, file: string, _cwd: string) =>
    file === CONSTANTS_FILE ? oldContent : null;
}

// ----------------------------------------------------------------------------
// Cases
// ----------------------------------------------------------------------------

describe('minSchemaRule', () => {
  it('flags MIN_SCHEMA_DECREASED when new < old (regardless of dep docs)', async () => {
    // R6.4: decrease must be rejected even if a deprecation doc exists.
    const rule = createMinSchemaRule({ readPreImage: preImage(constantsSrc(3)) });
    const ctx = makeCtx({
      postImage: {
        [CONSTANTS_FILE]: constantsSrc(2),
        // Deliberately include a deprecation doc to prove it doesn't
        // suppress the DECREASED violation.
        'docs/deprecations/schema-2.md': '# stub',
      },
    });

    const violations = await rule.check(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      ruleId: 'MIN_SCHEMA_DECREASED',
      file: CONSTANTS_FILE,
      details: { from: 3, to: 2 },
    });
  });

  it('flags MIN_SCHEMA_NO_DEPRECATION_DOC when new > old and the doc is missing', async () => {
    const rule = createMinSchemaRule({ readPreImage: preImage(constantsSrc(0)) });
    const ctx = makeCtx({
      postImage: {
        [CONSTANTS_FILE]: constantsSrc(1),
        // No docs/deprecations/schema-0.md present.
      },
    });

    const violations = await rule.check(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      ruleId: 'MIN_SCHEMA_NO_DEPRECATION_DOC',
      details: {
        schema: 0,
        expectedPath: 'docs/deprecations/schema-0.md',
      },
    });
  });

  it('emits one violation per missing dep doc when multiple schemas are dropped at once', async () => {
    // Going 1 → 4 drops schemas 1, 2, 3 — three deprecation docs needed.
    // We provide schema-2.md but omit schema-1.md and schema-3.md.
    const rule = createMinSchemaRule({ readPreImage: preImage(constantsSrc(1)) });
    const ctx = makeCtx({
      postImage: {
        [CONSTANTS_FILE]: constantsSrc(4),
        'docs/deprecations/schema-2.md': '# present',
      },
    });

    const violations = await rule.check(ctx);
    const ids = violations.map((v) => ({
      ruleId: v.ruleId,
      schema: (v.details as { schema?: number } | undefined)?.schema,
    }));
    // Order is the loop order [old, new) = [1,2,3]; we filter the
    // present schema-2 and expect 1 then 3.
    expect(ids).toEqual([
      { ruleId: 'MIN_SCHEMA_NO_DEPRECATION_DOC', schema: 1 },
      { ruleId: 'MIN_SCHEMA_NO_DEPRECATION_DOC', schema: 3 },
    ]);
    // And every entry carries the exact expectedPath shape.
    for (const v of violations) {
      const n = (v.details as { schema: number }).schema;
      expect((v.details as { expectedPath: string }).expectedPath).toBe(
        `docs/deprecations/schema-${n}.md`,
      );
    }
  });

  it('emits no violation when new > old and every dropped schema has a dep doc', async () => {
    const rule = createMinSchemaRule({ readPreImage: preImage(constantsSrc(2)) });
    const ctx = makeCtx({
      postImage: {
        [CONSTANTS_FILE]: constantsSrc(4),
        'docs/deprecations/schema-2.md': '# bye 2',
        'docs/deprecations/schema-3.md': '# bye 3',
      },
    });

    const violations = await rule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('emits no violation when new === old', async () => {
    const rule = createMinSchemaRule({ readPreImage: preImage(constantsSrc(5)) });
    const ctx = makeCtx({
      postImage: {
        [CONSTANTS_FILE]: constantsSrc(5),
      },
    });

    const violations = await rule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('is failure-safe when constants.ts is absent in the post-image', async () => {
    // Should not throw, should not emit a violation. Infra-level error
    // surfacing belongs to task 14.2 (the orchestrator), not this rule.
    const rule = createMinSchemaRule({ readPreImage: preImage(constantsSrc(0)) });
    const ctx = makeCtx({ postImage: {} });

    const violations = await rule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('is failure-safe when the regex does not match (file restructured)', async () => {
    const rule = createMinSchemaRule({ readPreImage: preImage(constantsSrc(0)) });
    const ctx = makeCtx({
      postImage: {
        [CONSTANTS_FILE]:
          '// no MIN_SUPPORTED_DATA_SCHEMA declaration here\n',
      },
    });

    const violations = await rule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('is failure-safe when git show returns null (file added in this PR / git unreachable)', async () => {
    const rule = createMinSchemaRule({ readPreImage: preImage(null) });
    const ctx = makeCtx({
      postImage: { [CONSTANTS_FILE]: constantsSrc(7) },
    });

    const violations = await rule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('parses the un-annotated form `MIN_SUPPORTED_DATA_SCHEMA = N`', async () => {
    // R6.1 grants this file the *only* declaration; we still want the
    // rule to be tolerant about an optional `: number` annotation.
    const oldSrc = 'export const MIN_SUPPORTED_DATA_SCHEMA = 1;\n';
    const newSrc = 'export const MIN_SUPPORTED_DATA_SCHEMA = 0;\n';
    const rule = createMinSchemaRule({ readPreImage: preImage(oldSrc) });
    const ctx = makeCtx({ postImage: { [CONSTANTS_FILE]: newSrc } });

    const violations = await rule.check(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.ruleId).toBe('MIN_SCHEMA_DECREASED');
    expect(violations[0]!.details).toEqual({ from: 1, to: 0 });
  });
});
