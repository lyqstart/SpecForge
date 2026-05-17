/**
 * Migration script discovery module for SpecForge V6.
 *
 * Promoted from `apply.ts` per task 2.2. Provides a strict, Result-based API
 * for finding migration scripts on disk and validating that the resulting
 * version graph is a well-formed linear chain (no orphans, no duplicates,
 * no forks).
 *
 * Naming convention: `vX.Y.Z-to-vA.B.C.ts` (or `.js`/`.tsx`/`.mjs`/`.cjs`).
 * Files starting with `_` (e.g. `_template.ts`) are skipped silently.
 *
 * Requirements: REQ-21
 */

import { readdir } from 'fs/promises'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A discovered migration script entry.
 *
 * - `fromVersion` / `toVersion` are normalized semver triplets (e.g. `1.0.0`).
 * - `filePath` is the absolute or directory-relative path of the script file.
 * - `scriptName` is the bare filename (e.g. `v1.0.0-to-v1.1.0.ts`).
 */
export interface MigrationScript {
  fromVersion: string
  toVersion: string
  filePath: string
  scriptName: string
}

/**
 * Reason codes for discovery errors.
 *
 * - `MALFORMED_FILENAME`: filename did not match `vX.Y.Z-to-vA.B.C.ext`.
 * - `INVALID_VERSION`: a version part was non-numeric.
 * - `SELF_LOOP`: fromVersion equals toVersion.
 * - `BACKWARD_EDGE`: toVersion < fromVersion.
 * - `DUPLICATE_EDGE`: two scripts have the same (from, to) pair.
 * - `BRANCH`: two scripts share the same fromVersion but different toVersion.
 * - `MERGE`: two scripts share the same toVersion but different fromVersion.
 * - `IO_ERROR`: the directory could not be read.
 */
export type DiscoveryErrorCode =
  | 'MALFORMED_FILENAME'
  | 'INVALID_VERSION'
  | 'SELF_LOOP'
  | 'BACKWARD_EDGE'
  | 'DUPLICATE_EDGE'
  | 'BRANCH'
  | 'MERGE'
  | 'IO_ERROR'

export interface DiscoveryError {
  code: DiscoveryErrorCode
  message: string
  /** Filename or path that caused the error (when applicable). */
  scriptName?: string
  /** Other scripts involved (for BRANCH/MERGE/DUPLICATE_EDGE). */
  related?: string[]
}

/**
 * Result of `discoverMigrationScripts`.
 *
 * `ok === true` iff `errors` is empty. When `ok === false`, `scripts` still
 * contains the well-formed entries that were parsed before validation kicked
 * in - useful for diagnostics, not for execution.
 */
export interface DiscoveryResult {
  ok: boolean
  scripts: MigrationScript[]
  errors: DiscoveryError[]
}

// ---------------------------------------------------------------------------
// Filename parsing
// ---------------------------------------------------------------------------

/**
 * Strict naming convention regex: `v<MAJOR>.<MINOR>.<PATCH>-to-v<MAJOR>.<MINOR>.<PATCH>.<ext>`.
 * Each version part must be a non-negative integer with no leading zeros
 * (except `0` itself), per semver. Allowed extensions: ts, tsx, js, mjs, cjs.
 */
const FILENAME_RE =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-to-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(ts|tsx|js|mjs|cjs)$/

/**
 * Try to parse a migration script filename.
 *
 * @returns A `MigrationScript` (with `filePath === scriptName`) or `null` if
 *          the filename does not match the naming convention.
 */
export function parseScriptFilename(filename: string): MigrationScript | null {
  const m = FILENAME_RE.exec(filename)
  if (!m) return null

  const fromVersion = `${m[1]}.${m[2]}.${m[3]}`
  const toVersion = `${m[4]}.${m[5]}.${m[6]}`

  return {
    fromVersion,
    toVersion,
    filePath: filename,
    scriptName: filename,
  }
}

/**
 * Whether a filename should be skipped during discovery.
 *
 * Files starting with `_` are convention-marked as templates / private and
 * are excluded from the migration graph entirely (no error emitted).
 */
export function isSkippedFile(filename: string): boolean {
  return filename.startsWith('_')
}

// ---------------------------------------------------------------------------
// Version comparison
// ---------------------------------------------------------------------------

/**
 * Compare two normalized X.Y.Z version strings.
 *
 * Returns negative / zero / positive in the usual sense.
 * Assumes the inputs were produced by `parseScriptFilename` (already validated),
 * so no defensive parsing is needed.
 */
