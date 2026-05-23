/**
 * tests/property/version-unification-property-18.property.test.ts
 *
 * Property Test: CI Guard Exit Code Semantics
 *
 * Feature: version-unification, Property 18: CI guard exit code blocks merge
 * Derived-From: v6-architecture-overview Property 18
 *
 * Validates: Requirements 9.3
 *
 * Requirement 9.3:
 *   WHEN CI_Version_Guard fails to complete with exit status code 0 for
 *   any reason (including detected violations and infrastructure failures),
 *   THE pull request CI status SHALL block merge until CI_Version_Guard
 *   completes successfully with exit status code 0.
 *   WHERE CI_Version_Guard completes with exit status code 0 in zero
 *   elapsed seconds, THE SpecForge_System SHALL treat the run as
 *   successful and SHALL NOT block merge on the basis of the run
 *   duration alone.
 *
 * Property 18 Definition:
 * - No violations + no infrastructure errors → exit 0 (does not block merge)
 * - Violations detected → exit 1 (blocks merge)
 * - Infrastructure errors → exit 1 (blocks merge)
 * - Zero elapsed time with exit 0 → still successful (does not block merge)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { runVersionGuard, type RunVersionGuardResult } from '../../scripts/ci/version-guard';
import type { VersionGuardRule, VersionGuardContext, Violation } from '../../scripts/ci/version-guard/types';
import type { FileHunks } from '../../scripts/ci/version-guard/diff-scanner';

// Configure iterations per task requirement
const NUM_ITERATIONS = 200;

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
 * Create a mock rule that always returns violations.
 */
function createViolationRule(violationCount: number, ruleId: string = 'MOCK_VIOLATION'): VersionGuardRule {
  return {
    name: 'mock-violation-rule',
    check: async (): Promise<Violation[]> => {
      return Array.from({ length: violationCount }, () => ({
        ruleId,
        file: 'mock/file.ts',
        line: 1,
        message: 'Mock violation for testing',
        matchedText: 'mock',
      }));
    },
  };
}

/**
 * Create a mock rule that throws an infrastructure error.
 */
function createThrowingRule(errorMessage: string): VersionGuardRule {
  return {
    name: 'mock-throwing-rule',
    check: async (): Promise<Violation[]> => {
      throw new Error(errorMessage);
    },
  };
}

/**
 * Create a mock rule that returns no violations.
 */
function createNoViolationRule(): VersionGuardRule {
  return {
    name: 'mock-clean-rule',
    check: async (): Promise<Violation[]> => {
      return [];
    },
  };
}

