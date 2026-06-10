/**
 * filesystem-diff.ts — Filesystem Baseline Snapshot & Diff
 *
 * Provides a secondary factual audit source by comparing directory state
 * at two points in time (baseline vs current).
 *
 * Used by close_gate to detect:
 * - Files modified outside Write Guard (not in write_guard_log.jsonl)
 * - Caller-undeclared changes
 * - .specforge/project/ writes by non-merge_runner
 *
 * Path: packages/daemon-core/src/tools/lib/filesystem-diff.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileSnapshot {
  /** Relative path from scan root */
  path: string;
  /** File size in bytes */
  size: number;
  /** Last modified time (ms since epoch) */
  mtimeMs: number;
}

export interface BaselineSnapshot {
  timestamp: string;
  root: string;
  files: FileSnapshot[];
}

export interface FileDiffEntry {
  path: string;
  change: 'created' | 'modified' | 'deleted';
}

export interface FilesystemDiffResult {
  baseline_timestamp: string;
  diff_timestamp: string;
  created: string[];
  modified: string[];
  deleted: string[];
  all_changes: FileDiffEntry[];
  /** Files in diff but NOT in write_guard_log (untracked changes) */
  untracked_changes: string[];
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/**
 * Take a snapshot of all files in a directory (recursive).
 * Excludes: node_modules, .git, dist directories.
 */
export function takeSnapshot(rootDir: string, excludeDirs?: string[]): BaselineSnapshot {
  const exclude = new Set(excludeDirs ?? ['node_modules', '.git', 'dist']);
  const files: FileSnapshot[] = [];

  function walk(dir: string, relPrefix: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!exclude.has(entry.name)) {
          walk(fullPath, relPath);
        }
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          files.push({
            path: relPath,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(rootDir, '');

  return {
    timestamp: new Date().toISOString(),
    root: rootDir,
    files,
  };
}

/**
 * Compare two snapshots and return the diff.
 */
export function diffSnapshots(
  baseline: BaselineSnapshot,
  current: BaselineSnapshot,
): { created: string[]; modified: string[]; deleted: string[] } {
  const baselineMap = new Map(baseline.files.map(f => [f.path, f]));
  const currentMap = new Map(current.files.map(f => [f.path, f]));

  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  // Find created and modified
  for (const [filePath, currentFile] of currentMap) {
    const baselineFile = baselineMap.get(filePath);
    if (!baselineFile) {
      created.push(filePath);
    } else if (
      currentFile.size !== baselineFile.size ||
      currentFile.mtimeMs !== baselineFile.mtimeMs
    ) {
      modified.push(filePath);
    }
  }

  // Find deleted
  for (const filePath of baselineMap.keys()) {
    if (!currentMap.has(filePath)) {
      deleted.push(filePath);
    }
  }

  return { created, modified, deleted };
}

/**
 * Take a filesystem diff between a saved baseline and current state.
 * Cross-references with write_guard_log allowed paths to detect untracked changes.
 */
export function computeFilesystemDiff(
  baseline: BaselineSnapshot,
  currentRoot: string,
  writeGuardAllowedPaths: string[],
): FilesystemDiffResult {
  const current = takeSnapshot(currentRoot);
  const { created, modified, deleted } = diffSnapshots(baseline, current);

  const allChanges: FileDiffEntry[] = [
    ...created.map(p => ({ path: p, change: 'created' as const })),
    ...modified.map(p => ({ path: p, change: 'modified' as const })),
    ...deleted.map(p => ({ path: p, change: 'deleted' as const })),
  ];

  // Cross-reference: find changes not tracked by Write Guard log
  const guardedSet = new Set(writeGuardAllowedPaths.map(p => p.replace(/\\/g, '/')));
  const untracked = allChanges
    .filter(c => !guardedSet.has(c.path.replace(/\\/g, '/')))
    .map(c => c.path);

  return {
    baseline_timestamp: baseline.timestamp,
    diff_timestamp: current.timestamp,
    created,
    modified,
    deleted,
    all_changes: allChanges,
    untracked_changes: untracked,
  };
}

/**
 * Save a baseline snapshot to a JSON file in the work item directory.
 * Path: .specforge/work-items/{id}/filesystem_baseline.json
 */
export function saveBaseline(workItemDir: string, baseline: BaselineSnapshot): void {
  const filePath = path.join(workItemDir, 'filesystem_baseline.json');
  fs.writeFileSync(filePath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
}

/**
 * Load a previously saved baseline snapshot.
 */
export function loadBaseline(workItemDir: string): BaselineSnapshot | null {
  const filePath = path.join(workItemDir, 'filesystem_baseline.json');
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as BaselineSnapshot;
  } catch {
    return null;
  }
}
