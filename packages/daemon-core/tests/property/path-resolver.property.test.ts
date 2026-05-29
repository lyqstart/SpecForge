/**
 * CP-1: Path Invariant Property Test
 *
 * Feature: daemon-core, CP-1: Path Invariant
 * Derived-From: TASK-1 (path-resolver)
 *
 * Property: For all valid projectPath inputs, resolveStatePath returns an
 * absolute path that does NOT contain ".." and ends with "state.json".
 *
 * Uses fast-check to generate random project paths, verifying the path
 * invariant holds for both PersonalPathResolver and EnterprisePathResolver.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as path from 'path';
import { PersonalPathResolver, EnterprisePathResolver, InvalidProjectPath } from '../../src/daemon/path-resolver';

// ── Arbitraries ──

/**
 * Generate a non-empty path segment (no slashes, no NUL, no backslash).
 */
const pathSegmentArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((s) => {
    if (s.includes('\0') || s.trim().length === 0) return false;
    if (s.includes('/') || s.includes('\\')) return false;
    return true;
  });

/**
 * Safe prefix that won't collide with critical system paths.
 * On POSIX this is /home ; on Windows this is D:\projects (or C:\projects).
 */
function safeProjectBase(): string {
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    // Use a safe drive letter; resolve ensures it's absolute on this system
    return path.resolve('C:\\projects');
  }
  return '/home';
}

/**
 * Generate an absolute project path like "/home/a/b/c" or "C:\projects\a\b\c".
 * Avoids critical system paths by using a known-safe prefix.
 */
const absolutePathArb = fc
  .array(pathSegmentArb, { minLength: 1, maxLength: 4 })
  .map((segments) => {
    const base = safeProjectBase();
    return path.join(base, ...segments);
  })
  .filter((p) => {
    // Ensure path.resolve doesn't land on a critical path (belt-and-suspenders)
    const resolved = path.resolve(p);
    // Must not be exactly root
    return resolved !== path.resolve('/');
  });

describe('CP-1: Path Invariant (resolveStatePath)', () => {
  const resolvers = [
    { name: 'PersonalPathResolver', resolver: new PersonalPathResolver() },
    { name: 'EnterprisePathResolver', resolver: new EnterprisePathResolver() },
  ];

  for (const { name, resolver } of resolvers) {
    describe(name, () => {
      it('should return absolute path without .. for valid inputs (fast-check)', () => {
        fc.assert(
          fc.property(absolutePathArb, (projectPath) => {
            let result: string;
            try {
              result = resolver.resolveStatePath(projectPath);
            } catch (e) {
              // Only InvalidProjectPath is acceptable; re-throw anything else
              if (e instanceof InvalidProjectPath) return;
              throw e;
            }

            // Invariant 1: result must be absolute
            expect(
              path.isAbsolute(result),
              `Expected absolute path, got "${result}" for input "${projectPath}"`,
            ).toBe(true);

            // Invariant 2: result must not contain ".."
            expect(
              result.includes('..'),
              `Path contains "..": "${result}" for input "${projectPath}"`,
            ).toBe(false);

            // Invariant 3: result must end with "state.json"
            const basename = path.basename(result);
            expect(basename).toBe('state.json');
          }),
          { numRuns: 200 },
        );
      });

      it('should handle edge-case paths without violating invariant', () => {
        const base = safeProjectBase();
        const edgeCases = [
          path.join(base, 'a'),
          path.join(base, 'a', 'b'),
          path.join(base, 'project'),
          path.join(base, 'my-project'),
          path.join(base, 'deep', 'nested', 'path', 'to', 'project'),
          path.join(base, 'project.with.dots'),
          path.join(base, 'project-with-hyphens'),
          path.join(base, 'project_with_underscores'),
        ];

        for (const projectPath of edgeCases) {
          const result = resolver.resolveStatePath(projectPath);
          expect(path.isAbsolute(result)).toBe(true);
          expect(result.includes('..')).toBe(false);
          expect(path.basename(result)).toBe('state.json');
        }
      });

      it('should reject empty projectPath', () => {
        expect(() => resolver.resolveStatePath('')).toThrow(InvalidProjectPath);
      });

      it('should reject whitespace-only projectPath', () => {
        expect(() => resolver.resolveStatePath('   ')).toThrow(InvalidProjectPath);
      });
    });
  }
});
