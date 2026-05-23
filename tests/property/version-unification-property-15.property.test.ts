/**
 * tests/property/version-unification-property-15.property.test.ts
 *
 * Property Test: CI Guard for MIN_SUPPORTED_DATA_SCHEMA monotonic + deprecation doc
 *
 * Feature: version-unification, Property 15: CI guard for MIN_SUPPORTED_DATA_SCHEMA monotonic + deprecation doc
 * Derived-From: v6-architecture-overview Property 15
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 8.3
 *
 * Requirement 6.2:
 *   WHEN a pull request changes the value of MIN_SUPPORTED_DATA_SCHEMA,
 *   THE pull request SHALL include a deprecation notice document under
 *   docs/deprecations/ that names the dropped schema versions and the
 *   replacement migration path.
 *
 * Requirement 6.3:
 *   IF a pull request changes the value of MIN_SUPPORTED_DATA_SCHEMA
 *   and does not include a corresponding deprecation notice document,
 *   THEN the CI_Version_Guard SHALL reject the pull request and report
 *   the missing document path.
 *
 * Requirement 6.4:
 *   THE SpecForge_System SHALL constrain MIN_SUPPORTED_DATA_SCHEMA to
 *   non-negative integers, SHALL only allow it to change by monotonic
 *   increments, and SHALL refuse any pull request that decreases its
 *   value regardless of accompanying documentation.
 *
 * Requirement 8.3:
 *   WHEN a pull request adds a new schema version N, the pull request
 *   SHALL leave MIN_SUPPORTED_DATA_SCHEMA unchanged unless the same
 *   pull request also satisfies the deprecation notice requirements
 *   of Requirement 6.
 *
 * Property 15 Definition:
 * - The CI version guard MUST detect decreases in MIN_SUPPORTED_DATA_SCHEMA
 * - The CI version guard MUST reject increases without deprecation docs
 * - The CI version guard MUST accept increases with proper deprecation docs
 * - The rule checks for docs/deprecations/schema-N.md for each dropped schema
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { createMinSchemaRule, type ReadPreImageFn } from '../../scripts/ci/version-guard/min-schema-rule';
import type { VersionGuardContext } from '../../scripts/ci/version-guard/types';
import type { FileHunks } from '../../scripts/ci/version-guard/diff-scanner';

// Configure iterations per task requirement
const NUM_ITERATIONS = 500;

/**
 * Build a mock VersionGuardContext.
 */
function makeContext(
  newConstantsContent: string,
  oldConstantsContent: string,
  readPreImage: ReadPreImageFn,
  deprecationDocs: Map<string, string>
): VersionGuardContext {
  return {
    diffBase: 'origin/main',
    repoRoot: '/test/repo',
    getChangedFiles: () => Promise.resolve(['packages/version-unification/src/constants.ts']),
    getFileHunks: () => Promise.resolve({ added: [], removed: [] }),
    readFileWithSizeLimit: (file: string) => {
      // Check if it's a deprecation doc request
      if (file.startsWith('docs/deprecations/')) {
        const content = deprecationDocs.get(file) ?? null;
        return Promise.resolve(content);
      }
      // Otherwise it's the constants file - return the new content
      if (file === 'packages/version-unification/src/constants.ts') {
        return Promise.resolve(newConstantsContent);
      }
      return Promise.resolve(null);
    },
  };
}

/**
 * Generate a valid MIN_SUPPORTED_DATA_SCHEMA constant assignment.
 */
function generateMinSchemaAssignment(value: number): string {
  return `export const MIN_SUPPORTED_DATA_SCHEMA: number = ${value};`;
}

/**
 * Generate valid deprecation doc content.
 */
function generateDeprecationDoc(schemaN: number): string {
  return `# Schema ${schemaN} Deprecation

## Dropped Schema Version
This document describes the deprecation of schema version ${schemaN}.

## Migration Path
Projects using schema ${schemaN} should migrate to schema ${schemaN + 1}.

## Breaking Changes
- Change 1
- Change 2
`;
}