export function compareScriptVersions(a: string, b: string): number {
  const pa = a.split('.').map((p) => parseInt(p, 10))
  const pb = b.split('.').map((p) => parseInt(p, 10))
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

// ---------------------------------------------------------------------------
// DAG validation
// ---------------------------------------------------------------------------

/**
 * Validate the discovered scripts as a linear migration chain.
 *
 * The migration graph must be a path (sequence of consecutive edges), not a
 * tree, DAG, or cyclic graph:
 * - No self-loops (`from === to`).
 * - No backward edges (`to < from`).
 * - No duplicate edges (same `(from, to)` pair).
 * - No branches (same `from` with different `to`).
 * - No merges (same `to` with different `from`).
 *
 * Orphan nodes (scripts that don't connect to the main chain) are reported
 * implicitly: a chain of {1.0->1.1, 1.1->1.2} plus an unrelated {3.0->3.1}
 * is allowed - both subchains are linear. Branches WITHIN a chain are not.
 *
 * @param scripts Already-parsed scripts. Must already pass filename validation.
 */
export function validateMigrationGraph(scripts: MigrationScript[]): DiscoveryError[] {
  const errors: DiscoveryError[] = []

  // 1. Per-edge sanity (self-loop, backward).
  for (const s of scripts) {
    const cmp = compareScriptVersions(s.fromVersion, s.toVersion)
    if (cmp === 0) {
      errors.push({
        code: 'SELF_LOOP',
        message: `Script ${s.scriptName} has identical fromVersion and toVersion (${s.fromVersion})`,
        scriptName: s.scriptName,
      })
    } else if (cmp > 0) {
      errors.push({
        code: 'BACKWARD_EDGE',
        message: `Script ${s.scriptName} migrates backward (${s.fromVersion} -> ${s.toVersion})`,
        scriptName: s.scriptName,
      })
    }
  }

  // 2. Bucket by from-version and to-version to detect branches/merges/duplicates.
  const byFrom = new Map<string, MigrationScript[]>()
  const byTo = new Map<string, MigrationScript[]>()
  const byEdge = new Map<string, MigrationScript[]>()

  for (const s of scripts) {
    const fromList = byFrom.get(s.fromVersion) ?? []
    fromList.push(s)
    byFrom.set(s.fromVersion, fromList)

    const toList = byTo.get(s.toVersion) ?? []
    toList.push(s)
    byTo.set(s.toVersion, toList)

    const edgeKey = `${s.fromVersion}->${s.toVersion}`
    const edgeList = byEdge.get(edgeKey) ?? []
    edgeList.push(s)
    byEdge.set(edgeKey, edgeList)
  }

  // 3. Duplicate edges (same from, same to, multiple files).
  for (const [edge, list] of byEdge) {
    if (list.length > 1) {
      errors.push({
        code: 'DUPLICATE_EDGE',
        message: `Multiple scripts define the same migration edge ${edge}: ${list
          .map((s) => s.scriptName)
          .join(', ')}`,
        related: list.map((s) => s.scriptName),
      })
    }
  }

  // 4. Branches (same from, different to).
  for (const [from, list] of byFrom) {
    if (list.length > 1) {
      const distinctTos = new Set(list.map((s) => s.toVersion))
      if (distinctTos.size > 1) {
        errors.push({
          code: 'BRANCH',
          message: `Multiple migration paths originate from ${from}: ${list
            .map((s) => `${s.scriptName} (-> ${s.toVersion})`)
            .join(', ')}`,
          related: list.map((s) => s.scriptName),
        })
      }
    }
  }

  // 5. Merges (same to, different from).
  for (const [to, list] of byTo) {
    if (list.length > 1) {
      const distinctFroms = new Set(list.map((s) => s.fromVersion))
      if (distinctFroms.size > 1) {
        errors.push({
          code: 'MERGE',
          message: `Multiple migration paths converge into ${to}: ${list
            .map((s) => `${s.scriptName} (from ${s.fromVersion})`)
            .join(', ')}`,
          related: list.map((s) => s.scriptName),
        })
      }
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// Public discovery entry point
// ---------------------------------------------------------------------------

/**
 * Discover migration scripts in `dir`.
 *
 * Behavior:
 * 1. Reads directory listing (returns IO_ERROR result on failure - never throws).
 * 2. Skips files whose name starts with `_` (templates/private).
 * 3. Skips entries that are not files (subdirectories, symlinks to dirs).
 * 4. Parses each remaining filename against the naming convention.
 *    Malformed names produce a `MALFORMED_FILENAME` error in `errors`.
 * 5. Validates the resulting set as a linear chain (no branches, merges,
 *    duplicate edges, self-loops, backward edges).
 * 6. Sorts the well-formed scripts ascending by `fromVersion`, then `toVersion`.
 *
 * @param dir Path to the migrations directory.
 * @returns A `DiscoveryResult` with `ok=true` iff `errors` is empty.
 *
 * Requirements: REQ-21
 */
export async function discoverMigrationScripts(dir: string): Promise<DiscoveryResult> {
  let entries: import('fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      scripts: [],
      errors: [
        {
          code: 'IO_ERROR',
          message: `Failed to read migrations directory ${dir}: ${msg}`,
        },
      ],
    }
  }

  const scripts: MigrationScript[] = []
  const errors: DiscoveryError[] = []

  for (const entry of entries) {
    // Only files, not directories.
    if (!entry.isFile()) continue

    const name = entry.name

    // Skip templates / private files.
    if (isSkippedFile(name)) continue

    // Skip files that are not migration-script-shaped extensions at all
    // (e.g. README.md, .DS_Store) - they are not "malformed migration
    // scripts", they are just unrelated files.
    if (!/\.(ts|tsx|js|mjs|cjs)$/i.test(name)) continue

    const parsed = parseScriptFilename(name)
    if (!parsed) {
      errors.push({
        code: 'MALFORMED_FILENAME',
        message: `Script ${name} does not match naming convention vX.Y.Z-to-vA.B.C.<ext>`,
        scriptName: name,
      })
      continue
    }

    parsed.filePath = join(dir, name)
    scripts.push(parsed)
  }

  // Sort by fromVersion ascending, breaking ties by toVersion.
  scripts.sort((a, b) => {
    const cmp = compareScriptVersions(a.fromVersion, b.fromVersion)
    if (cmp !== 0) return cmp
    return compareScriptVersions(a.toVersion, b.toVersion)
  })

  // Run graph validation on the well-formed scripts.
  errors.push(...validateMigrationGraph(scripts))

  return {
    ok: errors.length === 0,
    scripts,
    errors,
  }
}
