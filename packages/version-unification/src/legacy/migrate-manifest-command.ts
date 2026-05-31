/**
 * `migrate-manifest` CLI subcommand entry point.
 *
 * Implements the full Task 13.2 contract per Requirement 12:
 *
 *   - R12.2: invocation on a manifest already in current format leaves the
 *            manifest file byte-identical and exits with code 0.
 *   - R12.3: invocation on a legacy manifest produces a sibling backup
 *            (`<path>.legacy.bak`), rewrites the active manifest into the new
 *            format with the meta field `format: "CURRENT"` injected, and
 *            exits with code 0.
 *   - R12.4: any failure during the read/parse/convert/write pipeline leaves
 *            the active manifest byte-identical to its pre-command state and
 *            appends a JSONL diagnostic entry to
 *            `<manifest-dir>/migrate-error.log`, then exits with a non-zero
 *            code. The first entry written into a fresh log carries a
 *            `schema_version: "1.0"` header field.
 *   - R12.5: repeated invocations are idempotent — once converted, the
 *            manifest stays byte-identical on every subsequent run.
 *
 * The function never throws; all error paths are funneled through
 * {@link buildErrorResult} so the caller (`sf-installer.ts`) only needs to
 * propagate the returned `exitCode` via `process.exit`.
 *
 * @see Requirement 12 — `.kiro/specs/version-unification/requirements.md`
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { SPEC_DIR_NAME, LAYOUT } from '@specforge/types/directory-layout';
import { atomicWrite } from '../manifest/atomic-write.js';
import {
  LEGACY_FIELDS_USER,
  LEGACY_FIELDS_PROJECT,
  USER_MANIFEST_FIELDS,
  PROJECT_MANIFEST_FIELDS,
} from '../manifest/types.js';
import { createLegacyBackup } from './backup.js';

/** Result of a single `migrate-manifest` command invocation. */
export interface MigrateManifestResult {
  /**
   * Process exit code the caller (`sf-installer.ts`) should propagate.
   *
   *   - `0` on `--help` (R12.1), no-op (R12.2), and successful conversion (R12.3)
   *   - non-zero (`1` by default) on any failure path (R12.4)
   */
  readonly exitCode: number;
}

/**
 * The constant value injected into the converted manifest's `format` field per
 * R12.3. Kept in a single place so tests and production share one source of
 * truth.
 */
const FORMAT_CURRENT = 'CURRENT';

/** File name (relative to manifest's parent dir) for diagnostic log per R12.4. */
const MIGRATE_ERROR_LOG_NAME = 'migrate-error.log';

/** Schema version of the migrate-error.log JSONL header entry (R12.4). */
const ERROR_LOG_SCHEMA_VERSION = '1.0';

/** Inline help text printed for `--help` / `-h`. Kept short and human-readable. */
const HELP_TEXT = `\
SpecForge migrate-manifest — 把任意老格式 manifest in-place 升级到当前格式

用法:
  bun scripts/sf-installer.ts migrate-manifest [options]

选项:
  --help, -h                 显示此帮助信息
  --manifest-path <path>     指定要迁移的 manifest 路径
                             (默认: <cwd>/specforge/manifest.json)

行为:
  - 已是新格式      → byte-identical no-op，exit 0          (R12.2)
  - 检测到 legacy   → 备份 .legacy.bak → 写新格式
                      （含 format: "CURRENT" 元字段）→ exit 0 (R12.3)
  - 任意阶段失败    → 保留 active manifest 字节不变，
                      append <manifest-dir>/migrate-error.log，
                      exit ≠ 0                                (R12.4)
  - 反复执行幂等                                              (R12.5)

详情见 .kiro/specs/version-unification/requirements.md §Requirement 12。
`;

// =============================================================================
// Argument parsing
// =============================================================================

interface ParsedArgs {
  readonly help: boolean;
  /** Resolved absolute manifest path (defaults to <cwd>/specforge/manifest.json). */
  readonly manifestPath: string;
}

