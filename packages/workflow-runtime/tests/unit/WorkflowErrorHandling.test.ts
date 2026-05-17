/**
 * WorkflowErrorHandling Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GateError,
  GateErrorType,
  GateTimeoutError,
  GateValidationError,
  GateResourceError,
} from '../../src/error-handler.js';
import {
  WorkflowErrorHandler,
  WorkflowStateManager,
  createErrorHandler,
  DEFAULT_RETRY_CONFIG,
} from '../../src/WorkflowErrorHandling.js';
import type { WorkflowInstance, WorkflowDefinition } from '../../src/types.js';
import { ErrorPropagationManager } from '../../src/error-propagation.js';

describe('GateError integration', () => {
  it('should create a timeout error', () => {
    const error = new GateTimeoutError({
      gateId: 'test-gate',
      operation: 'check',
      timeoutMs: 5000,
    });

    expect(error.message).toContain('timed out');
    expect(error.gateId).toBe('test-gate');
    expect(error.errorType).toBe(GateErrorType.TIMEOUT_ERROR);
    expect(error.retryable).toBe(true);
  });

  it('should create a validation error', () => {
    const error = new GateValidationError({
      gateId: 'test-gate',
      validationErrors: ['Invalid input'],
    });

    expect(error.message).toContain('validation failed');
    expect(error.gateId).toBe('test-gate');
    expect(error.errorType).toBe(GateErrorType.VALIDATION_ERROR);
    expect(error.retryable).toBe(false);
  });

  it('should create a resource error', () => {
    const error = new GateResourceError({
      gateId: 'test-gate',
      resourceType: 'memory',
      resourceLimit: 1024,
      currentUsage: 2048,
    });

    expect(error.message).toContain('resource error');
    expect(error.gateId).toBe('test-gate');
    expect(error.errorType).toBe(GateErrorType.RESOURCE_ERROR);
    expect(error.retryable).toBe(true);
  });
});

describe('WorkflowErrorHandler', () => {
  let handler: WorkflowErrorHandler;

  beforeEach(() => {
    handler = createErrorHandler();
  });

  describe('retry configuration', () => {
    it('should use default retry config', () => {
      const config = handler.getRetryConfig('workflow-1');
      expect(config.maxAttempts).toBe(DEFAULT_RETRY_CONFIG.maxAttempts);
      expect(config.initialDelayMs).toBe(DEFAULT_RETRY_CONFIG.initialDelayMs);
    });

    it('should set custom retry config', () => {
      handler.setRetryConfig('workflow-1', {
        maxAttempts: 5,
        initialDelayMs: 500,
        maxDelayMs: 5000,
        backoffMultiplier: 1.5,
      });

      const config = handler.getRetryConfig('workflow-1');
      expect(config.maxAttempts).toBe(5);
      expect(config.initialDelayMs).toBe(500);
    });
  });

  describe('isRetryable', () => {
    it('should return false for non-retryable errors', () => {
      const error = new GateValidationError({
        gateId: 'test-gate',
        validationErrors: ['Invalid input'],
      });

      expect(handler.isRetryable(error, 'workflow-1')).toBe(false);
    });

    it('should return true for retryable errors', () => {
      const error = new GateTimeoutError({
        gateId: 'test-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      expect(handler.isRetryable(error, 'workflow-1')).toBe(true);
    });

    it('should check retryable errors list', () => {
      const error = new GateResourceError({
        gateId: 'test-gate',
        resourceType: 'memory',
        resourceLimit: 1024,
        currentUsage: 2048,
      });

      expect(handler.isRetryable(error, 'workflow-1')).toBe(true);
    });
  });

  describe('retry delays', () => {
    it('should return initial delay for first attempt', () => {
      const delay = handler.getRetryDelay('workflow-1');
      expect(delay).toBe(DEFAULT_RETRY_CONFIG.initialDelayMs);
    });

    it('should calculate exponential backoff', () => {
      // Record some attempts
      const error = new GateTimeoutError({
        gateId: 'test-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      // First call returns initial delay (no state yet)
      const delayBeforeRecording = handler.getRetryDelay('workflow-1');
      expect(delayBeforeRecording).toBe(DEFAULT_RETRY_CONFIG.initialDelayMs);

      // Record first attempt - this increments attempt to 1
      handler.recordRetryAttempt('workflow-1', error);
      // After first record, getRetryDelay returns initial delay (current attempt = 1)
      const delayAfterFirst = handler.getRetryDelay('workflow-1');
      expect(delayAfterFirst).toBe(DEFAULT_RETRY_CONFIG.initialDelayMs);

      // Record second attempt - this increments attempt to 2  
      handler.recordRetryAttempt('workflow-1', error);
      const delayAfterSecond = handler.getRetryDelay('workflow-1');
      expect(delayAfterSecond).toBe(DEFAULT_RETRY_CONFIG.initialDelayMs * DEFAULT_RETRY_CONFIG.backoffMultiplier);
    });

    it('should respect max delay', () => {
      handler.setRetryConfig('workflow-1', {
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 3000,
        backoffMultiplier: 2,
      });

      const error = new GateTimeoutError({
        gateId: 'test-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      // Record many attempts to exceed max delay
      for (let i = 0; i < 5; i++) {
        handler.recordRetryAttempt('workflow-1', error);
      }

      const delay = handler.getRetryDelay('workflow-1');
      expect(delay).toBe(3000); // Capped at maxDelayMs
    });
  });

  describe('canRetry', () => {
    it('should allow retry when under max attempts', () => {
      handler.setRetryConfig('workflow-1', {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
      });

      const error = new GateTimeoutError({
        gateId: 'test-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      // First record - should be able to retry (attempt 1 < max 3)
      handler.recordRetryAttempt('workflow-1', error);
      expect(handler.canRetry('workflow-1')).toBe(true);

      // Second record - should be able to retry (attempt 2 < max 3)
      handler.recordRetryAttempt('workflow-1', error);
      expect(handler.canRetry('workflow-1')).toBe(true);

      // Third record - attempt 3 equals max 3, canRetry returns false
      handler.recordRetryAttempt('workflow-1', error);
      expect(handler.canRetry('workflow-1')).toBe(false);
    });
  });

  describe('executeWithRetry', () => {
    it('should succeed without retry on first attempt', async () => {
      let callCount = 0;
      const result = await handler.executeWithRetry('workflow-1', async () => {
        callCount++;
        return 'success';
      });

      expect(result).toBe('success');
      expect(callCount).toBe(1);
    });

    it('should retry on failure and succeed', async () => {
      let callCount = 0;
      
      const result = await handler.executeWithRetry('workflow-1', async () => {
        callCount++;
        if (callCount < 3) {
          throw new GateTimeoutError({
            gateId: 'test-gate',
            operation: 'check',
            timeoutMs: 5000,
          });
        }
        return 'success';
      });

      expect(result).toBe('success');
      expect(callCount).toBe(3);
    });

    it('should fail after max retries', async () => {
      handler.setRetryConfig('workflow-1', {
        maxAttempts: 2,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      });

      let callCount = 0;
      
      await expect(
        handler.executeWithRetry('workflow-1', async () => {
          callCount++;
          throw new GateTimeoutError({
            gateId: 'test-gate',
            operation: 'check',
            timeoutMs: 5000,
          });
        })
      ).rejects.toThrow('timed out');

      expect(callCount).toBe(3); // Initial + 2 retries (maxAttempts=2)
    });

    it('should not retry non-retryable errors', async () => {
      let callCount = 0;
      
      await expect(
        handler.executeWithRetry('workflow-1', async () => {
          callCount++;
          throw new GateValidationError({
            gateId: 'test-gate',
            validationErrors: ['Invalid input'],
          });
        })
      ).rejects.toThrow('validation failed');

      expect(callCount).toBe(1); // No retries
    });

    it('should call onRetry callback', async () => {
      let callCount = 0;
      const retryCallbacks: Array<{ attempt: number; delay: number; error: GateError }> = [];
      
      handler.setRetryConfig('workflow-1', {
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      });

      await expect(
        handler.executeWithRetry('workflow-1', async () => {
          callCount++;
          throw new GateTimeoutError({
            gateId: 'test-gate',
            operation: 'check',
            timeoutMs: 5000,
          });
        }, async (attempt: number, delay: number, error: GateError) => {
          retryCallbacks.push({ attempt, delay, error });
        })
      ).rejects.toThrow();

      expect(retryCallbacks).toHaveLength(3);
      expect(retryCallbacks[0].attempt).toBe(1);
      expect(retryCallbacks[1].attempt).toBe(2);
      expect(retryCallbacks[2].attempt).toBe(3);
      expect(retryCallbacks[0].error).toBeInstanceOf(GateTimeoutError);
    });
  });

  describe('resetRetryState', () => {
    it('should reset retry state', () => {
      const error = new GateTimeoutError({
        gateId: 'test-gate',
        operation: 'check',
        timeoutMs: 5000,
      });

      // Record enough attempts to exceed max
      handler.setRetryConfig('workflow-1', {
        maxAttempts: 2,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
      });

      handler.recordRetryAttempt('workflow-1', error);
      handler.recordRetryAttempt('workflow-1', error);
      expect(handler.canRetry('workflow-1')).toBe(false);

      handler.resetRetryState('workflow-1');
      expect(handler.canRetry('workflow-1')).toBe(true);
    });
  });

  describe('executeWithRetry timeout', () => {
    it('should timeout after max total timeout', async () => {
      handler.setRetryConfig('workflow-1', {
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
      });

      let callCount = 0;
      
      await expect(
        handler.executeWithRetry('workflow-1', async () => {
          callCount++;
          throw new GateTimeoutError({
            gateId: 'test-gate',
            operation: 'check',
            timeoutMs: 5000,
          });
        }, undefined, { maxTotalTimeoutMs: 100 }) // 100ms超时
      ).rejects.toThrow('Retry operation timed out after 100ms for workflow workflow-1');

      expect(callCount).toBeGreaterThan(0); // 至少调用了一次
    });

    it('should respect abort signal', async () => {
      const abortController = new AbortController();
      
      handler.setRetryConfig('workflow-1', {
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
      });

      let callCount = 0;
      
      // 启动操作
      const promise = handler.executeWithRetry('workflow-1', async () => {
        callCount++;
        throw new GateTimeoutError({
          gateId: 'test-gate',
          operation: 'check',
          timeoutMs: 5000,
        });
      }, undefined, { abortSignal: abortController.signal });

      // 立即abort
      abortController.abort();
      
      await expect(promise).rejects.toThrow('Operation aborted for workflow workflow-1');
      expect(callCount).toBe(1); // 只调用了一次
    });

    it('should succeed before timeout', async () => {
      let callCount = 0;
      
      const result = await handler.executeWithRetry('workflow-1', async () => {
        callCount++;
        if (callCount < 2) {
          throw new GateTimeoutError({
            gateId: 'test-gate',
            operation: 'check',
            timeoutMs: 5000,
          });
        }
        return 'success';
      }, undefined, { maxTotalTimeoutMs: 5000 }); // 5秒超时足够

      expect(result).toBe('success');
      expect(callCount).toBe(2);
    });
  });
});

describe('WorkflowStateManager', () => {
  let stateManager: WorkflowStateManager;

  beforeEach(() => {
    stateManager = new WorkflowStateManager();
  });

  function createTestInstance(status: WorkflowInstance['status'] = 'running'): WorkflowInstance {
    return {
      id: 'test-instance-' + Math.random().toString(36).substr(2, 9),
      workflowId: 'test-workflow',
      currentState: 'initial',
      status,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  describe('pause', () => {
    it('should pause a running workflow', () => {
      const instance = createTestInstance('running');
      
      const result = stateManager.pause(instance, 'Testing pause');
      
      expect(result.status).toBe('paused');
      expect(stateManager.isPaused(instance.id)).toBe(true);
    });

    it('should fail to pause non-running workflow', () => {
      const instance = createTestInstance('completed');
      
      expect(() => stateManager.pause(instance)).toThrow('Cannot pause workflow instance in status: completed');
    });

    it('should store pause reason', () => {
      const instance = createTestInstance('running');
      stateManager.pause(instance, 'User requested pause');
      
      const pauseInfo = stateManager.getPauseInfo(instance.id);
      expect(pauseInfo?.pauseReason).toBe('User requested pause');
    });
  });

  describe('canResume', () => {
    it('should return true for paused instance', () => {
      const instance = createTestInstance('paused');
      expect(stateManager.canResume(instance)).toBe(true);
    });

    it('should return false for running instance', () => {
      const instance = createTestInstance('running');
      expect(stateManager.canResume(instance)).toBe(false);
    });

    it('should return false for pending instance', () => {
      const instance = createTestInstance('pending');
      expect(stateManager.canResume(instance)).toBe(false);
    });

    it('should return false for completed instance', () => {
      const instance = createTestInstance('completed');
      expect(stateManager.canResume(instance)).toBe(false);
    });

    it('should return false for failed instance', () => {
      const instance = createTestInstance('failed');
      expect(stateManager.canResume(instance)).toBe(false);
    });
  });

  describe('resume', () => {
    it('should resume a paused workflow', () => {
      const instance = createTestInstance('running');
      
      // First pause the instance
      stateManager.pause(instance);
      
      const result = stateManager.resume(instance);
      
      expect(result.status).toBe('running');
      expect(stateManager.isPaused(instance.id)).toBe(false);
    });

    it('should fail to resume non-paused workflow', () => {
      const instance = createTestInstance('running');
      
      expect(() => stateManager.resume(instance)).toThrow('Cannot resume workflow instance in status: running');
    });

    it('should clear pause state after resume', () => {
      const instance = createTestInstance('running');
      
      // First pause
      stateManager.pause(instance);
      
      // First verify it's paused
      expect(stateManager.isPaused(instance.id)).toBe(true);
      
      // Resume
      stateManager.resume(instance);
      
      // Should no longer be paused
      expect(stateManager.isPaused(instance.id)).toBe(false);
      expect(stateManager.getPauseInfo(instance.id)).toBeUndefined();
    });
  });

  describe('clearPauseState', () => {
    it('should clear pause state', () => {
      const instance = createTestInstance('running');
      stateManager.pause(instance);
      
      stateManager.clearPauseState(instance.id);
      
      expect(stateManager.isPaused(instance.id)).toBe(false);
    });
  });

  describe('getPausedInstanceIds', () => {
    it('should return all paused instance IDs', () => {
      const instance1 = createTestInstance('running');
      const instance2 = createTestInstance('running');
      
      stateManager.pause(instance1);
      stateManager.pause(instance2);
      
      const pausedIds = stateManager.getPausedInstanceIds();
      expect(pausedIds).toHaveLength(2);
      expect(pausedIds).toContain(instance1.id);
      expect(pausedIds).toContain(instance2.id);
    });
  });
});

describe('createErrorHandler', () => {
  it('should create error handler with custom config', () => {
    const handler = createErrorHandler({ maxAttempts: 5 });
    const config = handler.getRetryConfig('default');
    expect(config.maxAttempts).toBe(5);
  });
});

describe('Error propagation integration', () => {
  it('should handle error with propagation', () => {
    const handler = createErrorHandler();
    const propagationManager = handler.getErrorPropagationManager();
    
    expect(propagationManager).toBeInstanceOf(ErrorPropagationManager);
  });

  it('should execute with propagation', async () => {
    const handler = createErrorHandler();
    
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

    const context = ErrorPropagationManager.createContext(
      workflowInstance,
      workflowDefinition,
      'test-gate',
      undefined,
      0
    );

    // Test successful execution
    const successResult = await handler.executeWithPropagation(
      async () => 'success',
      context,
      'workflow-1'
    );
    
    expect(successResult.result).toBe('success');

    // Test error execution
    await expect(
      handler.executeWithPropagation(
        async () => {
          throw new GateTimeoutError({
            gateId: 'test-gate',
            operation: 'check',
            timeoutMs: 5000,
          });
        },
        context,
        'workflow-1'
      )
    ).rejects.toThrow('Retry scheduled');
  });
});