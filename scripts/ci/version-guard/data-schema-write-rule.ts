/**
 * scripts/ci/version-guard/data-schema-write-rule.ts
 *
 * CI Version Guard rule implementing Requirement 7.4:
 *
 *   IF a pull request adds or modifies any assignment to
 *   `data_schema_version` in source code outside the dedicated writer
 *   module, THEN THE CI_Version_Guard SHALL reject the pull request and
 *   report the offending file path and line number.
 *
 * Why this rule exists
 *   `data_schema_version` is the integer that tells the runtime which
 *   schema cohort a project's data is in. By design (R7.1) it is only
 *   ever written by ONE module — the migration-completion handler in
 *   `packages/version-unification/src/manifest/project-manifest-writer.ts`.
 *   Letting any other code hand-roll an assignment is exactly the
 *   drift hazard that motivates the whole spec; this rule short-circuits
 *   that class of bug at PR time.
 *
 * Scope
 *   - Only inspects *added* lines (post-image). Removals can't introduce
 *     drift, so they are uniformly ignored.
 *   - The dedicated writer file
 *     `packages/version-unification/src/manifest/project-manifest-writer.ts`
 *     is exempt by exact-path match (after normalising to POSIX-style
 *     and stripping any leading `./`).
 *   - Test files are exempt — tests legitimately construct fixtures
 *     containing `data_schema_version: 5`. We treat any path that
 *     contains `/tests/` or ends in `.test.ts` / `.test.tsx` as a test.
 *   - Spec/doc files are exempt — design.md and requirements.md
 *     reference the field name in prose. We treat any path that
 *     contains `.kiro/specs/` or ends in `.md` as a doc.
 *   - Files not appearing in the PR diff are not scanned (R9.4 budget).
 *
 * The regex `/data_schema_version\s*[:=]/` matches the assignment forms
 * we care about (`data_schema_version: N`, `data_schema_version = N`,
 * `data_schema_version : N`). It does NOT match identifiers that merely
 * share the prefix — e.g. `data_schema_version_history = []` is safe
 * because the character following `data_schema_version` is `_`, not
 * whitespace + `:`/`=`.
 *
 * Validates: Requirement 7.4
 *
 * schema_version: 1.0
 */

import type { VersionGuardContext, VersionGuardRule, Violation } from './types';

/**
 * Exact relative path of the only module allowed to write
 * `data_schema_version`. Normalised to POSIX-style separators.
 */
const DEDICATED_WRITER =
  'packages/version-unification/src/manifest/project-manifest-writer.ts';

/**
 * Per-task spec: matches assignments and object-literal entries for
 * `data_schema_version`. The /g flag lets a single line carrying
 * multiple matches (rare, but possible) report each one.
 */
const DATA_SCHEMA_WRITE_RE = /data_schema_version\s*[:=]/g;

/** Stable ruleId for this violation; matches design §"CI Guard 违规报告结构". */
const RULE_ID = 'DATA_SCHEMA_WRITE_OUTSIDE_DEDICATED_MODULE';

/** Convert a possibly-Windows path to POSIX-style and strip `./`. */
function normalisePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** True when `path` is the dedicated writer (exact match after normalise). */
function isDedicatedWriter(path: string): boolean {
  return normalisePath(path) === DEDICATED_WRITER;
}

/**
 * True for files that look like tests. We accept either pattern that
 * the codebase actually uses today:
 *   - any path segment `tests/` (e.g. `packages/foo/tests/bar.ts`)
 *   - filename ending `.test.ts` / `.test.tsx`
 */
function isExemptTestFile(path: string): boolean {
  const p = normalisePath(path);
  return p.includes('/tests/') || /\.test\.tsx?$/.test(p);
}

/**
 * True for spec / documentation files. Per the task brief, anything
 * under `.kiro/specs/` or any `.md` file is exempt — those legitimately
 * mention the field name in prose.
 */
function isExemptSpecOrDoc(path: string): boolean {
  const p = normalisePath(path);
  return p.includes('.kiro/specs/') || p.endsWith('.md');
}

/**
 * The rule itself. A plain object literal so it can be registered with
 * `registry.push(dataSchemaWriteRule)` without instantiation.
 */
export const dataSchemaWriteRule: VersionGuardRule = {
  name: 'data-schema-write-location',

  async check(ctx: VersionGuardContext): Promise<Violation[]> {
    const violations: Violation[] = [];
    const changed = await ctx.getChangedFiles();

    for (const file of changed) {
      if (isDedicatedWriter(file)) continue;
      if (isExemptTestFile(file)) continue;
      if (isExemptSpecOrDoc(file)) continue;

      const hunks = await ctx.getFileHunks(file);
      for (const addedLine of hunks.added) {
        // Reset lastIndex because the regex has the /g flag and is
        // shared between iterations.
        DATA_SCHEMA_WRITE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = DATA_SCHEMA_WRITE_RE.exec(addedLine.text)) !== null) {
          violations.push({
            ruleId: RULE_ID,
            file,
            line: addedLine.line,
            matchedText: m[0],
          });
          // Defensive: avoid an infinite loop on a hypothetical
          // zero-width match. (The regex above always advances by
          // at least the literal length, but the guard is cheap.)
          if (m.index === DATA_SCHEMA_WRITE_RE.lastIndex) {
            DATA_SCHEMA_WRITE_RE.lastIndex += 1;
          }
        }
      }
    }

    return violations;
  },
};
