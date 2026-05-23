/**
 * scripts/ci/version-guard.ts — CI Version Guard main entry.
 *
 * Orchestrates four PR-diff rules (R5/R6/R7/R8) that enforce how version
 * fields are allowed to change in the SpecForge repo. Each rule lives in
 * `scripts/ci/version-guard/*-rule.ts` and is fed a small
 * `VersionGuardContext` exposing diff and bounded file reads.
 *
 * Contract (design.md §"CI Version Guard" + Requirements 9.1-9.4):
 *   - Run all four rules concurrently with `Promise.all`, collecting
 *     violations from each. A failure in one rule does NOT cancel the
 *     others — we want the most complete report we can produce.
 *   - A 30 s hard wall-clock budget (R9.4) wraps the whole run via
 *     AbortController. On timeout, the run is treated as an
 *     infrastructure failure and the process exits non-zero (R9.3).
 *   - stdout receives a single JSON `ViolationReport` with
 *     `schema_version: "1.0"` (machine-consumable).
 *   - stderr receives a human-readable summary.
 *   - exit 0  ⇔  no violations AND no infrastructure error.
 *     exit 1  ⇔  any violation OR any infrastructure error
 *               (timeout, git failure, rule throw, fs error, …).
 *
 * CLI:
 *     bun run scripts/ci/version-guard.ts
 *         [--diff-base=<rev>]   default: origin/main
 *         [--repo-root=<path>]  default: process.cwd()
 *         [--timeout=<ms>]      default: 30000
 *
 * Usage as a library:
 *     import { runVersionGuard } from './version-guard';
 *     const { exitCode, report } = await runVersionGuard({
 *       diffBase: 'origin/main',
 *       repoRoot: process.cwd(),
 *     });
 *
 * schema_version: 1.0
 */

import {
  getChangedFiles as scannerGetChangedFiles,
  getFileHunks as scannerGetFileHunks,
  readFileWithSizeLimit as scannerReadFile,
  type FileHunks,
} from './version-guard/diff-scanner';
import { codeVersionRule } from './version-guard/code-version-rule';
import { minSchemaRule } from './version-guard/min-schema-rule';
import { dataSchemaWriteRule } from './version-guard/data-schema-write-rule';
import { schemaIntroductionRule } from './version-guard/schema-introduction-rule';
import type {
  VersionGuardRule,
  VersionGuardContext,
  Violation,
  ViolationReport,
} from './version-guard/types';

export type {
  VersionGuardRule,
  VersionGuardContext,
  Violation,
  ViolationReport,
} from './version-guard/types';

export const DEFAULT_HARD_TIMEOUT_MS = 30_000;

/** Public options for `runVersionGuard`. */
export interface RunVersionGuardOptions {
  /** Git revspec resolvable from `repoRoot`. e.g. `origin/main`. */
  readonly diffBase: string;
  /** Absolute path to the repo root. Used as cwd for git invocations. */
  readonly repoRoot: string;
  /** Override for testability. Defaults to `DEFAULT_HARD_TIMEOUT_MS`. */
  readonly hardTimeoutMs?: number;
  /**
   * Override the rule set. Defaults to the four production rules.
   * Tests use this to inject fast / slow / throwing rules.
   */
  readonly rules?: ReadonlyArray<VersionGuardRule>;
  /**
   * Override the underlying scanner functions. Tests inject in-memory
   * fakes here so they don't need a real git repo. Defaults wrap the
   * `diff-scanner` module.
   */
  readonly scanner?: {
    getChangedFiles?: (diffBase: string, cwd: string) => Promise<string[]>;
    getFileHunks?: (
      diffBase: string,
      file: string,
      cwd: string,
    ) => Promise<FileHunks>;
    readFileWithSizeLimit?: (file: string) => Promise<string | null>;
  };
}

/** Result of a single run. */
export interface RunVersionGuardResult {
  readonly exitCode: 0 | 1;
  readonly report: ViolationReport;
}

const DEFAULT_RULES: ReadonlyArray<VersionGuardRule> = [
  codeVersionRule,
  minSchemaRule,
  dataSchemaWriteRule,
  schemaIntroductionRule,
];

/**
 * Run all configured rules against the PR diff and produce a
 * `ViolationReport`. Never throws on rule failures — converts them into
 * an `infrastructureError` annotation on the report.
 */
