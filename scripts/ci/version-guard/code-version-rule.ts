/**
 * scripts/ci/version-guard/code-version-rule.ts
 *
 * CI Version Guard rule implementing Requirement 5.2:
 *
 *   IF a pull request adds or modifies a line containing a string literal
 *   matching `code_version\s*[:=]\s*["'][0-9]+\.[0-9]+\.[0-9]+` in any
 *   source file *other than the repository root `package.json`*,
 *   THEN the CI_Version_Guard SHALL reject the pull request and report
 *   the offending file path and line number.
 *
 * Why this rule exists
 *   The single source of truth for `code_version` is the repository root
 *   `package.json#version` field (R5.1). Any other file that hard-codes
 *   a SemVer literal next to `code_version` creates a drift hazard —
 *   the very class of bug that motivated this whole spec (see
 *   requirements.md "Introduction").
 *
 * Scope
 *   - We only inspect *added* lines (post-image) — the rule fires on
 *     additions and modifications, not on removals (deletions cannot
 *     introduce drift).
 *   - We exempt the *root* `package.json` (path === 'package.json'),
 *     not nested package manifests like `packages/foo/package.json`. A
 *     workspace package's manifest must NOT carry a `code_version`
 *     literal — that would be exactly the drift this rule prevents.
 *   - Files that don't appear in the PR diff are not scanned (R9.4
 *     time budget; the diff-scanner is the only data source).
 *
 * schema_version: 1.0
 */

import type { VersionGuardContext, VersionGuardRule, Violation } from './types';

/** Exact relative path of the root manifest, the only file exempted. */
const ROOT_PACKAGE_JSON = 'package.json';

/**
 * Regex per R5.2. The added-line text we get from the diff-scanner is
 * the post-image content with the leading `+` already stripped. Using
 * the global flag lets a single line containing multiple literals
 * (rare, but possible in JSON arrays) report each match.
 */
const CODE_VERSION_LITERAL_RE =
  /code_version\s*[:=]\s*["'][0-9]+\.[0-9]+\.[0-9]+/g;

/** Stable ruleId for this violation; matches design §"CI Guard 违规报告结构". */
const RULE_ID = 'CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON';

/**
 * Normalise a path returned by the diff-scanner before comparing to
 * `package.json`. git emits POSIX-style separators on every OS, but
 * we strip a leading `./` defensively and replace Windows-style
 * back-slashes — this keeps the exemption check robust if the scanner
 * is ever swapped out.
 */
function isRootPackageJson(path: string): boolean {
  const normalised = path.replace(/\\/g, '/').replace(/^\.\//, '');
  return normalised === ROOT_PACKAGE_JSON;
}

/**
 * The rule itself. It is a plain object literal (not a class) so the
 * orchestrator can register it with `registry.push(codeVersionRule)`
 * without needing to instantiate.
 */
export const codeVersionRule: VersionGuardRule = {
  name: 'code-version-literal',

  async check(ctx: VersionGuardContext): Promise<Violation[]> {
    const violations: Violation[] = [];
    const changed = await ctx.getChangedFiles();

    for (const file of changed) {
      if (isRootPackageJson(file)) continue;

      const hunks = await ctx.getFileHunks(file);
      for (const addedLine of hunks.added) {
        // Reset lastIndex because the regex has the /g flag and is
        // shared between iterations.
        CODE_VERSION_LITERAL_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = CODE_VERSION_LITERAL_RE.exec(addedLine.text)) !== null) {
          violations.push({
            ruleId: RULE_ID,
            file,
            line: addedLine.line,
            matchedText: m[0],
          });
          // Guard against zero-width matches (the regex above always
          // advances, but defensive coding is cheap).
          if (m.index === CODE_VERSION_LITERAL_RE.lastIndex) {
            CODE_VERSION_LITERAL_RE.lastIndex += 1;
          }
        }
      }
    }

    return violations;
  },
};
