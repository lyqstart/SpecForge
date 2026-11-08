/**
 * Error Propagation Module
 * Handles error propagation through workflow hierarchy and error transformation
 */

import { GateError, GateErrorType, isGateError, isRetryableError } from './error-handler.js';
import type { GateResult, WorkflowInstance, WorkflowDefinition } from './types.js';

/**
 * Error propagation context
 */
export interface ErrorPropagationContext {
  workflowInstance: WorkflowInstance;
  workflowDefinition: WorkflowDefinition;
  currentGateId: string;
  parentGateId?: string;
  depth: number;
  timestamp: Date;
}

/**
 * Error transformation rule
 */
export interface ErrorTransformationRule {
  match: (error: GateError, context: ErrorPropagationContext) => boolean;
  transform: (error: GateError, context: ErrorPropagationContext) => GateError;
}

/**
 * Error propagation result
 */
export interface ErrorPropagationResult {
  shouldContinue: boolean;
  transformedError?: GateError;
  action: 'retry' | 'pause' | 'fail' | 'skip' | 'escalate';
  delayMs?: number;
  reason: string;
}

/**
 * Error propagation manager
 */
export class ErrorPropagationManager {
  private transformationRules: ErrorTransformationRule[] = [];
  private propagationStrategies: Map<string, (error: GateError, context: ErrorPropagationContext) => ErrorPropagationResult> = new Map();

  constructor() {
    this.registerDefaultRules();
    this.registerDefaultStrategies();
  }

  /**
   * Register a transformation rule
   */
  registerTransformationRule(rule: ErrorTransformationRule): void {
    this.transformationRules.push(rule);
  }

  /**
   * Register a propagation strategy
   */
  registerPropagationStrategy(
    strategyName: string,
    strategy: (error: GateError, context: ErrorPropagationContext) => ErrorPropagationResult
  ): void {
    this.propagationStrategies.set(strategyName, strategy);
  }

  /**
   * Propagate an error through workflow hierarchy
   */
  propagateError(
    error: unknown,
    context: ErrorPropagationContext,
    strategyName: string = 'default'
  ): ErrorPropagationResult {
    // Convert to GateError if not already
    const gateError = this.ensureGateError(error, context);

    // Apply transformation rules
    const transformedError = this.applyTransformations(gateError, context);

    // Apply propagation strategy
    const strategy = this.propagationStrategies.get(strategyName) ?? this.propagationStrategies.get('default')!;
    return strategy(transformedError, context);
  }

  /**
   * Ensure error is a GateError
   */
  private ensureGateError(error: unknown, context: ErrorPropagationContext): GateError {
    if (isGateError(error)) {
      return error;
    }

    // Create a generic GateExecutionError
    const GenericGateError = class extends GateError {
      constructor() {
        super({
          code: 'GATE_PROPAGATION_ERROR',
          gateId: context.currentGateId,
          message: error instanceof Error ? error.message : String(error),
          suggestion: 'Check the error propagation logic',
          errorType: GateErrorType.EXECUTION_ERROR,
        });
      }
    };

    return new GenericGateError();
  }

  /**
   * Apply transformation rules
   */
  private applyTransformations(error: GateError, context: ErrorPropagationContext): GateError {
    let transformedError = error;

    for (const rule of this.transformationRules) {
      if (rule.match(transformedError, context)) {
        transformedError = rule.transform(transformedError, context);
      }
    }

    return transformedError;
  }

  /**
   * Register default transformation rules
   */
  private registerDefaultRules(): void {
    // Rule 1: Transform timeout errors in composite gates
    this.registerTransformationRule({
      match: (error, context) => 
        error.errorType === GateErrorType.TIMEOUT_ERROR && 
        context.parentGateId !== undefined,
      transform: (error, context) => {
        const CompositeTimeoutError = class extends GateError {
          constructor() {
            super({
              code: 'COMPOSITE_GATE_TIMEOUT',
              gateId: context.parentGateId!,
              message: `Composite gate timeout due to child gate "${context.currentGateId}": ${error.message}`,
              suggestion: `Check child gate "${context.currentGateId}" performance or increase timeout`,
              errorType: GateErrorType.TIMEOUT_ERROR,
              retryable: true,
            });
          }
        };
        return new CompositeTimeoutError();
      },
    });

    // Rule 2: Transform validation errors with context
    this.registerTransformationRule({
      match: (error, _context) => error.errorType === GateErrorType.VALIDATION_ERROR,
      transform: (error, context) => {
        const ContextualValidationError = class extends GateError {
          constructor() {
            super({
              code: error.code,
              gateId: error.gateId,
              message: `${error.message} (workflow: ${context.workflowDefinition.id}, instance: ${context.workflowInstance.id})`,
              suggestion: error.suggestion,
              errorType: error.errorType,
              retryable: error.retryable,
            });
          }
        };
        return new ContextualValidationError();
      },
    });

    // Rule 3: Escalate resource errors in critical workflows
    this.registerTransformationRule({
      match: (error, context) => 
        error.errorType === GateErrorType.RESOURCE_ERROR &&
        context.workflowDefinition.intent.includes('critical'),
      transform: (error, context) => {
        const CriticalResourceError = class extends GateError {
          constructor() {
            super({
              code: 'CRITICAL_RESOURCE_ERROR',
              gateId: error.gateId,
              message: `CRITICAL: ${error.message} in workflow "${context.workflowDefinition.displayName}"`,
              suggestion: `Immediate action required: ${error.suggestion}`,
              errorType: GateErrorType.RESOURCE_ERROR,
              retryable: false, // Critical errors should not auto-retry
            });
          }
        };
        return new CriticalResourceError();
      },
    });
  }