/**
 * Parse the post-subcommand argv for migrate-manifest.
 *
 * Supports:
 *   - `--help` / `-h`
 *   - `--manifest-path <path>` (or `--manifest-path=<path>`)
 *
 * Unknown flags currently fall through silently — we do not want a typo to
 * trigger a destructive write path, but we also do not want to fail before
 * `--help` can be printed. Stricter validation can be added later without
 * breaking the public signature.
 */
function parseArgs(args: readonly string[]): ParsedArgs {
  let help = false;
  let manifestPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--manifest-path') {
      const value = args[i + 1];
      if (typeof value === 'string' && value.length > 0) {
        manifestPath = value;
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--manifest-path=')) {
      manifestPath = arg.slice('--manifest-path='.length);
      continue;
    }
  }

  const resolved = manifestPath
    ? path.resolve(manifestPath)
    : path.resolve(process.cwd(), SPEC_DIR_NAME, LAYOUT.manifest);

  return { help, manifestPath: resolved };
}

// =============================================================================
// Conversion helpers
// =============================================================================

/**
 * The union of legacy field names from User_Manifest and Project_Manifest.
 * Used to strip deprecated keys when constructing the converted manifest.
 *
 * Note: this is intentionally NOT used for *detecting* legacy manifests in
 * this command. Detection here is type-aware (see {@link isLegacyForType})
 * because `code_version` is a valid field in User_Manifest but a legacy field
 * in Project_Manifest — using the union for detection would falsely flag
 * every valid user manifest as legacy.
 */
const ALL_LEGACY_FIELDS: ReadonlySet<string> = new Set<string>([
  ...LEGACY_FIELDS_USER,
  ...LEGACY_FIELDS_PROJECT,
]);

/**
 * Heuristically determine whether a parsed manifest represents a User or
 * Project manifest. Mirrors the logic in `migrator.ts` but kept inline so
 * `migrate-manifest-command.ts` is decoupled from that module's release-cycle
 * branching.
 *
 * Detection priority is intentional:
 *   1. user-only allowed fields (`min_supported_data_schema`, `files`,
 *      `installed_at`) — strongest user signal
 *   2. project-only allowed fields (`data_schema_version`, `initialized_at`)
 *   3. ambiguous → default to 'project' (smaller fieldset, safer fallback)
 *
 * `code_version` is intentionally NOT used as a discriminator because it is
 * an allowed field in user manifests AND a legacy field in project manifests.
 */
function determineManifestType(rawJson: Record<string, unknown>): 'user' | 'project' {
  if ('min_supported_data_schema' in rawJson || 'files' in rawJson || 'installed_at' in rawJson) {
    return 'user';
  }
  if ('data_schema_version' in rawJson || 'initialized_at' in rawJson) {
    return 'project';
  }
  // Defensive default: treat as project when truly ambiguous (project has the
  // smaller fieldset, so it is the safer "minimum-information" target).
  return 'project';
}

/**
 * Type-aware legacy detection.
 *
 * R11.1 / R12.3 — a manifest is "legacy" iff its top-level keys contain
 * any field marked legacy *for its inferred manifest type*. Using the
 * union of LEGACY_FIELDS_USER ∪ LEGACY_FIELDS_PROJECT here would falsely
 * flag every valid user manifest (which legitimately contains
 * `code_version`) as legacy and force a no-op conversion that mutates
 * the file (failing R12.2).
 */
function isLegacyForType(
  rawJson: Record<string, unknown>,
  manifestType: 'user' | 'project',
): boolean {
  const legacyFields: ReadonlyArray<string> =
    manifestType === 'user' ? LEGACY_FIELDS_USER : LEGACY_FIELDS_PROJECT;
  const legacySet = new Set<string>(legacyFields);
  for (const key of Object.keys(rawJson)) {
    if (legacySet.has(key)) {
      return true;
    }
  }
  return false;
}

/**
 * Strip every legacy field (for the inferred manifest type) and keep only the
 * allowed new-format fields, then inject the `format: "CURRENT"` meta field
 * per R12.3.
 *
 * Why we don't reuse `ManifestMigrator.decorateOnWrite`: that helper consults
 * the current release cycle and may *re-add* legacy fields under DUAL_WRITE
 * mode. The migrate-manifest command must always emit the new format, so we
 * keep the conversion logic inline and release-cycle-agnostic.
 *
 * Why we use type-specific legacy fields (not the union): see comment on
 * {@link ALL_LEGACY_FIELDS}.
 */
