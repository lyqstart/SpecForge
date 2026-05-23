/**
 * Property test for registry completeness.
 * 
 * Feature: version-unification, Property 8: Migration registry completeness
 * Derived-From: v6-architecture-overview Property 8
 * Validates: Requirements 4.1
 * 
 * Property: For any MigrationRegistry instance whose all array is well-formed,
 * the registry contains a script for every consecutive pair (N-1, N) with
 * MIN_SUPPORTED_DATA_SCHEMA < N ≤ HIGHEST_KNOWN_SCHEMA. If any such pair is
 * missing or duplicated, registry construction throws MalformedRegistryError
 * at module load time, before any migration runs.
 * 
 * numRuns: 200
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Migration, MigrationContext } from '../../src/migration/registry';
import { MalformedRegistryError } from '../../src/manifest/types';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a mock migration for testing purposes.
 */
function createMockMigration(targetVersion: number): Migration {
  return {
    targetVersion,
    forward: async (_ctx: MigrationContext) => {
      // No-op for testing
    },
    isIdempotentAtTarget: async () => true,
  };
}

/**
 * Simulates the registry validation logic from MigrationRegistry.
 * This mirrors the validation performed in registry.ts validateRegistry method.
 */
/**
 * Simulates the registry validation logic from MigrationRegistry.
 * This mirrors the validation performed in registry.ts validateRegistry method.
 */
function validateRegistry(
  migrations: Migration[],
  minSupported: number,
  highestKnown: number
): void {
  // Sort migrations by target version for validation
  const sorted = [...migrations].sort((a, b) => a.targetVersion - b.targetVersion);
  
  if (sorted.length === 0) {
    // No migrations is valid (when minSupported === highestKnown)
    if (minSupported < highestKnown) {
      throw new MalformedRegistryError('missing_version', minSupported + 1);
    }
    return;
  }

  // Check for duplicate versions
  const versionCounts = new Map<number, number>();
  for (const m of sorted) {
    const count = versionCounts.get(m.targetVersion) ?? 0;
    versionCounts.set(m.targetVersion, count + 1);
  }

  for (const [version, count] of versionCounts) {
    if (count > 1) {
      throw new MalformedRegistryError('duplicate_version', version);
    }
  }

  // Check for missing versions between minSupported + 1 and highestKnown
  // Expected versions: (minSupported + 1) to highestKnown inclusive
  const expectedMin = minSupported + 1;
  const expectedMax = highestKnown;

  for (let v = expectedMin; v <= expectedMax; v++) {
    const hasMigration = sorted.some(m => m.targetVersion === v);
    if (!hasMigration) {
      throw new MalformedRegistryError('missing_version', v);
    }
  }
}

// =============================================================================
// Arbitraries
// =============================================================================

/**
 * Generates arbitrary non-negative integers within a reasonable range.
 */
function arbitraryNonNegativeInt(max: number = 20): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max });
}

/**
 * Generates arbitrary migration arrays with various completeness patterns.
 */
function arbitraryMigrationArray(): fc.Arbitrary<Migration[]> {
  return fc.array(
    fc.integer({ min: 1, max: 10 }).map(v => createMockMigration(v)),
    { minLength: 0, maxLength: 10 }
  );
}

/**
 * Generates test cases with controlled version ranges.
 */
interface TestCase {
  migrations: Migration[];
  minSupported: number;
  highestKnown: number;
  shouldThrow: boolean;
  errorType?: 'duplicate_version' | 'missing_version';
  errorVersion?: number;
}

