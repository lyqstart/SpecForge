/**
 * filesystem-diff.ts — Filesystem Baseline Snapshot & Diff
 *
 * R2 changes:
 * - Runtime/observability files are excluded from snapshots and diffs.
 * - This prevents OBS logs from being treated as business file changes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

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
  /** Number of ignored runtime/observability files removed from the diff scope. */
  ignored_runtime_files?: number;
}

const DEFAULT_EXCLUDE_DIR_NAMES = new Set(['node_modules', '.git', 'dist']);
const DEFAULT_IGNORED_PREFIXES = [
  '.specforge/logs/',
  '.specforge/runtime/',
  '.specforge/archive/',
  '.specforge/cas/',
  '.specforge/tmp/',
  '.specforge/temp/',
  '.specforge/work-items/',
];

const DEFAULT_IGNORED_EXACT = new Set([
  '.specforge/logs',
  '.specforge/runtime',
  '.specforge/archive',
  '.specforge/cas',
  '.specforge/tmp',
  '.specforge/temp',
  '.specforge/work-items',
]);

export function normalizeFsPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}
function trimTrailingSlashForGuardAudit(value: string): string {
  return value.replace(/\/+$/g, '');
}

function stripWindowsDriveForGuardAudit(value: string): string {
  return value.replace(/^[A-Za-z]:\//, '');
}

function normalizeForGuardAuditMatch(value: string): string {
  return trimTrailingSlashForGuardAudit(normalizeFsPath(value).toLowerCase());
}

function guardAuditPathVariants(value: string): string[] {
  const normalized = normalizeForGuardAuditMatch(value);
  const withoutDrive = trimTrailingSlashForGuardAudit(stripWindowsDriveForGuardAudit(normalized));
  const basename = normalized.split('/').filter(Boolean).pop() ?? normalized;
  return Array.from(new Set([normalized, withoutDrive, basename].filter(Boolean)));
}

function isSameFileForGuardAudit(actualPath: string, allowedPath: string): boolean {
  const actualVariants = guardAuditPathVariants(actualPath);
  const allowedVariants = guardAuditPathVariants(allowedPath);
  return actualVariants.some((actual) =>
    allowedVariants.some((allowed) =>
      actual === allowed || actual.endsWith(`/${allowed}`) || allowed.endsWith(`/${actual}`),
    ),
  );
}

export function isSpecForgeRuntimePath(filePath: string): boolean {
  const normalized = normalizeFsPath(filePath);
  if (DEFAULT_IGNORED_EXACT.has(normalized)) return true;
  return DEFAULT_IGNORED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function shouldSkipDirectory(relPath: string, entryName: string, extraExcludeDirs: Set<string>): boolean {
  const normalized = normalizeFsPath(relPath);
  if (DEFAULT_EXCLUDE_DIR_NAMES.has(entryName)) return true;
  if (extraExcludeDirs.has(entryName) || extraExcludeDirs.has(normalized)) return true;
  if (isSpecForgeRuntimePath(normalized)) return true;
  return false;
}

function filterSnapshot(snapshot: BaselineSnapshot): { snapshot: BaselineSnapshot; ignored: number } {
  const files = snapshot.files.filter((f) => !isSpecForgeRuntimePath(f.path));
  return {
    snapshot: { ...snapshot, files },
    ignored: snapshot.files.length - files.length,
  };
}

/**
 * Take a snapshot of all files in a directory (recursive).
 * Excludes source/runtime noise: node_modules, .git, dist, and SpecForge runtime/log directories.
 */
export function takeSnapshot(rootDir: string, excludeDirs?: string[]): BaselineSnapshot {
  const extraExclude = new Set(excludeDirs ?? []);
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
      const normalized = normalizeFsPath(relPath);

      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(normalized, entry.name, extraExclude)) {
          walk(fullPath, normalized);
        }
      } else if (entry.isFile()) {
        if (isSpecForgeRuntimePath(normalized)) continue;
        try {
          const stat = fs.statSync(fullPath);
          files.push({ path: normalized, size: stat.size, mtimeMs: stat.mtimeMs });
        } catch {
          // Skip unreadable files.
        }
      }
    }
  }

  walk(rootDir, '');
  return { timestamp: new Date().toISOString(), root: rootDir, files };
}

/** Compare two snapshots and return the diff. */
export function diffSnapshots(
  baseline: BaselineSnapshot,
  current: BaselineSnapshot,
): { created: string[]; modified: string[]; deleted: string[] } {
  const baselineMap = new Map(baseline.files.map((f) => [normalizeFsPath(f.path), f]));
  const currentMap = new Map(current.files.map((f) => [normalizeFsPath(f.path), f]));

  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const [filePath, currentFile] of currentMap) {
    const baselineFile = baselineMap.get(filePath);
    if (!baselineFile) {
      created.push(filePath);
    } else if (currentFile.size !== baselineFile.size || currentFile.mtimeMs !== baselineFile.mtimeMs) {
      modified.push(filePath);
    }
  }

  for (const filePath of baselineMap.keys()) {
    if (!currentMap.has(filePath)) deleted.push(filePath);
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
  const baselineFiltered = filterSnapshot(baseline);
  const currentRaw = takeSnapshot(currentRoot);
  const currentFiltered = filterSnapshot(currentRaw);
  const { created, modified, deleted } = diffSnapshots(baselineFiltered.snapshot, currentFiltered.snapshot);

  const allChanges: FileDiffEntry[] = [
    ...created.map((p) => ({ path: p, change: 'created' as const })),
    ...modified.map((p) => ({ path: p, change: 'modified' as const })),
    ...deleted.map((p) => ({ path: p, change: 'deleted' as const })),
  ];

  const guardedPaths = writeGuardAllowedPaths.map((p) => normalizeFsPath(p));
  const untracked = allChanges
    .filter((c) => !guardedPaths.some((p) => isSameFileForGuardAudit(c.path, p)))
    .map((c) => c.path);

  return {
    baseline_timestamp: baseline.timestamp,
    diff_timestamp: currentRaw.timestamp,
    created,
    modified,
    deleted,
    all_changes: allChanges,
    untracked_changes: untracked,
    ignored_runtime_files: baselineFiltered.ignored + currentFiltered.ignored,
  };
}

/** Save a baseline snapshot to a JSON file in the work item directory. */
export function saveBaseline(workItemDir: string, baseline: BaselineSnapshot): void {
  const filePath = path.join(workItemDir, 'filesystem_baseline.json');
  const filtered = filterSnapshot(baseline).snapshot;
  fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2) + '\n', 'utf-8');
}

/** Load a previously saved baseline snapshot. */
export function loadBaseline(workItemDir: string): BaselineSnapshot | null {
  const filePath = path.join(workItemDir, 'filesystem_baseline.json');
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as BaselineSnapshot;
    return filterSnapshot(parsed).snapshot;
  } catch {
    return null;
  }
}
