/**
 * filesystem-diff.ts — Filesystem Baseline Snapshot & Diff
 *
 * R2 changes:
 * - Runtime/observability files are excluded from snapshots and diffs.
 * - This prevents OBS logs from being treated as business file changes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export interface FileSnapshot {
  /** Relative path from scan root */
  path: string;
  /** File size in bytes */
  size: number;
  /** Last modified time (ms since epoch) */
  mtimeMs: number;
  /** Content identity. Optional only for legacy baselines created before v2. */
  sha256?: string;
}

export interface BaselineSnapshot {
  schema_version?: '2.0';
  content_hash_algorithm?: 'sha256';
  timestamp: string;
  root: string;
  files: FileSnapshot[];
  legacy_reconciliation?: {
    artifact: string;
    reconciled_paths: string[];
  };
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
  /** Number of baseline files whose content identity is available. */
  baseline_files_with_content_hash?: number;
  /** Controlled legacy-baseline reconciliation paths applied in memory. */
  legacy_reconciled_metadata_only_paths?: string[];
}

export interface LegacyBaselineReconciliationResult {
  success: boolean;
  error?: string;
  reconciliation_path?: string;
  baseline_sha256?: string;
  preflight_trace_id?: string;
  preflight_timestamp?: string;
  branch_name?: string;
  head_commit?: string;
  reconciled_files?: Array<{
    path: string;
    sha256: string;
    baseline_size: number;
    baseline_mtime_ms: number;
    current_mtime_ms: number;
  }>;
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

function hashBuffer(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function hashFile(filePath: string): string {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const descriptor = fs.openSync(filePath, 'r');
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
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
          files.push({
            path: normalized,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            sha256: hashFile(fullPath),
          });
        } catch {
          // Skip unreadable files.
        }
      }
    }
  }

  walk(rootDir, '');
  return {
    schema_version: '2.0',
    content_hash_algorithm: 'sha256',
    timestamp: new Date().toISOString(),
    root: rootDir,
    files,
  };
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
    } else if (currentFile.size !== baselineFile.size) {
      modified.push(filePath);
    } else if (baselineFile.sha256 && currentFile.sha256) {
      if (baselineFile.sha256 !== currentFile.sha256) modified.push(filePath);
    } else if (currentFile.mtimeMs !== baselineFile.mtimeMs) {
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
    baseline_files_with_content_hash: baselineFiltered.snapshot.files.filter(file => Boolean(file.sha256)).length,
    legacy_reconciled_metadata_only_paths:
      baselineFiltered.snapshot.legacy_reconciliation?.reconciled_paths ?? [],
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
    const reconciliationPath = path.join(workItemDir, 'legacy_baseline_reconciliation.json');
    try {
      const reconciliation = JSON.parse(fs.readFileSync(reconciliationPath, 'utf-8')) as any;
      if (
        reconciliation?.status === 'applied' &&
        reconciliation?.baseline_sha256 === hashBuffer(content) &&
        Array.isArray(reconciliation?.reconciled_files)
      ) {
        const byPath = new Map<string, any>(
          reconciliation.reconciled_files.map((entry: any) => [
            normalizeFsPath(String(entry?.path ?? '')),
            entry,
          ] as [string, any]),
        );
        for (const file of parsed.files ?? []) {
          const entry = byPath.get(normalizeFsPath(file.path)) as any;
          if (
            entry &&
            Number(entry.baseline_size) === file.size &&
            /^[a-f0-9]{64}$/i.test(String(entry.sha256 ?? ''))
          ) {
            file.sha256 = String(entry.sha256).toLowerCase();
          }
        }
        parsed.legacy_reconciliation = {
          artifact: 'legacy_baseline_reconciliation.json',
          reconciled_paths: Array.from(byPath.keys()),
        };
      }
    } catch {
      // No valid controlled reconciliation artifact: retain fail-closed legacy mtime semantics.
    }
    return filterSnapshot(parsed).snapshot;
  } catch {
    return null;
  }
}

