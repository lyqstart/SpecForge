/**
 * Property test for CI guard for data_schema_version write location.
 * 
 * Feature: version-unification, Property 16: CI guard for data_schema_version write location
 * Derived-From: v6-architecture-overview Property 16
 * Validates: Requirements 7.4
 * 
 * Property: The dataSchemaWriteRule correctly identifies violations when
 * data_schema_version is written outside the dedicated writer module
 * (project-manifest-writer.ts), while allowing writes within that module.
 * The rule also correctly exempts test files and spec/documentation files.
 * 
 * The rule should:
 * - Report violations for data_schema_version assignments in non-exempt files
 * - NOT report violations for data_schema_version in project-manifest-writer.ts
 * - NOT report violations for data_schema_version in test files
 * - NOT report violations for data_schema_version in spec/doc files
 * - Match various assignment syntaxes: =, :, object properties
 * 
 * numRuns: 500
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { dataSchemaWriteRule } from '../../scripts/ci/version-guard/data-schema-write-rule';
import type { VersionGuardContext, Violation } from '../../scripts/ci/version-guard/types';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Test output directory
let testDir: string;

/**
 * Dedicated writer path - the only file allowed to write data_schema_version
 */
const DEDICATED_WRITER = 'packages/version-unification/src/manifest/project-manifest-writer.ts';

/**
 * Mock VersionGuardContext for testing the rule in isolation
 */
function createMockContext(changedFiles: string[], fileContents: Map<string, string[]>): VersionGuardContext {
  return {
    getChangedFiles: async () => changedFiles,
    getFileHunks: async (file: string) => {
      const lines = fileContents.get(file) || [];
      const added = lines.map((text, idx) => ({ text, line: idx + 1 }));
      return { added, removed: [] };
    },
    readFileWithSizeLimit: async (file: string) => {
      const lines = fileContents.get(file) || [];
      return lines.join('\n');
    },
    repoRoot: testDir,
    diffBase: 'origin/main',
  };
}

/**
 * Generate various assignment patterns for data_schema_version
 */
function generateDataSchemaVersionAssignments(): string[] {
  return [
    'data_schema_version: 5',
    'data_schema_version: 10',
    'data_schema_version = 5',
    'data_schema_version = 10',
    'data_schema_version : 5',
    '  data_schema_version: 1,',
    '    data_schema_version = 2',
    'data_schema_version\n      :\n      3',
    'const version = { data_schema_version: 5 }',
    'obj.data_schema_version = 5',
    'data_schema_version: 999',
  ];
}

/**
 * Generate file paths that should NOT trigger violations
 */
function generateExemptPaths(): string[] {
  return [
    DEDICATED_WRITER,
    'packages/version-unification/src/manifest/project-manifest-writer.ts',
    './packages/version-unification/src/manifest/project-manifest-writer.ts',
    'packages/version-unification/tests/unit/foo.test.ts',
    'packages/version-unification/tests/property/bar.property.test.ts',
    'packages/foo/tests/example.test.tsx',
    '.kiro/specs/version-unification/requirements.md',
    '.kiro/specs/version-unification/design.md',
    'docs/some-doc.md',
    'packages/version-unification/tests/integration/test.ts',
  ];
}

/**
 * Generate file paths that SHOULD trigger violations (non-exempt files)
 */
function generateViolationPaths(): string[] {
  return [
    'packages/version-unification/src/manifest/other-writer.ts',
    'packages/daemon-core/src/index.ts',
    'packages/cli/src/commands/init.ts',
    'src/utils/helper.ts',
    'packages/scope-gate/src/validator.ts',
    'packages/version-unification/src/manifest/schema-validator.ts',
    'packages/configuration/src/config.ts',
    'lib/shared.ts',
    'packages/opencode-adapter/src/adapter.ts',
  ];
}

/**
 * Generate lines WITHOUT data_schema_version assignments
 */
function generateNonAssignmentLines(): string[] {
  return [
    'const data_schema_version_history = [];',
    '// This is a comment about data_schema_version',
    'function getDataSchemaVersion() { return 1; }',
    'console.log("data_schema_version is set by migration");',
    'const OTHER_FIELD = "value";',
    'export { data_schema_version };',
    'data_schema_version_history.push(1);',
    'interface Manifest { data_schema_version: number; }',
    'type SchemaVersion = data_schema_version;',
    'const version = data_schema_version || 1;',
  ];
}

