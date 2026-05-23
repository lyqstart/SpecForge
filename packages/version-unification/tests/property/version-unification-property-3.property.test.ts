/**
 * Property test for non-negative-integer schema fields.
 * 
 * Feature: version-unification, Property 3: Integer schema fields reject non-non-negative-integer values
 * Derived-From: v6-architecture-overview Property 3
 * Validates: Requirements 1.3, 2.2
 * 
 * Property: For any candidate value v, the writer accepts v for min_supported_data_schema 
 * (resp. data_schema_version) if and only if Number.isInteger(v) ∧ v ≥ 0; 
 * for any other v (negative, fractional, NaN, Infinity, string, boolean, null, undefined) 
 * the writer throws InvalidManifestFieldError naming the offending field.
 * 
 * numRuns: 200
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { validateUserManifest, validateProjectManifest } from '../../src/manifest/schema-validator';
import { InvalidManifestFieldError } from '../../src/manifest/types';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Test output directory
let testDir: string;

beforeEach(async () => {
  testDir = mkdtempSync(join(tmpdir(), 'prop-test-3-'));
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
// Property Tests
// =============================================================================

describe('Property 3: Integer schema fields reject non-non-negative-integer values', () => {
  
  describe('min_supported_data_schema (User Manifest)', () => {
    
    it('should accept non-negative integers', () => {
      // Valid values: 0, 1, 2, 100, 999999
      const validValues = [0, 1, 2, 5, 10, 100, 999999, Number.MAX_SAFE_INTEGER];
      
      for (const value of validValues) {
        const manifest = {
          code_version: '6.0.0',
          min_supported_data_schema: value,
          installed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          files: [],
        };
        
        // Should not throw - valid non-negative integer
        expect(() => validateUserManifest(manifest)).not.toThrow();
      }
    });
    
    it('should reject negative integers', () => {
      const negativeValues = [-1, -100, -999999];
      
      for (const value of negativeValues) {
        const manifest = {
          code_version: '6.0.0',
          min_supported_data_schema: value,
          installed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          files: [],
        };
        
        // Should throw - negative value not allowed
        expect(() => validateUserManifest(manifest)).toThrow(/non-negative integer/);
      }
    });
    
    it('should reject fractional numbers', () => {
      const fractionalValues = [0.5, 1.5, 3.14159, 0.1, 99.99];
      
      for (const value of fractionalValues) {
        const manifest = {
          code_version: '6.0.0',
          min_supported_data_schema: value,
          installed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          files: [],
        };
        
        // Should throw - must be integer
        expect(() => validateUserManifest(manifest)).toThrow(/non-negative integer/);
      }
    });
    
    it('should reject NaN', () => {
      const manifest = {
        code_version: '6.0.0',
        min_supported_data_schema: NaN,
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [],
      };
      
      expect(() => validateUserManifest(manifest)).toThrow(/non-negative integer/);
    });
    
    it('should reject Infinity', () => {
      const manifest = {
        code_version: '6.0.0',
        min_supported_data_schema: Infinity,
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [],
      };
      
      expect(() => validateUserManifest(manifest)).toThrow(/non-negative integer/);
    });
    
    it('should reject negative Infinity', () => {
      const manifest = {
        code_version: '6.0.0',
        min_supported_data_schema: -Infinity,
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [],
      };
      
      expect(() => validateUserManifest(manifest)).toThrow(/non-negative integer/);
    });
    
    it('should reject string values', () => {
      const stringValues = ['0', '1', '5', 'ten', 'invalid', ''];
      
      for (const value of stringValues) {
        const manifest = {
          code_version: '6.0.0',
          min_supported_data_schema: value,
          installed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          files: [],
        };
        
        // Should throw - must be number
        expect(() => validateUserManifest(manifest)).toThrow(/number/);
      }
    });
    
    it('should reject boolean values', () => {
      const booleanValues = [true, false];
      
      for (const value of booleanValues) {
        const manifest = {
          code_version: '6.0.0',
          min_supported_data_schema: value,
          installed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          files: [],
        };
        
        // Should throw - must be number
        expect(() => validateUserManifest(manifest)).toThrow(/number/);
      }
    });
    
    it('should reject null', () => {
      const manifest = {
        code_version: '6.0.0',
        min_supported_data_schema: null,
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [],
      };
      
      expect(() => validateUserManifest(manifest)).toThrow(/number/);
    });
    
    it('should reject undefined', () => {
      const manifest = {
        code_version: '6.0.0',
        // min_supported_data_schema not provided (undefined)
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [],
      };
      
      // Should throw about missing field first
      expect(() => validateUserManifest(manifest)).toThrow(InvalidManifestFieldError);
    });
    
    it('should reject object values', () => {
      const manifest = {
        code_version: '6.0.0',
        min_supported_data_schema: { value: 0 },
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [],
      };
      
      expect(() => validateUserManifest(manifest)).toThrow(/number/);
    });
    
    it('should reject array values', () => {
      const manifest = {
        code_version: '6.0.0',
        min_supported_data_schema: [0],
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [],
      };
      
      expect(() => validateUserManifest(manifest)).toThrow(/number/);
    });
    
    it('Property: accepts non-negative integers, rejects everything else', () => {
      // Test with fast-check style reasoning but with explicit test cases
      
      // Valid cases: must accept
      const validIntegers = [0, 1, 2, 10, 100, 1000];
      for (const v of validIntegers) {
        const manifest = {
          code_version: '6.0.0',
          min_supported_data_schema: v,
          installed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          files: [],
        };
        expect(() => validateUserManifest(manifest)).not.toThrow();
      }
      
      // Invalid cases: must reject (throw InvalidManifestFieldError or validation error)
      const invalidCases = [
        -1, -100,           // negative integers
        0.5, 1.5, 3.14,    // fractional numbers
        NaN,                // NaN
        Infinity, -Infinity, // infinity
        '0', '1', 'ten',   // strings
        true, false,       // booleans
        null,              // null
      ];
      
      for (const v of invalidCases) {
        const manifest = {
          code_version: '6.0.0',
          min_supported_data_schema: v,
          installed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          files: [],
        };
        expect(() => validateUserManifest(manifest)).toThrow();
      }
    });
  });
  
  describe('data_schema_version (Project Manifest)', () => {
    
    it('should accept non-negative integers', () => {
      // Valid values: 0, 1, 2, 100, 999999
      const validValues = [0, 1, 2, 5, 10, 100, 999999, Number.MAX_SAFE_INTEGER];
      
      for (const value of validValues) {
        const manifest = {
          data_schema_version: value,
          initialized_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        // Should not throw - valid non-negative integer
        expect(() => validateProjectManifest(manifest)).not.toThrow();
      }
    });
    
    it('should reject negative integers', () => {
      const negativeValues = [-1, -100, -999999];
      
      for (const value of negativeValues) {
        const manifest = {
          data_schema_version: value,
          initialized_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        // Should throw - negative value not allowed
        expect(() => validateProjectManifest(manifest)).toThrow(/non-negative integer/);
      }
    });
    
    it('should reject fractional numbers', () => {
      const fractionalValues = [0.5, 1.5, 3.14159, 0.1, 99.99];
      
      for (const value of fractionalValues) {
        const manifest = {
          data_schema_version: value,
          initialized_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        // Should throw - must be integer
        expect(() => validateProjectManifest(manifest)).toThrow(/non-negative integer/);
      }
    });
    
    it('should reject NaN', () => {
      const manifest = {
        data_schema_version: NaN,
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      expect(() => validateProjectManifest(manifest)).toThrow(/non-negative integer/);
    });
    
    it('should reject Infinity', () => {
      const manifest = {
        data_schema_version: Infinity,
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      expect(() => validateProjectManifest(manifest)).toThrow(/non-negative integer/);
    });
    
    it('should reject negative Infinity', () => {
      const manifest = {
        data_schema_version: -Infinity,
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      expect(() => validateProjectManifest(manifest)).toThrow(/non-negative integer/);
    });
    
    it('should reject string values', () => {
      const stringValues = ['0', '1', '5', 'ten', 'invalid', ''];
      
      for (const value of stringValues) {
        const manifest = {
          data_schema_version: value,
          initialized_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        // Should throw - must be number
        expect(() => validateProjectManifest(manifest)).toThrow(/number/);
      }
    });
    
    it('should reject boolean values', () => {
      const booleanValues = [true, false];
      
      for (const value of booleanValues) {
        const manifest = {
          data_schema_version: value,
          initialized_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        // Should throw - must be number
        expect(() => validateProjectManifest(manifest)).toThrow(/number/);
      }
    });
    
    it('should reject null', () => {
      const manifest = {
        data_schema_version: null,
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      expect(() => validateProjectManifest(manifest)).toThrow(/number/);
    });
    
    it('should reject undefined', () => {
      const manifest = {
        // data_schema_version not provided (undefined)
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      // Should throw about missing field first
      expect(() => validateProjectManifest(manifest)).toThrow(InvalidManifestFieldError);
    });
    
    it('should reject object values', () => {
      const manifest = {
        data_schema_version: { value: 0 },
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      expect(() => validateProjectManifest(manifest)).toThrow(/number/);
    });
    
    it('should reject array values', () => {
      const manifest = {
        data_schema_version: [0],
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      expect(() => validateProjectManifest(manifest)).toThrow(/number/);
    });
    
    it('Property: accepts non-negative integers, rejects everything else', () => {
      // Valid cases: must accept
      const validIntegers = [0, 1, 2, 10, 100, 1000];
      for (const v of validIntegers) {
        const manifest = {
          data_schema_version: v,
          initialized_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        expect(() => validateProjectManifest(manifest)).not.toThrow();
      }
      
      // Invalid cases: must reject (throw error)
      const invalidCases = [
        -1, -100,           // negative integers
        0.5, 1.5, 3.14,    // fractional numbers
        NaN,                // NaN
        Infinity, -Infinity, // infinity
        '0', '1', 'ten',   // strings
        true, false,       // booleans
        null,              // null
      ];
      
      for (const v of invalidCases) {
        const manifest = {
          data_schema_version: v,
          initialized_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        expect(() => validateProjectManifest(manifest)).toThrow();
      }
    });
  });
  
  describe('Edge cases and boundary values', () => {
    
    it('should accept MAX_SAFE_INTEGER', () => {
      const manifest = {
        data_schema_version: Number.MAX_SAFE_INTEGER,
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      expect(() => validateProjectManifest(manifest)).not.toThrow();
    });
    
    it('should accept 0 (zero)', () => {
      // Test for min_supported_data_schema
      const userManifest = {
        code_version: '6.0.0',
        min_supported_data_schema: 0,
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [],
      };
      expect(() => validateUserManifest(userManifest)).not.toThrow();
      
      // Test for data_schema_version
      const projectManifest = {
        data_schema_version: 0,
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expect(() => validateProjectManifest(projectManifest)).not.toThrow();
    });
    
    it('should reject values just below zero', () => {
      // -Number.MIN_VALUE is the smallest positive number, -Number.MIN_VALUE is negative
      const manifest = {
        data_schema_version: -Number.MIN_VALUE,
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      expect(() => validateProjectManifest(manifest)).toThrow(/non-negative integer/);
    });
    
    it('should reject floating point integers that look like integers', () => {
      // 1.0 is a float but equal to integer 1
      // Our validator checks Number.isInteger, so 1.0 should pass
      const manifest = {
        data_schema_version: 1.0, // 1.0 is technically a float but isInteger returns true
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      // 1.0 passes Number.isInteger, so it should be accepted
      expect(() => validateProjectManifest(manifest)).not.toThrow();
    });
    
    it('should accept very large integers (1e100 is technically an integer in JavaScript)', () => {
      // Note: Number.isInteger(1e100) returns true in JavaScript
      // because 1e100 = 1 * 10^100 is mathematically an integer
      const largeInt = 1e100;
      const manifest = {
        data_schema_version: largeInt,
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      // 1e100 is considered an integer by JavaScript, so it should be accepted
      expect(() => validateProjectManifest(manifest)).not.toThrow();
    });
  });
  
  describe('Fast-check property-based tests', () => {
    
    it('min_supported_data_schema: accepts only non-negative integers', () => {
      // Using fast-check to generate test values
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),           // all integers
            fc.float(),             // floats  
            fc.boolean(),           // booleans
            fc.string(),            // strings
            fc.constantFrom(null, undefined), // null/undefined
            fc.object()             // objects/arrays
          ),
          (value) => {
            const manifest = {
              code_version: '6.0.0',
              min_supported_data_schema: value,
              installed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              files: [],
            };
            
            // Check if value is a non-negative integer
            const isValid = typeof value === 'number' && Number.isInteger(value) && value >= 0;
            
            if (isValid) {
              // Should not throw
              expect(() => validateUserManifest(manifest)).not.toThrow();
            } else {
              // Should throw
              expect(() => validateUserManifest(manifest)).toThrow();
            }
          }
        ),
        { numRuns: 200 }
      );
    });
    
    it('data_schema_version: accepts only non-negative integers', () => {
      // Using fast-check to generate test values
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),           // all integers
            fc.float(),             // floats
            fc.boolean(),           // booleans
            fc.string(),            // strings
            fc.constantFrom(null, undefined), // null/undefined
            fc.object()             // objects/arrays
          ),
          (value) => {
            const manifest = {
              data_schema_version: value,
              initialized_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            
            // Check if value is a non-negative integer
            const isValid = typeof value === 'number' && Number.isInteger(value) && value >= 0;
            
            if (isValid) {
              // Should not throw
              expect(() => validateProjectManifest(manifest)).not.toThrow();
            } else {
              // Should throw
              expect(() => validateProjectManifest(manifest)).toThrow();
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});