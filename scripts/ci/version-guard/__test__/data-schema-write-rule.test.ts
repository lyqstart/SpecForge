/**
 * scripts/ci/version-guard/__test__/data-schema-write-rule.test.ts
 *
 * Unit tests for `data-schema-write-rule.ts` (Requirement 7.4).
 *
 * The rule is exercised against an in-memory mock VersionGuardContext —
 * no git repo, no fs. We focus on the rule's logic: which paths are
 * exempt, which assignment shapes match, and how violations are shaped.
 *
 * Run with:
 *   bun test scripts/ci/version-guard/__test__/data-schema-write-rule.test.ts
 *
 * schema_version: 1.0
 */

import { describe, it, expect } from 'bun:test';

import { dataSchemaWriteRule } from '../data-schema-write-rule';
import type { VersionGuardContext } from '../types';
import type { FileHunks } from '../diff-scanner';

// ----------------------------------------------------------------------------
// Mock context
// ----------------------------------------------------------------------------

interface MockFile {
  /** Repository-relative path (POSIX-style). */
  readonly path: string;
  /** Pre-baked hunks the mock returns when this file is queried. */
  readonly hunks: FileHunks;
}

/**
 * Build a VersionGuardContext that serves a fixed list of changed files
 * and their hunks. `getFileHunks` for an unknown file returns empty
 * hunks (matching the real scanner's behaviour for unchanged files).
 */
function makeContext(files: readonly MockFile[]): VersionGuardContext {
  const byPath = new Map<string, FileHunks>();
  for (const f of files) byPath.set(f.path, f.hunks);
  return {
    diffBase: 'origin/main',
    repoRoot: '/test/repo',
    getChangedFiles: () => Promise.resolve(files.map((f) => f.path)),
    getFileHunks: (file) =>
      Promise.resolve(byPath.get(file) ?? { added: [], removed: [] }),
    readFileWithSizeLimit: () => Promise.resolve(null),
  };
}

/** Convenience: turn a list of "(line, text)" tuples into a FileHunks
 *  with only adds. */
function added(lines: ReadonlyArray<readonly [number, string]>): FileHunks {
  return {
    added: lines.map(([line, text]) => ({ line, text })),
    removed: [],
  };
}

const DEDICATED_WRITER =
  'packages/version-unification/src/manifest/project-manifest-writer.ts';

// ----------------------------------------------------------------------------
// Cases
// ----------------------------------------------------------------------------