function convertToCurrentFormat(
  rawJson: Record<string, unknown>,
  manifestType: 'user' | 'project',
): Record<string, unknown> {
  const allowedFields: ReadonlyArray<string> =
    manifestType === 'user' ? USER_MANIFEST_FIELDS : PROJECT_MANIFEST_FIELDS;
  const legacyFieldsForType: ReadonlySet<string> = new Set<string>(
    manifestType === 'user' ? LEGACY_FIELDS_USER : LEGACY_FIELDS_PROJECT,
  );

  // Inject `format: "CURRENT"` first so it lands at the top of the serialized
  // JSON for human readability.
  const result: Record<string, unknown> = { format: FORMAT_CURRENT };

  // Carry forward allowed fields, but skip any that are also marked legacy
  // for this manifest type (defensive: should not happen for well-defined
  // schemas, but cheap to guard).
  for (const field of allowedFields) {
    if (field in rawJson && !legacyFieldsForType.has(field)) {
      result[field] = rawJson[field];
    }
  }

  // Carry forward any non-legacy, non-allowed top-level fields that may have
  // been added by future schema extensions. We intentionally do NOT round-trip
  // legacy fields — that's the whole point of the migration. We also do not
  // carry forward fields that are legacy in the *other* manifest type but
  // happen to be in this raw JSON (e.g., a user manifest with a stray
  // `data_schema_version` is treated as a foreign-type contamination and
  // dropped).
  for (const [key, value] of Object.entries(rawJson)) {
    if (key === 'format') continue; // we already set it
    if (ALL_LEGACY_FIELDS.has(key)) continue; // strip union of legacy fields
    if (allowedFields.includes(key as (typeof allowedFields)[number])) continue;
    result[key] = value;
  }

  return result;
}

// =============================================================================
// Error logging (migrate-error.log per R12.4)
// =============================================================================

interface ErrorLogEntry {
  readonly stage: 'read' | 'parse' | 'backup' | 'convert' | 'write' | 'unknown';
  readonly manifestPath: string;
  readonly err: string;
  readonly stack?: string;
}

/**
 * Append one diagnostic entry to `<manifest-dir>/migrate-error.log` per R12.4.
 *
 * The first entry written into a fresh log carries a `schema_version: "1.0"`
 * header field. Subsequent entries omit that header. Errors during logging
 * are swallowed so they cannot cascade into a second non-zero exit reason.
 */
async function appendErrorLog(entry: ErrorLogEntry): Promise<void> {
  const manifestDir = path.dirname(entry.manifestPath);
  const logPath = path.join(manifestDir, MIGRATE_ERROR_LOG_NAME);

  let existingSize = 0;
  try {
    const stat = await fs.stat(logPath);
    existingSize = stat.size;
  } catch {
    existingSize = 0; // log doesn't exist yet → first entry will be the header
  }

  const base: Record<string, unknown> = {
    ts: new Date().toISOString(),
    stage: entry.stage,
    manifest_path: entry.manifestPath,
    err: entry.err,
  };
  if (entry.stack) {
    base.stack = entry.stack;
  }

  const record: Record<string, unknown> =
    existingSize === 0 ? { schema_version: ERROR_LOG_SCHEMA_VERSION, ...base } : base;

  const line = JSON.stringify(record) + '\n';

  try {
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.appendFile(logPath, line, 'utf-8');
  } catch {
    // Best-effort: if the manifest dir does not exist and we cannot create it,
    // we still have to surface a non-zero exit. Don't mask the original error.
  }
}

/** Tag an error with the failing pipeline stage and surface for logging. */
function buildErrorResult(
  stage: ErrorLogEntry['stage'],
  manifestPath: string,
  err: unknown,
): MigrateManifestResult {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const errorStack = err instanceof Error ? err.stack : undefined;

  process.stderr.write(
    `[migrate-manifest] 失败 (${stage}): ${errorMessage}\n` +
      `  manifest: ${manifestPath}\n` +
      `  详细日志: ${path.join(path.dirname(manifestPath), MIGRATE_ERROR_LOG_NAME)}\n`,
  );

  return { exitCode: 1 };
}

