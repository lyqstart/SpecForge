/**
 * Error Propagation Unit Tests
 * Tests for error propagation and transformation mechanisms
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ErrorPropagationManager,
  ErrorPropagationContext,
  ErrorPropagationResult,
  ErrorPropagationUtils,
  createErrorPropagationManager,
} from '../../src/error-propagation.js';
import {
  GateError,
  GateTimeoutError,
  GateValidationError,
  GateResourceError,
  GateErrorType,
} from '../../src/error-handler.js';
import type { WorkflowInstance, WorkflowDefinition } from '../../src/types.js';

describe('ErrorPropagationManager', () => {
  let manager: ErrorPropagationManager;
  let testContext: ErrorPropagationContext;

  beforeEach(() => {
    manager = createErrorPropagationManager();
    
    const workflowDefinition: WorkflowDefinition = {
      schema_version: '1.0',
      id: 'test-workflow',
      displayName: 'Test Workflow',
      intent: 'test-critical-workflow',
      stateMachine: {
        schema_version: '1.0',
        initial: 'start',
        states: {},
      },
      artifacts: [],
    };

    const workflowInstance: WorkflowInstance = {
      schema_version: '1.0',
      id: 'test-instance',
      workflowId: 'test-workflow',
      currentState: 'start',
      status: 'running',
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    testContext = ErrorPropagationManager.createContext(
      workflowInstance,
      workflowDefinition,
      'test-gate',
      undefined,
      0
    );
  });

  describe('propagateError', () => {
    it('should propagate timeout error with default strategy', () => {
      const error = new GateTimeoutError({
        gateId: 'test-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      const result = manager.propagateError(error, testContext, 'default');
      
      expect(result.shouldContinue).toBe(true);
      expect(result.action).toBe('retry');
      expect(result.delayMs).toBeGreaterThan(0);
      expect(result.reason).toContain('Retryable error');
    });

    it('should propagate validation error with default strategy', () => {
      const error = new GateValidationError({
        gateId: 'test-gate',
        validationErrors: ['Invalid input'],
      });

      const result = manager.propagateError(error, testContext, 'default');
      
      expect(result.shouldContinue).toBe(false);
      expect(result.action).toBe('fail');
      expect(result.reason).toContain('Non-retryable error in leaf gate');
    });

    it('should use fail-fast strategy', () => {
      const error = new GateTimeoutError({
        gateId: 'test-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      const result = manager.propagateError(error, testContext, 'fail-fast');
      
      expect(result.shouldContinue).toBe(false);
      expect(result.action).toBe('fail');
      expect(result.reason).toContain('Fail-fast triggered');
    });

    it('should use escalate strategy', () => {
      const error = new GateResourceError({
        gateId: 'test-gate',
        resourceType: 'memory',
        resourceLimit: 1024,
        currentUsage: 2048,
      });

      const result = manager.propagateError(error, testContext, 'escalate');
      
      expect(result.shouldContinue).toBe(false);
      expect(result.action).toBe('escalate');
      expect(result.reason).toContain('Error escalated');
    });

    it('should handle non-GateError', () => {
      const error = new Error('Generic error');
      const result = manager.propagateError(error, testContext, 'default');
      
      expect(result.shouldContinue).toBe(false);
      expect(result.action).toBe('fail');
    });

    it('should apply transformation rules', () => {
      // Create context with parent gate (composite gate)
      const compositeContext = ErrorPropagationManager.createContext(
        testContext.workflowInstance,
        testContext.workflowDefinition,
        'child-gate',
        'parent-gate',
        1
      );

      const error = new GateTimeoutError({
        gateId: 'child-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      const result = manager.propagateError(error, compositeContext, 'default');
      
      // The error should be transformed to composite gate timeout
      expect(result.reason).toContain('Retryable error');
    });

    it('should transform critical workflow errors', () => {
      const error = new GateResourceError({
        gateId: 'test-gate',
        resourceType: 'memory',
        resourceLimit: 1024,
        currentUsage: 2048,
      });

      const result = manager.propagateError(error, testContext, 'default');
      
      // Critical workflow transforms resource errors to non-retryable
      expect(result.reason).toContain('CRITICAL');
      expect(result.action).toBe('fail'); // Critical errors should fail, not retry
    });
  });

  describe('transformation rules', () => {
    it('should transform timeout errors in composite gates', () => {
      const compositeContext = ErrorPropagationManager.createContext(
        testContext.workflowInstance,
        testContext.workflowDefinition,
        'child-gate',
        'parent-gate',
        1
      );

      const error = new GateTimeoutError({
        gateId: 'child-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      const result = manager.propagateError(error, compositeContext, 'default');
      
      // Error should be transformed to composite gate error
      expect(result.reason).toContain('Retryable error');
    });

    it('should add context to validation errors', () => {
      const error = new GateValidationError({
        gateId: 'test-gate',
        validationErrors: ['Invalid field'],
      });

      const result = manager.propagateError(error, testContext, 'default');
      
      // Validation error should include workflow context
      expect(result.reason).toContain('Non-retryable error');
    });
  });

  describe('custom rules and strategies', () => {
    it('should allow custom transformation rules', () => {
      let transformationApplied = false;
      
      manager.registerTransformationRule({
        match: (error, context) => error.gateId === 'custom-gate',
        transform: (error, context) => {
          transformationApplied = true;
          const CustomError = class extends GateError {
            constructor() {
              super({
                code: 'CUSTOM_ERROR',
                gateId: error.gateId,
                message: `Custom: ${error.message}`,
                suggestion: 'Custom handling',
                errorType: error.errorType,
                retryable: error.retryable,
              });
            }
          };
          return new CustomError();
        },
      });

      const error = new GateTimeoutError({
        gateId: 'custom-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      manager.propagateError(error, testContext, 'default');
      expect(transformationApplied).toBe(true);
    });

    it('should allow custom propagation strategies', () => {
      manager.registerPropagationStrategy('custom-strategy', (error, context) => ({
        shouldContinue: true,
        action: 'skip',
        reason: 'Custom strategy: skip this error',
      }));

      const error = new GateValidationError({
        gateId: 'test-gate',
        validationErrors: ['Invalid'],
      });

      const result = manager.propagateError(error, testContext, 'custom-strategy');
      
      expect(result.action).toBe('skip');
      expect(result.reason).toContain('Custom strategy');
    });
  });
});

describe('ErrorPropagationUtils', () => {
  let testContext: ErrorPropagationContext;

  beforeEach(() => {
    const workflowDefinition: WorkflowDefinition = {
      schema_version: '1.0',
      id: 'test-workflow',
      displayName: 'Test Workflow',
      intent: 'test',
      stateMachine: {
        schema_version: '1.0',
        initial: 'start',
        states: {},
      },
      artifacts: [],
    };

    const workflowInstance: WorkflowInstance = {
      schema_version: '1.0',
      id: 'test-instance',
      workflowId: 'test-workflow',
      currentState: 'start',
      status: 'running',
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    testContext = ErrorPropagationManager.createContext(
      workflowInstance,
      workflowDefinition,
      'test-gate',
      'parent-gate',
      1
    );
  });

  describe('shouldPropagateToParent', () => {
    it('should propagate critical errors', () => {
      const CriticalError = class extends GateError {
        constructor() {
          super({
            code: 'CRITICAL_ERROR',
            gateId: 'test-gate',
            message: 'Critical error',
            suggestion: 'Immediate action',
            errorType: GateErrorType.EXECUTION_ERROR,
            retryable: false,
          });
        }
      };

      const error = new CriticalError();
      expect(ErrorPropagationUtils.shouldPropagateToParent(error, testContext)).toBe(true);
    });

    it('should propagate errors in composite gates', () => {
      const error = new GateTimeoutError({
        gateId: 'test-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      expect(ErrorPropagationUtils.shouldPropagateToParent(error, testContext)).toBe(true);
    });

    it('should not propagate retryable errors at leaf level', () => {
      const leafContext = ErrorPropagationManager.createContext(
        testContext.workflowInstance,
        testContext.workflowDefinition,
        'leaf-gate',
        undefined,
        0
      );

      const error = new GateTimeoutError({
        gateId: 'leaf-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      expect(ErrorPropagationUtils.shouldPropagateToParent(error, leafContext)).toBe(false);
    });
  });

  describe('createPropagationPath', () => {
    it('should create path with parent gate', () => {
      const error = new GateTimeoutError({
        gateId: 'test-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      const path = ErrorPropagationUtils.createPropagationPath(error, testContext);
      expect(path).toEqual(['parent-gate', 'test-gate']);
    });

    it('should create path without parent gate', () => {
      const leafContext = ErrorPropagationManager.createContext(
        testContext.workflowInstance,
        testContext.workflowDefinition,
        'leaf-gate',
        undefined,
        0
      );

      const error = new GateTimeoutError({
        gateId: 'leaf-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      const path = ErrorPropagationUtils.createPropagationPath(error, leafContext);
      expect(path).toEqual(['leaf-gate']);
    });
  });

  describe('formatErrorForLogging', () => {
    it('should format error with propagation info', () => {
      const error = new GateTimeoutError({
        gateId: 'test-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      const propagationResult: ErrorPropagationResult = {
        shouldContinue: true,
        action: 'retry',
        delayMs: 1000,
        reason: 'Retryable timeout error',
      };

      const logData = ErrorPropagationUtils.formatErrorForLogging(error, testContext, propagationResult);
      
      expect(logData.error).toBeDefined();
      expect(logData.context).toBeDefined();
      expect(logData.propagation).toBeDefined();
      expect(logData.propagationPath).toEqual(['parent-gate', 'test-gate']);
      expect(logData.propagation.action).toBe('retry');
      expect(logData.propagation.delayMs).toBe(1000);
    });
  });

  describe('resultToPropagationContext', () => {
    it('should convert successful result', () => {
      const workflowDefinition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'start',
          states: {},
        },
        artifacts: [],
      };

      const workflowInstance: WorkflowInstance = {
        schema_version: '1.0',
        id: 'test-instance',
        workflowId: 'test-workflow',
        currentState: 'start',
        status: 'running',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = {
        schema_version: '1.0',
        passed: true,
        reason: 'Success',
        details: {},
      };

      const conversion = ErrorPropagationUtils.resultToPropagationContext(
        result,
        workflowInstance,
        workflowDefinition,
        'test-gate'
      );

      expect(conversion.hasError).toBe(false);
    });

    it('should convert error result', () => {
      const workflowDefinition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'start',
          states: {},
        },
        artifacts: [],
      };

      const workflowInstance: WorkflowInstance = {
        schema_version: '1.0',
        id: 'test-instance',
        workflowId: 'test-workflow',
        currentState: 'start',
        status: 'running',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = {
        schema_version: '1.0',
        passed: false,
        reason: 'Timeout error',
        details: {
          code: 'GATE_TIMEOUT',
          gateId: 'test-gate',
          errorType: GateErrorType.TIMEOUT_ERROR,
          retryable: true,
          suggestion: 'Increase timeout',
          operation: 'check',
          timeoutMs: 5000,
        },
      };

      const conversion = ErrorPropagationUtils.resultToPropagationContext(
        result,
        workflowInstance,
        workflowDefinition,
        'test-gate'
      );

      expect(conversion.hasError).toBe(true);
      expect(conversion.error).toBeDefined();
      expect(conversion.context).toBeDefined();
      expect(conversion.error!.code).toBe('GATE_TIMEOUT');
      expect(conversion.error!.errorType).toBe(GateErrorType.TIMEOUT_ERROR);
      expect(conversion.error!.retryable).toBe(true);
    });
  });
});

describe('Error propagation integration', () => {
  it('should handle error propagation in workflow hierarchy', () => {
    const manager = createErrorPropagationManager();
    
    const workflowDefinition: WorkflowDefinition = {
      schema_version: '1.0',
      id: 'critical-workflow',
      displayName: 'Critical Workflow',
      intent: 'critical-processing',
      stateMachine: {
        schema_version: '1.0',
        initial: 'start',
        states: {},
      },
      artifacts: [],
    };

    const workflowInstance: WorkflowInstance = {
      schema_version: '1.0',
      id: 'instance-1',
      workflowId: 'critical-workflow',
      currentState: 'start',
      status: 'running',
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Test resource error in critical workflow
    const error = new GateResourceError({
      gateId: 'data-processor',
      resourceType: 'memory',
      resourceLimit: 1024,
      currentUsage: 2048,
    });

    const context = ErrorPropagationManager.createContext(
      workflowInstance,
      workflowDefinition,
      'data-processor',
      'composite-processor',
      2
    );

    const result = manager.propagateError(error, context, 'default');
    
    // Critical workflow errors should be transformed to non-retryable
    expect(result.reason).toContain('CRITICAL');
    expect(result.action).toBe('pause'); // In composite gate, non-retryable errors pause
    
    // Should propagate to parent
    const shouldPropagate = ErrorPropagationUtils.shouldPropagateToParent(error, context);
    expect(shouldPropagate).toBe(true);
    
    // Should create propagation path
    const path = ErrorPropagationUtils.createPropagationPath(error, context);
    expect(path).toEqual(['composite-processor', 'data-processor']);
  });
});