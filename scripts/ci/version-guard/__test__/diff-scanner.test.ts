/**
 * scripts/ci/version-guard/__test__/diff-scanner.test.ts
 *
 * Unit tests for the CI Version Guard diff scanner.
 *
 * Covers:
 *   - getChangedFiles parses git's NUL-separated output (filenames with
 *     spaces and Chinese characters round-trip correctly)
 *   - readFileWithSizeLimit returns null for files exceeding the cap
 *   - getFileHunks / parseUnifiedDiff produce correct added/removed line
 *     numbers
 *
 * Run with:
 *   bun test scripts/ci/version-guard/__test__/diff-scanner.test.ts
 *
 * schema_version: 1.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  getChangedFiles,
  getFileHunks,
  parseUnifiedDiff,
  readFileWithSizeLimit,
} from '../diff-scanner';

// ----------------------------------------------------------------------------
// git fixture helpers
// ----------------------------------------------------------------------------

async function spawnGit(args: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(' ')} failed (${exitCode}): ${stderr}`);
  }
}

interface Fixture {
  repo: string;
  baseRev: string;
  cleanup: () => Promise<void>;
}

/**
 * Build a temp git repo with an initial commit on `main` (the "base"),
 * then a second commit on HEAD that touches several files including
 * names with spaces and Chinese characters. Returns the base rev so
 * tests can ask for `<base>...HEAD`.
 */
