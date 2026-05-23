/**
 * scripts/ci/version-guard/min-schema-rule.ts
 *
 * CI Version Guard rule for `MIN_SUPPORTED_DATA_SCHEMA` (R6.2-6.4, R8.3).
 *
 * Behaviour
 *   1. Reads the PR-old value of `MIN_SUPPORTED_DATA_SCHEMA` from
 *      `<diffBase>:packages/version-unification/src/constants.ts` via
 *      `git show` (5 s hard timeout).
 *   2. Reads the PR-new value from the working tree (post-image) via
 *      `ctx.readFileWithSizeLimit`.
 *   3. Decides per the design table (design.md §"CI guard for
 *      MIN_SUPPORTED_DATA_SCHEMA monotonic + deprecation doc"):
 *
 *        | Condition                   | Violation                          |
 *        |-----------------------------|------------------------------------|
 *        | new <  old                  | MIN_SCHEMA_DECREASED               |
 *        | new >  old, no dep doc      | MIN_SCHEMA_NO_DEPRECATION_DOC      |
 *        | new >  old, all dep docs    | (no violation)                     |
 *        | new === old                 | (no violation)                     |
 *
 *      Decrease is reported regardless of accompanying documentation
 *      (R6.4: "SHALL refuse any pull request that decreases its value
 *      regardless of accompanying documentation").
 *
 *      For an increase old → new, the rule walks the schemas being
 *      dropped, namely each N in `[old, new)`, and emits one
 *      `MIN_SCHEMA_NO_DEPRECATION_DOC` violation per missing doc
 *      `docs/deprecations/schema-<N>.md`.
 *
 *   4. Failure-safe: if `constants.ts` is absent in either side or the
 *      regex doesn't match (e.g. someone reorganised the file outside
 *      of normal channels), the rule reports nothing. The orchestrator
 *      task 14.2 owns infra-level error surfacing.
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 8.3
 *
 * schema_version: 1.0
 */

import type { VersionGuardContext, VersionGuardRule, Violation } from './types';

/** Repo-relative path of the single declaration file (R6.1). */
const CONSTANTS_FILE = 'packages/version-unification/src/constants.ts';

/**
 * Extracts the integer literal assigned to `MIN_SUPPORTED_DATA_SCHEMA`.
 *
 * The optional `: number` annotation accommodates the canonical TS form
 * `export const MIN_SUPPORTED_DATA_SCHEMA: number = 0;` while also
 * matching the un-annotated form `MIN_SUPPORTED_DATA_SCHEMA = 0`. We
 * stop at a digit run only — there's no support for hex/binary/etc
 * because R6.4 constrains the value to non-negative integers and the
 * codebase currently only writes decimal literals.
 */
const MIN_SCHEMA_RE =
  /MIN_SUPPORTED_DATA_SCHEMA\s*(?::\s*number)?\s*=\s*(\d+)/;

const GIT_SHOW_TIMEOUT_MS = 5_000;

/**
 * Reader function for the pre-image of a file via `git show
 * <diffBase>:<file>`. Returns `null` when the file was absent in the
 * pre-image, when the call times out, or when git itself fails — these
 * are all "treat as no-change" situations per the failure-safe rule.
 *
 * Exported as a type so tests can swap in a deterministic in-memory
 * stub via `createMinSchemaRule({ readPreImage })`.
 */
export type ReadPreImageFn = (
  diffBase: string,
  file: string,
  cwd: string,
) => Promise<string | null>;

/**
 * Default `git show` reader. Spawns a single git process per call with
 * a 5 s hard timeout. Follows the async-resource lifecycle rules:
 * AbortController-driven cancel + clearTimeout in finally (rule A1).
 *
 * @internal — exposed via `createMinSchemaRule` opts for tests.
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

    // Drain stdout and stderr in parallel to avoid pipe back-pressure
    // (the file is small, but we still don't want to block on stderr).
    const [stdoutText, _stderrText, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    // Anything other than a clean exit → treat as "no usable pre-image".
    // This intentionally covers: file added in this PR (exit 128),
    // diffBase unresolvable (exit 128), or our own timeout abort.
    if (timedOut || exitCode !== 0) return null;
    return stdoutText;
  } catch {
    // git binary missing, signal handler races, etc. Failure-safe:
    // act as if there is no pre-image to compare against.
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Extract the int literal; return null when no match or invalid. */
function extractMinSchema(content: string): number | null {
  const m = MIN_SCHEMA_RE.exec(content);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Path of the deprecation notice for a single dropped schema. */
function deprecationDocPath(schemaN: number): string {
  return `docs/deprecations/schema-${schemaN}.md`;
}

/** Options for `createMinSchemaRule`. Tests inject `readPreImage`. */
export interface MinSchemaRuleOpts {
  readonly readPreImage?: ReadPreImageFn;
}

/**
 * Build the rule. The default export `minSchemaRule` calls this with
 * no opts (real `git show`); tests build their own with an in-memory
 * stub.
 */
export function createMinSchemaRule(
  opts: MinSchemaRuleOpts = {},
): VersionGuardRule {
  const readPreImage = opts.readPreImage ?? defaultReadPreImage;

  return {
    name: 'min-schema-rule',

    async check(ctx: VersionGuardContext): Promise<Violation[]> {
      const violations: Violation[] = [];

      // ---- Post-image (PR HEAD) ------------------------------------
      // ctx.readFileWithSizeLimit returns null for missing or oversized
      // files (>1 MB per design D7). For our 60-line constants file
      // the size cap is academic; we bail on null either way.
      const newContent = await ctx.readFileWithSizeLimit(CONSTANTS_FILE);
      if (newContent === null) return violations;
      const newVal = extractMinSchema(newContent);
      if (newVal === null) return violations;

      // ---- Pre-image (diffBase) ------------------------------------
      const oldContent = await readPreImage(
        ctx.diffBase,
        CONSTANTS_FILE,
        ctx.repoRoot,
      );
      if (oldContent === null) return violations;
      const oldVal = extractMinSchema(oldContent);
      if (oldVal === null) return violations;

      // ---- Decision ------------------------------------------------
      if (newVal < oldVal) {
        // R6.4: decrease is *always* a violation.
        violations.push({
          ruleId: 'MIN_SCHEMA_DECREASED',
          file: CONSTANTS_FILE,
          details: { from: oldVal, to: newVal },
        });
        return violations;
      }

      if (newVal > oldVal) {
        // R6.2/6.3: each schema in [oldVal, newVal) is being dropped;
        // every dropped schema needs its own deprecation notice.
        for (let n = oldVal; n < newVal; n += 1) {
          const expectedPath = deprecationDocPath(n);
          const doc = await ctx.readFileWithSizeLimit(expectedPath);
          if (doc === null) {
            violations.push({
              ruleId: 'MIN_SCHEMA_NO_DEPRECATION_DOC',
              details: { schema: n, expectedPath },
            });
          }
        }
      }

      // newVal === oldVal → no MIN-rule violation
      return violations;
    },
  };
}

/** The default rule instance, registered in `version-guard.ts`. */
export const minSchemaRule: VersionGuardRule = createMinSchemaRule();