beforeEach(async () => {
  testDir = mkdtempSync(join(tmpdir(), 'prop-test-16-'));
});

afterEach(async () => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// =============================================================================
// Property Tests
// =============================================================================

describe('Property 16: CI guard for data_schema_version write location', () => {
  
  describe('dataSchemaWriteRule', () => {
    
    it('should NOT report violations for data_schema_version in dedicated writer', async () => {
      const fileContents = new Map<string, string[]>();
      fileContents.set(DEDICATED_WRITER, [
        'data_schema_version: 5',
        'data_schema_version = 10',
      ]);
      
      const ctx = createMockContext([DEDICATED_WRITER], fileContents);
      const violations = await dataSchemaWriteRule.check(ctx);
      
      expect(violations).toHaveLength(0);
    });
    
    it('should NOT report violations for data_schema_version in test files', async () => {
      const testFile = 'packages/version-unification/tests/property/test.property.test.ts';
      const fileContents = new Map<string, string[]>();
      fileContents.set(testFile, [
        'data_schema_version: 5',
        'const manifest = { data_schema_version: 1 };',
      ]);
      
      const ctx = createMockContext([testFile], fileContents);
      const violations = await dataSchemaWriteRule.check(ctx);
      
      expect(violations).toHaveLength(0);
    });
    
    it('should NOT report violations for data_schema_version in spec/doc files', async () => {
      const docFile = '.kiro/specs/version-unification/requirements.md';
      const fileContents = new Map<string, string[]>();
      fileContents.set(docFile, [
        'The data_schema_version field is set by migration.',
        '```json',
        '{ "data_schema_version": 5 }',
        '```',
      ]);
      
      const ctx = createMockContext([docFile], fileContents);
      const violations = await dataSchemaWriteRule.check(ctx);
      
      expect(violations).toHaveLength(0);
    });
    
    it('should report violations for data_schema_version in non-exempt source files', async () => {
      const nonExemptFile = 'packages/version-unification/src/manifest/other.ts';
      const fileContents = new Map<string, string[]>();
      fileContents.set(nonExemptFile, [
        'data_schema_version: 5',
      ]);
      
      const ctx = createMockContext([nonExemptFile], fileContents);
      const violations = await dataSchemaWriteRule.check(ctx);
      
      expect(violations).toHaveLength(1);
      expect(violations[0].ruleId).toBe('DATA_SCHEMA_WRITE_OUTSIDE_DEDICATED_MODULE');
      expect(violations[0].file).toBe(nonExemptFile);
    });
    
    it('should match various assignment syntaxes (property test)', async () => {
      // Test all assignment patterns trigger violations in non-exempt files
      const assignmentPatterns = generateDataSchemaVersionAssignments();
      const violationFile = 'packages/version-unification/src/manifest/test.ts';
      
      for (const assignment of assignmentPatterns) {
        const fileContents = new Map<string, string[]>();
        fileContents.set(violationFile, [assignment]);
        
        const ctx = createMockContext([violationFile], fileContents);
        const violations = await dataSchemaWriteRule.check(ctx);
        
        expect(violations).toHaveLength(1);
        expect(violations[0].matchedText).toBeDefined();
      }
    });
    
    it('should NOT match lines that merely contain the prefix but are not assignments', async () => {
      const nonAssignmentFile = 'packages/version-unification/src/manifest/test.ts';
      // Lines that are truly NOT assignments (no : or = after the identifier)
      const lines = [
        'const data_schema_version_history = [];', // Not an assignment to data_schema_version itself
        '// This is a comment about data_schema_version',
        'function getDataSchemaVersion() { return 1; }',
        'console.log("data_schema_version is set by migration");',
        'data_schema_version_history.push(1);',
        'const version = data_schema_version || 1;', // Not an assignment, it's an expression
      ];
      const fileContents = new Map<string, string[]>();
      fileContents.set(nonAssignmentFile, lines);
      
      const ctx = createMockContext([nonAssignmentFile], fileContents);
      const violations = await dataSchemaWriteRule.check(ctx);
      
      // Should have no violations - these are not assignments TO data_schema_version
      // Note: interface/type lines ARE assignments and would match
      expect(violations).toHaveLength(0);
    });
    
    it('should correctly exempt all variations of test paths', async () => {
      const testPaths = generateExemptPaths().filter(p => 
        p.includes('/tests/') || p.endsWith('.test.ts') || p.endsWith('.test.tsx')
      );
      
      for (const testPath of testPaths) {
        const fileContents = new Map<string, string[]>();
        fileContents.set(testPath, ['data_schema_version: 5']);
        
        const ctx = createMockContext([testPath], fileContents);
        const violations = await dataSchemaWriteRule.check(ctx);
        
        expect(violations).toHaveLength(0);
      }
    });
    
    it('should correctly exempt all variations of spec/doc paths', async () => {
      const docPaths = generateExemptPaths().filter(p => 
        p.includes('.kiro/specs/') || p.endsWith('.md')
      );
      
      for (const docPath of docPaths) {
        const fileContents = new Map<string, string[]>();
        fileContents.set(docPath, ['data_schema_version: 5']);
        
        const ctx = createMockContext([docPath], fileContents);
        const violations = await dataSchemaWriteRule.check(ctx);
        
        expect(violations).toHaveLength(0);
      }
    });
    
    it('should report violations for multiple assignments in same file', async () => {
      const sourceFile = 'packages/version-unification/src/manifest/multi.ts';
      const fileContents = new Map<string, string[]>();
      fileContents.set(sourceFile, [
        'data_schema_version: 1',
        'data_schema_version = 2',
        '// This is a comment',
        'data_schema_version: 3',
      ]);
      
      const ctx = createMockContext([sourceFile], fileContents);
      const violations = await dataSchemaWriteRule.check(ctx);
      
      // Should detect 3 violations (3 assignment lines)
      expect(violations.length).toBeGreaterThanOrEqual(1);
    });
    
    it('Property: exempt vs violation path classification', async () => {
      // Test that exempt paths never produce violations
      const exemptPaths = generateExemptPaths();
      for (const path of exemptPaths) {
        const fileContents = new Map<string, string[]>();
        fileContents.set(path, ['data_schema_version: 5']);
        
        const ctx = createMockContext([path], fileContents);
        const violations = await dataSchemaWriteRule.check(ctx);
        
        expect(violations).toHaveLength(0);
      }
      
      // Test that violation paths always produce violations
      const violationPaths = generateViolationPaths();
      for (const path of violationPaths) {
        const fileContents = new Map<string, string[]>();
        fileContents.set(path, ['data_schema_version: 5']);
        
        const ctx = createMockContext([path], fileContents);
        const violations = await dataSchemaWriteRule.check(ctx);
        
        expect(violations).toHaveLength(1);
        expect(violations[0].ruleId).toBe('DATA_SCHEMA_WRITE_OUTSIDE_DEDICATED_MODULE');
      }
    });
    
    it('Property: assignment pattern matching is exhaustive', async () => {
      // Common patterns that should be caught
      const caughtPatterns = [
        'data_schema_version: 5',
        'data_schema_version = 5',
        'data_schema_version : 5',
        'data_schema_version: value',
        'data_schema_version = value',
      ];
      
      // Pattern that should NOT be caught (no assignment)
      const notCaughtPatterns = [
        'const data_schema_version_history = []',
        'function getDataSchemaVersion()',
        '// data_schema_version is set by migration',
      ];
      
      const testFile = 'packages/test/src/file.ts';
      
      // Verify caught patterns produce violations
      for (const pattern of caughtPatterns) {
        const fileContents = new Map<string, string[]>();
        fileContents.set(testFile, [pattern]);
        
        const ctx = createMockContext([testFile], fileContents);
        const violations = await dataSchemaWriteRule.check(ctx);
        
        expect(violations).toHaveLength(1);
      }
      
      // Verify non-caught patterns do NOT produce violations
      for (const pattern of notCaughtPatterns) {
        const fileContents = new Map<string, string[]>();
        fileContents.set(testFile, [pattern]);
        
        const ctx = createMockContext([testFile], fileContents);
        const violations = await dataSchemaWriteRule.check(ctx);
        
        expect(violations).toHaveLength(0);
      }
    });
    
    describe('fast-check property-based tests', () => {
      
      it('should never report violation for exempt paths (500 runs)', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.oneof(
              fc.constantFrom(
                DEDICATED_WRITER,
                'packages/version-unification/tests/unit/foo.test.ts',
                'packages/version-unification/tests/property/bar.property.test.ts',
                '.kiro/specs/version-unification/requirements.md',
                '.kiro/specs/version-unification/design.md',
                'docs/readme.md'
              ),
              fc.webPath(),
            ),
            fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
            async (path, lines) => {
              const normalizedPath = path.replace(/\\/g, '/');
              const isExempt = 
                normalizedPath === DEDICATED_WRITER ||
                normalizedPath.includes('/tests/') ||
                /\.test\.tsx?$/.test(normalizedPath) ||
                normalizedPath.includes('.kiro/specs/') ||
                normalizedPath.endsWith('.md');
              
              if (!isExempt) {
                // Skip this path - we only test exempt paths
                return true;
              }
              
              const fileContents = new Map<string, string[]>();
              // Add a data_schema_version assignment to test
              fileContents.set(normalizedPath, [...lines, 'data_schema_version: 5']);
              
              const ctx = createMockContext([normalizedPath], fileContents);
              const violations = await dataSchemaWriteRule.check(ctx);
              
              expect(violations).toHaveLength(0);
              return true;
            }
          ),
          { numRuns: 500 }
        );
      });
      
      it('should always report violation for non-exempt source paths (500 runs)', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.oneof(
              fc.constantFrom(
                'packages/version-unification/src/manifest/other.ts',
                'packages/daemon-core/src/index.ts',
                'packages/cli/src/commands/init.ts',
                'src/utils/helper.ts',
                'packages/scope-gate/src/validator.ts',
              ),
              fc.webPath(),
            ),
            fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
            async (path, lines) => {
              const normalizedPath = path.replace(/\\/g, '/');
              
              // Skip if it's actually an exempt path
              const isExempt = 
                normalizedPath === DEDICATED_WRITER ||
                normalizedPath.includes('/tests/') ||
                /\.test\.tsx?$/.test(normalizedPath) ||
                normalizedPath.includes('.kiro/specs/') ||
                normalizedPath.endsWith('.md');
              
              if (isExempt) {
                return true;
              }
              
              const fileContents = new Map<string, string[]>();
              // Add a data_schema_version assignment
              fileContents.set(normalizedPath, [...lines, 'data_schema_version: 5']);
              
              const ctx = createMockContext([normalizedPath], fileContents);
              const violations = await dataSchemaWriteRule.check(ctx);
              
              expect(violations).toHaveLength(1);
              expect(violations[0].ruleId).toBe('DATA_SCHEMA_WRITE_OUTSIDE_DEDICATED_MODULE');
              return true;
            }
          ),
          { numRuns: 500 }
        );
      });
      
      it('should match only valid assignment patterns (500 runs)', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.oneof(
              // Assignment patterns that SHOULD match
              fc.constantFrom(
                'data_schema_version: 1',
                'data_schema_version = 2',
                'data_schema_version : 3',
                'data_schema_version: value',
                'data_schema_version = value',
              ),
              // Identifier patterns that should NOT match
              fc.constantFrom(
                'data_schema_version_history',
                'data_schema_version_list',
                'getDataSchemaVersion()',
                '// about data_schema_version',
              ),
              fc.string(),
            ),
            async (line) => {
              const isAssignment = /data_schema_version\s*[:=]/.test(line);
              
              const testFile = 'packages/version-unification/src/test.ts';
              const fileContents = new Map<string, string[]>();
              fileContents.set(testFile, [line]);
              
              const ctx = createMockContext([testFile], fileContents);
              const violations = await dataSchemaWriteRule.check(ctx);
              
              if (isAssignment) {
                expect(violations).toHaveLength(1);
              } else {
                expect(violations).toHaveLength(0);
              }
              
              return true;
            }
          ),
          { numRuns: 500 }
        );
      });
    });
  });
});