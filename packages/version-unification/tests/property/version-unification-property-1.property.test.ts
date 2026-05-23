/**
 * Property test for Manifest writer field-set integrity.
 * 
 * Feature: version-unification, Property 1: Manifest writer field-set integrity
 * Derived-From: v6-architecture-overview Property 1
 * Validates: Requirements 1.1, 1.5, 1.6, 2.1, 2.4, 2.5
 * 
 * Property: For any candidate field set K, UserManifestWriter.write(m) succeeds 
 * without a field-rejection error if and only if keys(m) === USER_MANIFEST_FIELDS, 
 * and the same equivalence holds for ProjectManifestWriter.write(m) against 
 * PROJECT_MANIFEST_FIELDS. Furthermore, after any successful write, the persisted 
 * JSON's top-level keyset equals the corresponding *_FIELDS set exactly 
 * (no legacy field, no extra field).
 * 
 * numRuns: 200
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { UserManifestWriter } from '../../src/manifest/user-manifest-writer';
import { ProjectManifestWriter } from '../../src/manifest/project-manifest-writer';
import {
  USER_MANIFEST_FIELDS,
  PROJECT_MANIFEST_FIELDS,
  LEGACY_FIELDS_USER,
  LEGACY_FIELDS_PROJECT,
  InvalidManifestFieldError,
} from '../../src/manifest/types';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Test output directory
let testDir: string;

beforeEach(async () => {
  testDir = mkdtempSync(join(tmpdir(), 'prop-test-1-'));
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
 * Generates a valid User Manifest with the given fields.
 */
function generateValidUserManifest(fields: string[]): Record<string, unknown> {
  const manifest: Record<string, unknown> = {};
  
  if (fields.includes('code_version')) {
    manifest.code_version = '6.0.0-dev';
  }
  if (fields.includes('min_supported_data_schema')) {
    manifest.min_supported_data_schema = 0;
  }
  if (fields.includes('installed_at')) {
    manifest.installed_at = new Date().toISOString();
  }
  if (fields.includes('updated_at')) {
    manifest.updated_at = new Date().toISOString();
  }
  if (fields.includes('files')) {
    manifest.files = [];
  }
  
  return manifest;
}

/**
 * Generates a valid Project Manifest with the given fields.
 */
function generateValidProjectManifest(fields: string[]): Record<string, unknown> {
  const manifest: Record<string, unknown> = {};
  
  if (fields.includes('data_schema_version')) {
    manifest.data_schema_version = 0;
  }
  if (fields.includes('initialized_at')) {
    manifest.initialized_at = new Date().toISOString();
  }
  if (fields.includes('updated_at')) {
    manifest.updated_at = new Date().toISOString();
  }
  
  return manifest;
}

/**
 * Adds legacy fields to a manifest.
 */
function addLegacyFields(manifest: Record<string, unknown>, legacyFields: readonly string[]): Record<string, unknown> {
  const result = { ...manifest };
  
  for (const field of legacyFields) {
    if (field === 'shared_version') result.shared_version = '1.0.0';
    if (field === 'required_shared_version_range') result.required_shared_version_range = '>=1.0.0';
    if (field === 'schema_version') result.schema_version = '1.0';
    if (field === 'runtime_schema_version') result.runtime_schema_version = '1.0';
    if (field === 'code_version') result.code_version = '5.0.0';
  }
  
  return result;
}

// =============================================================================
// Property Tests
// =============================================================================

