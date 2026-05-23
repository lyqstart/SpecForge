/**
 * Property test for writeAfterMigration call-source contract.
 * 
 * Feature: version-unification, Property 11: data_schema_version writer call-source contract
 * Derived-From: v6-architecture-overview Property 11
 * Validates: Requirements 7.2
 * 
 * Property: The dedicated writer module updates data_schema_version only when
 * the call originates from the completion handler of a Migration_Script.
 * Attempts to call writeAfterMigration from any other site (external code,
 * test code without proper token) must throw IllegalWriterCallSiteError.
 * 
 * numRuns: 200
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { 
  ProjectManifestWriter, 
  createMigrationCallerToken 
} from '../../src/manifest/project-manifest-writer';
import { 
  IllegalWriterCallSiteError,
  DataSchemaMonotonicError 
} from '../../src/manifest/types';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Test output directory
let testDir: string;
let validCallerToken: symbol;

beforeEach(async () => {
  testDir = mkdtempSync(join(tmpdir(), 'prop-test-11-'));
  validCallerToken = createMigrationCallerToken();
});

afterEach(async () => {
  // Cleanup test directory
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Reads and parses a project manifest file
 */
function readManifest(path: string): { data_schema_version: number } | null {
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Creates a fake token that looks like a symbol but is not the valid one
 */
function createFakeToken(): symbol {
  return Symbol('fake-migration-token');
}

/**
 * Creates a token from a different "source" - simulates external code
 */
function createExternalToken(): symbol {
  return Symbol('external-call-site');
}

// =============================================================================
// Property Tests
// =============================================================================

describe('Property 11: data_schema_version writer call-source contract', () => {
  
  describe('Valid call-source requirement (R7.2)', () => {
    
    it('should succeed with valid MigrationContext callerToken', async () => {
      const manifestPath = join(testDir, 'valid-token.json');
      
      // Create initial manifest
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      // Should succeed with valid token from MigrationContext
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, validCallerToken)
      ).resolves.toBeUndefined();
      
      // Verify the data_schema_version was updated
      const manifest = readManifest(manifestPath);
      expect(manifest).not.toBeNull();
      expect(manifest!.data_schema_version).toBe(1);
    });
    
    it('should succeed with token created via createMigrationCallerToken', async () => {
      const manifestPath = join(testDir, 'created-token.json');
      
      await ProjectManifestWriter.writeFresh(manifestPath, 5);
      
      // Create token using the same function that MigrationContext uses
      const contextToken = createMigrationCallerToken();
      
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 5, 10, contextToken)
      ).resolves.toBeUndefined();
      
      const manifest = readManifest(manifestPath);
      expect(manifest!.data_schema_version).toBe(10);
    });
  });
  
  describe('Invalid call-source rejection (R7.2)', () => {
    
    it('should throw IllegalWriterCallSiteError with undefined token', async () => {
      const manifestPath = join(testDir, 'undefined-token.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, undefined)
      ).rejects.toThrow(IllegalWriterCallSiteError);
    });
    
    it('should throw IllegalWriterCallSiteError with null token', async () => {
      const manifestPath = join(testDir, 'null-token.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, null)
      ).rejects.toThrow(IllegalWriterCallSiteError);
    });
    
    it('should throw IllegalWriterCallSiteError with string token', async () => {
      const manifestPath = join(testDir, 'string-token.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, 'some-string-token')
      ).rejects.toThrow(IllegalWriterCallSiteError);
    });
    
    it('should throw IllegalWriterCallSiteError with number token', async () => {
      const manifestPath = join(testDir, 'number-token.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, 12345)
      ).rejects.toThrow(IllegalWriterCallSiteError);
    });
    
    it('should throw IllegalWriterCallSiteError with object token', async () => {
      const manifestPath = join(testDir, 'object-token.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, { token: 'fake' })
      ).rejects.toThrow(IllegalWriterCallSiteError);
    });
    
    it('should throw IllegalWriterCallSiteError with array token', async () => {
      const manifestPath = join(testDir, 'array-token.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, ['token'])
      ).rejects.toThrow(IllegalWriterCallSiteError);
    });
    
    it('should throw IllegalWriterCallSiteError with differently-named Symbol', async () => {
      const manifestPath = join(testDir, 'symbol-token.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      // Create a symbol with the same description but different identity
      const fakeSymbol = createFakeToken();
      
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, fakeSymbol)
      ).rejects.toThrow(IllegalWriterCallSiteError);
    });
    
    it('should throw IllegalWriterCallSiteError with external call-site token', async () => {
      const manifestPath = join(testDir, 'external-token.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      const externalToken = createExternalToken();
      
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, externalToken)
      ).rejects.toThrow(IllegalWriterCallSiteError);
    });
    
    it('should throw IllegalWriterCallSiteError with boolean true token', async () => {
      const manifestPath = join(testDir, 'bool-true-token.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, true)
      ).rejects.toThrow(IllegalWriterCallSiteError);
    });
    
    it('should throw IllegalWriterCallSiteError with boolean false token', async () => {
      const manifestPath = join(testDir, 'bool-false-token.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, false)
      ).rejects.toThrow(IllegalWriterCallSiteError);
    });
  });
  
  describe('Fast-check property-based tests (numRuns: 200)', () => {
    
    it('Property: rejects any token that is not the valid MigrationContext token', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat(50),  // prev version
          fc.nat({ max: 100 }), // target version (but only valid if > prev)
          async (prev, target) => {
            // Skip if target <= prev (we're testing token validation, not monotonicity)
            if (target <= prev) return true;
            
            const manifestPath = join(testDir, `fc-token-${prev}-${target}.json`);
            
            // Create initial manifest
            await ProjectManifestWriter.writeFresh(manifestPath, prev);
            
            // Generate arbitrary "invalid" tokens that are NOT the valid MIGRATION_CONTEXT_TOKEN
            const invalidTokens = [
              undefined,
              null,
              'invalid-token',
              0,
              1,
              -1,
              {},
              [],
              true,
              false,
              Symbol('anything'),
              Symbol('MigrationContext'),
              BigInt(0),
              () => {},
            ];
            
            // Test each invalid token
            for (const invalidToken of invalidTokens) {
              // Skip testing valid token
              if (invalidToken === validCallerToken) continue;
              
              try {
                await ProjectManifestWriter.writeAfterMigration(
                  manifestPath, 
                  prev, 
                  target, 
                  invalidToken
                );
                // If we get here, the test should fail
                throw new Error(`Expected IllegalWriterCallSiteError for token: ${String(invalidToken)}`);
              } catch (err) {
                // Must throw IllegalWriterCallSiteError
                if (!(err instanceof IllegalWriterCallSiteError)) {
                  throw new Error(
                    `Expected IllegalWriterCallSiteError but got ${err?.constructor?.name}: ${err?.message}`
                  );
                }
              }
            }
            
            // Finally, verify valid token still works
            await ProjectManifestWriter.writeAfterMigration(
              manifestPath,
              prev,
              target,
              validCallerToken
            );
            
            const manifest = readManifest(manifestPath);
            if (!manifest || manifest.data_schema_version !== target) {
              throw new Error(`Valid token should have updated version to ${target}`);
            }
            
            return true;
          }
        ),
        { numRuns: 200 }
      );
    });
    
    it('Property: call-source contract is strictly enforced for all invalid sources', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            fc.string().filter(s => s.length > 0).map(s => s || 'empty-string'),
            fc.integer().map(n => n),
            fc.boolean(),
            fc.object().map(o => o),
            fc.array(fc.anything()).map(a => a),
          ),
          fc.nat(20),
          async (invalidToken, prev) => {
            // Skip if token generates an empty/invalid filename
            const tokenStr = String(invalidToken);
            if (!tokenStr || tokenStr === '[object Object]') {
              return true; // Skip this iteration
            }
            
            const sanitizedToken = tokenStr.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
            const manifestPath = join(testDir, `fc-any-${sanitizedToken}-${prev}.json`);
            
            // Create initial manifest
            await ProjectManifestWriter.writeFresh(manifestPath, prev);
            
            // Any token that is NOT the valid MIGRATION_CONTEXT_TOKEN should fail
            if (invalidToken !== validCallerToken) {
              await expect(
                ProjectManifestWriter.writeAfterMigration(manifestPath, prev, prev + 1, invalidToken)
              ).rejects.toThrow(IllegalWriterCallSiteError);
            }
            
            return true;
          }
        ),
        { numRuns: 200 }
      );
    });
  });
  
  describe('Error message validation', () => {
    
    it('should include useful information in IllegalWriterCallSiteError', async () => {
      const manifestPath = join(testDir, 'error-message.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      try {
        await ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, 'invalid-token');
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(IllegalWriterCallSiteError);
        const error = err as IllegalWriterCallSiteError;
        
        // Error should have a meaningful message
        expect(error.message).toBeDefined();
        expect(error.message.length).toBeGreaterThan(0);
        
        // Error should contain information about the invalid token
        expect(error.message).toContain('writeAfterMigration');
      }
    });
  });
  
  describe('Contract verification', () => {
    
    it('should only allow writeAfterMigration from MigrationContext', async () => {
      const manifestPath = join(testDir, 'contract-verification.json');
      
      // Scenario 1: Direct call from "external code" (no valid token) - MUST FAIL
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      // External code trying to call without token
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, 'external-call')
      ).rejects.toThrow(IllegalWriterCallSiteError);
      
      // Verify version was NOT changed
      let manifest = readManifest(manifestPath);
      expect(manifest!.data_schema_version).toBe(0);
      
      // Scenario 2: Test code without proper token - MUST FAIL
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 2, {} as any)
      ).rejects.toThrow(IllegalWriterCallSiteError);
      
      // Verify version still NOT changed
      manifest = readManifest(manifestPath);
      expect(manifest!.data_schema_version).toBe(0);
      
      // Scenario 3: Call from within MigrationContext (via valid token) - MUST SUCCEED
      await ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 3, validCallerToken);
      
      // Verify version WAS changed
      manifest = readManifest(manifestPath);
      expect(manifest!.data_schema_version).toBe(3);
    });
    
    it('should enforce call-source contract regardless of version validity', async () => {
      const manifestPath = join(testDir, 'contract-enforcement.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      // Even if version is invalid (target <= prev), call-source should still be checked first
      // The call-source validation happens BEFORE monotonicity validation
      
      // Invalid token with invalid version transition should still fail with IllegalWriterCallSiteError
      // (not DataSchemaMonotonicError, because token is checked first)
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 0, 'invalid-token')
      ).rejects.toThrow(IllegalWriterCallSiteError);
      
      // Valid token with invalid version transition should fail with DataSchemaMonotonicError
      await expect(
        ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 0, validCallerToken)
      ).rejects.toThrow(DataSchemaMonotonicError);
    });
  });
  
  describe('Multiple invalid token types', () => {
    
    it('should reject all forms of invalid tokens consistently', async () => {
      const manifestPath = join(testDir, 'multiple-invalid.json');
      await ProjectManifestWriter.writeFresh(manifestPath, 0);
      
      // Test a comprehensive list of invalid token types
      const invalidTokenTests = [
        { token: undefined, desc: 'undefined' },
        { token: null, desc: 'null' },
        { token: '', desc: 'empty string' },
        { token: 'token', desc: 'regular string' },
        { token: 0, desc: 'zero' },
        { token: 1, desc: 'positive integer' },
        { token: -1, desc: 'negative integer' },
        { token: 0.5, desc: 'float' },
        { token: NaN, desc: 'NaN' },
        { token: Infinity, desc: 'Infinity' },
        { token: true, desc: 'boolean true' },
        { token: false, desc: 'boolean false' },
        { token: {}, desc: 'empty object' },
        { token: { token: true }, desc: 'object with properties' },
        { token: [], desc: 'empty array' },
        { token: [1, 2, 3], desc: 'array with elements' },
        { token: Symbol(), desc: 'anonymous symbol' },
        { token: Symbol('test'), desc: 'named symbol' },
        { token: BigInt(0), desc: 'BigInt zero' },
        { token: BigInt(1), desc: 'BigInt one' },
        { token: () => {}, desc: 'function' },
        { token: async () => {}, desc: 'async function' },
      ];
      
      for (const { token, desc } of invalidTokenTests) {
        await expect(
          ProjectManifestWriter.writeAfterMigration(manifestPath, 0, 1, token)
        ).rejects.toThrow(IllegalWriterCallSiteError),
        `Should reject token: ${desc}`;
      }
    });
  });
});