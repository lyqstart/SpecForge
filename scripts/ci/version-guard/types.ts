/**
 * scripts/ci/version-guard/types.ts
 *
 * Shared types for CI Version Guard.
 *
 * - VersionGuardRule:    contract every rule (R5/R6/R7/R8) implements
 * - VersionGuardContext: services injected into rules (diff scanning,
 *                        bounded file reads)
 * - Violation:           rule-agnostic finding shape
 * - ViolationReport:     aggregated output written to stdout as JSON
 *
 * The shape is intentionally generic so rules in 14.3-14.6 can specialise
 * via `ruleId` and `details` without forcing the orchestrator to know
 * about every rule type.
 *
 * schema_version: 1.0
 */

import type { DiffLine, FileHunks } from './diff-scanner';

/** Rule-agnostic finding. Specific rules attach a stable `ruleId` and
 *  may put extra structured info into `details`. */
export interface Violation {
  /** Stable identifier such as `CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON`. */
  readonly ruleId: string;
  /** Repo-relative POSIX-style path, when applicable. */
  readonly file?: string;
  /** 1-based line number in the post-image, when applicable. */
  readonly line?: number;
  /** Verbatim text that matched the rule, when applicable. */
  readonly matchedText?: string;
  /** Rule-specific structured payload (e.g. `{from: 3, to: 2}`). */
  readonly details?: Record<string, unknown>;
}

/**
 * Services injected into each rule. The orchestrator builds this once
 * per `runVersionGuard` invocation by wrapping `diff-scanner` helpers.
 *
 * Rules MUST NOT call git/fs themselves — they go through this context
 * so the orchestrator can enforce timeouts, size caps, and (in the
 * future) memoise repeated reads.
 */
export interface VersionGuardContext {
  readonly diffBase: string;
  readonly repoRoot: string;
  /** All files changed in `<diffBase>...HEAD`. Cached per run. */
  readonly getChangedFiles: () => Promise<string[]>;
  /** Hunks for a single file changed in `<diffBase>...HEAD`. */
  readonly getFileHunks: (file: string) => Promise<FileHunks>;
  /** Read a file capped at 1 MB; returns `null` if oversized or absent. */
  readonly readFileWithSizeLimit: (file: string) => Promise<string | null>;
}

/** Single rule contract. Implementations live next to this file. */
export interface VersionGuardRule {
  /** Human-readable rule name, e.g. `code-version-rule`. */
  readonly name: string;
  /** Inspect the PR diff and return zero or more violations.
   *  The orchestrator expects `check` to throw only on infrastructure
   *  failure (e.g. git unreachable), not on rule violations. */
  check(ctx: VersionGuardContext): Promise<Violation[]>;
}

/** Aggregated report serialised to stdout as JSON. */
export interface ViolationReport {
  readonly schema_version: '1.0';
  readonly tool: 'CI_Version_Guard';
  readonly diffBase: string;
  readonly scannedFileCount: number;
  readonly elapsedMs: number;
  readonly violations: ReadonlyArray<Violation>;
  /** Present when the run hit the hard timeout (R9.4). */
  readonly timedOut?: boolean;
  /** Present when at least one rule threw or git/fs failed. Joined
   *  message; full details go to stderr. */
  readonly infrastructureError?: string;
}

export type { DiffLine, FileHunks };