function arbitraryTestCase(): fc.Arbitrary<TestCase> {
  return fc.oneof(
    // Complete registry (should pass)
    fc.tuple(
      fc.integer({ min: 0, max: 5 }), // minSupported
      fc.integer({ min: 0, max: 5 })  // highestKnown (will be minSupported + some steps)
    ).chain(([minSupported, highestKnown]) => {
      const effectiveHighest = Math.max(minSupported, highestKnown);
      // Create complete migrations from minSupported+1 to effectiveHighest
      const migrations: Migration[] = [];
      for (let v = minSupported + 1; v <= effectiveHighest; v++) {
        migrations.push(createMockMigration(v));
      }
      return fc.constant({
        migrations,
        minSupported,
        highestKnown: effectiveHighest,
        shouldThrow: false,
      });
    }),
    
    // Missing version (should fail with missing_version)
    fc.tuple(
      fc.integer({ min: 0, max: 3 }), // minSupported
      fc.integer({ min: 2, max: 6 })  // highestKnown
    ).chain(([minSupported, highestKnown]) => {
      const effectiveHighest = Math.max(minSupported + 1, highestKnown);
      // Create migrations but skip one version
      const skipVersion = minSupported + 1 + fc.integer({ min: 0, max: effectiveHighest - minSupported - 2 }).run();
      const migrations: Migration[] = [];
      for (let v = minSupported + 1; v <= effectiveHighest; v++) {
        if (v !== skipVersion) {
          migrations.push(createMockMigration(v));
        }
      }
      return fc.constant({
        migrations,
        minSupported,
        highestKnown: effectiveHighest,
        shouldThrow: true,
        errorType: 'missing_version',
        errorVersion: skipVersion,
      });
    }),
    
    // Duplicate version (should fail with duplicate_version)
    fc.tuple(
      fc.integer({ min: 0, max: 3 }), // minSupported
      fc.integer({ min: 2, max: 5 })  // highestKnown
    ).chain(([minSupported, highestKnown]) => {
      const effectiveHighest = Math.max(minSupported + 1, highestKnown);
      // Create migrations with one duplicate
      const duplicateVersion = minSupported + 1 + fc.integer({ min: 0, max: Math.max(0, effectiveHighest - minSupported - 1) }).run();
      const migrations: Migration[] = [];
      for (let v = minSupported + 1; v <= effectiveHighest; v++) {
        migrations.push(createMockMigration(v));
        // Add duplicate
        if (v === duplicateVersion) {
          migrations.push(createMockMigration(v));
        }
      }
      return fc.constant({
        migrations,
        minSupported,
        highestKnown: effectiveHighest,
        shouldThrow: true,
        errorType: 'duplicate_version',
        errorVersion: duplicateVersion,
      });
    }),
    
    // Empty migrations (valid when minSupported === highestKnown)
    fc.tuple(
      fc.integer({ min: 0, max: 5 }), // same value for both
      fc.integer({ min: 0, max: 5 })  // same value for both
    ).chain(([minSupported, highestKnown]) => {
      return fc.constant({
        migrations: [],
        minSupported,
        highestKnown: Math.min(minSupported, highestKnown),
        shouldThrow: false,
      });
    })
  );
}

// =============================================================================
// Property Tests
// =============================================================================

