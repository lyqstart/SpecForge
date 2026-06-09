/**
 * Feature: specforge-v1-1-compliance-remediation
 * Property 2: Write Guard Protection Universality
 * Property 10: Tool Interception Completeness
 * Property 9: Permission-Based Write Control
 * Property 12: Frozen File Write Protection
 * Property 13: Privileged Component Write Authorization
 * Property 11: File Change Audit Accuracy
 * Property 15: Extension Registry Write Protection
 *
 * Validates: Requirements 4.1-4.29, 1.11, 3.29-3.33, 5.28-5.30
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { WriteGuard, CodePermissionService, ChangedFilesAudit } from '@/v11/runtime/WriteGuard';
import { PathPolicy, type PathCaller } from '@/v11/runtime/PathPolicy';

describe('Property 2: Write Guard Protection Universality', () => {
  /**
   * For any agent write attempt to protected paths, the Write Guard SHALL
   * block the operation regardless of tool type or context.
   */
  const protectedPaths = [
    '.specforge/project/requirements.md',
    '.specforge/project/design.md',
    '.specforge/project/extension_registry.json',
    '.specforge/specs/legacy.md',
    '.specforge/work-items/WI-0001/user_decision.json',
    '.specforge/work-items/WI-0001/gates/entry_gate.json',
    '.specforge/work-items/WI-0001/gate_summary.md',
    '.specforge/work-items/WI-0001/merge_report.md',
  ];

  it('should block all agent writes to protected paths', () => {
    const guard = new WriteGuard();
    const context = {
      workItemId: 'WI-0001',
      codeChangeAllowed: true,
      allowedWriteFiles: protectedPaths,
      frozenFiles: [],
      isWorkItemClosed: false,
    };

    fc.assert(
      fc.property(
        fc.constantFrom(...protectedPaths),
        (path) => {
          const result = guard.checkWrite({
            filePath: path,
            caller: 'agent',
            context,
          });
          return !result.allowed;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 10: Tool Interception Completeness', () => {
  /**
   * The Write Guard SHALL intercept all tool types and apply the same
   * write policy to each.
   */
  const toolTypes = ['edit', 'custom_write', 'bash', 'code_formatter', 'code_generator', 'package_manager', 'snapshot_update', 'git_operation'] as const;

  it('should intercept every tool type for unauthorized writes', () => {
    const guard = new WriteGuard();
    const context = {
      workItemId: 'WI-0001',
      codeChangeAllowed: true,
      allowedWriteFiles: ['src/authorized.ts'],
      frozenFiles: [],
      isWorkItemClosed: false,
    };

    fc.assert(
      fc.property(
        fc.constantFrom(...toolTypes),
        (tool) => {
          const result = guard.interceptToolWrite({
            toolType: tool,
            filePath: 'src/unauthorized.ts',
            caller: 'agent',
            context,
          });
          return !result.allowed;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 9: Permission-Based Write Control', () => {
  it('should block writes when no work item exists', () => {
    const guard = new WriteGuard();

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (path) => {
          const result = guard.checkWrite({
            filePath: path,
            caller: 'agent',
            context: {
              workItemId: undefined,
              codeChangeAllowed: true,
              allowedWriteFiles: [path],
              frozenFiles: [],
              isWorkItemClosed: false,
            },
          });
          return !result.allowed;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should block writes when code_change_allowed is false', () => {
    const guard = new WriteGuard();

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (path) => {
          const result = guard.checkWrite({
            filePath: path,
            caller: 'agent',
            context: {
              workItemId: 'WI-0001',
              codeChangeAllowed: false,
              allowedWriteFiles: [path],
              frozenFiles: [],
              isWorkItemClosed: false,
            },
          });
          return !result.allowed;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should block writes to files not in allowed_write_files', () => {
    const guard = new WriteGuard();

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s !== 'src/allowed.ts'),
        (allowedPath, writePath) => {
          const result = guard.checkWrite({
            filePath: writePath,
            caller: 'agent',
            context: {
              workItemId: 'WI-0001',
              codeChangeAllowed: true,
              allowedWriteFiles: [allowedPath],
              frozenFiles: [],
              isWorkItemClosed: false,
            },
          });
          if (writePath.replace(/\\/g, '/') === allowedPath.replace(/\\/g, '/')) return true;
          return !result.allowed;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 12: Frozen File Write Protection', () => {
  it('should block all writes to frozen files', () => {
    const guard = new WriteGuard();

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 60 }),
        (path) => {
          guard.freezeFile(path);
          const result = guard.checkWrite({
            filePath: path,
            caller: 'agent',
            context: {
              workItemId: 'WI-0001',
              codeChangeAllowed: true,
              allowedWriteFiles: [path],
              frozenFiles: [],
              isWorkItemClosed: false,
            },
          });
          return !result.allowed;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should block all writes when work item is closed', () => {
    const guard = new WriteGuard();

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (path) => {
          const result = guard.checkWrite({
            filePath: path,
            caller: 'agent',
            context: {
              workItemId: 'WI-0001',
              codeChangeAllowed: true,
              allowedWriteFiles: [path],
              frozenFiles: [],
              isWorkItemClosed: true,
            },
          });
          return !result.allowed;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 13: Privileged Component Write Authorization', () => {
  it('should allow merge_runner to write to project specs', () => {
    const guard = new WriteGuard();

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        (suffix) => {
          const path = `.specforge/project/${suffix}`;
          const result = guard.checkWrite({
            filePath: path,
            caller: 'merge_runner',
            context: {
              workItemId: 'WI-0001',
              codeChangeAllowed: true,
              allowedWriteFiles: [],
              frozenFiles: [],
              isWorkItemClosed: false,
            },
          });
          return result.allowed;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should allow user_decision_recorder to write to user_decision.json', () => {
    const guard = new WriteGuard();

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (wiId) => {
          const path = `.specforge/work-items/${wiId}/user_decision.json`;
          const result = guard.checkWrite({
            filePath: path,
            caller: 'user_decision_recorder',
            context: {
              workItemId: wiId,
              codeChangeAllowed: true,
              allowedWriteFiles: [],
              frozenFiles: [],
              isWorkItemClosed: false,
            },
          });
          return result.allowed;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should allow gate_runner to write to gates/** and gate_summary.md', () => {
    const guard = new WriteGuard();

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.boolean(),
        (wiId, isSummary) => {
          const path = isSummary
            ? `.specforge/work-items/${wiId}/gate_summary.md`
            : `.specforge/work-items/${wiId}/gates/entry.json`;
          const result = guard.checkWrite({
            filePath: path,
            caller: 'gate_runner',
            context: {
              workItemId: wiId,
              codeChangeAllowed: true,
              allowedWriteFiles: [],
              frozenFiles: [],
              isWorkItemClosed: false,
            },
          });
          return result.allowed;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 11: File Change Audit Accuracy', () => {
  it('should detect all escaped writes when actual exceeds expected', () => {
    const audit = new ChangedFilesAudit();

    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 10 }),
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
        (expectedFiles, extraFiles) => {
          // Only count as escaped files that are NOT in expected
          const expectedSet = new Set(expectedFiles.map((f) => f.replace(/\\/g, '/')));
          const trulyExtra = extraFiles.filter((f) => !expectedSet.has(f.replace(/\\/g, '/')));

          const actualFiles = [...expectedFiles, ...extraFiles];
          const incident = audit.auditFileChanges({
            expectedFiles,
            actualChangedFiles: actualFiles,
            command: 'npm test',
            workItemId: 'WI-0001',
          });

          if (trulyExtra.length === 0) {
            // No truly escaped files — audit should return null
            return incident === null;
          }

          if (incident === null) return false;

          // All truly extra files should appear in escapedWrites
          for (const extra of trulyExtra) {
            if (!incident.escapedWrites.some(
              (ew) => ew.replace(/\\/g, '/') === extra.replace(/\\/g, '/'),
            )) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return null when actual matches expected exactly', () => {
    const audit = new ChangedFilesAudit();

    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 10 }),
        (expectedFiles) => {
          const incident = audit.auditFileChanges({
            expectedFiles,
            actualChangedFiles: [...expectedFiles],
            command: 'npm test',
            workItemId: 'WI-0001',
          });
          return incident === null;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 15: Extension Registry Write Protection', () => {
  it('should block agent writes to extension_registry.json', () => {
    const guard = new WriteGuard();
    const context = {
      workItemId: 'WI-0001',
      codeChangeAllowed: true,
      allowedWriteFiles: ['.specforge/project/extension_registry.json'],
      frozenFiles: [],
      isWorkItemClosed: false,
    };

    fc.assert(
      fc.property(
        fc.constant('.specforge/project/extension_registry.json'),
        (path) => {
          const result = guard.checkWrite({
            filePath: path,
            caller: 'agent',
            context,
          });
          return !result.allowed;
        },
      ),
      { numRuns: 100 },
    );
  });
});
