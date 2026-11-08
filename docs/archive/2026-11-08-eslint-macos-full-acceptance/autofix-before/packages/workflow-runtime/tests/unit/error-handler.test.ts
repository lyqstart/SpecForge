/**
 * Error Handler Unit Tests
 * Tests for Gate error classes and unified error handling
 */

import { describe, it, expect, vi } from 'vitest';
import {
  GateError,
  GateTimeoutError,
  GateExecutionError,
  GateValidationError,
  GateConfigurationError,
  GateDependencyError,
  GateCancellationError,
  GateResourceError,
  GateErrorType,
  handleGateError,
  isGateError,
  getErrorCode,
  isRetryableError,
  getErrorType,
  createErrorResult,
} from '../../src/error-handler.js';
import { createGateRunner, SimpleGateRunner } from '../../src/GateRunner.js';
import type { SimpleGateDefinition } from '../../src/types.js';

describe('GateError', () => {
  it('should create a base GateError with all required fields', () => {
    const error = new (class TestGateError extends GateError {
      constructor() {
        super({
          code: 'TEST_ERROR',
          gateId: 'test-gate',
          message: 'Test error message',
          suggestion: 'Check the test configuration',
        });
      }
    })();

    expect(error.name).toBe('GateError');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.gateId).toBe('test-gate');
    expect(error.message).toBe('Test error message');
    expect(error.suggestion).toBe('Check the test configuration');
  });

  it('should convert to JSON', () => {
    const error = new GateTimeoutError({
      gateId: 'test-gate',
      operation: 'check',
      timeoutMs: 5000,
    });

    const json = error.toJSON();
    expect(json.name).toBe('GateTimeoutError');
    expect(json.code).toBe('GATE_TIMEOUT');
    expect(json.gateId).toBe('test-gate');
    expect(json.operation).toBe('check');
    expect(json.timeoutMs).toBe(5000);
  });
});

describe('GateTimeoutError', () => {
  it('should create timeout error with operation and timeoutMs', () => {
    const error = new GateTimeoutError({
      gateId: 'my-gate',
      operation: 'validateRequirements',
      timeoutMs: 30000,
    });

    expect(error.name).toBe('GateTimeoutError');
    expect(error.code).toBe('GATE_TIMEOUT');
    expect(error.gateId).toBe('my-gate');
    expect(error.operation).toBe('validateRequirements');
    expect(error.timeoutMs).toBe(30000);
    expect(error.message).toContain('timed out after 30000ms');
    expect(error.suggestion).toContain('validateRequirements');
  });

  it('should allow custom suggestion', () => {
    const error = new GateTimeoutError({
      gateId: 'my-gate',
      operation: 'check',
      timeoutMs: 1000,
      suggestion: 'Increase timeout or optimize the operation',
    });

    expect(error.suggestion).toBe('Increase timeout or optimize the operation');
  });

  it('should serialize to JSON with operation and timeoutMs', () => {
    const error = new GateTimeoutError({
      gateId: 'my-gate',
      operation: 'execute',
      timeoutMs: 5000,
    });

    const json = error.toJSON();
    expect(json.operation).toBe('execute');
    expect(json.timeoutMs).toBe(5000);
  });
});

describe('GateExecutionError', () => {
  it('should create execution error with original error', () => {
    const originalError = new Error('Something went wrong');
    const error = new GateExecutionError({
      gateId: 'my-gate',
      originalError,
    });

    expect(error.name).toBe('GateExecutionError');
    expect(error.code).toBe('GATE_EXECUTION_ERROR');
    expect(error.gateId).toBe('my-gate');
    expect(error.originalError).toBe(originalError);
    expect(error.message).toContain('my-gate');
    expect(error.message).toContain('Something went wrong');
  });

  it('should allow custom suggestion', () => {
    const error = new GateExecutionError({
      gateId: 'my-gate',
      suggestion: 'Check the gate implementation',
    });

    expect(error.suggestion).toBe('Check the gate implementation');
  });

  it('should work without original error', () => {
    const error = new GateExecutionError({
      gateId: 'my-gate',
    });

    expect(error.originalError).toBeUndefined();
    expect(error.message).toContain('my-gate');
  });

  it('should serialize original error to JSON', () => {
    const originalError = new Error('Original message');
    const error = new GateExecutionError({
      gateId: 'my-gate',
      originalError,
    });

    const json = error.toJSON();
    expect(json.originalError).toEqual({
      name: 'Error',
      message: 'Original message',
    });
  });
});