export async function runVersionGuard(
  opts: RunVersionGuardOptions,
): Promise<RunVersionGuardResult> {
  const startedAt = Date.now();
  const hardTimeoutMs = opts.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS;
  const rules = opts.rules ?? DEFAULT_RULES;

  // ---- AbortController-based hard timeout (rule A1: clear timer in finally)
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  // Memoise getChangedFiles per run so multiple rules share one git call.
  let changedFilesPromise: Promise<string[]> | null = null;
  const scannerCfg = opts.scanner ?? {};
  const ctxGetChangedFiles = (): Promise<string[]> => {
    if (!changedFilesPromise) {
      const fn = scannerCfg.getChangedFiles ?? scannerGetChangedFiles;
      changedFilesPromise = fn(opts.diffBase, opts.repoRoot);
    }
    return changedFilesPromise;
  };
  const ctxGetFileHunks = (file: string): Promise<FileHunks> => {
    const fn = scannerCfg.getFileHunks ?? scannerGetFileHunks;
    return fn(opts.diffBase, file, opts.repoRoot);
  };
  const ctxReadFile = (file: string): Promise<string | null> => {
    const fn = scannerCfg.readFileWithSizeLimit ?? scannerReadFile;
    return fn(file);
  };

  const ctx: VersionGuardContext = {
    diffBase: opts.diffBase,
    repoRoot: opts.repoRoot,
    getChangedFiles: ctxGetChangedFiles,
    getFileHunks: ctxGetFileHunks,
    readFileWithSizeLimit: ctxReadFile,
  };

  const violations: Violation[] = [];
  const infraErrors: string[] = [];

  try {
    // ---- run rules in parallel against a hard-timeout barrier ----
    const ruleWork: Promise<void> = Promise.all(
      rules.map(async (rule) => {
        try {
          const out = await rule.check(ctx);
          violations.push(...out);
        } catch (err) {
          infraErrors.push(
            `rule '${rule.name}' threw: ${formatError(err)}`,
          );
        }
      }),
    ).then(() => undefined);

    const timeoutPromise: Promise<void> = new Promise<void>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
        reject(
          new Error(
            `version-guard exceeded hard timeout of ${hardTimeoutMs} ms`,
          ),
        );
      }, hardTimeoutMs);
    });

    try {
      await Promise.race([ruleWork, timeoutPromise]);
    } catch (err) {
      // Timer fired or some surprise propagated past per-rule catches.
      infraErrors.push(formatError(err));
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  // Try to count scanned files — best-effort, not fatal if it fails.
  let scannedFileCount = 0;
  try {
    const files = await ctxGetChangedFiles();
    scannedFileCount = files.length;
  } catch (err) {
    infraErrors.push(`getChangedFiles failed: ${formatError(err)}`);
  }

  const elapsedMs = Date.now() - startedAt;
  const report: ViolationReport = {
    schema_version: '1.0',
    tool: 'CI_Version_Guard',
    diffBase: opts.diffBase,
    scannedFileCount,
    elapsedMs,
    violations,
    ...(timedOut ? { timedOut: true as const } : {}),
    ...(infraErrors.length > 0
      ? { infrastructureError: infraErrors.join('; ') }
      : {}),
  };

  const exitCode: 0 | 1 =
    violations.length > 0 || infraErrors.length > 0 ? 1 : 0;

  return { exitCode, report };
}

/** Best-effort `Error -> string`. */
function formatError(e: unknown): string {
  if (e instanceof Error) return e.stack ?? `${e.name}: ${e.message}`;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Render the human-readable stderr summary of a report. */
export function formatHumanReport(report: ViolationReport): string {
  const lines: string[] = [];
  lines.push(`CI Version Guard — diffBase=${report.diffBase}`);
  lines.push(
    `  scannedFiles=${report.scannedFileCount}  elapsedMs=${report.elapsedMs}` +
      (report.timedOut ? '  timedOut=true' : ''),
  );
  if (report.violations.length === 0) {
    lines.push(`  violations: none`);
  } else {
    lines.push(`  violations (${report.violations.length}):`);
    for (const v of report.violations) {
      const where =
        v.file !== undefined
          ? `${v.file}${v.line !== undefined ? `:${v.line}` : ''}`
          : '<no-file>';
      const matched = v.matchedText !== undefined ? ` :: ${v.matchedText}` : '';
      lines.push(`    - [${v.ruleId}] ${where}${matched}`);
    }
  }
  if (report.infrastructureError !== undefined) {
    lines.push(`  infrastructureError: ${report.infrastructureError}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

/** Parse a tiny subset of CLI flags. Exported for tests. */
export function parseCliArgs(argv: ReadonlyArray<string>): {
  diffBase: string;
  repoRoot: string;
  hardTimeoutMs: number;
} {
  let diffBase = 'origin/main';
  let repoRoot = process.cwd();
  let hardTimeoutMs = DEFAULT_HARD_TIMEOUT_MS;
  for (const arg of argv) {
    if (arg.startsWith('--diff-base=')) {
      diffBase = arg.slice('--diff-base='.length);
    } else if (arg === '--diff-base') {
      // ignore — we expect `--diff-base=<value>` form for simplicity
    } else if (arg.startsWith('--repo-root=')) {
      repoRoot = arg.slice('--repo-root='.length);
    } else if (arg.startsWith('--timeout=')) {
      const n = Number.parseInt(arg.slice('--timeout='.length), 10);
      if (Number.isFinite(n) && n > 0) hardTimeoutMs = n;
    }
  }
  return { diffBase, repoRoot, hardTimeoutMs };
}

// Bun-only: `import.meta.main` is `true` when this module is the entry.
if ((import.meta as { main?: boolean }).main) {
  const args = parseCliArgs(process.argv.slice(2));
  runVersionGuard(args)
    .then(({ exitCode, report }) => {
      // stdout: JSON for machines.
      process.stdout.write(JSON.stringify(report) + '\n');
      // stderr: human summary.
      process.stderr.write(formatHumanReport(report) + '\n');
      process.exit(exitCode);
    })
    .catch((err) => {
      // This catch is the LAST resort — `runVersionGuard` itself does
      // not throw on rule errors. If we land here, something at the
      // orchestrator level itself failed (e.g. JSON.stringify cycle).
      const fallback: ViolationReport = {
        schema_version: '1.0',
        tool: 'CI_Version_Guard',
        diffBase: args.diffBase,
        scannedFileCount: 0,
        elapsedMs: 0,
        violations: [],
        infrastructureError: formatError(err),
      };
      process.stdout.write(JSON.stringify(fallback) + '\n');
      process.stderr.write(formatHumanReport(fallback) + '\n');
      process.exit(1);
    });
}
