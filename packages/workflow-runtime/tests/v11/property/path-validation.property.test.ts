/**
 * Feature: specforge-v1-1-compliance-remediation
 * Property 1: Path Validation Consistency
 * Property 3: Legacy Spec Read-Only Enforcement
 *
 * Validates: Requirements 1.4-1.10, 1.11, 1.12
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PathPolicy } from '@/v11/runtime/PathPolicy';

describe('Property 1: Path Validation Consistency', () => {
  const policy = new PathPolicy();

  /**
   * For any path string, the Path_Policy validation SHALL consistently
   * apply all path rules and reject paths that violate any rule.
   */
  it('should consistently validate paths across multiple calls', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }),
        (path) => {
          const result1 = policy.validatePath(path);
          const result2 = policy.validatePath(path);
          // Must be consistent
          expect(result1.valid).toBe(result2.valid);
          expect(result1.reason).toBe(result2.reason);
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject all absolute paths', () => {
    fc.assert(
      fc.property(
        // Construct: "/" + arbitrary suffix to guarantee starts with "/"
        fc.tuple(fc.constant('/'), fc.string({ maxLength: 49 })),
        ([prefix, suffix]) => {
          const path = prefix + suffix;
          const result = policy.validatePath(path);
          return !result.valid;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject all paths with backslashes', () => {
    fc.assert(
      fc.property(
        // Construct: arbitrary prefix + "\\" + arbitrary suffix
        fc.tuple(fc.string({ maxLength: 24 }), fc.constant('\\'), fc.string({ maxLength: 24 })),
        ([prefix, sep, suffix]) => {
          const path = prefix + sep + suffix;
          const result = policy.validatePath(path);
          return !result.valid;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject all paths with .. traversal', () => {
    fc.assert(
      fc.property(
        // Construct: arbitrary prefix + ".." + arbitrary suffix
        fc.tuple(fc.string({ maxLength: 24 }), fc.constant('..'), fc.string({ maxLength: 24 })),
        ([prefix, dotdot, suffix]) => {
          const path = prefix + dotdot + suffix;
          const result = policy.validatePath(path);
          return !result.valid;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject all paths with ~', () => {
    fc.assert(
      fc.property(
        // Construct: arbitrary prefix + "~" + arbitrary suffix
        fc.tuple(fc.string({ maxLength: 24 }), fc.constant('~'), fc.string({ maxLength: 24 })),
        ([prefix, tilde, suffix]) => {
          const path = prefix + tilde + suffix;
          const result = policy.validatePath(path);
          return !result.valid;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 3: Legacy Spec Read-Only Enforcement', () => {
  const policy = new PathPolicy();

  /**
   * For any path matching .specforge/specs/**, the Runtime SHALL allow
   * read operations and SHALL block all write operations.
   */
  it('should block all writes to legacy spec paths for all callers', () => {
    const callers = ['agent', 'merge_runner', 'gate_runner', 'user_decision_recorder', 'state_machine'] as const;

    fc.assert(
      fc.property(
        // Construct: ".specforge/specs/" + arbitrary suffix
        fc.tuple(fc.constant('.specforge/specs/'), fc.string({ maxLength: 50 })),
        fc.constantFrom(...callers),
        ([prefix, suffix], caller) => {
          const path = prefix + suffix;
          const result = policy.canWriteToPath(path, caller);
          return !result.valid; // Must block
        },
      ),
      { numRuns: 100 },
    );
  });
});