  /**
   * Register default propagation strategies
   */
  private registerDefaultStrategies(): void {
    // Default strategy: retry retryable errors, pause on others
    this.registerPropagationStrategy('default', (error, context) => {
      if (isRetryableError(error)) {
        return {
          shouldContinue: true,
          action: 'retry',
          delayMs: this.calculateRetryDelay(context.depth),
          reason: `Retryable error: ${error.message}`,
        };
      }

      // For non-retryable errors in leaf gates, fail
      if (context.depth === 0) {
        return {
          shouldContinue: false,
          action: 'fail',
          reason: `Non-retryable error in leaf gate: ${error.message}`,
        };
      }

      // For non-retryable errors in composite gates, pause
      return {
        shouldContinue: false,
        action: 'pause',
        reason: `Non-retryable error in composite gate, workflow paused: ${error.message}`,
      };
    });

    // Aggressive retry strategy
    this.registerPropagationStrategy('aggressive-retry', (error, _context) => {
      return {
        shouldContinue: true,
        action: 'retry',
        delayMs: 100, // Very short delay
        reason: `Aggressive retry for error: ${error.message}`,
      };
    });

    // Fail-fast strategy
    this.registerPropagationStrategy('fail-fast', (error, _context) => {
      return {
        shouldContinue: false,
        action: 'fail',
        reason: `Fail-fast triggered by error: ${error.message}`,
      };
    });

    // Escalate strategy
    this.registerPropagationStrategy('escalate', (error, _context) => {
      return {
        shouldContinue: false,
        action: 'escalate',
        reason: `Error escalated: ${error.message}`,
      };
    });
  }

  /**
   * Calculate retry delay based on depth
   */
  private calculateRetryDelay(depth: number): number {
    // Exponential backoff based on depth
    const baseDelay = 1000; // 1 second
    const multiplier = 2;
    return baseDelay * Math.pow(multiplier, depth);
  }

  /**
   * Create error propagation context
   */
  static createContext(
    workflowInstance: WorkflowInstance,
    workflowDefinition: WorkflowDefinition,
    currentGateId: string,
    parentGateId?: string,
    depth: number = 0
  ): ErrorPropagationContext {
    return {
      workflowInstance,
      workflowDefinition,
      currentGateId,
      ...(parentGateId !== undefined && { parentGateId }),
      depth,
      timestamp: new Date(),
    };
  }
}

/**
 * Error propagation utilities
 */
export class ErrorPropagationUtils {
  /**
   * Check if error should be propagated to parent
   */
  static shouldPropagateToParent(error: GateError, context: ErrorPropagationContext): boolean {
    // Always propagate critical errors
    if (error.code.includes('CRITICAL')) {
      return true;
    }

    // Propagate errors in composite gates
    if (context.parentGateId !== undefined) {
      return true;
    }

    // Don't propagate retryable errors at leaf level
    if (isRetryableError(error) && context.depth === 0) {
      return false;
    }

    return true;
  }

  /**
   * Create propagation path for error
   */
  static createPropagationPath(
    _error: GateError,
    context: ErrorPropagationContext
  ): string[] {
    const path: string[] = [context.currentGateId];
    
    if (context.parentGateId) {
      path.unshift(context.parentGateId);
    }

    return path;
  }

  /**
   * Format error for logging with propagation info
   */
  static formatErrorForLogging(
    error: GateError,
    context: ErrorPropagationContext,
    propagationResult: ErrorPropagationResult
  ): Record<string, unknown> {
    return {
      error: error.toJSON(),
      context: {
        workflowId: context.workflowDefinition.id,
        instanceId: context.workflowInstance.id,
        currentGateId: context.currentGateId,
        parentGateId: context.parentGateId,
        depth: context.depth,
        timestamp: context.timestamp.toISOString(),
      },
      propagation: {
        action: propagationResult.action,
        shouldContinue: propagationResult.shouldContinue,
        reason: propagationResult.reason,
        delayMs: propagationResult.delayMs,
      },
      propagationPath: this.createPropagationPath(error, context),
    };
  }

  /**
   * Convert GateResult to propagation context
   */
  static resultToPropagationContext(
    result: GateResult,
    workflowInstance: WorkflowInstance,
    workflowDefinition: WorkflowDefinition,
    gateId: string
  ): { hasError: boolean; error?: GateError; context?: ErrorPropagationContext } {
    if (result.passed) {
      return { hasError: false };
    }

    // Try to extract error from result details
    const errorDetails = result.details;
    if (!errorDetails) {
      return { hasError: false };
    }

    const errorDetailsRecord = errorDetails as Record<string, unknown>;

    // Create a synthetic error from result
    const SyntheticGateError = class extends GateError {
      constructor() {
        super({
          code: (errorDetailsRecord['code'] as string) || 'UNKNOWN_ERROR',
          gateId,
          message: result.reason || 'Unknown error',
          suggestion: (errorDetailsRecord['suggestion'] as string) || 'Check error details',
          errorType: (errorDetailsRecord['errorType'] as GateErrorType) || GateErrorType.EXECUTION_ERROR,
          retryable: (errorDetailsRecord['retryable'] as boolean) || false,
        });
      }
    };

    const error = new SyntheticGateError();
    const context = ErrorPropagationManager.createContext(
      workflowInstance,
      workflowDefinition,
      gateId,
      undefined,
      0
    );

    return { hasError: true, error, context };
  }
}

/**
 * Create default error propagation manager
 */
export function createErrorPropagationManager(): ErrorPropagationManager {
  return new ErrorPropagationManager();
}