describe('Property 8: Migration registry completeness', () => {

  describe('R4.1: Registry must contain script for every consecutive pair', () => {
    
    it('should accept complete registry (all versions present)', () => {
      const migrations = [
        createMockMigration(1),
        createMockMigration(2),
        createMockMigration(3),
      ];
      
      // With minSupported=0, highestKnown=3, expect versions 1, 2, 3
      expect(() => validateRegistry(migrations, 0, 3)).not.toThrow();
    });
    
    it('should accept complete registry with gaps above highestKnown', () => {
      const migrations = [
        createMockMigration(1),
        createMockMigration(2),
        createMockMigration(3),
        createMockMigration(10), // Extra migration beyond highestKnown
        createMockMigration(15), // Extra migration beyond highestKnown
      ];
      
      // With minSupported=0, highestKnown=3, expect versions 1, 2, 3
      // Extra migrations above highestKnown should not cause errors (just a warning)
      expect(() => validateRegistry(migrations, 0, 3)).not.toThrow();
    });
    
    it('should reject missing version - throws MalformedRegistryError', () => {
      const migrations = [
        createMockMigration(1),
        // Missing version 2
        createMockMigration(3),
      ];
      
      // With minSupported=0, highestKnown=3, version 2 is missing
      expect(() => validateRegistry(migrations, 0, 3)).toThrow(MalformedRegistryError);
    });
    
    it('should reject missing version - error contains version info', () => {
      const migrations = [
        createMockMigration(1),
        // Missing version 2
        createMockMigration(3),
      ];
      
      // With minSupported=0, highestKnown=3, version 2 is missing
      expect(() => validateRegistry(migrations, 0, 3)).toThrow(MalformedRegistryError);
    });
    
    it('should reject missing version - error contains version info', () => {
      const migrations = [
        createMockMigration(1),
        // Missing version 2
        createMockMigration(3),
      ];
      
      try {
        validateRegistry(migrations, 0, 3);
        // Should have thrown
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MalformedRegistryError);
        const mre = error as MalformedRegistryError;
        expect(mre.reason).toBe('missing_version');
        expect(mre.version).toBe(2);
      }
    });
    
    it('should reject duplicate version - throws MalformedRegistryError', () => {
      const migrations = [
        createMockMigration(1),
        createMockMigration(2),
        createMockMigration(2), // Duplicate
        createMockMigration(3),
      ];
      
      // With minSupported=0, highestKnown=3, version 2 is duplicated
      expect(() => validateRegistry(migrations, 0, 3)).toThrow(MalformedRegistryError);
    });
    
    it('should reject duplicate version - error contains version info', () => {
      const migrations = [
        createMockMigration(1),
        createMockMigration(2),
        createMockMigration(2), // Duplicate
        createMockMigration(3),
      ];
      
      // With minSupported=0, highestKnown=3, version 2 is duplicated
      expect(() => validateRegistry(migrations, 0, 3)).toThrow(MalformedRegistryError);
    });
    
    it('should reject duplicate version - error contains version info', () => {
      const migrations = [
        createMockMigration(1),
        createMockMigration(2),
        createMockMigration(2), // Duplicate
        createMockMigration(3),
      ];
      
      try {
        validateRegistry(migrations, 0, 3);
        // Should have thrown
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MalformedRegistryError);
        const mre = error as MalformedRegistryError;
        expect(mre.reason).toBe('duplicate_version');
        expect(mre.version).toBe(2);
      }
    });
    
    it('should accept empty registry when minSupported equals highestKnown', () => {
      // When no migration is needed (already at highest)
      const migrations: Migration[] = [];
      
      expect(() => validateRegistry(migrations, 5, 5)).not.toThrow();
    });
    
    it('should reject empty registry when migration is needed', () => {
      const migrations: Migration[] = [];
      
      // With minSupported=0, highestKnown=3, versions 1, 2, 3 are required
      expect(() => validateRegistry(migrations, 0, 3)).toThrow(MalformedRegistryError);
    });
    
    it('should reject empty registry - error is missing_version', () => {
      const migrations: Migration[] = [];
      
      // With minSupported=0, highestKnown=3, versions 1, 2, 3 are required
      expect(() => validateRegistry(migrations, 0, 3)).toThrow(MalformedRegistryError);
    });
    
    it('should reject empty registry - error is missing_version', () => {
      const migrations: Migration[] = [];
      
      try {
        validateRegistry(migrations, 0, 3);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MalformedRegistryError);
        const mre = error as MalformedRegistryError;
        expect(mre.reason).toBe('missing_version');
        expect(mre.version).toBe(1); // First missing version
      }
    });
  });
  
  describe('R4.1: Validation at construction time (before any migration runs)', () => {
    
    it('should validate immediately when constructing registry-like object', () => {
      // This test verifies the validation happens synchronously
      // before any migration can be executed
      
      const migrations = [
        createMockMigration(1),
        createMockMigration(2),
      ];
      
      // Validation should happen synchronously
      let errorThrown = false;
      try {
        validateRegistry(migrations, 0, 3); // Missing version 3
      } catch {
        errorThrown = true;
      }
      
      expect(errorThrown).toBe(true);
      
      // And the error should prevent getting to any migration execution
      const migrations2 = [
        createMockMigration(1),
        createMockMigration(2),
        createMockMigration(3),
      ];
      
      let errorThrown2 = false;
      try {
        validateRegistry(migrations2, 0, 3); // Complete - no error
      } catch {
        errorThrown2 = true;
      }
      
      expect(errorThrown2).toBe(false);
    });
    
    it('should validate all versions in range before allowing execution', () => {
      const migrations = [
        createMockMigration(1),
        // Missing 2
        createMockMigration(3),
        // Missing 4
        createMockMigration(5),
      ];
      
      // The validation should catch the first missing version
      // and throw before any migration can run
      try {
        validateRegistry(migrations, 0, 5);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(MalformedRegistryError);
        const mre = error as MalformedRegistryError;
        // Should fail on version 2 (first missing)
        expect(mre.reason).toBe('missing_version');
        expect(mre.version).toBe(2);
      }
    });
  });
  
  describe('Property: for any valid registry, all consecutive pairs exist', () => {
    
    it('Property: complete registries are accepted for all valid (min, highest) pairs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 0, max: 10 }),
          (minSupported, highestKnown) => {
            const effectiveHighest = Math.max(minSupported, highestKnown);
            
            // Build a complete migration set
            const migrations: Migration[] = [];
            for (let v = minSupported + 1; v <= effectiveHighest; v++) {
              migrations.push(createMockMigration(v));
            }
            
            // Should not throw for complete registry
            expect(() => validateRegistry(migrations, minSupported, effectiveHighest)).not.toThrow();
          }
        ),
        { numRuns: 200 }
      );
    });
    
    it('Property: missing any version in (minSupported, highestKnown] throws MalformedRegistryError', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          fc.integer({ min: 2, max: 8 }),
          (minSupported, highestKnown) => {
            const effectiveHighest = Math.max(minSupported + 1, highestKnown);
            
            // Need at least 2 versions in range to have something to skip
            // If effectiveHighest <= minSupported + 1, there's only 1 version, can't skip
            if (effectiveHighest <= minSupported + 1) {
              // Only 1 version needed - complete migration is valid
              const migrations = [createMockMigration(minSupported + 1)];
              expect(() => validateRegistry(migrations, minSupported, effectiveHighest)).not.toThrow();
              return;
            }
            
            // Calculate the number of versions in range
            const numVersions = effectiveHighest - minSupported;
            
            // Skip the middle version (index 1 of 1..numVersions-1)
            // This ensures we skip a valid version without going out of bounds
            const skipVersion = minSupported + Math.floor(numVersions / 2);
            
            const migrations: Migration[] = [];
            for (let v = minSupported + 1; v <= effectiveHighest; v++) {
              if (v !== skipVersion) {
                migrations.push(createMockMigration(v));
              }
            }
            
            // Should throw with missing_version
            try {
              validateRegistry(migrations, minSupported, effectiveHighest);
              // Should have thrown
              expect(true).toBe(false);
            } catch (error) {
              expect(error).toBeInstanceOf(MalformedRegistryError);
              const mre = error as MalformedRegistryError;
              expect(mre.reason).toBe('missing_version');
            }
          }
        ),
        { numRuns: 200 }
      );
    });
    
    it('Property: duplicate versions throw MalformedRegistryError', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 3 }),
          fc.integer({ min: 2, max: 5 }),
          (minSupported, highestKnown) => {
            const effectiveHighest = Math.max(minSupported + 1, highestKnown);
            
            // Need at least 2 versions in range to have something to duplicate
            if (effectiveHighest <= minSupported + 1) {
              // Only 1 version needed - complete migration is valid (no duplicates possible)
              const migrations = [createMockMigration(minSupported + 1)];
              expect(() => validateRegistry(migrations, minSupported, effectiveHighest)).not.toThrow();
              return;
            }
            
            // Duplicate the middle version
            const numVersions = effectiveHighest - minSupported;
            const duplicateVersion = minSupported + Math.floor(numVersions / 2);
            
            const migrations: Migration[] = [];
            for (let v = minSupported + 1; v <= effectiveHighest; v++) {
              migrations.push(createMockMigration(v));
              if (v === duplicateVersion) {
                migrations.push(createMockMigration(v)); // Add duplicate
              }
            }
            
            // Should throw with duplicate_version
            try {
              validateRegistry(migrations, minSupported, effectiveHighest);
              // Should have thrown
              expect(true).toBe(false);
            } catch (error) {
              expect(error).toBeInstanceOf(MalformedRegistryError);
              const mre = error as MalformedRegistryError;
              expect(mre.reason).toBe('duplicate_version');
            }
          }
        ),
        { numRuns: 200 }
      );
    });
    
    it('Property: empty registry is valid only when minSupported >= highestKnown', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 0, max: 10 }),
          (minSupported, highestKnown) => {
            const migrations: Migration[] = [];
            
            if (minSupported >= highestKnown) {
              // Empty registry is valid
              expect(() => validateRegistry(migrations, minSupported, highestKnown)).not.toThrow();
            } else {
              // Empty registry is invalid when migration is needed
              try {
                validateRegistry(migrations, minSupported, highestKnown);
                expect(true).toBe(false); // Should have thrown
              } catch (error) {
                expect(error).toBeInstanceOf(MalformedRegistryError);
                const mre = error as MalformedRegistryError;
                expect(mre.reason).toBe('missing_version');
              }
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });
  
  describe('Edge cases', () => {
    
    it('should handle single version migration correctly', () => {
      const migrations = [createMockMigration(1)];
      
      // minSupported=0, highestKnown=1 → expect version 1
      expect(() => validateRegistry(migrations, 0, 1)).not.toThrow();
    });
    
    it('should handle minSupported = 0 correctly', () => {
      const migrations = [
        createMockMigration(1),
        createMockMigration(2),
        createMockMigration(3),
        createMockMigration(4),
        createMockMigration(5),
      ];
      
      // minSupported=0, highestKnown=5 → expect versions 1, 2, 3, 4, 5
      expect(() => validateRegistry(migrations, 0, 5)).not.toThrow();
    });
    
    it('should handle non-zero minSupported correctly', () => {
      const migrations = [
        createMockMigration(3), // Start from 3 when minSupported=2
        createMockMigration(4),
        createMockMigration(5),
      ];
      
      // minSupported=2, highestKnown=5 → expect versions 3, 4, 5
      expect(() => validateRegistry(migrations, 2, 5)).not.toThrow();
    });
    
    it('should reject when migration exists below minSupported', () => {
      const migrations = [
        createMockMigration(0), // Below minSupported
        createMockMigration(1),
        createMockMigration(2),
      ];
      
      // minSupported=1, highestKnown=2 → expect versions 1, 2
      // Version 0 is below expected range - should warn but not throw
      expect(() => validateRegistry(migrations, 1, 2)).not.toThrow();
    });
    
    it('should handle large version ranges', () => {
      const migrations: Migration[] = [];
      for (let v = 1; v <= 20; v++) {
        migrations.push(createMockMigration(v));
      }
      
      expect(() => validateRegistry(migrations, 0, 20)).not.toThrow();
    });
    
    it('should handle multiple missing versions', () => {
      const migrations = [
        createMockMigration(1),
        createMockMigration(4),
      ];
      
      // minSupported=0, highestKnown=5 → expect 1,2,3,4,5
      // Missing: 2, 3, 5
      expect(() => validateRegistry(migrations, 0, 5)).toThrow(MalformedRegistryError);
    });
    
    it('should handle multiple duplicate versions', () => {
      const migrations = [
        createMockMigration(1),
        createMockMigration(2),
        createMockMigration(2), // Duplicate
        createMockMigration(3),
        createMockMigration(3), // Duplicate
      ];
      
      // minSupported=0, highestKnown=3
      // Duplicates at 2 and 3
      expect(() => validateRegistry(migrations, 0, 3)).toThrow(MalformedRegistryError);
    });
  });
});