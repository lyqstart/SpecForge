/**
 * scripts/ci/version-guard/__test__/code-version-rule.test.ts
 *
 * Unit tests for `code-version-rule.ts` (Requirement 5.2).
 *
 * The rule is exercised against an in-memory mock VersionGuardContext —
 * we deliberately do NOT spin up a git repo here because the diff parsing
 * is already covered by diff-scanner.test.ts. These tests focus purely
 * on the rule's logic: which files it skips, which lines it flags,
 * and how it shapes Violation records.
 *
 * Run with:
 *   bun test scripts/ci/version-guard/__test__/code-version-rule.test.ts
 *
 * schema_version: 1.0
 */

import { describe, it, expect } from 'bun:test';

import { codeVersionRule } from '../code-version-rule';
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
 *
 * `readFileWithSizeLimit` is unused by this rule but is part of the
 * shared context contract, so we stub it to a benign value.
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
 *  with only adds (the only side the rule inspects). */
function added(lines: ReadonlyArray<readonly [number, string]>): FileHunks {
  return {
    added: lines.map(([line, text]) => ({ line, text })),
    removed: [],
  };
}

// ----------------------------------------------------------------------------
// Cases
// ----------------------------------------------------------------------------

describe('codeVersionRule', () => {
  it('flags a code_version literal in a non-root file (TS source)', async () => {
    const ctx = makeContext([
      {
        path: 'packages/cli/src/version.ts',
        hunks: added([
          [10, 'export const FOO = "ok";'],
          [11, 'export const code_version = "6.0.0";'],
        ]),
      },
    ]);

    const violations = await codeVersionRule.check(ctx);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      ruleId: 'CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON',
      file: 'packages/cli/src/version.ts',
      line: 11,
    });
    expect(violations[0]!.matchedText).toMatch(
      /code_version\s*[:=]\s*["'][0-9]+\.[0-9]+\.[0-9]+/,
    );
  });

  it('does NOT flag a code_version literal in the ROOT package.json', async () => {
    // The exemption applies unconditionally per R5.2. Use a literal that
    // the regex *would* catch in any other file, so this test actually
    // exercises the path-exemption branch (rather than passing because
    // the regex didn't match the JSON form).
    const ctx = makeContext([
      {
        path: 'package.json',
        hunks: added([
          [3, '  // code_version = "6.0.0" — single source of truth'],
        ]),
      },
    ]);

    const violations = await codeVersionRule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('DOES flag a nested workspace package.json (not exempt)', async () => {
    // Nested manifests must not encode a `code_version` literal — only
    // the *root* package.json is exempt (R5.2 wording: "other than the
    // repository root `package.json`").
    //
    // Note: R5.2's regex `code_version\s*[:=]\s*["']...` requires the
    // delimiter immediately (or after whitespace) AFTER `code_version`,
    // so canonical JSON form `"code_version": "1.2.3"` (with the closing
    // `"` before `:`) does NOT match. The line below uses a relaxed-JSON
    // form that the regex *does* catch — the assertion focus is the
    // path-exemption logic, not the regex coverage of every JSON dialect.
    const ctx = makeContext([
      {
        path: 'packages/foo/package.json',
        hunks: added([[5, '  code_version: "1.2.3",']]),
      },
    ]);

    const violations = await codeVersionRule.check(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.file).toBe('packages/foo/package.json');
    expect(violations[0]!.line).toBe(5);
  });

  it('does NOT flag fields that merely contain "version" but are not code_version', async () => {
    const ctx = makeContext([
      {
        path: 'packages/cli/src/sniff.ts',
        hunks: added([
          [1, 'export const node_version = "20.0.0";'],
          [2, 'export const data_schema_version = 5;'],
          [3, 'const required_shared_version_range = ">=3.5.0 <6.0.0";'],
          [4, '// code_version_history: see CHANGELOG'], // no value literal
        ]),
      },
    ]);

    const violations = await codeVersionRule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('aggregates violations across multiple files and multiple hunks within a file', async () => {
    const ctx = makeContext([
      // Exempt: root manifest with a regex-matching literal — must be
      // ignored by virtue of the path exemption, not by virtue of the
      // regex failing to match.
      {
        path: 'package.json',
        hunks: added([[2, '// code_version = "6.0.0" — drift forbidden elsewhere']]),
      },
      // Two violations on different lines, same file.
      {
        path: 'packages/a/src/x.ts',
        hunks: added([
          [10, 'const A = { code_version: "1.0.0" };'],
          [42, "let B = `code_version = '2.3.4'`;"],
        ]),
      },
      // One violation in another file (different file path).
      {
        path: 'packages/b/src/y.ts',
        hunks: added([[7, 'export const code_version="9.9.9"']]),
      },
      // No violations: non-matching content only.
      {
        path: 'packages/c/src/z.ts',
        hunks: added([[1, 'const z = 1;']]),
      },
    ]);

    const violations = await codeVersionRule.check(ctx);

    // Sort for stable assertion order — the rule is allowed to report
    // in any deterministic order; we only require *what* was found.
    const summary = violations.map((v) => ({
      ruleId: v.ruleId,
      file: v.file,
      line: v.line,
    }));
    summary.sort((a, b) =>
      a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
    );

    expect(summary).toEqual([
      {
        ruleId: 'CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON',
        file: 'packages/a/src/x.ts',
        line: 10,
      },
      {
        ruleId: 'CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON',
        file: 'packages/a/src/x.ts',
        line: 42,
      },
      {
        ruleId: 'CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON',
        file: 'packages/b/src/y.ts',
        line: 7,
      },
    ]);
    // And nothing from package.json or packages/c.
    expect(violations.find((v) => v.file === 'package.json')).toBeUndefined();
    expect(
      violations.find((v) => v.file === 'packages/c/src/z.ts'),
    ).toBeUndefined();
  });

  it('returns [] when no files changed', async () => {
    const ctx = makeContext([]);
    const violations = await codeVersionRule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('only inspects added lines, never removed lines', async () => {
    const ctx: VersionGuardContext = {
      diffBase: 'origin/main',
      repoRoot: '/test/repo',
      getChangedFiles: () => Promise.resolve(['packages/x/src/a.ts']),
      getFileHunks: () =>
        Promise.resolve({
          added: [{ line: 5, text: 'const safe = 1;' }],
          // A removed line carrying a code_version literal must NOT
          // produce a violation — deletions cannot introduce drift.
          removed: [{ line: 9, text: 'export const code_version = "5.5.5";' }],
        }),
      readFileWithSizeLimit: () => Promise.resolve(null),
    };

    const violations = await codeVersionRule.check(ctx);
    expect(violations).toEqual([]);
  });

  it('matches both single- and double-quoted SemVer literals (per R5.2 regex)', async () => {
    const ctx = makeContext([
      {
        path: 'packages/x/src/a.ts',
        hunks: added([
          [1, 'const a = { code_version: "1.0.0" };'],
          [2, "const b = { code_version: '2.0.0' };"],
          [3, 'const c = { code_version  =  "3.10.42" };'],
        ]),
      },
    ]);

    const violations = await codeVersionRule.check(ctx);
    expect(violations).toHaveLength(3);
    const lines = violations.map((v) => v.line).sort((a, b) => a - b);
    expect(lines).toEqual([1, 2, 3]);
  });
});
