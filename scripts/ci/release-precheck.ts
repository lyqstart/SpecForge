/**
 * scripts/ci/release-precheck.ts — Release pre-check for version drift.
 *
 * Implements Requirement 5.3:
 *
 *   WHEN a maintainer prepares a SpecForge release, THE SpecForge_System
 *   release process SHALL update `code_version` exclusively by changing
 *   the `version` field of the repository root `package.json` and SHALL
 *   refuse to publish if any other file has been changed to encode a
 *   different version string.
 *
 * Strategy
 *   The root `package.json#version` is the single source of truth (R5.1).
 *   Workspace sub-package `package.json` files are consumed via the
 *   `workspace:*` protocol and therefore should either:
 *     - omit the `version` field entirely (preferred), OR
 *     - declare a `version` exactly equal to the root version string.
 *   Any sub-package declaring a *different* SemVer string is a "drift"
 *   that would publish out-of-sync versions to npm.
 *
 *   This pre-check runs immediately before `bun publish` (or equivalent)
 *   and rejects the release when drift is detected. It complements the
 *   PR-time `code-version-rule.ts` which catches drift introduced by a
 *   PR, while this script catches drift in the working tree at release
 *   time (e.g. an uncommitted local edit, a forgotten branch merge).
 *
 * Scope
 *   - Only inspects `packages/<module>/package.json`. Nested manifests
 *     deeper than that level (e.g. `packages/<module>/dist/package.json`)
 *     are ignored — they are build artefacts, not workspace members.
 *   - The root `package.json` itself is skipped (it is the truth, not
 *     a candidate for drift).
 *   - A sub-package without a `version` field is *not* drift (its
 *     publish-time version is resolved from the workspace, or it is
 *     simply not published).
 *   - A non-string `version` field (e.g. number, null) is treated as
 *     "no declared version" — those are invalid manifests for npm but
 *     are not the kind of drift this rule targets; let `bun publish`
 *     itself reject them.
 *
 * Exit code
 *   0  drifts.length === 0 (release may proceed)
 *   1  drifts.length  > 0  (release MUST be rejected)
 *
 * CLI:
 *     bun run scripts/ci/release-precheck.ts [--repo-root=<path>]
 *
 * schema_version: 1.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** A single mismatch between a sub-package and the root version. */
export interface VersionDrift {
  /** Repo-relative POSIX-style path to the offending `package.json`. */
  readonly file: string;
  /** The version literal declared in the offending file. */
  readonly declared: string;
  /** The root `package.json#version` we expected to see. */
  readonly expected: string;
}

/** Result of a single pre-check run. */
export interface ReleasePrecheckResult {
  readonly ok: boolean;
  readonly drifts: ReadonlyArray<VersionDrift>;
  /** Root version that was used as the source of truth. Useful for
   *  human-readable reporting. */
  readonly rootVersion: string;
}

export interface RunReleasePrecheckOptions {
  /** Absolute path to the repo root (the dir containing the root
   *  `package.json` and the `packages/` workspace directory). */
  readonly repoRoot: string;
}

/**
 * Read `<repoRoot>/package.json` and return its top-level `version`
 * field as a string. Throws when the file is missing, unparseable, or
 * `version` is not a string — these are all "release pre-check cannot
 * decide" situations and should fail the release loudly.
 */
async function readRootVersion(repoRoot: string): Promise<string> {
  const rootPath = path.join(repoRoot, 'package.json');
  let raw: string;
  try {
    raw = await fs.readFile(rootPath, 'utf-8');
  } catch (err) {
    throw new Error(
      `release-precheck: cannot read root package.json at ${rootPath}: ${formatError(err)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `release-precheck: root package.json is not valid JSON (${rootPath}): ${formatError(err)}`,
    );
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { version?: unknown }).version !== 'string'
  ) {
    throw new Error(
      `release-precheck: root package.json at ${rootPath} is missing a string \`version\` field`,
    );
  }
  return (parsed as { version: string }).version;
}

/**
 * List every `packages/<module>/package.json` under `repoRoot`, but NOT
 * the root manifest itself. Returns absolute file paths. Returns an
 * empty array when the `packages/` directory does not exist (a fresh
 * monorepo before any sub-packages have been created — not a drift).
 */
