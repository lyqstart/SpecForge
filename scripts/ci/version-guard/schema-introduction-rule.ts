/**
 * scripts/ci/version-guard/schema-introduction-rule.ts
 *
 * CI Version Guard rule implementing Requirements 8.1 and 8.2:
 *
 *   WHEN a pull request introduces a new schema version `N`, THE pull
 *   request SHALL include all of the following artifacts in the same
 *   commit set:
 *     1. a Migration_Script for the version pair `(N-1, N)`,
 *     2. the updated read-write code paths for schema version `N`,
 *     3. automated tests covering both schema versions `N-1` and `N`,
 *     4. an updated decision record under `docs/schema-versions/`.
 *
 *   IF a pull request adds a new schema version `N` and is missing one
 *   or more of the artifacts listed in criterion 1, THEN THE
 *   CI_Version_Guard SHALL collect every missing artifact across the
 *   full pull request, reject the pull request, and emit a single
 *   report that names every missing artifact together rather than
 *   failing on the first miss.
 *
 * Detection
 *   A "new schema version N" enters the set of schemas-to-validate via
 *   either of two signals (union, deduplicated):
 *     a) `HIGHEST_KNOWN_SCHEMA` is raised in
 *        `packages/version-unification/src/constants.ts`. Every integer
 *        in `(oldHighest, newHighest]` is a new schema introduction.
 *     b) A new file `packages/version-unification/src/migration/scripts/<N>.ts`
 *        is added in this PR (pre-image absent, post-image present).
 *
 *   Both signals are collected concurrently and unioned. The rule
 *   processes each N in ascending order so the report is deterministic.
 *
 * Aggregation contract (R8.2 — "禁止首条命中即退")
 *   For each new schema N we check four artifact paths:
 *     1. `packages/version-unification/src/migration/scripts/<N>.ts`
 *        (the Migration_Script)
 *     2. `packages/version-unification/tests/unit/migrations/<N>.test.ts`
 *        (forward / read-write coverage for N)
 *     3. `packages/version-unification/tests/unit/migrations/<N>.idempotence.test.ts`
 *        (idempotence at target — covers N-1 → N round-trip)
 *     4. `docs/schema-versions/<N>.md`  (decision record)
 *
 *   We collect EVERY missing artifact for N, not the first miss. If any
 *   are missing we push exactly one violation:
 *     `{ ruleId: 'SCHEMA_INTRODUCTION_INCOMPLETE',
 *        details: { schema: N, missingArtifacts: string[] } }`
 *
 *   If multiple Ns are introduced, each N gets its own violation. Per
 *   the design table (Property 17), the orchestrator stores these in
 *   the standard `violations[]` array; the report is "aggregated" in
 *   the sense that **no early exit** drops misses.
 *
 * Failure-safety
 *   If `constants.ts` is absent or unreadable in either side, we still
 *   take the second signal path. If both signals yield no Ns, the rule
 *   silently returns `[]` — infrastructure-level error surfacing is the
 *   orchestrator's job (task 14.2), not this rule's.
 *
 * Validates: Requirements 8.1, 8.2
 *
 * schema_version: 1.0
 */

import type { VersionGuardContext, VersionGuardRule, Violation } from './types';

/** Repo-relative path of the constants module (R6.1: sole declaration). */
const CONSTANTS_FILE = 'packages/version-unification/src/constants.ts';

/**
 * Extract the integer literal assigned to `HIGHEST_KNOWN_SCHEMA`.
 *
 * The optional `: number` annotation matches the canonical TS form
 * `export const HIGHEST_KNOWN_SCHEMA: number = 0;` while also accepting
 * the un-annotated form. Decimal-only — there's no sane reason for the
 * codebase to use hex/binary for a schema version.
 */
const HIGHEST_KNOWN_RE =
  /HIGHEST_KNOWN_SCHEMA\s*(?::\s*number)?\s*=\s*(\d+)/;

/**
 * Match a migration script path of the form
 * `packages/version-unification/src/migration/scripts/<N>.ts`.
 * The path is normalised to POSIX-style first.
 */
const MIGRATION_SCRIPT_RE =
  /^packages\/version-unification\/src\/migration\/scripts\/(\d+)\.ts$/;

const GIT_SHOW_TIMEOUT_MS = 5_000;

/** Stable ruleId for this violation; matches design §"CI Guard 违规报告结构". */
const RULE_ID = 'SCHEMA_INTRODUCTION_INCOMPLETE';

// ---------------------------------------------------------------------------
// Artifact path helpers
// ---------------------------------------------------------------------------

function migrationScriptPath(n: number): string {
  return `packages/version-unification/src/migration/scripts/${n}.ts`;
}

function forwardTestPath(n: number): string {
  return `packages/version-unification/tests/unit/migrations/${n}.test.ts`;
}

function idempotenceTestPath(n: number): string {
  return `packages/version-unification/tests/unit/migrations/${n}.idempotence.test.ts`;
}

function decisionRecordPath(n: number): string {
  return `docs/schema-versions/${n}.md`;
}