// =============================================================================
// Public entry point
// =============================================================================

/**
 * Run the `migrate-manifest` subcommand.
 *
 * @param args  Arguments **after** the subcommand name (i.e., everything past
 *              `migrate-manifest` on the command line).
 * @returns     A {@link MigrateManifestResult} whose `exitCode` the caller
 *              must surface via `process.exit`.
 */
export async function runMigrateManifestCommand(
  args: readonly string[],
): Promise<MigrateManifestResult> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    process.stdout.write(HELP_TEXT);
    return { exitCode: 0 };
  }

  const manifestPath = parsed.manifestPath;

  // Stage 1: read the manifest as raw bytes. We need bytes (not parsed JSON)
  // to provide the byte-identical no-op guarantee in R12.2.
  let rawBytes: Buffer;
  try {
    rawBytes = await fs.readFile(manifestPath);
  } catch (err) {
    await appendErrorLog({
      stage: 'read',
      manifestPath,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return buildErrorResult('read', manifestPath, err);
  }

  // Stage 2: parse JSON. A parse failure is a hard error (R12.4) — we do NOT
  // touch the manifest, we just log and exit non-zero.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBytes.toString('utf-8'));
  } catch (err) {
    await appendErrorLog({
      stage: 'parse',
      manifestPath,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return buildErrorResult('parse', manifestPath, err);
  }

  if (parsedJson === null || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
    const message = `Manifest root must be a JSON object, got ${
      Array.isArray(parsedJson) ? 'array' : typeof parsedJson
    }.`;
    await appendErrorLog({ stage: 'parse', manifestPath, err: message });
    return buildErrorResult('parse', manifestPath, new Error(message));
  }

  const rawJson = parsedJson as Record<string, unknown>;

  // Determine manifest type once — used for both legacy detection and
  // conversion. Both must agree on the type, otherwise R12.2/R12.3 can
  // disagree (e.g., one would treat `code_version` as legacy, the other not).
  const manifestType = determineManifestType(rawJson);

  // Stage 3: branch on type-aware legacy detection.
  if (!isLegacyForType(rawJson, manifestType)) {
    // R12.2: already in current format → byte-identical no-op + exit 0.
    // We deliberately do not rewrite — readFile alone changes nothing on disk.
    process.stdout.write(
      `[migrate-manifest] manifest 已是当前格式，无需迁移：${manifestPath}\n`,
    );
    return { exitCode: 0 };
  }

  // Stage 4: legacy → backup first (R12.3 + R11.5 ordering).
  // Critical: the backup must exist before we even consider rewriting the
  // active manifest. If backup fails, the active file is still byte-identical.
  let backupPath: string;
  try {
    backupPath = await createLegacyBackup(manifestPath);
  } catch (err) {
    await appendErrorLog({
      stage: 'backup',
      manifestPath,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return buildErrorResult('backup', manifestPath, err);
  }

  // Stage 5: convert the parsed object to the new format.
  let converted: Record<string, unknown>;
  try {
    converted = convertToCurrentFormat(rawJson, manifestType);
  } catch (err) {
    await appendErrorLog({
      stage: 'convert',
      manifestPath,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return buildErrorResult('convert', manifestPath, err);
  }

  // Stage 6: atomic write the new format. atomicWrite uses copy+unlink so
  // failures here will surface before the active manifest is replaced (the
  // copyFile step is the atomicity boundary on Windows + POSIX).
  try {
    const newContent = JSON.stringify(converted, null, 2) + '\n';
    await atomicWrite(manifestPath, newContent);
  } catch (err) {
    await appendErrorLog({
      stage: 'write',
      manifestPath,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return buildErrorResult('write', manifestPath, err);
  }

  process.stdout.write(
    `[migrate-manifest] 已将 legacy manifest 升级到当前格式：${manifestPath}\n` +
      `  备份: ${backupPath}\n`,
  );
  return { exitCode: 0 };
}