async function listSubpackageManifests(repoRoot: string): Promise<string[]> {
  const packagesDir = path.join(repoRoot, 'packages');
  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = await fs.readdir(packagesDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error(
      `release-precheck: cannot list ${packagesDir}: ${formatError(err)}`,
    );
  }

  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(packagesDir, entry.name, 'package.json');
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) out.push(candidate);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new Error(
        `release-precheck: cannot stat ${candidate}: ${formatError(err)}`,
      );
    }
  }
  // Sort for deterministic reporting order.
  out.sort();
  return out;
}

/**
 * Inspect a single sub-package manifest and return a `VersionDrift` if
 * it declares a string `version` that differs from `rootVersion`.
 * Returns `null` when:
 *   - the file is unparseable JSON (we don't claim "drift" for a
 *     malformed manifest — that's a different class of problem and
 *     `bun publish` will reject it anyway);
 *   - the `version` field is missing;
 *   - the `version` field is not a string;
 *   - the `version` field equals `rootVersion`.
 */
async function inspectSubpackageManifest(
  manifestPath: string,
  rootVersion: string,
  repoRoot: string,
): Promise<VersionDrift | null> {
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, 'utf-8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const version = (parsed as { version?: unknown }).version;
  if (typeof version !== 'string') return null;
  if (version === rootVersion) return null;
  return {
    file: toRepoRelative(manifestPath, repoRoot),
    declared: version,
    expected: rootVersion,
  };
}

/** Repo-relative POSIX-style path. */
function toRepoRelative(absPath: string, repoRoot: string): string {
  const rel = path.relative(repoRoot, absPath);
  return rel.split(path.sep).join('/');
}

/**
 * Run the pre-check. Returns a structured result instead of exiting,
 * so consumers (release scripts, tests) can decide how to react.
 */
export async function runReleasePrecheck(
  opts: RunReleasePrecheckOptions,
): Promise<ReleasePrecheckResult> {
  const rootVersion = await readRootVersion(opts.repoRoot);
  const manifests = await listSubpackageManifests(opts.repoRoot);

  const drifts: VersionDrift[] = [];
  for (const m of manifests) {
    const drift = await inspectSubpackageManifest(m, rootVersion, opts.repoRoot);
    if (drift !== null) drifts.push(drift);
  }

  return {
    ok: drifts.length === 0,
    drifts,
    rootVersion,
  };
}

/** Best-effort `Error -> string`. Mirrors version-guard.ts. */
function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Render a human-readable summary of the result for stderr output. */
export function formatHumanReport(result: ReleasePrecheckResult): string {
  const lines: string[] = [];
  lines.push(`release-precheck — rootVersion=${result.rootVersion}`);
  if (result.ok) {
    lines.push('  no drifts; release may proceed');
    return lines.join('\n');
  }
  lines.push(`  drifts (${result.drifts.length}):`);
  for (const d of result.drifts) {
    lines.push(`    - ${d.file}: declared=${d.declared} expected=${d.expected}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

/** Parse a tiny subset of CLI flags. Exported for tests. */
export function parseCliArgs(argv: ReadonlyArray<string>): {
  repoRoot: string;
} {
  let repoRoot = process.cwd();
  for (const arg of argv) {
    if (arg.startsWith('--repo-root=')) {
      repoRoot = arg.slice('--repo-root='.length);
    }
  }
  return { repoRoot };
}

// Bun-only: `import.meta.main` is `true` when this module is the entry.
if ((import.meta as { main?: boolean }).main) {
  const args = parseCliArgs(process.argv.slice(2));
  runReleasePrecheck({ repoRoot: args.repoRoot })
    .then((result) => {
      // stdout: JSON for machines.
      process.stdout.write(JSON.stringify(result) + '\n');
      // stderr: human-readable summary.
      process.stderr.write(formatHumanReport(result) + '\n');
      process.exit(result.ok ? 0 : 1);
    })
    .catch((err) => {
      process.stderr.write(
        `release-precheck: fatal error: ${formatError(err)}\n`,
      );
      process.exit(1);
    });
}