async function makeRepo(): Promise<Fixture> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-diff-scanner-'));
  await spawnGit(['init', '-q', '-b', 'main'], repo);
  await spawnGit(['config', 'commit.gpgsign', 'false'], repo);

  // ---- base commit ----
  await fs.writeFile(path.join(repo, 'unchanged.txt'), 'stay\n');
  await fs.writeFile(
    path.join(repo, 'modified.ts'),
    ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n') + '\n',
  );
  // Pre-create the files with spaces and Chinese names so we can MODIFY
  // them (rather than ADD) to keep the diff simple.
  await fs.writeFile(path.join(repo, 'with space.txt'), 'old\n');
  await fs.writeFile(path.join(repo, '中文文件.md'), 'old\n');
  await spawnGit(['add', '-A'], repo);
  await spawnGit(['commit', '-q', '-m', 'base'], repo);

  // capture base sha
  const baseProc = Bun.spawn(['git', 'rev-parse', 'HEAD'], {
    cwd: repo,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const baseRev = (await new Response(baseProc.stdout).text()).trim();
  await baseProc.exited;

  // ---- head commit: change four files ----
  await fs.writeFile(
    path.join(repo, 'modified.ts'),
    // Replace line 3 ("line3") with two new lines and delete line 5.
    ['line1', 'line2', 'replaced3a', 'replaced3b', 'line4'].join('\n') + '\n',
  );
  await fs.writeFile(path.join(repo, 'with space.txt'), 'new\n');
  await fs.writeFile(path.join(repo, '中文文件.md'), 'new\n');
  // Add a brand-new file so we also exercise pure-additions.
  await fs.writeFile(path.join(repo, 'added.txt'), 'hello\n');
  await spawnGit(['add', '-A'], repo);
  await spawnGit(['commit', '-q', '-m', 'head'], repo);

  return {
    repo,
    baseRev,
    cleanup: async () => {
      await fs.rm(repo, { recursive: true, force: true });
    },
  };
}

// ----------------------------------------------------------------------------
// Tests against a real ephemeral git repo
// ----------------------------------------------------------------------------

describe('diff-scanner: getChangedFiles', () => {
  let fx: Fixture;
  let prevCwd: string;

  beforeAll(async () => {
    fx = await makeRepo();
    prevCwd = process.cwd();
    process.chdir(fx.repo);
  });

  afterAll(async () => {
    process.chdir(prevCwd);
    await fx.cleanup();
  });

  it('returns every changed path including names with spaces and CJK', async () => {
    const files = await getChangedFiles(fx.baseRev);
    const sorted = [...files].sort();
    expect(sorted).toEqual(
      [
        'added.txt',
        'modified.ts',
        'with space.txt',
        '中文文件.md',
      ].sort(),
    );
  });

  it('returns an empty list when base === HEAD', async () => {
    const files = await getChangedFiles('HEAD');
    expect(files).toEqual([]);
  });
});

describe('diff-scanner: getFileHunks', () => {
  let fx: Fixture;
  let prevCwd: string;

  beforeAll(async () => {
    fx = await makeRepo();
    prevCwd = process.cwd();
    process.chdir(fx.repo);
  });

  afterAll(async () => {
    process.chdir(prevCwd);
    await fx.cleanup();
  });

  it('parses added/removed line numbers for a modified file', async () => {
    // modified.ts went from
    //   1 line1   1 line1
    //   2 line2   2 line2
    //   3 line3   3 replaced3a
    //   4 line4   4 replaced3b
    //   5 line5   5 line4
    // i.e. line 3,4,5 (old) replaced with 3,4,5 (new) — two adds, one
    // adjacent delete, plus another delete. The exact hunk shape depends
    // on git's diff algorithm; assert the *content* and *direction*
    // rather than fragile line numbers.
    const { added, removed } = await getFileHunks(fx.baseRev, 'modified.ts');

    const addedTexts = added.map((l) => l.text);
    const removedTexts = removed.map((l) => l.text);

    expect(addedTexts).toContain('replaced3a');
    expect(addedTexts).toContain('replaced3b');
    expect(removedTexts).toContain('line3');
    expect(removedTexts).toContain('line5');

    // Line numbers must be positive integers.
    for (const l of [...added, ...removed]) {
      expect(Number.isInteger(l.line)).toBe(true);
      expect(l.line).toBeGreaterThan(0);
    }
  });

  it('parses a pure addition (new file) with first added line at 1', async () => {
    const { added, removed } = await getFileHunks(fx.baseRev, 'added.txt');
    expect(removed).toEqual([]);
    expect(added).toEqual([{ line: 1, text: 'hello' }]);
  });
});

// ----------------------------------------------------------------------------
// parseUnifiedDiff — pure-function unit tests (no git dependency)
// ----------------------------------------------------------------------------

describe('diff-scanner: parseUnifiedDiff', () => {
  it('handles a single replacement hunk with correct line numbers', () => {
    // Simulate `git diff --unified=0` output for a single-line edit on
    // line 3.
    const diff = [
      'diff --git a/foo.txt b/foo.txt',
      'index 0000001..0000002 100644',
      '--- a/foo.txt',
      '+++ b/foo.txt',
      '@@ -3 +3 @@',
      '-old',
      '+new',
      '',
    ].join('\n');
    const { added, removed } = parseUnifiedDiff(diff);
    expect(removed).toEqual([{ line: 3, text: 'old' }]);
    expect(added).toEqual([{ line: 3, text: 'new' }]);
  });

  it('handles multi-line add and remove counts', () => {
    const diff = [
      '@@ -10,2 +10,3 @@',
      '-removedA',
      '-removedB',
      '+addedA',
      '+addedB',
      '+addedC',
      '',
    ].join('\n');
    const { added, removed } = parseUnifiedDiff(diff);
    expect(removed).toEqual([
      { line: 10, text: 'removedA' },
      { line: 11, text: 'removedB' },
    ]);
    expect(added).toEqual([
      { line: 10, text: 'addedA' },
      { line: 11, text: 'addedB' },
      { line: 12, text: 'addedC' },
    ]);
  });

  it('ignores "\\ No newline at end of file" markers', () => {
    const diff = [
      '@@ -1 +1 @@',
      '-old',
      '\\ No newline at end of file',
      '+new',
      '\\ No newline at end of file',
      '',
    ].join('\n');
    const { added, removed } = parseUnifiedDiff(diff);
    expect(removed).toEqual([{ line: 1, text: 'old' }]);
    expect(added).toEqual([{ line: 1, text: 'new' }]);
  });
});

// ----------------------------------------------------------------------------
// readFileWithSizeLimit
// ----------------------------------------------------------------------------

describe('diff-scanner: readFileWithSizeLimit', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-size-limit-'));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns the contents of a small file', async () => {
    const p = path.join(dir, 'small.txt');
    await fs.writeFile(p, 'hello\nworld\n');
    const out = await readFileWithSizeLimit(p);
    expect(out).toBe('hello\nworld\n');
  });

  it('returns null when the file exceeds the default 1 MB limit', async () => {
    const p = path.join(dir, 'big.bin');
    // Write 1 MB + 1 byte.
    const oversized = Buffer.alloc(1_048_577, 0x61);
    await fs.writeFile(p, oversized);
    const out = await readFileWithSizeLimit(p);
    expect(out).toBeNull();
  });

  it('respects a custom maxBytes ceiling', async () => {
    const p = path.join(dir, 'mid.txt');
    await fs.writeFile(p, 'abcdefghij'); // 10 bytes
    expect(await readFileWithSizeLimit(p, 9)).toBeNull();
    expect(await readFileWithSizeLimit(p, 10)).toBe('abcdefghij');
    expect(await readFileWithSizeLimit(p, 11)).toBe('abcdefghij');
  });

  it('returns null for a non-existent file', async () => {
    const p = path.join(dir, 'does-not-exist.txt');
    const out = await readFileWithSizeLimit(p);
    expect(out).toBeNull();
  });
});
