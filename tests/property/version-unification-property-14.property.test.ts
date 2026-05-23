/**
 * tests/property/version-unification-property-14.property.test.ts
 *
 * Property Test: CI Guard Rejects code_version Literal Outside package.json
 *
 * Feature: version-unification, Property 14: CI guard rejects code_version literal outside package.json
 * Derived-From: v6-architecture-overview Property 14
 *
 * Validates: Requirements 5.2
 *
 * Requirement 5.2:
 *   IF a pull request adds or modifies a line containing a string literal
 *   matching `code_version\s*[:=]\s*["'][0-9]+\.[0-9]+\.[0-9]+` in any
 *   source file *other than the repository root `package.json`,
 *   THEN the CI_Version_Guard SHALL reject the pull request and report
 *   the offending file path and line number.
 *
 * Property 14 Definition:
 * - The CI version guard MUST detect code_version literals in any file
 *   except the root package.json
 * - The root package.json is the ONLY exempted file
 * - Nested package.json files (packages-slash-star-slash-package.json) MUST be flagged
 * - The rule MUST correctly identify line numbers for violations
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { codeVersionRule } from '../../scripts/ci/version-guard/code-version-rule';
import type { VersionGuardContext } from '../../scripts/ci/version-guard/types';
import type { FileHunks } from '../../scripts/ci/version-guard/diff-scanner';

// Configure iterations per task requirement
const NUM_ITERATIONS = 500;

/**
 * Build a mock VersionGuardContext that serves fixed list of changed files
 * and their hunks.
 */
function makeContext(files: { path: string; hunks: FileHunks }[]): VersionGuardContext {
  const byPath = new Map<string, FileHunks>();
  for (const f of files) byPath.set(f.path, f.hunks);
  return {
    diffBase: 'origin/main',
    repoRoot: '/test/repo',
    getChangedFiles: () => Promise.resolve(files.map((f) => f.path)),
    getFileHunks: (file) => Promise.resolve(byPath.get(file) ?? { added: [], removed: [] }),
    readFileWithSizeLimit: () => Promise.resolve(null),
  };
}

/**
 * Turn a list of "(line, text)" tuples into FileHunks with only adds.
 */
function added(lines: ReadonlyArray<readonly [number, string]>): FileHunks {
  return {
    added: lines.map(([line, text]) => ({ line, text })),
    removed: [],
  };
}

/**
 * Generate a valid SemVer string (e.g., "1.2.3", "6.0.0", "0.0.1")
 */
function generateSemVer(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 999 }))
    .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);
}

/**
 * Generate a code_version assignment with valid SemVer
 * Matches regex: code_version\s*[:=]\s*["'][0-9]+\.[0-9]+\.[0-9]+
 */
function generateCodeVersionAssignment(): fc.Arbitrary<{ lineNum: number; text: string }> {
  return fc
    .tuple(
      fc.integer({ min: 1, max: 1000 }), // line number
      generateSemVer(), // SemVer string
      fc.constantFrom(':', '='), // colon or equals
      fc.constantFrom('"', "'")  // quote style
    )
    .map(([lineNum, semVer, delimiter, quote]) => ({
      lineNum,
      text: `code_version ${delimiter} ${quote}${semVer}${quote}`,
    }));
}

/**
 * Generate a valid non-root file path (not the root package.json)
 * This includes:
 * - Source files (.ts, .js, .tsx, .jsx)
 * - Nested package.json files
 * - Configuration files
 */
function generateNonRootFilePath(): fc.Arbitrary<string> {
  const prefixes = [
    'packages/',
    'src/',
    'lib/',
    'scripts/',
    'tests/',
    'docs/',
    'configs/',
  ];
  const fileNames = [
    'index.ts',
    'version.ts',
    'config.ts',
    'main.js',
    'app.tsx',
    'package.json',
    'tsconfig.json',
    'constants.ts',
    'utils.ts',
    'types.ts',
  ];
  return fc
    .tuple(
      fc.constantFrom(...prefixes),
      fc.constantFrom(...fileNames)
    )
    .map(([prefix, name]) => `${prefix}${name}`);
}

/**
 * Generate content that should NOT match the code_version literal regex
 * (negative test cases)
 */
function generateNonMatchingContent(): fc.Arbitrary<{ lineNum: number; text: string }> {
  return fc.constantFrom(
    { lineNum: 1, text: 'export const node_version = "20.0.0";' },
    { lineNum: 2, text: 'const data_schema_version = 5;' },
    { lineNum: 3, text: 'const required_shared_version_range = ">=3.5.0";' },
    { lineNum: 4, text: '// code_version_history: see CHANGELOG' },
    { lineNum: 5, text: 'export const VERSION = "1.0.0";' },
  );
}

