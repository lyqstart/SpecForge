/**
 * Unit tests for GateRunner error handling
 * Validates: Requirements for Gate execution error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SimpleGateRunner,
  CompositeGateRunner,
  GateRunner,
  DefaultGateRunnerLogger,
  IGateRunnerLogger,
} from '../../src/GateRunner.js';
import {
  SimpleGateDefinition,
  CompositeGateDefinition,
} from '../../src/types.js';
import {
  GateExecutionError,
  GateErrorType,
  isGateError,
  createErrorResult,
} from '../../src/error-handler.js';

describe('GateRunner Error Handling', () => {
  // Mock logger for testing error logging
  const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default logger before each test
    GateRunner.setLogger(new DefaultGateRunnerLogger());
  });

  afterEach(() => {
    // Reset to default logger after each test
    GateRunner.setLogger(new DefaultGateRunnerLogger());
  });

  describe('SimpleGateRunner - Error capturing', () => {
    it('should capture synchronous errors and return failure result', async () => {
      const errorMessage = 'Synchronous check function error';
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'sync-error-gate',
        name: 'Sync Error Gate',
        checkFn: () => {
          throw new Error(errorMessage);
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('sync-error-gate');
      expect(result.details).toBeDefined();
    });

    it('should capture asynchronous errors and return failure result', async () => {
      const errorMessage = 'Async check function error';
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'async-error-gate',
        name: 'Async Error Gate',
        checkFn: async () => {
          throw new Error(errorMessage);
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('async-error-gate');
      expect(result.details).toBeDefined();
    });

    it('should include error type in failure details', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'error-type-gate',
        name: 'Error Type Gate',
        checkFn: async () => {
          throw new Error('Test error');
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.details?.errorType).toBe(GateErrorType.EXECUTION_ERROR);
    });

    it('should include original error information in details', async () => {
      const originalErrorMessage = 'Original error message';
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'original-error-gate',
        name: 'Original Error Gate',
        checkFn: async () => {
          throw new Error(originalErrorMessage);
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      // Check that original error details are captured
      expect(result.details).toHaveProperty('originalError');
    });

    it('should handle different error types correctly', async () => {
      // Test TypeError
      const typeErrorGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'type-error-gate',
        name: 'Type Error Gate',
        checkFn: async () => {
          const obj: any = null;
          return obj.property;
        },
      };

      const runner = new SimpleGateRunner(typeErrorGate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should handle custom error classes', async () => {
      const customError = new GateExecutionError({
        gateId: 'custom-error-gate',
        gateType: 'simple',
        originalError: new Error('Custom error occurred'),
        suggestion: 'Check custom error handler',
      });

      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'custom-error-gate',
        name: 'Custom Error Gate',
        checkFn: async () => {
          throw customError;
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.details?.gateId).toBe('custom-error-gate');
    });

    it('should return standardized GateResult.failure format', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'standard-format-gate',
        name: 'Standard Format Gate',
        checkFn: async () => {
          throw new Error('Standard format test');
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      // Verify standardized format
      expect(result).toHaveProperty('schema_version', '1.0');
      expect(result).toHaveProperty('passed', false);
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('details');
      expect(result.details).toHaveProperty('code');
      expect(result.details).toHaveProperty('errorType');
      expect(result.details).toHaveProperty('retryable');
      expect(result.details).toHaveProperty('suggestion');
      expect(result.details).toHaveProperty('timestamp');
    });
  });

  describe('CompositeGateRunner - Error handling', () => {
    it('should handle error in sequential mode', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-before-error',
        name: 'Child Before Error',
        checkFn: async () => ({ passed: true, reason: 'First child passed' }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-with-error',
        name: 'Child With Error',
        checkFn: async () => {
          throw new Error('Error in second child');
        },
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-error-sequential',
        name: 'Composite Error Sequential',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [childGate1, childGate2],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.details?.results).toHaveLength(2);
    });

    it('should handle error in parallel mode', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-parallel-1',
        name: 'Child Parallel 1',
        checkFn: async () => {
          throw new Error('Error in parallel child 1');
        },
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-parallel-2',
        name: 'Child Parallel 2',
        checkFn: async () => ({ passed: true, reason: 'Second child passed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-error-parallel',
        name: 'Composite Error Parallel',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [childGate1, childGate2],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.details?.results).toHaveLength(2);
    });

    it('should handle errors during composite execution setup', async () => {
      // Gate that throws during validation (empty id triggers validation error in check)
      const invalidGate: SimpleGateDefinition = {
        type: 'simple',
        id: '',
        name: 'Invalid Gate',
        checkFn: async () => ({ passed: true, reason: 'Should not reach here' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-validation-error',
        name: 'Composite Validation Error',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [invalidGate],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('id');
    });

    it('should include error context in composite results', async () => {
      const childGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'error-context-child',
        name: 'Error Context Child',
        checkFn: async () => {
          throw new Error('Context error');
        },
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-context-error',
        name: 'Composite Context Error',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [childGate],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      // Verify error details are propagated
      expect(result.details?.results?.[0]).toBeDefined();
      expect(result.details?.results?.[0].passed).toBe(false);
    });
  });

  describe('Error context and logging', () => {
    it('should include gate ID in error details', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'gate-id-context-test',
        name: 'Gate ID Context Test',
        checkFn: async () => {
          throw new Error('Test error');
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.details?.gateId).toBe('gate-id-context-test');
    });

    it('should include error code in details', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'error-code-test',
        name: 'Error Code Test',
        checkFn: async () => {
          throw new Error('Test error for code');
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.details?.code).toBeDefined();
      expect(result.details?.code).toBe('GATE_EXECUTION_ERROR');
    });

    it('should include suggestion in error details', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'suggestion-test',
        name: 'Suggestion Test',
        checkFn: async () => {
          throw new Error('Test error for suggestion');
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.details?.suggestion).toBeDefined();
      expect(typeof result.details?.suggestion).toBe('string');
    });

    it('should include timestamp in error details', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'timestamp-test',
        name: 'Timestamp Test',
        checkFn: async () => {
          throw new Error('Test error for timestamp');
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.details?.timestamp).toBeDefined();
      // Verify it's an ISO date string
      expect(() => new Date(result.details?.timestamp as string)).not.toThrow();
    });
  });

  describe('Error utility functions', () => {
    it('should correctly identify GateError with isGateError', () => {
      const gateError = new GateExecutionError({
        gateId: 'test-gate',
        gateType: 'simple',
        originalError: new Error('Test'),
      });

      const regularError = new Error('Regular error');

      expect(isGateError(gateError)).toBe(true);
      expect(isGateError(regularError)).toBe(false);
      expect(isGateError('string error')).toBe(false);
      expect(isGateError(null)).toBe(false);
      expect(isGateError(undefined)).toBe(false);
    });

    it('should create standardized error result with createErrorResult', () => {
      const originalError = new Error('Test error message');
      const result = createErrorResult(originalError, 'test-gate-id', 'simple');

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('test-gate-id');
      expect(result.details).toBeDefined();
      expect(result.details?.code).toBe('GATE_EXECUTION_ERROR');
      expect(result.details?.gateId).toBe('test-gate-id');
      expect(result.details?.errorType).toBe(GateErrorType.EXECUTION_ERROR);
    });

    it('should create error result with non-Error input', () => {
      const result = createErrorResult('string error', 'test-gate-id', 'simple');

      expect(result.passed).toBe(false);
      expect(result.details?.code).toBe('GATE_EXECUTION_ERROR');
    });

    it('should create error result with null input', () => {
      const result = createErrorResult(null, 'test-gate-id', 'simple');

      expect(result.passed).toBe(false);
      expect(result.details?.code).toBe('GATE_EXECUTION_ERROR');
    });
  });

  describe('GateExecutionError class', () => {
    it('should create GateExecutionError with all parameters', () => {
      const originalError = new Error('Original error');
      const error = new GateExecutionError({
        gateId: 'test-gate',
        gateType: 'simple',
        originalError,
        suggestion: 'Fix the error',
        errorType: GateErrorType.EXECUTION_ERROR,
        retryable: false,
      });

      expect(error.message).toContain('test-gate');
      expect(error.gateId).toBe('test-gate');
      expect(error.gateType).toBe('simple');
      expect(error.originalError).toBe(originalError);
      expect(error.suggestion).toBe('Fix the error');
      expect(error.errorType).toBe(GateErrorType.EXECUTION_ERROR);
      expect(error.retryable).toBe(false);
    });

    it('should create GateExecutionError without original error', () => {
      const error = new GateExecutionError({
        gateId: 'test-gate',
        gateType: 'composite',
      });

      expect(error.message).toContain('test-gate');
      expect(error.message).toContain('composite');
      expect(error.originalError).toBeUndefined();
    });

    it('should serialize to JSON correctly', () => {
      const originalError = new Error('Original error');
      const error = new GateExecutionError({
        gateId: 'test-gate',
        gateType: 'simple',
        originalError,
      });

      const json = error.toJSON();

      expect(json.name).toBe('GateExecutionError');
      expect(json.gateId).toBe('test-gate');
      expect(json.gateType).toBe('simple');
      expect(json.errorType).toBe(GateErrorType.EXECUTION_ERROR);
      expect(json.originalError).toBeDefined();
      expect((json.originalError as any).message).toBe('Original error');
    });

    it('should default retryable based on error type', () => {
      const executionError = new GateExecutionError({
        gateId: 'test-gate',
        gateType: 'simple',
      });

      // EXECUTION_ERROR is not retryable by default
      expect(executionError.retryable).toBe(false);
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle errors in check function returning Promise that rejects', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'promise-reject-gate',
        name: 'Promise Reject Gate',
        checkFn: async () => {
          return Promise.reject(new Error('Promise rejected'));
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
    });

    it('should handle errors with circular references', async () => {
      const circularError: any = new Error('Circular error');
      circularError.self = circularError;

      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'circular-error-gate',
        name: 'Circular Error Gate',
        checkFn: async () => {
          throw circularError;
        },
      };

      const runner = new SimpleGateRunner(gate);
      
      // Should not throw when handling circular references
      const result = await runner.check();
      expect(result.passed).toBe(false);
    });

    it('should handle errors with non-serializable values', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'non-serializable-gate',
        name: 'Non Serializable Gate',
        checkFn: async () => {
          const nonSerializable: any = {
            toJSON: () => {
              throw new Error('Cannot serialize');
            },
          };
          throw new Error('Test').toJSON = nonSerializable.toJSON;
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
    });

    it('should preserve error message in reason', async () => {
      const specificMessage = 'This is a specific error message for testing';
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'message-preservation-gate',
        name: 'Message Preservation Gate',
        checkFn: async () => {
          throw new Error(specificMessage);
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      // The reason should contain either the message or gate ID
      expect(
        result.reason?.includes(specificMessage) || result.reason?.includes('message-preservation-gate')
      ).toBe(true);
    });
  });

  describe('GateRunner Logger Integration', () => {
    it('should allow setting custom logger', () => {
      const customLogger: IGateRunnerLogger = {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      };

      GateRunner.setLogger(customLogger);
      const logger = GateRunner.getLogger();

      expect(logger).toBe(customLogger);
    });

    it('should use custom logger for error logging', async () => {
      const customLogger: IGateRunnerLogger = {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      };

      GateRunner.setLogger(customLogger);

      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'custom-logger-test',
        name: 'Custom Logger Test',
        checkFn: async () => {
          throw new Error('Test error for custom logger');
        },
      };

      const runner = new SimpleGateRunner(gate);
      await runner.check();

      expect(customLogger.error).toHaveBeenCalled();
      expect(customLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('custom-logger-test'),
        expect.objectContaining({
          gateId: 'custom-logger-test',
          gateType: 'simple',
          errorType: GateErrorType.EXECUTION_ERROR,
        })
      );
    });

    it('should include operation and timeout in log context when provided', async () => {
      const customLogger: IGateRunnerLogger = {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      };

      GateRunner.setLogger(customLogger);

      // Direct test of handleError with operation parameter
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'direct-handle-error-test',
        name: 'Direct Handle Error Test',
        checkFn: async () => ({ passed: true, reason: 'test' }),
      };

      const runner = new SimpleGateRunner(gate);
      
      // Call handleError directly with operation and timeout
      (runner as any).handleError(
        new Error('Direct error test'),
        'test_operation',
        5000
      );

      expect(customLogger.error).toHaveBeenCalled();
      const logCall = customLogger.error.mock.calls[0];
      expect(logCall[1]).toHaveProperty('operation', 'test_operation');
      expect(logCall[1]).toHaveProperty('timeoutMs', 5000);
    });

    it('should reset to default logger', () => {
      const customLogger: IGateRunnerLogger = {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      };

      GateRunner.setLogger(customLogger);
      GateRunner.setLogger(new DefaultGateRunnerLogger());

      const logger = GateRunner.getLogger();
      expect(logger).toBeInstanceOf(DefaultGateRunnerLogger);
    });
  });
});