/** Normalise a possibly-Windows path to POSIX-style and strip `./`. */
function normalisePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Extract the int literal; return null when no match or invalid. */
function extractHighestKnown(content: string): number | null {
  const m = HIGHEST_KNOWN_RE.exec(content);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

// ---------------------------------------------------------------------------
// Pre-image reader (mirrors min-schema-rule.ts)
// ---------------------------------------------------------------------------

/**
 * Reader function for the pre-image of a file via `git show
 * <diffBase>:<file>`. Returns `null` when the file was absent in the
 * pre-image, when the call times out, or when git itself fails — all
 * "treat as added in this PR" situations per the failure-safe contract.
 *
 * Exported as a type so tests can swap in a deterministic in-memory
 * stub via `createSchemaIntroductionRule({ readPreImage })`.
 */
export type ReadPreImageFn = (
  diffBase: string,
  file: string,
  cwd: string,
) => Promise<string | null>;

/**
 * Default `git show` reader. Spawns a single git process per call with
 * a 5 s hard timeout. Follows async-resource-lifecycle rule A1:
 * AbortController-driven cancel + clearTimeout in finally.
 *
 * @internal — exposed via `createSchemaIntroductionRule` opts for tests.
 */
async function defaultReadPreImage(
  diffBase: string,
  file: string,
  cwd: string,
): Promise<string | null> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, GIT_SHOW_TIMEOUT_MS);

    const proc = Bun.spawn(['git', 'show', `${diffBase}:${file}`], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      signal: ctrl.signal,
    });

    const [stdoutText, _stderrText, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (timedOut || exitCode !== 0) return null;
    return stdoutText;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Rule factory
// ---------------------------------------------------------------------------

/** Options for `createSchemaIntroductionRule`. Tests inject `readPreImage`. */
export interface SchemaIntroductionRuleOpts {
  readonly readPreImage?: ReadPreImageFn;
}

/**
 * Build the rule. The default export `schemaIntroductionRule` calls
 * this with no opts (real `git show`); tests build their own with an
 * in-memory stub.
 */
export function createSchemaIntroductionRule(
  opts: SchemaIntroductionRuleOpts = {},
): VersionGuardRule {
  const readPreImage = opts.readPreImage ?? defaultReadPreImage;

  return {
    name: 'schema-introduction-rule',

    async check(ctx: VersionGuardContext): Promise<Violation[]> {
      const newSchemas = new Set<number>();

      // ---- Signal (a): HIGHEST_KNOWN_SCHEMA bumped ------------------
      // Both reads are best-effort; if either is null we just skip
      // this signal and rely on signal (b).
      const [newConst, oldConst] = await Promise.all([
        ctx.readFileWithSizeLimit(CONSTANTS_FILE),
        readPreImage(ctx.diffBase, CONSTANTS_FILE, ctx.repoRoot),
      ]);
      const newHighest =
        newConst !== null ? extractHighestKnown(newConst) : null;
      const oldHighest =
        oldConst !== null ? extractHighestKnown(oldConst) : null;

      if (
        newHighest !== null &&
        oldHighest !== null &&
        newHighest > oldHighest
      ) {
        // Each integer in (oldHighest, newHighest] is a new schema.
        for (let n = oldHighest + 1; n <= newHighest; n += 1) {
          newSchemas.add(n);
        }
      }

      // ---- Signal (b): new migration script files in PR -------------
      // We walk the changed-files list and pick out any path that
      // matches the migration-scripts pattern AND has no pre-image
      // (= file was added, not modified).
      const changed = await ctx.getChangedFiles();
      const candidatePaths: Array<{ file: string; n: number }> = [];
      for (const file of changed) {
        const m = MIGRATION_SCRIPT_RE.exec(normalisePath(file));
        if (!m) continue;
        const n = Number.parseInt(m[1]!, 10);
        if (!Number.isFinite(n) || n < 0) continue;
        candidatePaths.push({ file, n });
      }

      // Confirm "new file" by reading the pre-image — null pre-image
      // means the file did not exist before this PR. We do this in
      // parallel so a PR adding many scripts at once doesn't pay
      // sequential git-show latency.
      await Promise.all(
        candidatePaths.map(async ({ file, n }) => {
          const preImage = await readPreImage(
            ctx.diffBase,
            file,
            ctx.repoRoot,
          );
          if (preImage === null) {
            newSchemas.add(n);
          }
        }),
      );

      // ---- Aggregate missing artifacts per new schema ---------------
      // Sort so the report order is deterministic (good for test
      // assertions and for readability in CI output).
      const sortedSchemas = [...newSchemas].sort((a, b) => a - b);

      const violations: Violation[] = [];
      for (const n of sortedSchemas) {
        const required: ReadonlyArray<string> = [
          migrationScriptPath(n),
          forwardTestPath(n),
          idempotenceTestPath(n),
          decisionRecordPath(n),
        ];

        // R8.2: collect EVERY missing artifact, never break on first
        // miss. We do these checks in parallel; the order of `missing`
        // is reconstructed from `required` afterwards so the report
        // ordering is stable regardless of which fs read finishes first.
        const presence = await Promise.all(
          required.map((p) => ctx.readFileWithSizeLimit(p)),
        );
        const missing: string[] = [];
        for (let i = 0; i < required.length; i += 1) {
          if (presence[i] === null) {
            missing.push(required[i]!);
          }
        }

        if (missing.length > 0) {
          violations.push({
            ruleId: RULE_ID,
            details: {
              schema: n,
              missingArtifacts: missing,
            },
          });
        }
      }

      return violations;
    },
  };
}

/** The default rule instance, registered in `version-guard.ts`. */
export const schemaIntroductionRule: VersionGuardRule =
  createSchemaIntroductionRule();