describe('Property 14: CI guard rejects code_version literal outside package.json', () => {
  /**
   * Property 14.1: The rule MUST detect code_version literals in non-root files
   *
   * For any file path that is NOT the root package.json,
   * when a line containing a valid code_version literal is added,
   * the rule MUST report a violation.
   */
  it(
    'Property 14.1: detects code_version literals in various non-root source files',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          generateNonRootFilePath(),
          generateCodeVersionAssignment(),
          async (filePath, codeVersion) => {
            // Skip if somehow generated the exact root package.json
            if (filePath === 'package.json') return;

            const ctx = makeContext([
              {
                path: filePath,
                hunks: added([[codeVersion.lineNum, codeVersion.text]]),
              },
            ]);

            const violations = await codeVersionRule.check(ctx);

            // The rule MUST detect a violation in any non-root file
            expect(violations).toHaveLength(1);
            expect(violations[0]!.file).toBe(filePath);
            expect(violations[0]!.line).toBe(codeVersion.lineNum);
            expect(violations[0]!.ruleId).toBe('CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON');
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 14.2: The rule MUST flag nested package.json files
   *
   * Files like packages/foo/package.json must be flagged,
   * only the root package.json is exempt.
   */
  it(
    'Property 14.2: flags code_version in nested package.json files',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .tuple(
              fc.integer({ min: 1, max: 20 }),
              generateCodeVersionAssignment()
            )
            .map(([pkgNum, codeVersion]) => ({
              path: `packages/module-${pkgNum}/package.json`,
              codeVersion,
            })),
          async ({ path, codeVersion }) => {
            const ctx = makeContext([
              {
                path,
                hunks: added([[codeVersion.lineNum, codeVersion.text]]),
              },
            ]);

            const violations = await codeVersionRule.check(ctx);

            // Nested package.json MUST be flagged
            expect(violations).toHaveLength(1);
            expect(violations[0]!.file).toBe(path);
            expect(violations[0]!.ruleId).toBe('CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON');
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 14.3: The rule MUST NOT flag the root package.json
   *
   * Only the root package.json at the repository root is exempt.
   */
  it(
    'Property 14.3: exempts root package.json even with code_version literal',
    async () => {
      await fc.assert(
        fc.asyncProperty(generateCodeVersionAssignment(), async (codeVersion) => {
          const ctx = makeContext([
            {
              path: 'package.json',
              hunks: added([[codeVersion.lineNum, codeVersion.text]]),
            },
          ]);

          const violations = await codeVersionRule.check(ctx);

          // Root package.json MUST NOT be flagged
          expect(violations).toHaveLength(0);
        }),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 14.4: The rule correctly identifies line numbers
   *
   * The violation's line number must match the added line's line number.
   */
  it(
    'Property 14.4: correctly reports line numbers for violations',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .tuple(
              generateNonRootFilePath().filter((p) => p !== 'package.json'),
              fc.integer({ min: 1, max: 500 }),
              generateCodeVersionAssignment()
            )
            .map(([filePath, lineOffset, codeVersion]) => ({
              filePath,
              line: codeVersion.lineNum + lineOffset,
              text: codeVersion.text,
            })),
          async ({ filePath, line, text }) => {
            const ctx = makeContext([
              {
                path: filePath,
                hunks: added([[line, text]]),
              },
            ]);

            const violations = await codeVersionRule.check(ctx);

            expect(violations).toHaveLength(1);
            expect(violations[0]!.line).toBe(line);
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 14.5: The rule does NOT flag similar-looking but non-matching patterns
   *
   * Fields like node_version, data_schema_version, required_shared_version_range
   * should NOT trigger violations.
   */
  it(
    'Property 14.5: does not flag similar but non-matching field names',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .tuple(
              generateNonRootFilePath().filter((p) => p !== 'package.json'),
              generateNonMatchingContent()
            )
            .map(([filePath, content]) => ({ filePath, content })),
          async ({ filePath, content }) => {
            const ctx = makeContext([
              {
                path: filePath,
                hunks: added([[content.lineNum, content.text]]),
              },
            ]);

            const violations = await codeVersionRule.check(ctx);

            // These patterns should NOT match
            expect(violations).toHaveLength(0);
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 14.6: Multiple violations in multiple files are all detected
   *
   * The rule should aggregate violations across all changed files.
   */
  it(
    'Property 14.6: detects violations across multiple files',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .tuple(
              generateNonRootFilePath().filter((p) => p !== 'package.json'),
              generateNonRootFilePath().filter((p) => p !== 'package.json'),
              generateCodeVersionAssignment(),
              generateCodeVersionAssignment()
            )
            .map(([path1, path2, cv1, cv2]) => ({
              file1: { path: path1, lineNum: cv1.lineNum, text: cv1.text },
              file2: { path: path2, lineNum: cv2.lineNum, text: cv2.text },
            })),
          async ({ file1, file2 }) => {
            // Ensure different files
            if (file1.path === file2.path) return;

            const ctx = makeContext([
              {
                path: file1.path,
                hunks: added([[file1.lineNum, file1.text]]),
              },
              {
                path: file2.path,
                hunks: added([[file2.lineNum, file2.text]]),
              },
            ]);

            const violations = await codeVersionRule.check(ctx);

            // Both files should have violations
            expect(violations).toHaveLength(2);
            const files = violations.map((v) => v.file);
            expect(files).toContain(file1.path);
            expect(files).toContain(file2.path);
          }
        ),
        { numRuns: Math.floor(NUM_ITERATIONS / 10) } // Fewer iterations due to tuple complexity
      );
    }
  );

  /**
   * Property 14.7: Handles various code_version syntax variants
   *
   * Tests both colon and equals delimiters, single and double quotes.
   */
  it(
    'Property 14.7: handles all code_version syntax variants',
    async () => {
      const variants = [
        'code_version: "1.2.3"',
        "code_version: '1.2.3'",
        'code_version = "1.2.3"',
        "code_version = '1.2.3'",
        'code_version  :  "2.0.0"', // extra whitespace
        'code_version="3.0.0"',     // no spaces
      ];

      for (const text of variants) {
        const ctx = makeContext([
          {
            path: 'packages/test/src/version.ts',
            hunks: added([[10, text]]),
          },
        ]);

        const violations = await codeVersionRule.check(ctx);
        expect(violations).toHaveLength(1);
        expect(violations[0]!.matchedText).toMatch(/code_version\s*[:=]\s*["'][0-9]+\.[0-9]+\.[0-9]+/);
      }
    }
  );
});