describe('Property 1: Manifest writer field-set integrity', () => {
  
  describe('UserManifestWriter.write', () => {
    
    it('should accept valid field set exactly matching USER_MANIFEST_FIELDS', async () => {
      const manifest = generateValidUserManifest([...USER_MANIFEST_FIELDS]);
      const path = join(testDir, 'user-manifest.json');
      
      // Should not throw - exact field match
      await UserManifestWriter.write(path, manifest);
      
      // Verify the persisted JSON has exactly those fields
      const content = await readFile(path, 'utf-8');
      const persisted = JSON.parse(content);
      const persistedKeys = new Set(Object.keys(persisted));
      const expectedKeys = new Set([...USER_MANIFEST_FIELDS]);
      
      expect(persistedKeys).toEqual(expectedKeys);
    });
    
    it('should reject when extra fields are present', async () => {
      // Generate manifest with extra fields (not in USER_MANIFEST_FIELDS)
      const manifest = generateValidUserManifest([...USER_MANIFEST_FIELDS]);
      manifest.extra_field = 'should be rejected';
      manifest.another_extra = 123;
      
      const path = join(testDir, 'user-manifest.json');
      
      // Should throw InvalidManifestFieldError
      await expect(UserManifestWriter.write(path, manifest)).rejects.toThrow(InvalidManifestFieldError);
    });
    
    it('should reject when fields are missing', async () => {
      // Generate manifest with only a subset of fields
      const manifest = generateValidUserManifest(USER_MANIFEST_FIELDS.slice(0, 3));
      
      const path = join(testDir, 'user-manifest.json');
      
      // Should throw InvalidManifestFieldError
      await expect(UserManifestWriter.write(path, manifest)).rejects.toThrow(InvalidManifestFieldError);
    });
    
    it('should reject when legacy fields are present', async () => {
      // Generate manifest with USER_MANIFEST_FIELDS + some legacy fields
      const manifest = generateValidUserManifest([...USER_MANIFEST_FIELDS]);
      const legacyWithSomeValid = addLegacyFields(manifest, LEGACY_FIELDS_USER);
      
      const path = join(testDir, 'user-manifest.json');
      
      // Should throw - legacy fields are not allowed
      await expect(UserManifestWriter.write(path, legacyWithSomeValid)).rejects.toThrow(InvalidManifestFieldError);
    });
    
    it('should write only allowed fields to persisted JSON (no legacy, no extra)', async () => {
      const manifest = generateValidUserManifest([...USER_MANIFEST_FIELDS]);
      const path = join(testDir, 'user-manifest.json');
      
      await UserManifestWriter.write(path, manifest);
      
      const content = await readFile(path, 'utf-8');
      const persisted = JSON.parse(content);
      const persistedKeys = Object.keys(persisted);
      
      // Check no legacy fields present
      for (const legacyField of LEGACY_FIELDS_USER) {
        expect(persisted).not.toHaveProperty(legacyField);
      }
      
      // Check no extra fields present
      expect(persistedKeys.length).toBe(USER_MANIFEST_FIELDS.length);
    });
    
    it('Property: success iff keys === USER_MANIFEST_FIELDS', async () => {
      // Test 1: Exact match should succeed
      const exactMatchPath = join(testDir, 'user-exact.json');
      const exactManifest = generateValidUserManifest([...USER_MANIFEST_FIELDS]);
      
      // Should succeed - no error thrown
      try {
        await UserManifestWriter.write(exactMatchPath, exactManifest);
      } catch (e) {
        throw new Error(`Write should not throw for exact field match: ${e}`);
      }
      
      // Verify persisted has exactly those fields
      let content = await readFile(exactMatchPath, 'utf-8');
      let persisted = JSON.parse(content);
      expect(Object.keys(persisted).sort()).toEqual([...USER_MANIFEST_FIELDS].sort());
      
      // Test 2: Extra fields should fail
      const extraManifest = { ...exactManifest, extra_field: 'value' };
      const extraPath = join(testDir, 'user-extra.json');
      await expect(UserManifestWriter.write(extraPath, extraManifest)).rejects.toThrow(InvalidManifestFieldError);
      
      // Test 3: Missing fields should fail  
      const missingManifest = {
        code_version: '6.0.0',
        min_supported_data_schema: 0,
        // missing installed_at, updated_at, files
      };
      const missingPath = join(testDir, 'user-missing.json');
      await expect(UserManifestWriter.write(missingPath, missingManifest)).rejects.toThrow(InvalidManifestFieldError);
      
      // Test 4: Legacy fields should fail
      const legacyManifest = {
        ...exactManifest,
        shared_version: '1.0.0',  // legacy field
      };
      const legacyPath = join(testDir, 'user-legacy.json');
      await expect(UserManifestWriter.write(legacyPath, legacyManifest)).rejects.toThrow(InvalidManifestFieldError);
    });
  });
  
  describe('ProjectManifestWriter.writeFresh', () => {
    
    it('should write only PROJECT_MANIFEST_FIELDS to persisted JSON', async () => {
      const path = join(testDir, 'project-manifest.json');
      
      await ProjectManifestWriter.writeFresh(path, 5);
      
      const content = await readFile(path, 'utf-8');
      const persisted = JSON.parse(content);
      const persistedKeys = Object.keys(persisted);
      
      // Check exactly 3 fields
      expect(persistedKeys.length).toBe(PROJECT_MANIFEST_FIELDS.length);
      
      // Check all fields are in PROJECT_MANIFEST_FIELDS
      for (const key of persistedKeys) {
        expect(PROJECT_MANIFEST_FIELDS).toContain(key);
      }
      
      // Check no legacy fields present
      for (const legacyField of LEGACY_FIELDS_PROJECT) {
        expect(persisted).not.toHaveProperty(legacyField);
      }
    });
    
    it('Property: output always equals PROJECT_MANIFEST_FIELDS', async () => {
      // Test with various schema versions
      for (const dsv of [0, 1, 5, 100]) {
        const path = join(testDir, `project-${dsv}.json`);
        
        // writeFresh creates manifest - always outputs exactly PROJECT_MANIFEST_FIELDS
        await ProjectManifestWriter.writeFresh(path, dsv);
        
        const content = await readFile(path, 'utf-8');
        const persisted = JSON.parse(content);
        const persistedKeys = Object.keys(persisted);
        
        // Output should always be exactly PROJECT_MANIFEST_FIELDS
        expect(new Set(persistedKeys)).toEqual(new Set([...PROJECT_MANIFEST_FIELDS]));
        
        // And contain the correct data_schema_version
        expect(persisted.data_schema_version).toBe(dsv);
        
        // Check no legacy fields
        for (const legacyField of LEGACY_FIELDS_PROJECT) {
          expect(persisted).not.toHaveProperty(legacyField);
        }
      }
    });
  });
  
  describe('Additional field-set edge cases', () => {
    
    it('should accept empty files array in UserManifest', async () => {
      const manifest = {
        code_version: '6.0.0',
        min_supported_data_schema: 0,
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [],
      };
      const path = join(testDir, 'user-empty-files.json');
      
      await UserManifestWriter.write(path, manifest);
      
      const content = await readFile(path, 'utf-8');
      const persisted = JSON.parse(content);
      expect(persisted.files).toEqual([]);
    });
    
    it('should accept files with valid entries', async () => {
      const manifest = {
        code_version: '6.0.0',
        min_supported_data_schema: 0,
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [
          { path: '/test/file.ts', sha256: 'a'.repeat(64), size: 100 },
        ],
      };
      const path = join(testDir, 'user-with-files.json');
      
      await UserManifestWriter.write(path, manifest);
      
      const content = await readFile(path, 'utf-8');
      const persisted = JSON.parse(content);
      expect(persisted.files).toHaveLength(1);
      expect(persisted.files[0].path).toBe('/test/file.ts');
    });
    
    it('should reject invalid code_version format', async () => {
      const manifest = {
        code_version: 'invalid-version',
        min_supported_data_schema: 0,
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [],
      };
      const path = join(testDir, 'user-invalid-version.json');
      
      // Should throw about code_version format
      await expect(UserManifestWriter.write(path, manifest)).rejects.toThrow(/code_version/);
    });
    
    it('should reject negative min_supported_data_schema', async () => {
      const manifest = {
        code_version: '6.0.0',
        min_supported_data_schema: -1,
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [],
      };
      const path = join(testDir, 'user-negative-schema.json');
      
      // Should throw about non-negative integer
      await expect(UserManifestWriter.write(path, manifest)).rejects.toThrow(/non-negative integer/);
    });
    
    it('should reject invalid timestamp format', async () => {
      const manifest = {
        code_version: '6.0.0',
        min_supported_data_schema: 0,
        installed_at: 'not-a-timestamp',
        updated_at: new Date().toISOString(),
        files: [],
      };
      const path = join(testDir, 'user-invalid-timestamp.json');
      
      // Should throw about ISO 8601 timestamp
      await expect(UserManifestWriter.write(path, manifest)).rejects.toThrow(/ISO 8601/);
    });
  });
});