describe('Property 15: CI guard for MIN_SUPPORTED_DATA_SCHEMA monotonic + deprecation doc', () => {
  /**
   * Property 15.1: The rule MUST detect decreases in MIN_SUPPORTED_DATA_SCHEMA
   *
   * When new value < old value, the rule MUST report MIN_SCHEMA_DECREASED
   * regardless of any accompanying documentation (R6.4).
   */
  it(
    'Property 15.1: detects decreases in MIN_SUPPORTED_DATA_SCHEMA',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          async (oldVal, newVal) => {
            // Skip if not a decrease
            if (newVal >= oldVal) return;

            const newContent = generateMinSchemaAssignment(newVal);
            const oldContent = generateMinSchemaAssignment(oldVal);
            const deprecationDocs = new Map<string, string>();

            // Mock readPreImage that returns the old value
            const readPreImage: ReadPreImageFn = async () => oldContent;

            const ctx = makeContext(newContent, oldContent, readPreImage, deprecationDocs);
            const rule = createMinSchemaRule({ readPreImage });

            const violations = await rule.check(ctx);

            // MUST detect decrease
            expect(violations).toHaveLength(1);
            expect(violations[0]!.ruleId).toBe('MIN_SCHEMA_DECREASED');
            expect(violations[0]!.details).toEqual({ from: oldVal, to: newVal });
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 15.2: The rule MUST reject increases without deprecation docs
   *
   * When new value > old value and no deprecation doc exists for dropped
   * schemas, the rule MUST report MIN_SCHEMA_NO_DEPRECATION_DOC.
   */
  it(
    'Property 15.2: detects missing deprecation docs for increased MIN_SUPPORTED_DATA_SCHEMA',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 20 }),
          fc.integer({ min: 0, max: 20 }),
          async (oldVal, newVal) => {
            // Skip if not an increase
            if (newVal <= oldVal) return;

            const newContent = generateMinSchemaAssignment(newVal);
            const oldContent = generateMinSchemaAssignment(oldVal);

            // NO deprecation docs provided
            const deprecationDocs = new Map<string, string>();

            const readPreImage: ReadPreImageFn = async () => oldContent;

            const ctx = makeContext(newContent, oldContent, readPreImage, deprecationDocs);
            const rule = createMinSchemaRule({ readPreImage });

            const violations = await rule.check(ctx);

            // MUST report violation for each missing doc
            const missingCount = newVal - oldVal;
            expect(violations).toHaveLength(missingCount);

            // All violations should be about missing deprecation docs
            for (const v of violations) {
              expect(v.ruleId).toBe('MIN_SCHEMA_NO_DEPRECATION_DOC');
            }

            // Check that each dropped schema N is reported
            const schemas = violations.map((v) => v.details?.schema as number);
            for (let n = oldVal; n < newVal; n++) {
              expect(schemas).toContain(n);
            }
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 15.3: The rule MUST accept increases with proper deprecation docs
   *
   * When new value > old value and all required deprecation docs exist,
   * the rule MUST NOT report any violations.
   */
  it(
    'Property 15.3: accepts increases when all deprecation docs are present',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 20 }),
          fc.integer({ min: 0, max: 20 }),
          async (oldVal, newVal) => {
            // Skip if not an increase
            if (newVal <= oldVal) return;

            const newContent = generateMinSchemaAssignment(newVal);
            const oldContent = generateMinSchemaAssignment(oldVal);

            // Provide ALL required deprecation docs
            const deprecationDocs = new Map<string, string>();
            for (let n = oldVal; n < newVal; n++) {
              const path = `docs/deprecations/schema-${n}.md`;
              deprecationDocs.set(path, generateDeprecationDoc(n));
            }

            const readPreImage: ReadPreImageFn = async () => oldContent;

            const ctx = makeContext(newContent, oldContent, readPreImage, deprecationDocs);
            const rule = createMinSchemaRule({ readPreImage });

            const violations = await rule.check(ctx);

            // MUST NOT report any violations
            expect(violations).toHaveLength(0);
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 15.4: The rule MUST handle unchanged values correctly
   *
   * When new value === old value, the rule MUST NOT report any violations.
   */
  it(
    'Property 15.4: accepts unchanged MIN_SUPPORTED_DATA_SCHEMA value',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 50 }),
          async (val) => {
            const content = generateMinSchemaAssignment(val);

            const readPreImage: ReadPreImageFn = async () => content;
            const deprecationDocs = new Map<string, string>();

            const ctx = makeContext(content, content, readPreImage, deprecationDocs);
            const rule = createMinSchemaRule({ readPreImage });

            const violations = await rule.check(ctx);

            // MUST NOT report any violations for unchanged value
            expect(violations).toHaveLength(0);
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 15.5: The rule MUST reject partial deprecation docs
   *
   * When some but not all required deprecation docs exist, the rule
   * MUST report violations for the missing ones.
   */
  it(
    'Property 15.5: detects partially missing deprecation docs',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 15 }),
          fc.integer({ min: 1, max: 16 }),
          async (oldVal, newVal) => {
            // Only test increases with at least 2 schemas being dropped
            if (newVal <= oldVal || newVal - oldVal < 2) return;

            const newContent = generateMinSchemaAssignment(newVal);
            const oldContent = generateMinSchemaAssignment(oldVal);

            // Provide only SOME deprecation docs (e.g., only for odd schemas)
            const deprecationDocs = new Map<string, string>();
            for (let n = oldVal; n < newVal; n++) {
              if (n % 2 === 1) {
                // Only provide docs for odd schemas (3, 5, 7, ...)
                const path = `docs/deprecations/schema-${n}.md`;
                deprecationDocs.set(path, generateDeprecationDoc(n));
              }
            }

            const readPreImage: ReadPreImageFn = async () => oldContent;

            const ctx = makeContext(newContent, oldContent, readPreImage, deprecationDocs);
            const rule = createMinSchemaRule({ readPreImage });

            const violations = await rule.check(ctx);

            // Calculate expected violations: schemas in [oldVal, newVal) that we did NOT provide docs for
            // We provided docs for odd schemas, so violations should be for even schemas
            const expectedViolations: number[] = [];
            for (let n = oldVal; n < newVal; n++) {
              if (n % 2 === 0) {
                expectedViolations.push(n);
              }
            }
            expect(violations).toHaveLength(expectedViolations.length);

            for (const v of violations) {
              expect(v.ruleId).toBe('MIN_SCHEMA_NO_DEPRECATION_DOC');
              const schema = v.details?.schema as number;
              // Missing ones (even schemas) should be even
              expect(schema % 2).toBe(0);
            }
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );

  /**
   * Property 15.6: The rule validates constraint to non-negative integers
   *
   * The rule should handle edge cases like zero values correctly.
   */
  it(
    'Property 15.6: handles zero as a valid MIN_SUPPORTED_DATA_SCHEMA value',
    async () => {
      const zeroContent = generateMinSchemaAssignment(0);
      const oneContent = generateMinSchemaAssignment(1);

      // Test increase from 0 to 1 with doc
      const deprecationDocs = new Map<string, string>();
      deprecationDocs.set('docs/deprecations/schema-0.md', generateDeprecationDoc(0));

      const readPreImage: ReadPreImageFn = async () => zeroContent;

      const ctx = makeContext(oneContent, zeroContent, readPreImage, deprecationDocs);
      const rule = createMinSchemaRule({ readPreImage });

      const violations = await rule.check(ctx);
      expect(violations).toHaveLength(0);

      // Test increase from 0 to 1 without doc
      const noDocs = new Map<string, string>();
      const ctxNoDoc = makeContext(oneContent, zeroContent, readPreImage, noDocs);
      const ruleNoDoc = createMinSchemaRule({ readPreImage });

      const violationsNoDoc = await ruleNoDoc.check(ctxNoDoc);
      expect(violationsNoDoc).toHaveLength(1);
      expect(violationsNoDoc[0]!.ruleId).toBe('MIN_SCHEMA_NO_DEPRECATION_DOC');
      expect(violationsNoDoc[0]!.details).toEqual({
        schema: 0,
        expectedPath: 'docs/deprecations/schema-0.md',
      });
    }
  );

  /**
   * Property 15.7: The rule handles large jumps correctly
   *
   * When MIN_SUPPORTED_DATA_SCHEMA jumps by multiple versions (e.g., 5 -> 10),
   * the rule should require docs for each dropped schema.
   */
  it(
    'Property 15.7: handles large version jumps with multiple required docs',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }),
          fc.integer({ min: 6, max: 15 }),
          async (oldVal, newVal) => {
            // Only test actual increases
            if (newVal <= oldVal) return;

            const newContent = generateMinSchemaAssignment(newVal);
            const oldContent = generateMinSchemaAssignment(oldVal);

            // NO deprecation docs - this should fail
            const deprecationDocs = new Map<string, string>();

            const readPreImage: ReadPreImageFn = async () => oldContent;

            const ctx = makeContext(newContent, oldContent, readPreImage, deprecationDocs);
            const rule = createMinSchemaRule({ readPreImage });

            const violations = await rule.check(ctx);

            // MUST have exactly (newVal - oldVal) violations
            expect(violations).toHaveLength(newVal - oldVal);

            // Each dropped schema should be reported
            const reportedSchemas = new Set(
              violations.map((v) => v.details?.schema as number)
            );
            for (let n = oldVal; n < newVal; n++) {
              expect(reportedSchemas.has(n)).toBe(true);
            }
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    }
  );
});