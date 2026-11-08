/**
 * GateResult Type Definition Tests
 * 
 * Tests for the GateResult interface to ensure:
 * - Correct structure and field types
 * - Schema version validation
 * - Optional field handling
 * - Type safety
 * 
 * **Validates: Requirements 2.2** - Gate Execution Determinism
 */

import { describe, it, expect } from 'vitest';
import type { GateResult } from '../../src/types';

describe('GateResult Interface', () => {
  describe('Basic Structure', () => {
    it('should create a minimal GateResult with required fields', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
      };

      expect(result.schema_version).toBe('1.0');
      expect(result.passed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.details).toBeUndefined();
    });

    it('should create a complete GateResult with all fields', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: false,
        reason: 'Validation failed',
        details: {
          failedChecks: ['check1', 'check2'],
          errorCount: 2,
          timestamp: '2024-01-15T10:30:00Z',
        },
      };

      expect(result.schema_version).toBe('1.0');
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('Validation failed');
      expect(result.details?.failedChecks).toEqual(['check1', 'check2']);
      expect(result.details?.errorCount).toBe(2);
    });
  });

  describe('Schema Version', () => {
    it('should enforce schema_version as "1.0"', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
      };

      expect(result.schema_version).toBe('1.0');
      // TypeScript will enforce this at compile time
    });

    it('should be immutable in the type definition', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
      };

      // Verify the literal type is enforced
      expect(result.schema_version).toBe('1.0');
    });
  });

  describe('Passed Field', () => {
    it('should support passed=true', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
      };

      expect(result.passed).toBe(true);
    });

    it('should support passed=false', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: false,
      };

      expect(result.passed).toBe(false);
    });

    it('should be required field', () => {
      // This test verifies TypeScript compilation
      // @ts-expect-error - passed is required
      const result: GateResult = {
        schema_version: '1.0',
      };
    });
  });

  describe('Reason Field', () => {
    it('should support optional reason for passed result', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
        reason: 'All checks passed',
      };

      expect(result.reason).toBe('All checks passed');
    });

    it('should support optional reason for failed result', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: false,
        reason: 'Validation failed: missing required field',
      };

      expect(result.reason).toBe('Validation failed: missing required field');
    });

    it('should be optional', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
      };

      expect(result.reason).toBeUndefined();
    });

    it('should support empty string as reason', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: false,
        reason: '',
      };

      expect(result.reason).toBe('');
    });
  });

  describe('Details Field', () => {
    it('should support optional details object', () => {
      const details = {
        checkedItems: 10,
        passedItems: 8,
        failedItems: 2,
      };

      const result: GateResult = {
        schema_version: '1.0',
        passed: false,
        details,
      };

      expect(result.details).toEqual(details);
      expect(result.details?.checkedItems).toBe(10);
    });

    it('should support nested objects in details', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
        details: {
          metadata: {
            executionTime: 1234,
            environment: 'test',
          },
          results: [
            { id: 'check1', status: 'passed' },
            { id: 'check2', status: 'passed' },
          ],
        },
      };

      expect(result.details?.metadata).toEqual({
        executionTime: 1234,
        environment: 'test',
      });
      expect(Array.isArray(result.details?.results)).toBe(true);
    });

    it('should support various data types in details', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
        details: {
          stringValue: 'test',
          numberValue: 42,
          booleanValue: true,
          nullValue: null,
          arrayValue: [1, 2, 3],
          objectValue: { nested: 'value' },
        },
      };

      expect(result.details?.stringValue).toBe('test');
      expect(result.details?.numberValue).toBe(42);
      expect(result.details?.booleanValue).toBe(true);
      expect(result.details?.nullValue).toBeNull();
      expect(result.details?.arrayValue).toEqual([1, 2, 3]);
      expect(result.details?.objectValue).toEqual({ nested: 'value' });
    });

    it('should be optional', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
      };

      expect(result.details).toBeUndefined();
    });

    it('should support empty object as details', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
        details: {},
      };

      expect(result.details).toEqual({});
    });
  });

  describe('Type Safety', () => {
    it('should enforce correct types at compile time', () => {
      // This test verifies TypeScript compilation
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
        reason: 'Test',
        details: { key: 'value' },
      };

      // All fields should be accessible with correct types
      const schemaVersion: string = result.schema_version;
      const passed: boolean = result.passed;
      const reason: string | undefined = result.reason;
      const details: Record<string, unknown> | undefined = result.details;

      expect(schemaVersion).toBe('1.0');
      expect(passed).toBe(true);
      expect(reason).toBe('Test');
      expect(details).toEqual({ key: 'value' });
    });

    it('should reject invalid schema_version at compile time', () => {
      // @ts-expect-error - schema_version must be "1.0"
      const result: GateResult = {
        schema_version: '2.0',
        passed: true,
      };
    });

    it('should reject non-boolean passed value at compile time', () => {
      // @ts-expect-error - passed must be boolean
      const result: GateResult = {
        schema_version: '1.0',
        passed: 'true',
      };
    });

    it('should reject non-string reason at compile time', () => {
      // @ts-expect-error - reason must be string
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
        reason: 123,
      };
    });

    it('should reject non-object details at compile time', () => {
      // @ts-expect-error - details must be Record<string, unknown>
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
        details: 'not an object',
      };
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should support success result pattern', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
        reason: 'All requirements validated successfully',
        details: {
          validatedCount: 15,
          duration: 234,
        },
      };

      expect(result.passed).toBe(true);
      expect(result.reason).toContain('successfully');
    });

    it('should support failure result pattern', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: false,
        reason: 'Design validation failed',
        details: {
          errors: [
            'Missing component documentation',
            'Invalid state transitions',
          ],
          failedAt: 'design-gate-2',
        },
      };

      expect(result.passed).toBe(false);
      expect(result.details?.errors).toHaveLength(2);
    });

    it('should support timeout result pattern', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: false,
        reason: 'Gate execution timeout',
        details: {
          timeoutMs: 5000,
          elapsedMs: 5001,
          operation: 'verification-gate',
        },
      };

      expect(result.passed).toBe(false);
      expect(result.details?.timeoutMs).toBe(5000);
    });

    it('should support error result pattern', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: false,
        reason: 'Gate execution error',
        details: {
          errorType: 'ValidationError',
          errorMessage: 'Invalid workflow definition',
          stack: 'Error: Invalid workflow definition\n    at ...',
        },
      };

      expect(result.passed).toBe(false);
      expect(result.details?.errorType).toBe('ValidationError');
    });
  });

  describe('Serialization', () => {
    it('should be JSON serializable', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
        reason: 'Test passed',
        details: { key: 'value' },
      };

      const json = JSON.stringify(result);
      const parsed = JSON.parse(json) as GateResult;

      expect(parsed.schema_version).toBe('1.0');
      expect(parsed.passed).toBe(true);
      expect(parsed.reason).toBe('Test passed');
      expect(parsed.details?.key).toBe('value');
    });

    it('should preserve all fields during serialization', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: false,
        reason: 'Complex test',
        details: {
          nested: {
            deep: {
              value: 42,
            },
          },
          array: [1, 2, 3],
        },
      };

      const json = JSON.stringify(result);
      const parsed = JSON.parse(json) as GateResult;

      expect(parsed).toEqual(result);
    });

    it('should handle undefined fields in serialization', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: true,
      };

      const json = JSON.stringify(result);
      const parsed = JSON.parse(json) as GateResult;

      expect(parsed.schema_version).toBe('1.0');
      expect(parsed.passed).toBe(true);
      expect(parsed.reason).toBeUndefined();
      expect(parsed.details).toBeUndefined();
    });
  });
});
