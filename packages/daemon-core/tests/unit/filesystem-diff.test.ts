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
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import {
  takeSnapshot,
  diffSnapshots,
  computeFilesystemDiff,
  saveBaseline,
  loadBaseline,
  reconcileLegacyBaselineWithGitPreflight,
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

    it('records size, mtime, and content hash', async () => {
      await fs.writeFile(path.join(tmpDir, 'file.txt'), 'hello');
      const snapshot = takeSnapshot(tmpDir);
      expect(snapshot.files[0].size).toBe(5);
      expect(snapshot.files[0].mtimeMs).toBeGreaterThan(0);
      expect(snapshot.files[0].sha256).toBe(
        createHash('sha256').update('hello').digest('hex')
      );
      expect(snapshot.schema_version).toBe('2.0');
      expect(snapshot.content_hash_algorithm).toBe('sha256');
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

    it('does not report a metadata-only mtime change when content hash is unchanged', async () => {
      const filePath = path.join(tmpDir, 'a.ts');
      await fs.writeFile(filePath, 'unchanged');
      const baseline = takeSnapshot(tmpDir);

      const future = new Date(Date.now() + 60_000);
      await fs.utimes(filePath, future, future);
      const current = takeSnapshot(tmpDir);

      expect(current.files[0].mtimeMs).not.toBe(baseline.files[0].mtimeMs);
      expect(diffSnapshots(baseline, current).modified).toEqual([]);
    });

    it('detects same-size content changes even when mtime is restored', async () => {
      const filePath = path.join(tmpDir, 'a.ts');
      await fs.writeFile(filePath, 'original');
      const baseline = takeSnapshot(tmpDir);

      await fs.writeFile(filePath, 'modified');
      const baselineTime = new Date(baseline.files[0].mtimeMs);
      await fs.utimes(filePath, baselineTime, baselineTime);
      const current = takeSnapshot(tmpDir);

      expect(current.files[0].size).toBe(baseline.files[0].size);
      expect(diffSnapshots(baseline, current).modified).toEqual(['a.ts']);
    });

    it('keeps legacy baselines fail-closed until controlled reconciliation exists', async () => {
      const filePath = path.join(tmpDir, 'legacy.txt');
      await fs.writeFile(filePath, 'stable');
      const captured = takeSnapshot(tmpDir);
      const legacyBaseline = {
        timestamp: captured.timestamp,
        root: captured.root,
        files: captured.files.map(({ path: file, size, mtimeMs }) => ({
          path: file,
          size,
          mtimeMs,
        })),
      };

      const future = new Date(Date.now() + 60_000);
      await fs.utimes(filePath, future, future);
      const current = takeSnapshot(tmpDir);

      expect(diffSnapshots(legacyBaseline, current).modified).toEqual(['legacy.txt']);
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

  describe('legacy baseline reconciliation', () => {
    function git(args: string[]): string {
      return execFileSync('git', args, {
        cwd: tmpDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    }

    it('reconciles a provable metadata-only change without rewriting the original baseline', async () => {
      git(['init', '-b', 'test-branch']);
      git(['config', 'user.email', 'test@example.com']);
      git(['config', 'user.name', 'Test']);
      const trackedPath = path.join(tmpDir, 'tracked.txt');
      await fs.writeFile(trackedPath, 'stable');
      git(['add', 'tracked.txt']);
      git(['commit', '-m', 'baseline']);

      const stat = await fs.stat(trackedPath);
      const preflightTimestamp = new Date(stat.mtimeMs + 1_000).toISOString();
      const baselineTimestamp = new Date(stat.mtimeMs + 2_000).toISOString();
      const head = git(['rev-parse', 'HEAD']);
      const payload = JSON.stringify({
        success: true,
        inside_work_tree: true,
        current_branch: 'test-branch',
        head_commit: head,
        status_entries: [],
      });
      const payloadSha = createHash('sha256').update(payload).digest('hex');
      const payloadRel =
        `.specforge/logs/observability/payloads/by-sha256/` +
        `${payloadSha.slice(0, 2)}/${payloadSha}.json`;
      const payloadPath = path.join(tmpDir, ...payloadRel.split('/'));
      await fs.mkdir(path.dirname(payloadPath), { recursive: true });
      await fs.writeFile(payloadPath, payload);
      await fs.writeFile(
        path.join(tmpDir, '.specforge', 'logs', 'observability', 'index.jsonl'),
        JSON.stringify({
          timestamp: preflightTimestamp,
          trace_id: 'trace-preflight',
          category: 'rpc',
          phase: 'response',
          status: 'success',
          tool_name: 'sf_git_preflight',
          payload_file: payloadRel,
        }) + '\n'
      );

      const wiDir = path.join(tmpDir, '.specforge', 'work-items', 'WI-0001');
      await fs.mkdir(wiDir, { recursive: true });
      const legacyBaseline = {
        timestamp: baselineTimestamp,
        root: tmpDir,
        files: [{ path: 'tracked.txt', size: stat.size, mtimeMs: stat.mtimeMs }],
      };
      const baselineText = JSON.stringify(legacyBaseline, null, 2) + '\n';
      await fs.writeFile(path.join(wiDir, 'filesystem_baseline.json'), baselineText);

      const future = new Date(stat.mtimeMs + 5_000);
      await fs.utimes(trackedPath, future, future);
      expect(git(['status', '--porcelain=v1', '--', 'tracked.txt'])).toBe('');

      const result = reconcileLegacyBaselineWithGitPreflight({
        projectRoot: tmpDir,
        workItemDir: wiDir,
        reason: 'tracked file content is unchanged; only mtime changed',
      });
      expect(result.success).toBe(true);
      expect(result.reconciled_files?.map(file => file.path)).toEqual(['tracked.txt']);
      expect(await fs.readFile(path.join(wiDir, 'filesystem_baseline.json'), 'utf-8')).toBe(
        baselineText
      );

      const loaded = loadBaseline(wiDir)!;
      expect(loaded.legacy_reconciliation?.reconciled_paths).toEqual(['tracked.txt']);
      const diff = computeFilesystemDiff(loaded, tmpDir, []);
      expect(diff.modified).toEqual([]);
      expect(diff.legacy_reconciled_metadata_only_paths).toEqual(['tracked.txt']);
    });

    it('refuses reconciliation when the preflight already reported the path dirty', async () => {
      git(['init', '-b', 'test-branch']);
      git(['config', 'user.email', 'test@example.com']);
      git(['config', 'user.name', 'Test']);
      const trackedPath = path.join(tmpDir, 'tracked.txt');
      await fs.writeFile(trackedPath, 'stable');
      git(['add', 'tracked.txt']);
      git(['commit', '-m', 'baseline']);

      const stat = await fs.stat(trackedPath);
      const head = git(['rev-parse', 'HEAD']);
      const payload = JSON.stringify({
        success: true,
        inside_work_tree: true,
        current_branch: 'test-branch',
        head_commit: head,
        status_entries: [{ path: 'tracked.txt', kind: 'modified' }],
      });
      const payloadSha = createHash('sha256').update(payload).digest('hex');
      const payloadRel = '.specforge/logs/observability/payloads/preflight.json';
      const payloadPath = path.join(tmpDir, ...payloadRel.split('/'));
      await fs.mkdir(path.dirname(payloadPath), { recursive: true });
      await fs.writeFile(payloadPath, payload);
      await fs.writeFile(
        path.join(tmpDir, '.specforge', 'logs', 'observability', 'index.jsonl'),
        JSON.stringify({
          timestamp: new Date(stat.mtimeMs + 1_000).toISOString(),
          trace_id: 'trace-dirty',
          category: 'rpc',
          phase: 'response',
          status: 'success',
          tool_name: 'sf_git_preflight',
          payload_file: payloadRel,
          payload_sha256: payloadSha,
        }) + '\n'
      );
      const wiDir = path.join(tmpDir, '.specforge', 'work-items', 'WI-0001');
      await fs.mkdir(wiDir, { recursive: true });
      await fs.writeFile(
        path.join(wiDir, 'filesystem_baseline.json'),
        JSON.stringify({
          timestamp: new Date(stat.mtimeMs + 2_000).toISOString(),
          root: tmpDir,
          files: [{ path: 'tracked.txt', size: stat.size, mtimeMs: stat.mtimeMs }],
        })
      );
      const future = new Date(stat.mtimeMs + 5_000);
      await fs.utimes(trackedPath, future, future);

      const result = reconcileLegacyBaselineWithGitPreflight({
        projectRoot: tmpDir,
        workItemDir: wiDir,
        reason: 'must remain fail closed',
      });
      expect(result).toMatchObject({
        success: false,
        error: 'NO_PROVABLE_LEGACY_METADATA_ONLY_CHANGES',
      });
      expect(fsSync.existsSync(path.join(wiDir, 'legacy_baseline_reconciliation.json'))).toBe(
        false
      );
    });
  });
});