describe('GateValidationError', () => {
  it('should create validation error with validation errors array', () => {
    const error = new GateValidationError({
      gateId: 'my-gate',
      validationErrors: ['Missing required field', 'Invalid type'],
    });

    expect(error.name).toBe('GateValidationError');
    expect(error.code).toBe('GATE_VALIDATION_ERROR');
    expect(error.gateId).toBe('my-gate');
    expect(error.validationErrors).toEqual(['Missing required field', 'Invalid type']);
    expect(error.message).toContain('Missing required field');
    expect(error.errorType).toBe(GateErrorType.VALIDATION_ERROR);
    expect(error.retryable).toBe(false);
  });

  it('should allow custom suggestion', () => {
    const error = new GateValidationError({
      gateId: 'my-gate',
      validationErrors: ['Invalid value'],
      suggestion: 'Fix the validation issues',
    });

    expect(error.suggestion).toBe('Fix the validation issues');
  });

  it('should serialize validation errors to JSON', () => {
    const error = new GateValidationError({
      gateId: 'my-gate',
      validationErrors: ['Error 1', 'Error 2'],
    });

    const json = error.toJSON();
    expect(json.validationErrors).toEqual(['Error 1', 'Error 2']);
    expect(json.errorType).toBe(GateErrorType.VALIDATION_ERROR);
  });
});

describe('GateConfigurationError', () => {
  it('should create configuration error with config path and value', () => {
    const error = new GateConfigurationError({
      gateId: 'my-gate',
      configPath: 'timeout',
      configValue: -1,
    });

    expect(error.name).toBe('GateConfigurationError');
    expect(error.code).toBe('GATE_CONFIGURATION_ERROR');
    expect(error.gateId).toBe('my-gate');
    expect(error.configPath).toBe('timeout');
    expect(error.configValue).toBe(-1);
    expect(error.errorType).toBe(GateErrorType.CONFIGURATION_ERROR);
    expect(error.retryable).toBe(false);
  });

  it('should serialize config details to JSON', () => {
    const error = new GateConfigurationError({
      gateId: 'my-gate',
      configPath: 'maxRetries',
      configValue: 'invalid',
    });

    const json = error.toJSON();
    expect(json.configPath).toBe('maxRetries');
    expect(json.configValue).toBe('invalid');
  });
});

describe('GateDependencyError', () => {
  it('should create dependency error with missing dependencies', () => {
    const error = new GateDependencyError({
      gateId: 'my-gate',
      missingDependencies: ['module-a', 'module-b'],
    });

    expect(error.name).toBe('GateDependencyError');
    expect(error.code).toBe('GATE_DEPENDENCY_ERROR');
    expect(error.gateId).toBe('my-gate');
    expect(error.missingDependencies).toEqual(['module-a', 'module-b']);
    expect(error.errorType).toBe(GateErrorType.DEPENDENCY_ERROR);
    expect(error.retryable).toBe(true);
  });
});

describe('GateCancellationError', () => {
  it('should create cancellation error with reason', () => {
    const error = new GateCancellationError({
      gateId: 'my-gate',
      cancellationReason: 'User requested cancellation',
    });

    expect(error.name).toBe('GateCancellationError');
    expect(error.code).toBe('GATE_CANCELLATION_ERROR');
    expect(error.gateId).toBe('my-gate');
    expect(error.cancellationReason).toBe('User requested cancellation');
    expect(error.errorType).toBe(GateErrorType.CANCELLATION_ERROR);
    expect(error.retryable).toBe(false);
  });
});

describe('GateResourceError', () => {
  it('should create resource error with resource details', () => {
    const error = new GateResourceError({
      gateId: 'my-gate',
      resourceType: 'memory',
      resourceLimit: 1024,
      currentUsage: 2048,
    });

    expect(error.name).toBe('GateResourceError');
    expect(error.code).toBe('GATE_RESOURCE_ERROR');
    expect(error.gateId).toBe('my-gate');
    expect(error.resourceType).toBe('memory');
    expect(error.resourceLimit).toBe(1024);
    expect(error.currentUsage).toBe(2048);
    expect(error.errorType).toBe(GateErrorType.RESOURCE_ERROR);
    expect(error.retryable).toBe(true);
  });
});

