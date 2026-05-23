/**
 * Property test for CI guard schema-introduction aggregated report.
 * 
 * Feature: version-unification, Property 17: CI guard schema-introduction aggregated report
 * Derived-From: v6-architecture-overview Property 17
 * Validates: Requirements 8.1, 8.2
 * 
 * Requirement 8.1: New schema version N must include:
 *   1. Migration_Script for version pair (N-1, N)
 *   2. Updated read-write code paths for schema version N
 *   3. Automated tests covering both N-1 and N
 *   4. Decision record under docs/schema-versions/
 * 
 * Requirement 8.2: CI_Version_Guard SHALL collect every missing artifact 
 * across the full pull request, reject the pull request, and emit a single 
 * report that names every missing artifact together rather than failing on 
 * the first miss.
 * 
 * Property 17: The rule collects ALL missing artifacts for each new schema N 
 * before returning, never breaking on the first missing artifact.
 * 
 * numRuns: 500
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { createSchemaIntroductionRule, type ReadPreImageFn } from '../../../../scripts/ci/version-guard/schema-introduction-rule';
import type { VersionGuardContext, Violation } from '../../../../scripts/ci/version-guard/types';

// =============================================================================
// Mock Context Setup
// =============================================================================

/** Four artifact paths that are required for each new schema version N */
const ARTIFACT_TYPES = [
  'migrationScript',
  'forwardTest', 
  'idempotenceTest',
  'decisionRecord',
] as const;

type ArtifactType = typeof ARTIFACT_TYPES[number];

/** Build the expected artifact paths for a given schema version N */
function buildArtifactPaths(n: number): Record<ArtifactType, string> {
  return {
    migrationScript: `packages/version-unification/src/migration/scripts/${n}.ts`,
    forwardTest: `packages/version-unification/tests/unit/migrations/${n}.test.ts`,
    idempotenceTest: `packages/version-unification/tests/unit/migrations/${n}.idempotence.test.ts`,
    decisionRecord: `docs/schema-versions/${n}.md`,
  };
}

/** 
 * Creates a mock VersionGuardContext that simulates file presence/absence 
 * based on the provided configuration.
 */
function createMockContext(
  config: {
    /** Map of file path -> file content (null = file does not exist) */
    fileContents: Map<string, string | null>;
    /** Changed files in the PR */
    changedFiles: string[];
    /** HIGHEST_KNOWN_SCHEMA value in constants.ts (null = file absent) */
    constantsContent: string | null;
    /** HIGHEST_KNOWN_SCHEMA value in pre-image constants.ts (null = file absent) */
    oldConstantsContent: string | null;
  },
): VersionGuardContext {
  return {
    diffBase: 'main',
    repoRoot: '/mock/repo',
    
    getChangedFiles: async () => config.changedFiles,
    
    getFileHunks: async () => ({
      hunks: [],
    }),
    
    readFileWithSizeLimit: async (file: string) => {
      // Special handling for constants.ts
      if (file === 'packages/version-unification/src/constants.ts') {
        return config.constantsContent;
      }
      return config.fileContents.get(file) ?? null;
    },
  };
}

