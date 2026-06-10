/**
 * filesystem-diff.test.ts — Filesystem baseline snapshot & diff tests
 *
 * Tests the secondary factual audit source that detects:
 * - Files changed outside Write Guard
 * - Caller-undeclared changes
 * - Untracked modifications
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  takeSnapshot,
  diffSnapshots,
  computeFilesystemDiff,
  saveBaseline,
  loadBaseline,
} from '../../src/tools/lib/filesystem-diff.js';

describe('filesystem-diff', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-fsdiff-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('takeSnapshot', () => {
    it('captures files in directory', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.ts'), 'const a = 1;');
      await fs.writeFile(path.join(tmpDir, 'b.ts'), 'const b = 2;');
      await fs.mkdir(path.join(tmpDir, 'src'));
      await fs.writeFile(path.join(tmpDir, 'src', 'c.ts'), 'const c = 3;');

      const snapshot = takeSnapshot(tmpDir);
      expect(snapshot.files.length).toBe(3);
      expect(snapshot.files.map(f => f.path).sort()).toEqual(['a.ts', 'b.ts', 'src/c.ts']);
    });

    it('excludes node_modules and .git', async () => {
      await fs.writeFile(path.join(tmpDir, 'main.ts'), 'ok');
      await fs.mkdir(path.join(tmpDir, 'node_modules'));
      await fs.writeFile(path.join(tmpDir, 'node_modules', 'dep.js'), 'dep');
      await fs.mkdir(path.join(tmpDir, '.git'));
      await fs.writeFile(path.join(tmpDir, '.git', 'HEAD'), 'ref');

      const snapshot = takeSnapshot(tmpDir);
      expect(snapshot.files.length).toBe(1);
      expect(snapshot.files[0].path).toBe('main.ts');
    });

    it('records size and mtime', async () => {
      await fs.writeFile(path.join(tmpDir, 'file.txt'), 'hello');
      const snapshot = takeSnapshot(tmpDir);
      expect(snapshot.files[0].size).toBe(5);
      expect(snapshot.files[0].mtimeMs).toBeGreaterThan(0);
    });
  });

  describe('diffSnapshots', () => {
    it('detects created files', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.ts'), 'a');
      const baseline = takeSnapshot(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'b.ts'), 'b');
      const current = takeSnapshot(tmpDir);

      const diff = diffSnapshots(baseline, current);
      expect(diff.created).toEqual(['b.ts']);
      expect(diff.modified).toEqual([]);
      expect(diff.deleted).toEqual([]);
    });

    it('detects modified files', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.ts'), 'original');
      const baseline = takeSnapshot(tmpDir);

      // Modify with different content (size change)
      await fs.writeFile(path.join(tmpDir, 'a.ts'), 'modified content here');
      const current = takeSnapshot(tmpDir);

      const diff = diffSnapshots(baseline, current);
      expect(diff.modified).toEqual(['a.ts']);
    });

    it('detects deleted files', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.ts'), 'a');
      await fs.writeFile(path.join(tmpDir, 'b.ts'), 'b');
      const baseline = takeSnapshot(tmpDir);

      await fs.rm(path.join(tmpDir, 'b.ts'));
      const current = takeSnapshot(tmpDir);

      const diff = diffSnapshots(baseline, current);
      expect(diff.deleted).toEqual(['b.ts']);
    });
  });

  describe('computeFilesystemDiff', () => {
    it('detects untracked changes (not in Write Guard log)', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.ts'), 'a');
      const baseline = takeSnapshot(tmpDir);

      // Simulate: a.ts was tracked by Write Guard, b.ts was NOT
      await fs.writeFile(path.join(tmpDir, 'a.ts'), 'modified a');
      await fs.writeFile(path.join(tmpDir, 'b.ts'), 'new file not tracked');

      const result = computeFilesystemDiff(baseline, tmpDir, ['a.ts']);
      expect(result.all_changes.length).toBe(2); // a.ts modified + b.ts created
      expect(result.untracked_changes).toEqual(['b.ts']); // only b.ts is untracked
    });

    it('empty untracked when all changes are in Write Guard log', async () => {
      await fs.writeFile(path.join(tmpDir, 'x.ts'), 'x');
      const baseline = takeSnapshot(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'x.ts'), 'modified x');
      await fs.writeFile(path.join(tmpDir, 'y.ts'), 'new y');

      const result = computeFilesystemDiff(baseline, tmpDir, ['x.ts', 'y.ts']);
      expect(result.untracked_changes).toEqual([]);
    });

    it('detects .specforge/project/ writes as untracked', async () => {
      await fs.mkdir(path.join(tmpDir, '.specforge', 'project'), { recursive: true });
      const baseline = takeSnapshot(tmpDir);

      await fs.writeFile(path.join(tmpDir, '.specforge', 'project', 'arch.md'), '# Arch');

      const result = computeFilesystemDiff(baseline, tmpDir, []);
      expect(result.created).toContain('.specforge/project/arch.md');
      expect(result.untracked_changes).toContain('.specforge/project/arch.md');
    });
  });

  describe('saveBaseline / loadBaseline', () => {
    it('round-trips baseline to disk', async () => {
      await fs.writeFile(path.join(tmpDir, 'test.ts'), 'test');
      const baseline = takeSnapshot(tmpDir);

      const wiDir = path.join(tmpDir, 'wi');
      await fs.mkdir(wiDir);
      saveBaseline(wiDir, baseline);

      const loaded = loadBaseline(wiDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.files.length).toBe(1);
      expect(loaded!.files[0].path).toBe('test.ts');
    });

    it('returns null when no baseline exists', () => {
      const result = loadBaseline(path.join(tmpDir, 'nonexistent'));
      expect(result).toBeNull();
    });
  });
});