describe('dataSchemaWriteRule', () => {
  it('flags a data_schema_version assignment in a non-dedicated source file', async () => {
    const ctx = makeContext([
      {
        path: 'packages/cli/src/sneaky.ts',
        hunks: added([
          [10, 'export const FOO = "ok";'],
          [11, 'manifest.data_schema_version = 5;'],
        ]),
      },
    ]);

    const violations = await dataSchemaWriteRule.check(ctx);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      ruleId: 'DATA_SCHEMA_WRITE_OUTSIDE_DEDICATED_MODULE',
      file: 'packages/cli/src/sneaky.ts',
      line: 11,
    });
    expect(violations[0]!.matchedText).toMatch(/data_schema_version\s*[:=]/);
  });

  it('does NOT flag assignments inside the dedicated writer module', async () => {
    // R7.1: the writer module is the single source of writes for this field.
    const ctx = makeContext([
      {
        path: DEDICATED_WRITER,
        hunks: added([
          [3, '// dedicated writer — allowed to assign'],
          [4, 'manifest.data_schema_version = nextVersion;'],
          [5, 'return { data_schema_version: targetVersion, ...rest };'],
        ]),
      },
    ]);

    const violations = await dataSchemaWriteRule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('does NOT flag assignments in test files (path with /tests/ or .test.ts)', async () => {
    // Tests legitimately construct fixtures containing this field.
    const ctx = makeContext([
      {
        path: 'packages/version-unification/tests/manifest.test.ts',
        hunks: added([
          [12, 'const fixture = { data_schema_version: 3, foo: "bar" };'],
        ]),
      },
      {
        path: 'packages/cli/src/parser.test.ts',
        hunks: added([
          [7, 'expect(parsed.data_schema_version).toBe(2);'], // not an assignment, but harmless either way
          [8, 'parsed.data_schema_version = 4;'],
        ]),
      },
    ]);

    const violations = await dataSchemaWriteRule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('does NOT flag assignments in spec/doc files (.kiro/specs/** or *.md)', async () => {
    // Design / requirements docs reference the field name in prose.
    const ctx = makeContext([
      {
        path: '.kiro/specs/version-unification/design.md',
        hunks: added([
          [42, 'Set `data_schema_version: 5` in the post-image manifest.'],
        ]),
      },
      {
        path: 'docs/migrations/notes.md',
        hunks: added([
          [9, '`data_schema_version = N` is migration-only; see R7.1.'],
        ]),
      },
    ]);

    const violations = await dataSchemaWriteRule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('does NOT flag identifiers that share the prefix (e.g. data_schema_version_history)', async () => {
    // The regex requires whitespace + `:` or `=` immediately after the
    // identifier — `data_schema_version_history` has `_` in that slot
    // and must therefore NOT match.
    const ctx = makeContext([
      {
        path: 'packages/cli/src/history.ts',
        hunks: added([
          [1, 'export const data_schema_version_history: number[] = [];'],
          [2, 'const required_data_schema_version_range = ">=3";'],
          [3, '// data_schema_version mentioned in a comment, no assignment'],
        ]),
      },
    ]);

    const violations = await dataSchemaWriteRule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('aggregates violations across multiple non-exempt files and lines', async () => {
    const ctx = makeContext([
      // Exempt: dedicated writer with a regex-matching line — must be
      // ignored by virtue of the path exemption.
      {
        path: DEDICATED_WRITER,
        hunks: added([[20, 'manifest.data_schema_version = N;']]),
      },
      // Two violations on different lines, same file.
      {
        path: 'packages/a/src/x.ts',
        hunks: added([
          [10, 'cfg.data_schema_version = 1;'],
          [42, 'return { data_schema_version: 2, ts: now };'],
        ]),
      },
      // One violation in another file.
      {
        path: 'packages/b/src/y.ts',
        hunks: added([[7, '  data_schema_version : 9,']]),
      },
      // No violations: tests are exempt.
      {
        path: 'packages/c/tests/z.test.ts',
        hunks: added([[1, 'const fixture = { data_schema_version: 4 };']]),
      },
      // No violations: doc.
      {
        path: '.kiro/specs/version-unification/requirements.md',
        hunks: added([[2, 'data_schema_version = N is allowed only here.']]),
      },
      // No violations: non-matching content only.
      {
        path: 'packages/d/src/w.ts',
        hunks: added([[1, 'const w = 1;']]),
      },
    ]);

    const violations = await dataSchemaWriteRule.check(ctx);

    const summary = violations.map((v) => ({
      ruleId: v.ruleId,
      file: v.file,
      line: v.line,
    }));
    summary.sort((a, b) =>
      a.file === b.file ? a.line! - b.line! : a.file!.localeCompare(b.file!),
    );

    expect(summary).toEqual([
      {
        ruleId: 'DATA_SCHEMA_WRITE_OUTSIDE_DEDICATED_MODULE',
        file: 'packages/a/src/x.ts',
        line: 10,
      },
      {
        ruleId: 'DATA_SCHEMA_WRITE_OUTSIDE_DEDICATED_MODULE',
        file: 'packages/a/src/x.ts',
        line: 42,
      },
      {
        ruleId: 'DATA_SCHEMA_WRITE_OUTSIDE_DEDICATED_MODULE',
        file: 'packages/b/src/y.ts',
        line: 7,
      },
    ]);
    // And nothing from any exempt file.
    expect(violations.find((v) => v.file === DEDICATED_WRITER)).toBeUndefined();
    expect(
      violations.find((v) => v.file === 'packages/c/tests/z.test.ts'),
    ).toBeUndefined();
    expect(
      violations.find(
        (v) => v.file === '.kiro/specs/version-unification/requirements.md',
      ),
    ).toBeUndefined();
    expect(
      violations.find((v) => v.file === 'packages/d/src/w.ts'),
    ).toBeUndefined();
  });

  it('returns [] when no files changed', async () => {
    const ctx = makeContext([]);
    const violations = await dataSchemaWriteRule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('only inspects added lines, never removed lines', async () => {
    // A removed line carrying an assignment must NOT fire — deletions
    // cannot introduce drift.
    const ctx: VersionGuardContext = {
      diffBase: 'origin/main',
      repoRoot: '/test/repo',
      getChangedFiles: () => Promise.resolve(['packages/x/src/a.ts']),
      getFileHunks: () =>
        Promise.resolve({
          added: [{ line: 5, text: 'const safe = 1;' }],
          removed: [{ line: 9, text: 'cfg.data_schema_version = 7;' }],
        }),
      readFileWithSizeLimit: () => Promise.resolve(null),
    };

    const violations = await dataSchemaWriteRule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('treats Windows-style backslash paths for the dedicated writer as exempt', async () => {
    // Defensive: even though git emits POSIX separators, we normalise
    // backslashes so the exemption is robust if the scanner is ever
    // swapped out for one that emits native paths.
    const winPath =
      'packages\\version-unification\\src\\manifest\\project-manifest-writer.ts';
    const ctx = makeContext([
      {
        path: winPath,
        hunks: added([[1, 'manifest.data_schema_version = next;']]),
      },
    ]);

    const violations = await dataSchemaWriteRule.check(ctx);
    expect(violations).toEqual([]);
  });
});