describe('Property 18: CI guard exit code blocks merge', () => {
  /**
   * Property 18.1: No violations + no errors → exit 0
   *
   * When there are no violations detected and no infrastructure errors,
   * the exit code MUST be 0, which means the PR can be merged.
   */
  it(
    'Property 18.1: returns exit 0 when no violations and no errors',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 1000 }),
          async (seed) => {
            // Use a clean rule with no violations
            const result = await runVersionGuard({
              diffBase: 'origin/main',
              repoRoot: '/test/repo',
              rules: [createNoViolationRule()],
              scanner: {
                getChangedFiles: () => Promise.resolve([]),
                getFileHunks: () => Promise.resolve({ added: [], removed: [] }),
                readFileWithSizeLimit: () => Promise.resolve(null),
              },
            });

            // Exit code MUST be 0 when there are no violations
            expect(result.exitCode).toBe(0);
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 18.2: Violations detected → exit 1
   *
   * When violations are detected, the exit code MUST be 1,
   * which blocks the PR merge.
   */
  it(
    'Property 18.2: returns exit 1 when violations are detected',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (violationCount) => {
            const result = await runVersionGuard({
              diffBase: 'origin/main',
              repoRoot: '/test/repo',
              rules: [createViolationRule(violationCount)],
              scanner: {
                getChangedFiles: () => Promise.resolve([]),
                getFileHunks: () => Promise.resolve({ added: [], removed: [] }),
                readFileWithSizeLimit: () => Promise.resolve(null),
              },
            });

            // Exit code MUST be 1 when violations exist
            expect(result.exitCode).toBe(1);
            // The report should contain the violations
            expect(result.report.violations.length).toBe(violationCount);
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 18.3: Infrastructure error → exit 1
   *
   * When an infrastructure error occurs (e.g., rule throws, git fails),
   * the exit code MUST be 1, which blocks the PR merge.
   */
  it(
    'Property 18.3: returns exit 1 when infrastructure error occurs',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (seed) => {
            const errorMessages = [
              'Git diff failed: repository not found',
              'File read timeout after 30s',
              'Out of memory',
              'Invalid git revspec',
              'Permission denied',
            ];

            const result = await runVersionGuard({
              diffBase: 'origin/main',
              repoRoot: '/test/repo',
              rules: [createThrowingRule(errorMessages[seed % errorMessages.length])],
              scanner: {
                getChangedFiles: () => Promise.resolve([]),
                getFileHunks: () => Promise.resolve({ added: [], removed: [] }),
                readFileWithSizeLimit: () => Promise.resolve(null),
              },
            });

            // Exit code MUST be 1 when infrastructure error occurs
            expect(result.exitCode).toBe(1);
            // The report should contain infrastructure error details
            expect(result.report.infrastructureError).toBeDefined();
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 18.4: Zero elapsed time with exit 0 is still successful
   *
   * Even if the guard completes in 0ms with exit 0, it should still
   * be considered successful and not block merge.
   */
  it(
    'Property 18.4: treats zero-elapsed exit 0 as successful',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 100 }),
          async (seed) => {
            const result = await runVersionGuard({
              diffBase: 'origin/main',
              repoRoot: '/test/repo',
              rules: [createNoViolationRule()],
              hardTimeoutMs: 30000,
              scanner: {
                getChangedFiles: () => Promise.resolve([]),
                getFileHunks: () => Promise.resolve({ added: [], removed: [] }),
                readFileWithSizeLimit: () => Promise.resolve(null),
              },
            });

            // Exit code 0 with any elapsed time is successful
            expect(result.exitCode).toBe(0);

            // The report should indicate successful run (no violations, no errors)
            expect(result.report.violations.length).toBe(0);
            expect(result.report.infrastructureError).toBeUndefined();
            expect(result.report.timedOut).toBeUndefined();
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 18.5: Both violations and infrastructure errors → exit 1
   *
   * When there are both violations AND infrastructure errors,
   * the exit code MUST still be 1.
   */
  it(
    'Property 18.5: returns exit 1 when both violations and errors exist',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 20 }),
          async (violationCount) => {
            const result = await runVersionGuard({
              diffBase: 'origin/main',
              repoRoot: '/test/repo',
              rules: [
                createViolationRule(violationCount),
                createThrowingRule('Simulated infrastructure failure'),
              ],
              scanner: {
                getChangedFiles: () => Promise.resolve([]),
                getFileHunks: () => Promise.resolve({ added: [], removed: [] }),
                readFileWithSizeLimit: () => Promise.resolve(null),
              },
            });

            // Exit code MUST be 1 (both violations and errors present)
            expect(result.exitCode).toBe(1);
            expect(result.report.violations.length).toBe(violationCount);
            expect(result.report.infrastructureError).toBeDefined();
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 18.6: Report contains required fields
   *
   * The violation report MUST contain schema_version, tool name,
   * violations array, and proper exit code mapping.
   */
  it(
    'Property 18.6: report contains all required fields',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 50 }),
          async (seed) => {
            const hasViolations = seed % 2 === 0;

            const result = await runVersionGuard({
              diffBase: 'origin/main',
              repoRoot: '/test/repo',
              rules: hasViolations
                ? [createViolationRule(seed)]
                : [createNoViolationRule()],
              scanner: {
                getChangedFiles: () => Promise.resolve([]),
                getFileHunks: () => Promise.resolve({ added: [], removed: [] }),
                readFileWithSizeLimit: () => Promise.resolve(null),
              },
            });

            // Verify required fields in report
            expect(result.report.schema_version).toBe('1.0');
            expect(result.report.tool).toBe('CI_Version_Guard');
            expect(result.report.diffBase).toBe('origin/main');
            expect(result.report.scannedFileCount).toBeDefined();
            expect(result.report.elapsedMs).toBeDefined();
            expect(Array.isArray(result.report.violations)).toBe(true);

            // Verify exit code matches report state
            if (result.report.violations.length > 0 || result.report.infrastructureError) {
              expect(result.exitCode).toBe(1);
            } else {
              expect(result.exitCode).toBe(0);
            }
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 18.7: Timeout also results in exit 1
   *
   * When the version guard times out, it should be treated as
   * an infrastructure error and return exit code 1.
   */
  it(
    'Property 18.7: timeout results in exit 1',
    async () => {
      // Create a rule that takes longer than the timeout
      const slowRule: VersionGuardRule = {
        name: 'slow-rule',
        check: async (): Promise<Violation[]> => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return [];
        },
      };

      const result = await runVersionGuard({
        diffBase: 'origin/main',
        repoRoot: '/test/repo',
        rules: [slowRule],
        hardTimeoutMs: 50, // Very short timeout
        scanner: {
          getChangedFiles: () => Promise.resolve([]),
          getFileHunks: () => Promise.resolve({ added: [], removed: [] }),
          readFileWithSizeLimit: () => Promise.resolve(null),
        },
      });

      // Exit code MUST be 1 on timeout
      expect(result.exitCode).toBe(1);
      expect(result.report.timedOut).toBe(true);
    }
  );
});