/**
 * Property Test: Error Handling
 * 
 * Feature: error-handling
 * Property: Error handling robustness and correctness
 * 
 * Validates: Requirements for error handling (Requirements 2.5)
 * - THE Workflow_Runtime SHALL process Gate execution failures
 * - THE Workflow_Runtime SHALL support workflow instance pause/resume
 * - THE Workflow_Runtime SHALL provide error retry mechanism
 * - THE Workflow_Runtime SHALL support workflow state recovery from crashes
 * 
 * Derived-From: workflow-runtime Requirements 5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  handleGateError,
  isGateError,
  isRetryableError,
  getErrorCode,
  getErrorType,
  createErrorResult,
  GateError,
  GateTimeoutError,
  GateExecutionError,
  GateValidationError,
  GateConfigurationError,
  GateDependencyError,
  GateCancellationError,
  GateResourceError,
  GateErrorType,
} from '../../src/error-handler';
import { SimpleGateRunner, CompositeGateRunner } from '../../src/GateRunner';
import type { SimpleGateDefinition, CompositeGateDefinition } from '../../src/types';

// Configure iterations - using 100 as per spec requirements
const NUM_ITERATIONS = 100;

describe('Property: Error Handling - Error Classification', () => {
  
  describe('Error Type Detection', () => {
    /**
     * Property: handleGateError correctly classifies timeout errors
     */
    it('should classify timeout errors correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.integer({ min: 100, max: 60000 }),
          (gateId, operation, timeoutMs) => {
            const error = new Error('Operation timed out');
            const result = handleGateError(error, gateId, 'simple', {
              operation,
              timeoutMs
            });
            
            expect(result).toBeInstanceOf(GateTimeoutError);
            expect(result.gateId).toBe(gateId);
            expect((result as GateTimeoutError).operation).toBe(operation);
            expect((result as GateTimeoutError).timeoutMs).toBe(timeoutMs);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: handleGateError correctly classifies configuration errors
     */
    it('should classify configuration errors correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.oneof(fc.integer(), fc.string(), fc.boolean()),
          (gateId, configPath, configValue) => {
            const error = new Error('Config error');
            const result = handleGateError(error, gateId, 'simple', {
              configPath,
              configValue
            });
            
            expect(result).toBeInstanceOf(GateConfigurationError);
            expect(result.gateId).toBe(gateId);
            expect((result as GateConfigurationError).configPath).toBe(configPath);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: handleGateError correctly classifies dependency errors
     */
    it('should classify dependency errors correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
          (gateId, dependencies) => {
            const error = new Error('Missing dependency');
            const result = handleGateError(error, gateId, 'simple', {
              missingDependencies: dependencies
            });
            
            expect(result).toBeInstanceOf(GateDependencyError);
            expect(result.gateId).toBe(gateId);
            expect((result as GateDependencyError).missingDependencies).toEqual(dependencies);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: handleGateError correctly classifies validation errors
     */
    it('should classify validation errors correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
          (gateId, validationErrors) => {
            const error = new Error('Validation failed');
            const result = handleGateError(error, gateId, 'simple', {
              validationErrors
            });
            
            expect(result).toBeInstanceOf(GateValidationError);
            expect(result.gateId).toBe(gateId);
            expect((result as GateValidationError).validationErrors).toEqual(validationErrors);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: handleGateError correctly classifies resource errors
     */
    it('should classify resource errors correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 10000 }),
          fc.integer({ min: 1, max: 20000 }),
          (gateId, resourceType, limit, usage) => {
            const error = new Error('Resource limit exceeded');
            const result = handleGateError(error, gateId, 'simple', {
              resourceType,
              resourceLimit: limit,
              currentUsage: usage
            });
            
            expect(result).toBeInstanceOf(GateResourceError);
            expect(result.gateId).toBe(gateId);
            expect((result as GateResourceError).resourceType).toBe(resourceType);
            expect((result as GateResourceError).resourceLimit).toBe(limit);
            expect((result as GateResourceError).currentUsage).toBe(usage);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: handleGateError correctly classifies cancellation errors
     */
    it('should classify cancellation errors correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (gateId, reason) => {
            const error = new Error('Cancelled');
            const result = handleGateError(error, gateId, 'simple', {
              cancellationReason: reason
            });
            
            expect(result).toBeInstanceOf(GateCancellationError);
            expect(result.gateId).toBe(gateId);
            expect((result as GateCancellationError).cancellationReason).toBe(reason);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Error Message Accuracy', () => {
    /**
     * Property: Timeout error messages contain all required information
     */
    it('should include gate ID, operation, and timeout in error message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.integer({ min: 100, max: 60000 }),
          (gateId, operation, timeoutMs) => {
            const error = new GateTimeoutError({ gateId, operation, timeoutMs });
            
            expect(error.message).toContain(gateId);
            expect(error.message).toContain(operation);
            expect(error.message).toContain(String(timeoutMs));
            expect(error.suggestion).toContain(operation);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Validation error messages list all validation errors
     */
    it('should include all validation errors in message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
          (gateId, errors) => {
            const error = new GateValidationError({ gateId, validationErrors: errors });
            
            for (const err of errors) {
              expect(error.message).toContain(err);
            }
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Configuration error messages include path and value
     */
    it('should include config path and value in message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.oneof(fc.integer(), fc.string(), fc.boolean()),
          (gateId, configPath, configValue) => {
            const error = new GateConfigurationError({ gateId, configPath, configValue });
            
            expect(error.message).toContain(configPath);
            expect(error.message).toContain(JSON.stringify(configValue));
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Dependency error messages list all missing dependencies
     */
    it('should list all missing dependencies in message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
          (gateId, deps) => {
            const error = new GateDependencyError({ gateId, missingDependencies: deps });
            
            for (const dep of deps) {
              expect(error.message).toContain(dep);
            }
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Resource error messages include type, limit, and usage
     */
    it('should include resource info in message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 10000 }),
          fc.integer({ min: 1, max: 20000 }),
          (gateId, resourceType, limit, usage) => {
            const error = new GateResourceError({
              gateId, resourceType, resourceLimit: limit, currentUsage: usage
            });
            
            expect(error.message).toContain(resourceType);
            expect(error.message).toContain(String(limit));
            expect(error.message).toContain(String(usage));
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Retryability Classification', () => {
    /**
     * Property: Timeout errors are retryable
     */
    it('should classify timeout errors as retryable', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.integer({ min: 100, max: 60000 }),
          (gateId, operation, timeoutMs) => {
            const error = new GateTimeoutError({ gateId, operation, timeoutMs });
            expect(isRetryableError(error)).toBe(true);
            expect(error.retryable).toBe(true);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Resource errors are retryable
     */
    it('should classify resource errors as retryable', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 10000 }),
          fc.integer({ min: 1, max: 20000 }),
          (gateId, resourceType, limit, usage) => {
            const error = new GateResourceError({
              gateId, resourceType, resourceLimit: limit, currentUsage: usage
            });
            expect(isRetryableError(error)).toBe(true);
            expect(error.retryable).toBe(true);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Dependency errors are retryable
     */
    it('should classify dependency errors as retryable', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
          (gateId, deps) => {
            const error = new GateDependencyError({ gateId, missingDependencies: deps });
            expect(isRetryableError(error)).toBe(true);
            expect(error.retryable).toBe(true);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Validation errors are not retryable
     */
    it('should classify validation errors as non-retryable', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
          (gateId, errors) => {
            const error = new GateValidationError({ gateId, validationErrors: errors });
            expect(isRetryableError(error)).toBe(false);
            expect(error.retryable).toBe(false);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Configuration errors are not retryable
     */
    it('should classify configuration errors as non-retryable', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.oneof(fc.integer(), fc.string()),
          (gateId, path, value) => {
            const error = new GateConfigurationError({ gateId, configPath: path, configValue: value });
            expect(isRetryableError(error)).toBe(false);
            expect(error.retryable).toBe(false);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Cancellation errors are not retryable
     */
    it('should classify cancellation errors as non-retryable', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (gateId, reason) => {
            const error = new GateCancellationError({ gateId, cancellationReason: reason });
            expect(isRetryableError(error)).toBe(false);
            expect(error.retryable).toBe(false);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Error Code and Type', () => {
    /**
     * Property: getErrorCode returns correct codes for all error types
     */
    it('should return correct error codes', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (gateId) => {
            const timeoutError = new GateTimeoutError({ gateId, operation: 'check', timeoutMs: 5000 });
            expect(getErrorCode(timeoutError)).toBe('GATE_TIMEOUT');
            
            const execError = new GateExecutionError({ gateId, gateType: 'simple' });
            expect(getErrorCode(execError)).toBe('GATE_EXECUTION_ERROR');
            
            const validationError = new GateValidationError({ gateId, validationErrors: ['error'] });
            expect(getErrorCode(validationError)).toBe('GATE_VALIDATION_ERROR');
            
            const configError = new GateConfigurationError({ gateId, configPath: 'path', configValue: 'value' });
            expect(getErrorCode(configError)).toBe('GATE_CONFIGURATION_ERROR');
            
            const depError = new GateDependencyError({ gateId, missingDependencies: ['dep'] });
            expect(getErrorCode(depError)).toBe('GATE_DEPENDENCY_ERROR');
            
            const cancelError = new GateCancellationError({ gateId, cancellationReason: 'reason' });
            expect(getErrorCode(cancelError)).toBe('GATE_CANCELLATION_ERROR');
            
            const resourceError = new GateResourceError({ gateId, resourceType: 'memory', resourceLimit: 100, currentUsage: 200 });
            expect(getErrorCode(resourceError)).toBe('GATE_RESOURCE_ERROR');
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: getErrorType returns correct types for all error types
     */
    it('should return correct error types', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (gateId) => {
            const timeoutError = new GateTimeoutError({ gateId, operation: 'check', timeoutMs: 5000 });
            expect(getErrorType(timeoutError)).toBe(GateErrorType.TIMEOUT_ERROR);
            
            const execError = new GateExecutionError({ gateId, gateType: 'simple' });
            expect(getErrorType(execError)).toBe(GateErrorType.EXECUTION_ERROR);
            
            const validationError = new GateValidationError({ gateId, validationErrors: ['error'] });
            expect(getErrorType(validationError)).toBe(GateErrorType.VALIDATION_ERROR);
            
            const configError = new GateConfigurationError({ gateId, configPath: 'path', configValue: 'value' });
            expect(getErrorType(configError)).toBe(GateErrorType.CONFIGURATION_ERROR);
            
            const depError = new GateDependencyError({ gateId, missingDependencies: ['dep'] });
            expect(getErrorType(depError)).toBe(GateErrorType.DEPENDENCY_ERROR);
            
            const cancelError = new GateCancellationError({ gateId, cancellationReason: 'reason' });
            expect(getErrorType(cancelError)).toBe(GateErrorType.CANCELLATION_ERROR);
            
            const resourceError = new GateResourceError({ gateId, resourceType: 'memory', resourceLimit: 100, currentUsage: 200 });
            expect(getErrorType(resourceError)).toBe(GateErrorType.RESOURCE_ERROR);
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Error Result Creation', () => {
    /**
     * Property: createErrorResult produces standardized error results
     */
    it('should create standardized error results', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.oneof(fc.constant('simple'), fc.constant('composite')),
          (gateId, errorMessage, gateType) => {
            const error = new Error(errorMessage);
            const result = createErrorResult(error, gateId, gateType);
            
            expect(result.passed).toBe(false);
            expect(result.reason).toBeDefined();
            expect(result.details).toBeDefined();
            expect(result.details.code).toBeDefined();
            expect(result.details.gateId).toBe(gateId);
            expect(result.details.errorType).toBeDefined();
            expect(result.details.retryable).toBeDefined();
            expect(result.details.suggestion).toBeDefined();
            expect(result.details.timestamp).toBeDefined();
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Error JSON Serialization', () => {
    /**
     * Property: All error types serialize to JSON correctly
     */
    it('should serialize all error types to JSON', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (gateId) => {
            // Timeout error
            const timeoutError = new GateTimeoutError({ gateId, operation: 'check', timeoutMs: 5000 });
            const timeoutJson = timeoutError.toJSON();
            expect(timeoutJson.name).toBe('GateTimeoutError');
            expect(timeoutJson.operation).toBe('check');
            expect(timeoutJson.timeoutMs).toBe(5000);
            
            // Execution error
            const execError = new GateExecutionError({ gateId, gateType: 'simple', originalError: new Error('test') });
            const execJson = execError.toJSON();
            expect(execJson.name).toBe('GateExecutionError');
            expect(execJson.gateType).toBe('simple');
            
            // Validation error
            const validationError = new GateValidationError({ gateId, validationErrors: ['error1', 'error2'] });
            const validationJson = validationError.toJSON();
            expect(validationJson.name).toBe('GateValidationError');
            expect(validationJson.validationErrors).toEqual(['error1', 'error2']);
            
            // Configuration error
            const configError = new GateConfigurationError({ gateId, configPath: 'path', configValue: 'value' });
            const configJson = configError.toJSON();
            expect(configJson.name).toBe('GateConfigurationError');
            expect(configJson.configPath).toBe('path');
            
            // Dependency error
            const depError = new GateDependencyError({ gateId, missingDependencies: ['dep1'] });
            const depJson = depError.toJSON();
            expect(depJson.name).toBe('GateDependencyError');
            expect(depJson.missingDependencies).toEqual(['dep1']);
            
            // Cancellation error
            const cancelError = new GateCancellationError({ gateId, cancellationReason: 'reason' });
            const cancelJson = cancelError.toJSON();
            expect(cancelJson.name).toBe('GateCancellationError');
            expect(cancelJson.cancellationReason).toBe('reason');
            
            // Resource error
            const resourceError = new GateResourceError({ gateId, resourceType: 'memory', resourceLimit: 100, currentUsage: 200 });
            const resourceJson = resourceError.toJSON();
            expect(resourceJson.name).toBe('GateResourceError');
            expect(resourceJson.resourceType).toBe('memory');
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Error Handling Edge Cases', () => {
    /**
     * Property: handleGateError preserves existing GateError instances
     */
    it('should preserve existing GateError instances', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (gateId) => {
            const originalError = new GateTimeoutError({ gateId, operation: 'check', timeoutMs: 5000 });
            const wrapped = handleGateError(originalError, 'different-gate', 'simple');
            expect(wrapped).toBe(originalError);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: handleGateError handles null and undefined errors
     */
    it('should handle null and undefined errors', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (gateId) => {
            const nullResult = handleGateError(null, gateId, 'simple');
            expect(nullResult).toBeInstanceOf(GateExecutionError);
            
            const undefinedResult = handleGateError(undefined, gateId, 'simple');
            expect(undefinedResult).toBeInstanceOf(GateExecutionError);
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: handleGateError handles non-Error values
     */
    it('should handle non-Error values', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined)
          ),
          (gateId, value) => {
            if (value === null || value === undefined) return true;
            
            const result = handleGateError(value, gateId, 'simple');
            expect(result).toBeInstanceOf(GateExecutionError);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Error Pattern Detection', () => {
    /**
     * Property: Error message pattern detection works correctly
     */
    it('should detect error patterns in messages', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (gateId) => {
            // Validation pattern
            const validationError = handleGateError(
              new Error('Validation failed: invalid input'),
              gateId,
              'simple'
            );
            expect(validationError).toBeInstanceOf(GateValidationError);
            
            // Configuration pattern
            const configError = handleGateError(
              new Error('Configuration error: invalid value'),
              gateId,
              'simple'
            );
            expect(configError).toBeInstanceOf(GateConfigurationError);
            
            // Dependency pattern
            const depError = handleGateError(
              new Error('Missing dependency: module-x'),
              gateId,
              'simple'
            );
            expect(depError).toBeInstanceOf(GateDependencyError);
            
            // Resource pattern
            const resourceError = handleGateError(
              new Error('Resource limit exceeded'),
              gateId,
              'simple'
            );
            expect(resourceError).toBeInstanceOf(GateResourceError);
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('isGateError Detection', () => {
    /**
     * Property: isGateError correctly identifies GateError instances
     */
    it('should correctly identify GateError instances', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (gateId) => {
            const gateError = new GateTimeoutError({ gateId, operation: 'check', timeoutMs: 5000 });
            const regularError = new Error('Regular error');
            const stringError = 'string error';
            
            expect(isGateError(gateError)).toBe(true);
            expect(isGateError(regularError)).toBe(false);
            expect(isGateError(stringError)).toBe(false);
            expect(isGateError(null)).toBe(false);
            expect(isGateError(undefined)).toBe(false);
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Error Recovery Path', () => {
    /**
     * Property: GateRunner handles errors and returns proper error results
     */
    it('should return error results when gate check fails', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (gateId, errorMessage) => {
            const gateDefinition: SimpleGateDefinition = {
              type: 'simple',
              id: gateId,
              name: 'Test Gate',
              checkFn: async () => {
                throw new Error(errorMessage);
              }
            };
            
            const runner = new SimpleGateRunner(gateDefinition);
            const result = runner.check();
            
            // The result should be a Promise
            expect(result).toBeInstanceOf(Promise);
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: CompositeGateRunner handles errors in children correctly
     */
    it('should handle errors in composite gate children', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              shouldFail: fc.boolean()
            }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.oneof(fc.constant('sequential'), fc.constant('parallel')),
          fc.oneof(fc.constant('fail_fast'), fc.constant('collect_all')),
          (compositeId, children, mode, failPolicy) => {
            const childGates: SimpleGateDefinition[] = children.map((child, index) => ({
              type: 'simple' as const,
              id: child.id,
              name: `Child ${index}`,
              checkFn: async () => {
                if (child.shouldFail) {
                  throw new Error(`Child ${index} failed`);
                }
                return { passed: true, reason: `Child ${index} passed` };
              }
            }));
            
            const compositeGate: CompositeGateDefinition = {
              type: 'composite',
              id: compositeId,
              name: 'Test Composite',
              mode,
              failPolicy,
              children: childGates
            };
            
            const runner = new CompositeGateRunner(compositeGate);
            const result = runner.check();
            
            expect(result).toBeInstanceOf(Promise);
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });
});

describe('Error Handling Edge Cases - Unit Tests', () => {
  /**
   * Edge Case: Circular reference in error
   */
  it('should handle errors with circular references', async () => {
    const circularError: any = new Error('Circular error');
    circularError.self = circularError;
    
    const gateDefinition: SimpleGateDefinition = {
      type: 'simple',
      id: 'circular-test',
      name: 'Circular Test',
      checkFn: async () => {
        throw circularError;
      }
    };
    
    const runner = new SimpleGateRunner(gateDefinition);
    const result = await runner.check();
    
    expect(result.passed).toBe(false);
    expect(result.details?.code).toBe('GATE_EXECUTION_ERROR');
  });

  /**
   * Edge Case: Very long error messages
   */
  it('should handle very long error messages', async () => {
    const longMessage = 'x'.repeat(10000);
    
    const gateDefinition: SimpleGateDefinition = {
      type: 'simple',
      id: 'long-message-test',
      name: 'Long Message Test',
      checkFn: async () => {
        throw new Error(longMessage);
      }
    };
    
    const runner = new SimpleGateRunner(gateDefinition);
    const result = await runner.check();
    
    expect(result.passed).toBe(false);
    expect(result.details?.code).toBe('GATE_EXECUTION_ERROR');
  });

  /**
   * Edge Case: Special characters in error messages
   */
  it('should handle special characters in error messages', async () => {
    const specialMessage = 'Error with <xml> & "quotes" and unicode: 你好 🎉';
    
    const gateDefinition: SimpleGateDefinition = {
      type: 'simple',
      id: 'special-char-test',
      name: 'Special Char Test',
      checkFn: async () => {
        throw new Error(specialMessage);
      }
    };
    
    const runner = new SimpleGateRunner(gateDefinition);
    const result = await runner.check();
    
    expect(result.passed).toBe(false);
    expect(result.reason).toContain(specialMessage);
  });

  /**
   * Edge Case: Empty error messages
   */
  it('should handle empty error messages', async () => {
    const gateDefinition: SimpleGateDefinition = {
      type: 'simple',
      id: 'empty-message-test',
      name: 'Empty Message Test',
      checkFn: async () => {
        throw new Error('');
      }
    };
    
    const runner = new SimpleGateRunner(gateDefinition);
    const result = await runner.check();
    
    expect(result.passed).toBe(false);
  });

  /**
   * Edge Case: Non-Error objects thrown
   */
  it('should handle non-Error objects thrown', async () => {
    const gateDefinition: SimpleGateDefinition = {
      type: 'simple',
      id: 'non-error-test',
      name: 'Non Error Test',
      checkFn: async () => {
        throw { message: 'Not an Error', code: 123 };
      }
    };
    
    const runner = new SimpleGateRunner(gateDefinition);
    const result = await runner.check();
    
    expect(result.passed).toBe(false);
    expect(result.details?.code).toBe('GATE_EXECUTION_ERROR');
  });

  /**
   * Edge Case: Promise rejection values
   */
  it('should handle rejected promises with non-Error values', async () => {
    const gateDefinition: SimpleGateDefinition = {
      type: 'simple',
      id: 'promise-rejection-test',
      name: 'Promise Rejection Test',
      checkFn: async () => {
        return Promise.reject('string rejection');
      }
    };
    
    const runner = new SimpleGateRunner(gateDefinition);
    const result = await runner.check();
    
    expect(result.passed).toBe(false);
  });
});