/** Mock pre-image reader - simulates git show behavior */
function createMockPreImageReader(
  config: {
    fileContents: Map<string, string | null>;
    oldConstantsContent: string | null;
  },
): ReadPreImageFn {
  return async (_diffBase: string, file: string, _cwd: string) => {
    if (file === 'packages/version-unification/src/constants.ts') {
      return config.oldConstantsContent;
    }
    return config.fileContents.get(file) ?? null;
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('Property 17: CI guard schema-introduction aggregated report', () => {
  
  /**
   * Property: When all four required artifacts are present for a new schema N,
   * no violation should be reported.
   */
  describe('All artifacts present - no violation', () => {
    
    it('should return empty violations when migration script, tests, and decision record all exist', async () => {
      // Scenario: Schema version 5 is introduced, all artifacts present
      const fileContents = new Map<string, string | null>();
      const paths = buildArtifactPaths(5);
      
      // All four artifacts exist
      fileContents.set(paths.migrationScript, '// migration script content');
      fileContents.set(paths.forwardTest, '// forward test content');
      fileContents.set(paths.idempotenceTest, '// idempotence test content');
      fileContents.set(paths.decisionRecord, '# Schema 5 Decision Record');
      fileContents.set('packages/version-unification/src/constants.ts', 'export const HIGHEST_KNOWN_SCHEMA: number = 5;');
      
      const mockPreImage = createMockPreImageReader({
        fileContents,
        oldConstantsContent: 'export const HIGHEST_KNOWN_SCHEMA: number = 4;',
      });
      
      const rule = createSchemaIntroductionRule({ readPreImage: mockPreImage });
      const ctx = createMockContext({
        fileContents,
        changedFiles: [paths.migrationScript], // Signal via migration script
        constantsContent: 'export const HIGHEST_KNOWN_SCHEMA: number = 5;',
      });
      
      const violations = await rule.check(ctx);
      
      // No violations because all artifacts are present
      expect(violations).toHaveLength(0);
    });
    
    it('Property: all artifacts present yields zero violations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }), // schema version N
          async (n) => {
            const fileContents = new Map<string, string | null>();
            const paths = buildArtifactPaths(n);
            
            // All four artifacts exist
            fileContents.set(paths.migrationScript, 'content');
            fileContents.set(paths.forwardTest, 'content');
            fileContents.set(paths.idempotenceTest, 'content');
            fileContents.set(paths.decisionRecord, 'content');
            fileContents.set('packages/version-unification/src/constants.ts', `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`);
            
            const oldN = n - 1;
            const mockPreImage: ReadPreImageFn = async () => 
              `export const HIGHEST_KNOWN_SCHEMA: number = ${oldN};`;
            
            const rule = createSchemaIntroductionRule({ readPreImage: mockPreImage });
            const ctx = createMockContext({
              fileContents,
              changedFiles: [paths.migrationScript],
              constantsContent: `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`,
            });
            
            const violations = await rule.check(ctx);
            
            // Must return empty array when all artifacts present
            expect(violations).toEqual([]);
          },
        ),
        { numRuns: 50 },
      );
    });
  });
  
  /**
   * Property: When one or more artifacts are missing, the rule should collect
   * ALL missing artifacts and report them in a single violation (not fail on first miss).
   */
  describe('Missing artifacts - aggregation behavior (R8.2)', () => {
    
    it('should report all four missing artifacts when none exist', async () => {
      const fileContents = new Map<string, string | null>();
      const n = 5;
      const paths = buildArtifactPaths(n);
      
      // None of the four artifacts exist
      fileContents.set(paths.migrationScript, null);
      fileContents.set(paths.forwardTest, null);
      fileContents.set(paths.idempotenceTest, null);
      fileContents.set(paths.decisionRecord, null);
      fileContents.set('packages/version-unification/src/constants.ts', `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`);
      
      const oldN = n - 1;
      const mockPreImage: ReadPreImageFn = async () => 
        `export const HIGHEST_KNOWN_SCHEMA: number = ${oldN};`;
      
      const rule = createSchemaIntroductionRule({ readPreImage: mockPreImage });
      const ctx = createMockContext({
        fileContents,
        changedFiles: [], // Signal via constants bump
        constantsContent: `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`,
      });
      
      const violations = await rule.check(ctx);
      
      // Should have exactly one violation with all 4 missing artifacts
      expect(violations).toHaveLength(1);
      expect(violations[0]!.ruleId).toBe('SCHEMA_INTRODUCTION_INCOMPLETE');
      expect(violations[0]!.details).toEqual({
        schema: n,
        missingArtifacts: [
          paths.migrationScript,
          paths.forwardTest,
          paths.idempotenceTest,
          paths.decisionRecord,
        ],
      });
    });
    
    it('should aggregate exactly three missing artifacts when only migration script exists', async () => {
      const fileContents = new Map<string, string | null>();
      const n = 7;
      const paths = buildArtifactPaths(n);
      
      // Only migration script exists, other three are missing
      fileContents.set(paths.migrationScript, '// migration script content');
      fileContents.set(paths.forwardTest, null);
      fileContents.set(paths.idempotenceTest, null);
      fileContents.set(paths.decisionRecord, null);
      fileContents.set('packages/version-unification/src/constants.ts', `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`);
      
      const oldN = n - 1;
      const mockPreImage: ReadPreImageFn = async () => 
        `export const HIGHEST_KNOWN_SCHEMA: number = ${oldN};`;
      
      const rule = createSchemaIntroductionRule({ readPreImage: mockPreImage });
      const ctx = createMockContext({
        fileContents,
        changedFiles: [],
        constantsContent: `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`,
      });
      
      const violations = await rule.check(ctx);
      
      expect(violations).toHaveLength(1);
      expect(violations[0]!.details?.missingArtifacts).toHaveLength(3);
      expect(violations[0]!.details?.missingArtifacts).toContain(paths.forwardTest);
      expect(violations[0]!.details?.missingArtifacts).toContain(paths.idempotenceTest);
      expect(violations[0]!.details?.missingArtifacts).toContain(paths.decisionRecord);
      // Migration script should NOT be in missing list
      expect(violations[0]!.details?.missingArtifacts).not.toContain(paths.migrationScript);
    });
    
    it('should aggregate exactly two missing artifacts when only tests exist', async () => {
      const fileContents = new Map<string, string | null>();
      const n = 3;
      const paths = buildArtifactPaths(n);
      
      // Only tests exist, migration script and decision record are missing
      fileContents.set(paths.migrationScript, null);
      fileContents.set(paths.forwardTest, '// forward test content');
      fileContents.set(paths.idempotenceTest, '// idempotence test content');
      fileContents.set(paths.decisionRecord, null);
      fileContents.set('packages/version-unification/src/constants.ts', `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`);
      
      const oldN = n - 1;
      const mockPreImage: ReadPreImageFn = async () => 
        `export const HIGHEST_KNOWN_SCHEMA: number = ${oldN};`;
      
      const rule = createSchemaIntroductionRule({ readPreImage: mockPreImage });
      const ctx = createMockContext({
        fileContents,
        changedFiles: [],
        constantsContent: `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`,
      });
      
      const violations = await rule.check(ctx);
      
      expect(violations).toHaveLength(1);
      expect(violations[0]!.details?.missingArtifacts).toHaveLength(2);
      expect(violations[0]!.details?.missingArtifacts).toContain(paths.migrationScript);
      expect(violations[0]!.details?.missingArtifacts).toContain(paths.decisionRecord);
    });
    
    /**
     * Core Property: The rule never breaks on first missing artifact.
     * It collects ALL missing artifacts across the full PR.
     */
    it('Property: aggregation collects ALL missing, never first-miss-only', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }), // schema version N
          fc.nat(15), // 0-15 representing which artifacts are present (4-bit mask)
          async (n, mask) => {
            const fileContents = new Map<string, string | null>();
            const paths = buildArtifactPaths(n);
            
            // Decode mask: bit 0=migration, bit 1=forwardTest, bit 2=idempotence, bit 3=decisionRecord
            const hasMigration = (mask & 1) !== 0;
            const hasForwardTest = (mask & 2) !== 0;
            const hasIdempotenceTest = (mask & 4) !== 0;
            const hasDecisionRecord = (mask & 8) !== 0;
            
            const existingCount = [hasMigration, hasForwardTest, hasIdempotenceTest, hasDecisionRecord].filter(Boolean).length;
            
            if (hasMigration) fileContents.set(paths.migrationScript, 'content');
            if (hasForwardTest) fileContents.set(paths.forwardTest, 'content');
            if (hasIdempotenceTest) fileContents.set(paths.idempotenceTest, 'content');
            if (hasDecisionRecord) fileContents.set(paths.decisionRecord, 'content');
            
            fileContents.set('packages/version-unification/src/constants.ts', `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`);
            
            const oldN = n - 1;
            const mockPreImage: ReadPreImageFn = async () => 
              `export const HIGHEST_KNOWN_SCHEMA: number = ${oldN};`;
            
            const rule = createSchemaIntroductionRule({ readPreImage: mockPreImage });
            const ctx = createMockContext({
              fileContents,
              changedFiles: [],
              constantsContent: `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`,
            });
            
            const violations = await rule.check(ctx);
            
            // Count expected missing
            const expectedMissingCount = 4 - existingCount;
            
            if (expectedMissingCount === 0) {
              // All present -> no violation
              expect(violations).toHaveLength(0);
            } else {
              // Some missing -> exactly one violation
              expect(violations).toHaveLength(1);
              expect(violations[0]!.ruleId).toBe('SCHEMA_INTRODUCTION_INCOMPLETE');
              expect(violations[0]!.details).toEqual({
                schema: n,
                missingArtifacts: expect.arrayContaining([
                  expect.any(String),
                ]),
              });
              
              // The count of missing artifacts should be exactly what's expected
              const missingList = violations[0]!.details?.missingArtifacts as string[];
              expect(missingList).toHaveLength(expectedMissingCount);
              
              // Verify each artifact is correctly reported as missing or present
              if (!hasMigration) {
                expect(missingList).toContain(paths.migrationScript);
              }
              if (!hasForwardTest) {
                expect(missingList).toContain(paths.forwardTest);
              }
              if (!hasIdempotenceTest) {
                expect(missingList).toContain(paths.idempotenceTest);
              }
              if (!hasDecisionRecord) {
                expect(missingList).toContain(paths.decisionRecord);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
  
  /**
   * Property: When multiple schema versions are introduced (e.g., N=3,4,5),
   * each schema should get its own violation with its own missing list.
   */
  describe('Multiple schema versions - separate violations per schema', () => {
    
    it('should create separate violation for each new schema version', async () => {
      const fileContents = new Map<string, string | null>();
      
      // Schema 3: all missing
      // Schema 4: only migration script exists
      // Schema 5: all present
      
      const paths3 = buildArtifactPaths(3);
      const paths4 = buildArtifactPaths(4);
      const paths5 = buildArtifactPaths(5);
      
      // Schema 3: all missing
      fileContents.set(paths3.migrationScript, null);
      fileContents.set(paths3.forwardTest, null);
      fileContents.set(paths3.idempotenceTest, null);
      fileContents.set(paths3.decisionRecord, null);
      
      // Schema 4: only migration script exists
      fileContents.set(paths4.migrationScript, '// migration script');
      fileContents.set(paths4.forwardTest, null);
      fileContents.set(paths4.idempotenceTest, null);
      fileContents.set(paths4.decisionRecord, null);
      
      // Schema 5: all present
      fileContents.set(paths5.migrationScript, '// migration script');
      fileContents.set(paths5.forwardTest, '// forward test');
      fileContents.set(paths5.idempotenceTest, '// idempotence test');
      fileContents.set(paths5.decisionRecord, '# Schema 5');
      
      // Constants shows bump from 2 to 5
      fileContents.set('packages/version-unification/src/constants.ts', 'export const HIGHEST_KNOWN_SCHEMA: number = 5;');
      
      const mockPreImage: ReadPreImageFn = async () => 
        'export const HIGHEST_KNOWN_SCHEMA: number = 2;';
      
      const rule = createSchemaIntroductionRule({ readPreImage: mockPreImage });
      const ctx = createMockContext({
        fileContents,
        changedFiles: [],
        constantsContent: 'export const HIGHEST_KNOWN_SCHEMA: number = 5;',
      });
      
      const violations = await rule.check(ctx);
      
      // Should have 2 violations: one for schema 3 (all 4 missing), one for schema 4 (3 missing)
      expect(violations).toHaveLength(2);
      
      // Find violations by schema number
      const schema3Violation = violations.find(v => v.details?.schema === 3);
      const schema4Violation = violations.find(v => v.details?.schema === 4);
      
      expect(schema3Violation).toBeDefined();
      expect(schema3Violation!.details?.missingArtifacts).toHaveLength(4);
      
      expect(schema4Violation).toBeDefined();
      expect(schema4Violation!.details?.missingArtifacts).toHaveLength(3);
      
      // Schema 5 should not appear in violations (all artifacts present)
      expect(violations.find(v => v.details?.schema === 5)).toBeUndefined();
    });
    
    it('Property: multiple schemas each get aggregated missing list', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.integer({ min: 1, max: 10 }), // starting schema
            fc.integer({ min: 1, max: 3 }),  // how many new schemas to add
          ),
          async ([startN, count]) => {
            const fileContents = new Map<string, string | null>();
            
            // Create schemas from startN+1 to startN+count
            const newSchemas: number[] = [];
            for (let i = 1; i <= count; i++) {
              newSchemas.push(startN + i);
            }
            
            // For each new schema, randomly decide what's present
            for (const n of newSchemas) {
              const paths = buildArtifactPaths(n);
              const hasMigration = Math.random() > 0.5;
              const hasForwardTest = Math.random() > 0.5;
              const hasIdempotenceTest = Math.random() > 0.5;
              const hasDecisionRecord = Math.random() > 0.5;
              
              if (hasMigration) fileContents.set(paths.migrationScript, 'content');
              if (hasForwardTest) fileContents.set(paths.forwardTest, 'content');
              if (hasIdempotenceTest) fileContents.set(paths.idempotenceTest, 'content');
              if (hasDecisionRecord) fileContents.set(paths.decisionRecord, 'content');
            }
            
            const highestN = startN + count;
            fileContents.set('packages/version-unification/src/constants.ts', 
              `export const HIGHEST_KNOWN_SCHEMA: number = ${highestN};`);
            
            const mockPreImage: ReadPreImageFn = async () => 
              `export const HIGHEST_KNOWN_SCHEMA: number = ${startN};`;
            
            const rule = createSchemaIntroductionRule({ readPreImage: mockPreImage });
            const ctx = createMockContext({
              fileContents,
              changedFiles: [],
              constantsContent: `export const HIGHEST_KNOWN_SCHEMA: number = ${highestN};`,
            });
            
            const violations = await rule.check(ctx);
            
            // Each schema with missing artifacts should have exactly one violation
            for (const n of newSchemas) {
              const paths = buildArtifactPaths(n);
              const hasMigration = fileContents.has(paths.migrationScript);
              const hasForwardTest = fileContents.has(paths.forwardTest);
              const hasIdempotenceTest = fileContents.has(paths.idempotenceTest);
              const hasDecisionRecord = fileContents.has(paths.decisionRecord);
              
              const missingCount = [hasMigration, hasForwardTest, hasIdempotenceTest, hasDecisionRecord]
                .filter(x => !x).length;
              
              if (missingCount === 0) {
                // All present - no violation for this schema
                expect(violations.find(v => v.details?.schema === n)).toBeUndefined();
              } else {
                // Some missing - must have exactly one violation with all missing items
                const schemaViolation = violations.find(v => v.details?.schema === n);
                expect(schemaViolation).toBeDefined();
                const missingList = schemaViolation!.details?.missingArtifacts as string[];
                expect(missingList).toHaveLength(missingCount);
              }
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });
  
  /**
   * Property: Signal detection - both via HIGHEST_KNOWN_SCHEMA bump AND via 
   * new migration script files added in PR.
   */
  describe('Signal detection - constants bump OR new migration script', () => {
    
    it('should detect new schema via constants.ts bump', async () => {
      const fileContents = new Map<string, string | null>();
      const n = 10;
      const paths = buildArtifactPaths(n);
      
      fileContents.set('packages/version-unification/src/constants.ts', `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`);
      
      // All artifacts missing
      fileContents.set(paths.migrationScript, null);
      fileContents.set(paths.forwardTest, null);
      fileContents.set(paths.idempotenceTest, null);
      fileContents.set(paths.decisionRecord, null);
      
      const mockPreImage: ReadPreImageFn = async () => 
        `export const HIGHEST_KNOWN_SCHEMA: number = ${n - 1};`;
      
      const rule = createSchemaIntroductionRule({ readPreImage: mockPreImage });
      const ctx = createMockContext({
        fileContents,
        changedFiles: [], // No files changed, signal via constants
        constantsContent: `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`,
      });
      
      const violations = await rule.check(ctx);
      
      // Should detect schema 10 via constants bump
      expect(violations).toHaveLength(1);
      expect(violations[0]!.details?.schema).toBe(n);
    });
    
    it('should detect new schema via new migration script file in PR', async () => {
      const fileContents = new Map<string, string | null>();
      const n = 8;
      const paths = buildArtifactPaths(n);
      
      // Constants unchanged, but migration script added in PR
      fileContents.set('packages/version-unification/src/constants.ts', 'export const HIGHEST_KNOWN_SCHEMA: number = 5;');
      
      // Migration script exists (added in this PR)
      fileContents.set(paths.migrationScript, '// new migration script');
      fileContents.set(paths.forwardTest, null);
      fileContents.set(paths.idempotenceTest, null);
      fileContents.set(paths.decisionRecord, null);
      
      // Pre-image: migration script doesn't exist
      const mockPreImage: ReadPreImageFn = async (_diffBase, file) => {
        if (file === paths.migrationScript) return null; // File added in PR
        if (file === 'packages/version-unification/src/constants.ts') return 'export const HIGHEST_KNOWN_SCHEMA: number = 5;';
        return null;
      };
      
      const rule = createSchemaIntroductionRule({ readPreImage: mockPreImage });
      const ctx = createMockContext({
        fileContents,
        changedFiles: [paths.migrationScript], // Migration script is in changed files
        constantsContent: 'export const HIGHEST_KNOWN_SCHEMA: number = 5;',
      });
      
      const violations = await rule.check(ctx);
      
      // Should detect schema 8 via new migration script file
      expect(violations).toHaveLength(1);
      expect(violations[0]!.details?.schema).toBe(8);
    });
    
    it('Property: both signals are collected and deduplicated', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (n) => {
            const fileContents = new Map<string, string | null>();
            const paths = buildArtifactPaths(n);
            
            // Both signals point to same schema N
            // Constants bump from n-1 to n
            fileContents.set('packages/version-unification/src/constants.ts', 
              `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`);
            
            // All artifacts missing
            fileContents.set(paths.migrationScript, null);
            fileContents.set(paths.forwardTest, null);
            fileContents.set(paths.idempotenceTest, null);
            fileContents.set(paths.decisionRecord, null);
            
            const mockPreImage: ReadPreImageFn = async () => 
              `export const HIGHEST_KNOWN_SCHEMA: number = ${n - 1};`;
            
            const rule = createSchemaIntroductionRule({ readPreImage: mockPreImage });
            const ctx = createMockContext({
              fileContents,
              changedFiles: [paths.migrationScript], // Also signal via migration script
              constantsContent: `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`,
            });
            
            const violations = await rule.check(ctx);
            
            // Should only get ONE violation even with both signals
            // (deduplicated)
            expect(violations).toHaveLength(1);
            expect(violations[0]!.details?.schema).toBe(n);
          },
        ),
        { numRuns: 30 },
      );
    });
  });
  
  /**
   * Final verification: The complete property test with 500 runs
   */
  describe('Full property verification (500 runs)', () => {
    it('Property 17: aggregated report collects ALL missing artifacts per schema', async () => {
      let passed = 0;
      let failed = 0;
      
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }), // schema version N
          fc.oneof(
            fc.constant('none' as const),     // all 4 missing
            fc.constant('migration' as const), // only migration present
            fc.constant('tests' as const),     // tests present, others missing
            fc.constant('partial' as const),   // random mix
          ),
          async (n, scenario) => {
            const fileContents = new Map<string, string | null>();
            const paths = buildArtifactPaths(n);
            
            // Set up scenario
            if (scenario === 'none') {
              // All missing - nothing to set
            } else if (scenario === 'migration') {
              fileContents.set(paths.migrationScript, 'content');
            } else if (scenario === 'tests') {
              fileContents.set(paths.forwardTest, 'content');
              fileContents.set(paths.idempotenceTest, 'content');
            } else if (scenario === 'partial') {
              // Random selection
              if (Math.random() > 0.5) fileContents.set(paths.migrationScript, 'content');
              if (Math.random() > 0.5) fileContents.set(paths.forwardTest, 'content');
              if (Math.random() > 0.5) fileContents.set(paths.idempotenceTest, 'content');
              if (Math.random() > 0.5) fileContents.set(paths.decisionRecord, 'content');
            }
            
            fileContents.set('packages/version-unification/src/constants.ts', 
              `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`);
            
            const oldN = n - 1;
            const mockPreImage: ReadPreImageFn = async () => 
              `export const HIGHEST_KNOWN_SCHEMA: number = ${oldN};`;
            
            const rule = createSchemaIntroductionRule({ readPreImage: mockPreImage });
            const ctx = createMockContext({
              fileContents,
              changedFiles: [],
              constantsContent: `export const HIGHEST_KNOWN_SCHEMA: number = ${n};`,
            });
            
            const violations = await rule.check(ctx);
            
            // Core verification: the rule aggregates ALL missing artifacts
            const migrationExists = fileContents.has(paths.migrationScript);
            const forwardTestExists = fileContents.has(paths.forwardTest);
            const idempotenceTestExists = fileContents.has(paths.idempotenceTest);
            const decisionRecordExists = fileContents.has(paths.decisionRecord);
            
            const expectedMissing = [
              !migrationExists ? paths.migrationScript : null,
              !forwardTestExists ? paths.forwardTest : null,
              !idempotenceTestExists ? paths.idempotenceTest : null,
              !decisionRecordExists ? paths.decisionRecord : null,
            ].filter(Boolean) as string[];
            
            const expectedCount = expectedMissing.length;
            
            if (expectedCount === 0) {
              // All present -> no violation
              if (violations.length === 0) {
                passed++;
              } else {
                failed++;
                console.error(`FAIL: Expected no violation for schema ${n}, got ${violations.length}`);
              }
            } else {
              // Some missing -> verify single violation with ALL missing
              if (violations.length === 1) {
                const missingList = violations[0]!.details?.missingArtifacts as string[];
                if (missingList.length === expectedCount) {
                  // Verify ALL expected missing are in the list
                  const allPresent = expectedMissing.every(m => missingList.includes(m));
                  if (allPresent) {
                    passed++;
                  } else {
                    failed++;
                    console.error(`FAIL: Missing list mismatch for schema ${n}`);
                    console.error('Expected:', expectedMissing);
                    console.error('Got:', missingList);
                  }
                } else {
                  failed++;
                  console.error(`FAIL: Expected ${expectedCount} missing, got ${missingList.length}`);
                }
              } else {
                failed++;
                console.error(`FAIL: Expected 1 aggregated violation, got ${violations.length}`);
              }
            }
          },
        ),
        { numRuns: 500 },
      );
      
      // Report results
      console.log(`Property 17: ${passed} passed, ${failed} failed out of 500 runs`);
      
      // Allow small margin for edge cases (but should be very close to 500)
      expect(failed).toBeLessThan(10); // Allow up to 1% failure margin
    }, 120000); // 2 minute timeout for 500 runs
  });
});