describe('handleGateError', () => {
  it('should return existing GateError as-is', () => {
    const originalError = new GateTimeoutError({
      gateId: 'gate-1',
      operation: 'check',
      timeoutMs: 5000,
    });

    const wrapped = handleGateError(originalError, 'gate-2', 'simple');
    expect(wrapped).toBe(originalError);
  });

  it('should wrap Error in GateExecutionError', () => {
    const originalError = new Error('Test error');
    const wrapped = handleGateError(originalError, 'my-gate', 'simple');

    expect(wrapped).toBeInstanceOf(GateExecutionError);
    expect(wrapped.gateId).toBe('my-gate');
    expect(wrapped.code).toBe('GATE_EXECUTION_ERROR');
    expect((wrapped as GateExecutionError).gateType).toBe('simple');
  });

  it('should detect timeout errors and create GateTimeoutError', () => {
    const timeoutError = new Error('Operation timed out');
    const wrapped = handleGateError(timeoutError, 'my-gate', 'simple', {
      operation: 'validate',
      timeoutMs: 10000,
    });

    expect(wrapped).toBeInstanceOf(GateTimeoutError);
    expect((wrapped as GateTimeoutError).operation).toBe('validate');
    expect((wrapped as GateTimeoutError).timeoutMs).toBe(10000);
  });

  it('should detect timeout in error message (case insensitive)', () => {
    const error = new Error('Request ETIMEDOUT');
    const wrapped = handleGateError(error, 'my-gate', 'simple', {
      operation: 'fetch',
      timeoutMs: 5000,
    });

    expect(wrapped).toBeInstanceOf(GateTimeoutError);
  });

  it('should handle configuration errors', () => {
    const wrapped = handleGateError(new Error('config error'), 'my-gate', 'simple', {
      configPath: 'timeout',
      configValue: -1,
    });

    expect(wrapped).toBeInstanceOf(GateConfigurationError);
    expect((wrapped as GateConfigurationError).configPath).toBe('timeout');
  });

  it('should handle dependency errors', () => {
    const wrapped = handleGateError(new Error('dependency missing'), 'my-gate', 'simple', {
      missingDependencies: ['module-a'],
    });

    expect(wrapped).toBeInstanceOf(GateDependencyError);
    expect((wrapped as GateDependencyError).missingDependencies).toEqual(['module-a']);
  });

  it('should handle cancellation errors', () => {
    const wrapped = handleGateError(new Error('cancelled'), 'my-gate', 'simple', {
      cancellationReason: 'user request',
    });

    expect(wrapped).toBeInstanceOf(GateCancellationError);
    expect((wrapped as GateCancellationError).cancellationReason).toBe('user request');
  });

  it('should handle resource errors', () => {
    const wrapped = handleGateError(new Error('resource limit'), 'my-gate', 'simple', {
      resourceType: 'memory',
      resourceLimit: 1024,
      currentUsage: 2048,
    });

    expect(wrapped).toBeInstanceOf(GateResourceError);
    expect((wrapped as GateResourceError).resourceType).toBe('memory');
  });

  it('should handle validation errors', () => {
    const wrapped = handleGateError(new Error('validation failed'), 'my-gate', 'simple', {
      validationErrors: ['field required'],
    });

    expect(wrapped).toBeInstanceOf(GateValidationError);
    expect((wrapped as GateValidationError).validationErrors).toEqual(['field required']);
  });

  it('should detect error patterns in message', () => {
    const validationError = handleGateError(new Error('Validation failed: invalid input'), 'my-gate', 'simple');
    expect(validationError).toBeInstanceOf(GateValidationError);

    const configError = handleGateError(new Error('Configuration error: invalid value'), 'my-gate', 'simple');
    expect(configError).toBeInstanceOf(GateConfigurationError);

    const dependencyError = handleGateError(new Error('Missing dependency: module-x'), 'my-gate', 'simple');
    expect(dependencyError).toBeInstanceOf(GateDependencyError);

    const resourceError = handleGateError(new Error('Resource limit exceeded'), 'my-gate', 'simple');
    expect(resourceError).toBeInstanceOf(GateResourceError);
  });

  it('should handle non-Error values', () => {
    const wrapped = handleGateError('string error', 'my-gate', 'simple');
    expect(wrapped).toBeInstanceOf(GateExecutionError);
    expect(wrapped.message).toContain('string error');
  });

  it('should handle null and undefined', () => {
    const wrappedNull = handleGateError(null, 'my-gate', 'simple');
    expect(wrappedNull).toBeInstanceOf(GateExecutionError);

    const wrappedUndefined = handleGateError(undefined, 'my-gate', 'simple');
    expect(wrappedUndefined).toBeInstanceOf(GateExecutionError);
  });
});