function normalizePayloadPath(projectRoot: string, payloadFile: string): string {
  const normalized = payloadFile.replace(/[\\/]+/g, path.sep);
  return path.resolve(projectRoot, normalized);
}

function readLatestPreflightBeforeBaseline(
  projectRoot: string,
  baselineTimestamp: string,
): {
  index: any;
  payload: any;
  payloadSha256: string;
} | null {
  const indexPath = path.join(projectRoot, '.specforge', 'logs', 'observability', 'index.jsonl');
  const baselineMs = Date.parse(baselineTimestamp);
  const maxPreflightAgeMs = 5 * 60 * 1000;
  if (!Number.isFinite(baselineMs)) return null;

  let entries: any[];
  try {
    entries = fs
      .readFileSync(indexPath, 'utf-8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line))
      .filter(
        entry =>
          entry?.tool_name === 'sf_git_preflight' &&
          entry?.category === 'rpc' &&
          entry?.phase === 'response' &&
          entry?.status === 'success' &&
          typeof entry?.payload_file === 'string' &&
          Date.parse(String(entry?.timestamp ?? '')) <= baselineMs &&
          baselineMs - Date.parse(String(entry?.timestamp ?? '')) <= maxPreflightAgeMs,
      )
      .sort(
        (left, right) =>
          Date.parse(String(right.timestamp ?? '')) - Date.parse(String(left.timestamp ?? '')),
      );
  } catch {
    return null;
  }

  for (const entry of entries) {
    try {
      const payloadPath = normalizePayloadPath(projectRoot, entry.payload_file);
      const payloadContent = fs.readFileSync(payloadPath, 'utf-8');
      const payloadFileName = String(entry.payload_file).split(/[\\/]/).pop() ?? '';
      const pathEncodedSha256 = payloadFileName.replace(/\.json$/i, '');
      const expectedSha256 = String(entry.payload_sha256 ?? pathEncodedSha256).toLowerCase();
      if (
        !/^[a-f0-9]{64}$/.test(expectedSha256) ||
        hashBuffer(payloadContent) !== expectedSha256
      ) {
        continue;
      }
      const payload = JSON.parse(payloadContent);
      if (
        payload?.success === true &&
        payload?.inside_work_tree === true &&
        typeof payload?.current_branch === 'string' &&
        typeof payload?.head_commit === 'string' &&
        Array.isArray(payload?.status_entries)
      ) {
        return { index: entry, payload, payloadSha256: expectedSha256 };
      }
    } catch {
      // Try the next earlier preflight evidence record.
    }
  }
  return null;
}

function runGit(projectRoot: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Create a controlled compatibility record for a pre-v2 baseline.
 *
 * Reconciliation is fail-closed and only covers metadata-only candidates when:
 * - a hash-verified sf_git_preflight immediately preceding the baseline proves
 *   the path was clean on the same branch and HEAD;
 * - the current branch and HEAD are unchanged;
 * - Git still reports the tracked path clean;
 * - size is unchanged and only mtime differs.
 *
 * The original baseline is never rewritten. loadBaseline() overlays the
 * reconciled hashes only while its original SHA-256 still matches the record.
 */
export function reconcileLegacyBaselineWithGitPreflight(input: {
  projectRoot: string;
  workItemDir: string;
  reason: string;
}): LegacyBaselineReconciliationResult {
  const baselinePath = path.join(input.workItemDir, 'filesystem_baseline.json');
  let baselineContent: string;
  let baseline: BaselineSnapshot;
  try {
    baselineContent = fs.readFileSync(baselinePath, 'utf-8');
    baseline = JSON.parse(baselineContent) as BaselineSnapshot;
  } catch {
    return { success: false, error: 'LEGACY_BASELINE_NOT_FOUND_OR_INVALID' };
  }

  if (!input.reason.trim()) {
    return { success: false, error: 'LEGACY_BASELINE_RECONCILIATION_REASON_REQUIRED' };
  }

  const preflight = readLatestPreflightBeforeBaseline(input.projectRoot, baseline.timestamp);
  if (!preflight) {
    return { success: false, error: 'LEGACY_BASELINE_PREFLIGHT_EVIDENCE_NOT_FOUND' };
  }

  let currentBranch: string;
  let currentHead: string;
  try {
    currentBranch = runGit(input.projectRoot, ['branch', '--show-current']);
    currentHead = runGit(input.projectRoot, ['rev-parse', 'HEAD']);
  } catch {
    return { success: false, error: 'LEGACY_BASELINE_GIT_EVIDENCE_UNAVAILABLE' };
  }

  if (
    currentBranch !== preflight.payload.current_branch ||
    currentHead !== preflight.payload.head_commit
  ) {
    return {
      success: false,
      error: 'LEGACY_BASELINE_GIT_IDENTITY_CHANGED',
      branch_name: currentBranch,
      head_commit: currentHead,
    };
  }

  const current = takeSnapshot(input.projectRoot);
  const currentByPath = new Map(current.files.map(file => [normalizeFsPath(file.path), file]));
  const preflightDirty = new Set(
    preflight.payload.status_entries.map((entry: any) =>
      normalizeFsPath(String(entry?.path ?? '')),
    ),
  );
  const preflightMs = Date.parse(String(preflight.index.timestamp ?? ''));
  const reconciledFiles: NonNullable<LegacyBaselineReconciliationResult['reconciled_files']> = [];

  for (const baselineFile of baseline.files ?? []) {
    const normalized = normalizeFsPath(baselineFile.path);
    const currentFile = currentByPath.get(normalized);
    if (
      baselineFile.sha256 ||
      !currentFile?.sha256 ||
      currentFile.size !== baselineFile.size ||
      currentFile.mtimeMs === baselineFile.mtimeMs ||
      preflightDirty.has(normalized) ||
      !Number.isFinite(preflightMs) ||
      baselineFile.mtimeMs > preflightMs
    ) {
      continue;
    }

    try {
      runGit(input.projectRoot, ['ls-files', '--error-unmatch', '--', normalized]);
      const status = runGit(input.projectRoot, [
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--',
        normalized,
      ]);
      if (status) continue;
    } catch {
      continue;
    }

    reconciledFiles.push({
      path: normalized,
      sha256: currentFile.sha256,
      baseline_size: baselineFile.size,
      baseline_mtime_ms: baselineFile.mtimeMs,
      current_mtime_ms: currentFile.mtimeMs,
    });
  }

  if (reconciledFiles.length === 0) {
    return {
      success: false,
      error: 'NO_PROVABLE_LEGACY_METADATA_ONLY_CHANGES',
      branch_name: currentBranch,
      head_commit: currentHead,
    };
  }

  const reconciliationPath = path.join(
    input.workItemDir,
    'legacy_baseline_reconciliation.json',
  );
  const record = {
    schema_version: '1.0',
    status: 'applied',
    applied_at: new Date().toISOString(),
    work_item_id: path.basename(input.workItemDir),
    reason: input.reason.trim(),
    baseline_file: 'filesystem_baseline.json',
    baseline_sha256: hashBuffer(baselineContent),
    preflight_evidence: {
      timestamp: preflight.index.timestamp,
      trace_id: preflight.index.trace_id,
      payload_file: preflight.index.payload_file,
      payload_sha256: preflight.payloadSha256,
      branch_name: preflight.payload.current_branch,
      head_commit: preflight.payload.head_commit,
      status_entries: preflight.payload.status_entries,
    },
    current_git_evidence: {
      branch_name: currentBranch,
      head_commit: currentHead,
    },
    reconciled_files: reconciledFiles,
  };
  fs.writeFileSync(reconciliationPath, JSON.stringify(record, null, 2) + '\n', 'utf-8');

  return {
    success: true,
    reconciliation_path: reconciliationPath,
    baseline_sha256: record.baseline_sha256,
    preflight_trace_id: preflight.index.trace_id,
    preflight_timestamp: preflight.index.timestamp,
    branch_name: currentBranch,
    head_commit: currentHead,
    reconciled_files: reconciledFiles,
  };
}