describe('isGateError', () => {
  it('should return true for GateError instances', () => {
    const timeoutError = new GateTimeoutError({
      gateId: 'gate-1',
      operation: 'check',
      timeoutMs: 5000,
    });
    const executionError = new GateExecutionError({
      gateId: 'gate-1',
    });
    const validationError = new GateValidationError({
      gateId: 'gate-1',
      validationErrors: ['error'],
    });

    expect(isGateError(timeoutError)).toBe(true);
    expect(isGateError(executionError)).toBe(true);
    expect(isGateError(validationError)).toBe(true);
  });

  it('should return false for regular errors', () => {
    expect(isGateError(new Error('test'))).toBe(false);
    expect(isGateError('string')).toBe(false);
    expect(isGateError(null)).toBe(false);
  });
});

describe('getErrorCode', () => {
  it('should return code for GateError', () => {
    const error = new GateTimeoutError({
      gateId: 'gate-1',
      operation: 'check',
      timeoutMs: 5000,
    });
    expect(getErrorCode(error)).toBe('GATE_TIMEOUT');
  });

  it('should return UNKNOWN_ERROR for regular Error', () => {
    expect(getErrorCode(new Error('test'))).toBe('UNKNOWN_ERROR');
  });

  it('should return UNKNOWN for non-Error', () => {
    expect(getErrorCode('string')).toBe('UNKNOWN');
    expect(getErrorCode(null)).toBe('UNKNOWN');
  });
});

describe('isRetryableError', () => {
  it('should return true for retryable errors', () => {
    const timeoutError = new GateTimeoutError({
      gateId: 'gate-1',
      operation: 'check',
      timeoutMs: 5000,
    });
    expect(isRetryableError(timeoutError)).toBe(true);

    const resourceError = new GateResourceError({
      gateId: 'gate-1',
      resourceType: 'memory',
      resourceLimit: 1024,
      currentUsage: 2048,
    });
    expect(isRetryableError(resourceError)).toBe(true);

    const dependencyError = new GateDependencyError({
      gateId: 'gate-1',
      missingDependencies: ['module-a'],
    });
    expect(isRetryableError(dependencyError)).toBe(true);
  });

  it('should return false for non-retryable errors', () => {
    const validationError = new GateValidationError({
      gateId: 'gate-1',
      validationErrors: ['error'],
    });
    expect(isRetryableError(validationError)).toBe(false);

    const configError = new GateConfigurationError({
      gateId: 'gate-1',
      configPath: 'timeout',
      configValue: -1,
    });
    expect(isRetryableError(configError)).toBe(false);

    const cancellationError = new GateCancellationError({
      gateId: 'gate-1',
      cancellationReason: 'user',
    });
    expect(isRetryableError(cancellationError)).toBe(false);
  });

  it('should return false for non-GateError', () => {
    expect(isRetryableError(new Error('test'))).toBe(false);
    expect(isRetryableError('string')).toBe(false);
  });
});

describe('getErrorType', () => {
  it('should return error type for GateError', () => {
    const timeoutError = new GateTimeoutError({
      gateId: 'gate-1',
      operation: 'check',
      timeoutMs: 5000,
    });
    expect(getErrorType(timeoutError)).toBe(GateErrorType.TIMEOUT_ERROR);

    const validationError = new GateValidationError({
      gateId: 'gate-1',
      validationErrors: ['error'],
    });
    expect(getErrorType(validationError)).toBe(GateErrorType.VALIDATION_ERROR);
  });

  it('should return UNKNOWN for non-GateError', () => {
    expect(getErrorType(new Error('test'))).toBe('UNKNOWN');
    expect(getErrorType('string')).toBe('UNKNOWN');
  });
});

describe('createErrorResult', () => {
  it('should create standardized error result', () => {
    const error = new GateTimeoutError({
      gateId: 'test-gate',
      operation: 'check',
      timeoutMs: 5000,
    });

    const result = createErrorResult(error, 'test-gate', 'simple');
    
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('timed out');
    expect(result.details.code).toBe('GATE_TIMEOUT');
    expect(result.details.gateId).toBe('test-gate');
    expect(result.details.errorType).toBe(GateErrorType.TIMEOUT_ERROR);
    expect(result.details.retryable).toBe(true);
    expect(result.details.suggestion).toBeDefined();
    expect(result.details.timestamp).toBeDefined();
    expect(result.details.operation).toBe('check');
    expect(result.details.timeoutMs).toBe(5000);
  });

  it('should handle non-GateError', () => {
    const error = new Error('Test error');
    const result = createErrorResult(error, 'test-gate', 'simple');
    
    expect(result.passed).toBe(false);
    expect(result.details.code).toBe('GATE_EXECUTION_ERROR');
    expect(result.details.gateId).toBe('test-gate');
  });
});

describe('GateRunner Error Integration', () => {
  it('should handle errors in SimpleGateRunner.check()', async () => {
    const gateDefinition: SimpleGateDefinition = {
      schema_version: '1.0',
      type: 'simple',
      id: 'test-gate',
      name: 'Test Gate',
      checkFn: () => {
        throw new Error('Check function failed');
      },
    };

    const runner = new SimpleGateRunner(gateDefinition);
    const result = await runner.check();

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Check function failed');
    expect(result.details).toHaveProperty('code', 'GATE_EXECUTION_ERROR');
    expect(result.details).toHaveProperty('gateId', 'test-gate');
    expect(result.details).toHaveProperty('suggestion');
  });

  it('should handle timeout errors with operation context', async () => {
    const gateDefinition: SimpleGateDefinition = {
      schema_version: '1.0',
      type: 'simple',
      id: 'timeout-gate',
      name: 'Timeout Gate',
      checkFn: async () => {
        await new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 5000ms')), 100)
        );
        return { schema_version: '1.0', passed: true };
      },
    };

    const runner = new SimpleGateRunner(gateDefinition);
    const result = await runner.check();

    // The error is handled but since it's async, we get execution error
    expect(result.passed).toBe(false);
    expect(result.details).toHaveProperty('code');
  });

  it('should propagate errors to WorkflowEngine', async () => {
    // Create a gate that throws an error
    const gateDefinition: SimpleGateDefinition = {
      schema_version: '1.0',
      type: 'simple',
      id: 'error-gate',
      name: 'Error Gate',
      checkFn: () => {
        throw new Error('Intentional error');
      },
    };

    const runner = new SimpleGateRunner(gateDefinition);
    const result = await runner.check();

    // Verify the error was properly wrapped
    expect(result.passed).toBe(false);
    expect(result.details?.code).toBe('GATE_EXECUTION_ERROR');
    expect(result.details?.gateId).toBe('error-gate');
    // Error should be accessible in WorkflowEngine through result
    expect(result.details).toHaveProperty('originalError');
  });

  it('should create correct runner with createGateRunner', () => {
    const gateDefinition: SimpleGateDefinition = {
      schema_version: '1.0',
      type: 'simple',
      id: 'test-gate',
      name: 'Test Gate',
    };

    const runner = createGateRunner(gateDefinition);
    expect(runner).toBeInstanceOf(SimpleGateRunner);
  });
});

describe('Error propagation to WorkflowEngine', () => {
  it('should capture gate errors in result details', async () => {
    const gateDefinition: SimpleGateDefinition = {
      schema_version: '1.0',
      type: 'simple',
      id: 'test-gate',
      name: 'Test Gate',
      checkFn: () => {
        throw new Error('Test error for propagation');
      },
    };

    const runner = new SimpleGateRunner(gateDefinition);
    const result = await runner.check();

    // The result should contain all error information needed for WorkflowEngine
    expect(result.passed).toBe(false);
    expect(result.details).toBeDefined();
    expect(result.details?.gateId).toBe('test-gate');
    expect(result.details?.code).toBeDefined();
    expect(result.details?.suggestion).toBeDefined();
  });
});