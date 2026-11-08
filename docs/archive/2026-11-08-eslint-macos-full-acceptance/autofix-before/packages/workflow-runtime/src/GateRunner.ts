/**
 * GateRunner Module
 * Base classes for executing Gates in workflow runtime
 */

import {
  GateDefinition,
  GateResult,
  SimpleGateDefinition,
  CompositeGateDefinition,
  WorkflowContext,
  RetryConfig,
} from './types.js';
import {
  GateError,
  handleGateError,
  createErrorResult,
  isGateError,
} from './error-handler.js';
import { withRetry, DEFAULT_RETRY_CONFIG } from './retry.js';

/**
 * Logger interface for GateRunner error logging
 */
export interface IGateRunnerLogger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

/**
 * Default console logger implementation
 */
export class DefaultGateRunnerLogger implements IGateRunnerLogger {
  error(message: string, context?: Record<string, unknown>): void {
    console.error(`[GateRunner ERROR] ${message}`, context ? JSON.stringify(context) : '');
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(`[GateRunner WARN] ${message}`, context ? JSON.stringify(context) : '');
  }

  info(message: string, context?: Record<string, unknown>): void {
    console.info(`[GateRunner INFO] ${message}`, context ? JSON.stringify(context) : '');
  }

  debug(message: string, context?: Record<string, unknown>): void {
    console.debug(`[GateRunner DEBUG] ${message}`, context ? JSON.stringify(context) : '');
  }
}

/**
 * Abstract base class for Gate execution
 * Provides the framework for check() method and error handling
 */
export abstract class GateRunner {
  protected gate: GateDefinition;
  protected context: Record<string, unknown>;
  
  // Static logger for error logging (can be configured via setLogger)
  protected static logger: IGateRunnerLogger = new DefaultGateRunnerLogger();

  // Retry configuration
  protected retryConfig?: RetryConfig;
  protected retryAttempts: number = 0;

  /**
   * Configure the logger for GateRunner
   * @param logger The logger to use for error logging
   */
  static setLogger(logger: IGateRunnerLogger): void {
    GateRunner.logger = logger;
  }

  /**
   * Get the current logger
   */
  static getLogger(): IGateRunnerLogger {
    return GateRunner.logger;
  }

  /**
   * Create a new GateRunner
   * @param gate The gate definition to execute
   * @param context Optional execution context
   */
  constructor(gate: GateDefinition, context: Record<string, unknown> = {}) {
    this.gate = gate;
    this.context = context;
  }

  /**
   * Execute the gate check with optional workflow context
   * Must be implemented by subclasses
   * @param context Optional workflow context for gate execution
   */
  abstract check(context?: WorkflowContext): Promise<GateResult> | GateResult;

  /**
   * Validate workflow context before execution
   * @param context The workflow context to validate
   * @returns true if context is valid, false otherwise
   */
  validate(context: WorkflowContext): boolean {
    // Check if context has required fields
    if (!context) {
      return false;
    }

    // Validate instance
    if (!context.instance) {
      return false;
    }

    // Validate instance has required fields
    if (!context.instance.id || !context.instance.workflowId) {
      return false;
    }

    // Validate definition
    if (!context.definition) {
      return false;
    }

    if (!context.definition.id || !context.definition.stateMachine) {
      return false;
    }

    // Validate stateMachine has required fields
    if (!context.definition.stateMachine.initial || !context.definition.stateMachine.states) {
      return false;
    }

    return true;
  }

  /**
   * Get the gate definition
   */
  getGate(): GateDefinition {
    return this.gate;
  }

  /**
   * Get the execution context
   */
  getContext(): Record<string, unknown> {
    return this.context;
  }

  /**
   * Update the execution context
   */
  setContext(context: Record<string, unknown>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Set retry configuration for this gate runner
   * @param config Retry configuration
   */
  setRetryConfig(config: RetryConfig): void {
    this.retryConfig = config;
  }

  /**
   * Get retry configuration
   */
  getRetryConfig(): RetryConfig | undefined {
    return this.retryConfig;
  }

  /**
   * Get current retry attempts
   */
  getRetryAttempts(): number {
    return this.retryAttempts;
  }

  /**
   * Check if retry is enabled for this runner
   */
  isRetryEnabled(): boolean {
    if (!this.retryConfig) {
      return false;
    }
    const maxAttempts = this.retryConfig.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts;
    return maxAttempts > 0;
  }

  /**
   * Handle errors during gate execution
   * Subclasses can override for custom error handling
   * @param error The error that occurred
   * @param operation Optional operation name for timeout detection
   * @param timeoutMs Optional timeout for timeout detection
   * @param additionalOptions Additional error handling options
   */
  protected handleError(
    error: unknown, 
    operation?: string, 
    timeoutMs?: number,
    additionalOptions?: {
      configPath?: string;
      configValue?: unknown;
      missingDependencies?: string[];
      cancellationReason?: string;
      resourceType?: string;
      resourceLimit?: number;
      currentUsage?: number;
      validationErrors?: string[];
    }
  ): GateResult {
    // Wrap error using the unified handler
    const options: any = { operation, timeoutMs, ...additionalOptions };
    
    // Determine gate type
    const gateType = this.gate.type;
    
    const gateError = handleGateError(error, this.gate.id, gateType, options);

    // Log the error with context
    this.logError(gateError, operation, timeoutMs);

    // Convert to GateResult using standardized error result
    const errorResult = createErrorResult(error, this.gate.id, gateType);
    
    return {
      schema_version: '1.0',
      passed: false,
      reason: errorResult.reason,
      details: errorResult.details,
    };
  }

  /**
   * Log error with context information
   * @param gateError The handled GateError
   * @param operation Optional operation name
   * @param timeoutMs Optional timeout value
   */
  protected logError(gateError: GateError, operation?: string, timeoutMs?: number): void {
    const logContext: Record<string, unknown> = {
      gateId: this.gate.id,
      gateType: this.gate.type,
      errorType: gateError.errorType,
      errorCode: gateError.code,
      retryable: gateError.retryable,
      suggestion: gateError.suggestion,
      timestamp: new Date().toISOString(),
    };

    if (operation) {
      logContext.operation = operation;
    }
    if (timeoutMs) {
      logContext.timeoutMs = timeoutMs;
    }

    // Include original error details if available
    if (gateError instanceof GateError && 'originalError' in gateError) {
      const execError = gateError as any;
      if (execError.originalError) {
        logContext.originalError = {
          name: execError.originalError.name,
          message: execError.originalError.message,
        };
      }
    }

    // Use static logger for error logging
    (GateRunner.logger as IGateRunnerLogger).error(
      `Gate execution failed: ${gateError.message}`,
      logContext
    );
  }

  /**
   * Check if error is a GateError
   */
  protected isGateError(error: unknown): error is GateError {
    return isGateError(error);
  }

  /**
   * Validate gate definition before execution
   */
  protected validateGate(): void {
    if (!this.gate.id) {
      throw new Error('Gate definition must have an id');
    }
    if (!this.gate.type) {
      throw new Error('Gate definition must have a type');
    }
  }

  /**
   * Dispose of resources held by the gate runner
   * Implements Rule C4: 返回需要清理的资源时，必须提供dispose方法
   * Subclasses should override to clean up specific resources
   */
  dispose(): void {
    // Clear context references
    this.context = {};
  }
}

/**
 * GateRunner for simple (non-composite) gates
 * Executes a single gate check function
 */
export class SimpleGateRunner extends GateRunner {
  /**
   * Create a new SimpleGateRunner
   */
  constructor(gate: SimpleGateDefinition, context: Record<string, unknown> = {}) {
    super(gate, context);
  }

  /**
   * Execute the simple gate check with optional retry logic
   * @param context Optional workflow context for gate execution
   */
  async check(context?: WorkflowContext): Promise<GateResult> {
    void context; // Context parameter reserved for future use
    this.validateGate();

    const simpleGate = this.gate as SimpleGateDefinition;

    // If retry is configured, wrap the check in retry logic
    if (this.isRetryEnabled() && this.retryConfig) {
      this.retryAttempts = 0;
      
      try {
        const result = await withRetry(
          () => this.executeCheck(simpleGate),
          this.retryConfig,
          `GateRunner:${simpleGate.id}`
        );
        return result;
      } catch (error) {
        this.retryAttempts++;
        return this.handleError(error, 'simple_gate_execution');
      }
    }

    // No retry configured - execute directly
    try {
      return await this.executeCheck(simpleGate);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Execute the actual gate check logic
   * Separated to allow retry wrapper to call it
   */
  private async executeCheck(simpleGate: SimpleGateDefinition): Promise<GateResult> {
    // If the gate has a check function, execute it with context
    if (simpleGate.checkFn) {
      const result = simpleGate.checkFn();
      // Handle both sync and async check functions
      if (result instanceof Promise) {
        return await result;
      }
      return result;
    }

    // Default pass for gates without check function
    return {
      schema_version: '1.0',
      passed: true,
      reason: 'No check function defined, default pass',
      details: { gateId: simpleGate.id },
    };
  }
}

/**
 * GateRunner for composite gates
 * Manages execution of multiple child gates with different modes and policies
 */
export class CompositeGateRunner extends GateRunner {
  private childRunners: GateRunner[] = [];
  private abortController: AbortController | null = null;
  private cancelledGates: Set<string> = new Set();
  private isCancelled: boolean = false;

  /**
   * Create a new CompositeGateRunner
   */
  constructor(gate: CompositeGateDefinition, context: Record<string, unknown> = {}) {
    super(gate, context);
  }

  /**
   * Get the composite gate definition
   */
  getCompositeGate(): CompositeGateDefinition {
    return this.gate as CompositeGateDefinition;
  }

  /**
   * Set child runners for composite execution
   */
  setChildRunners(runners: GateRunner[]): void {
    this.childRunners = runners;
  }

  /**
   * Get child runners
   */
  getChildRunners(): GateRunner[] {
    return this.childRunners;
  }

  /**
   * Check if execution has been cancelled
   */
  isExecutionCancelled(): boolean {
    return this.isCancelled;
  }

  /**
   * Get the list of cancelled gate IDs
   */
  getCancelledGates(): Set<string> {
    return this.cancelledGates;
  }

  /**
   * Cancel all running child gates
   * Implements resource cleanup and cancellation event publishing
   * @param reason The reason for cancellation
   */
  async cancel(reason: string = 'Composite gate cancelled'): Promise<void> {
    this.isCancelled = true;
    
    // Mark all active promises as cancelled
    // Note: Actual cancellation of running gates requires the check functions
    // to respect the abort signal. For now, we track cancelled gates.
    
    // Clear active promises
    // (kept reference via abort controller)
    
    // Publish cancellation event
    await this.publishCancellationEvent(reason);
  }

  /**
   * Publish cancellation event
   */
  private async publishCancellationEvent(reason: string): Promise<void> {
    const compositeGate = this.getCompositeGate();
    
    // Try to get event publisher from context if available
    const eventPublisher = this.context.eventPublisher as any;
    
    if (eventPublisher?.publish) {
      const payload = {
        instanceId: this.context.instanceId as string || 'unknown',
        workflowId: this.context.workflowId as string || 'unknown',
        state: this.context.currentState as string || 'unknown',
        gateId: compositeGate.id,
        gateType: 'composite' as const,
        cancelledAt: new Date().toISOString(),
        reason,
        childGateIds: Array.from(this.cancelledGates),
      };
      
      eventPublisher.publish({
        type: 'workflow.gate.cancelled',
        payload,
      });
    }
  }

  /**
   * Execute the composite gate with optional retry logic
   * Supports sequential and parallel execution modes
   * Supports fail_fast and collect_all failure policies
   * @param context Optional workflow context for gate execution
   */
  async check(context?: WorkflowContext): Promise<GateResult> {
    // If retry is configured, wrap the check in retry logic
    if (this.isRetryEnabled() && this.retryConfig) {
      this.retryAttempts = 0;
      
      try {
        const result = await withRetry(
          () => this.executeCheckInternal(context),
          this.retryConfig,
          `CompositeGateRunner:${this.getCompositeGate().id}`
        );
        return result;
      } catch (error) {
        this.retryAttempts++;
        return this.handleError(error, 'composite_gate_execution');
      }
    }

    // No retry configured - execute directly
    return this.executeCheckInternal(context);
  }

  /**
   * Internal check execution logic
   * Separated to allow retry wrapper to call it
   */
  private async executeCheckInternal(context?: WorkflowContext): Promise<GateResult> {
    // Initialize cancellation state for new execution
    this.isCancelled = false;
    this.cancelledGates = new Set();
    this.abortController = new AbortController();
    
    try {
      this.validateGate();

      const compositeGate = this.getCompositeGate();
      const results: GateResult[] = [];

      // Store context for child runners
      if (context) {
        this.setContext({ 
          workflow: context,
          abortSignal: this.abortController.signal,
        });
      }

      if (compositeGate.mode === 'sequential') {
        return await this.executeSequential(compositeGate, results);
      } else {
        return await this.executeParallel(compositeGate, results);
      }
    } catch (error) {
      // Handle any errors during composite gate execution
      return this.handleError(error, 'composite_gate_execution');
    } finally {
      // Ensure cleanup is performed
      await this.cleanup();
    }
  }

  /**
   * Clean up resources after execution
   * Implements Rule A4: 资源的创建者负责资源的销毁
   */
  private async cleanup(): Promise<void> {
    // Clear abort controller
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    
    // Dispose child runners
    for (const runner of this.childRunners) {
      try {
        runner.dispose();
      } catch {
        // Ignore dispose errors
      }
    }
    this.childRunners = [];
    
    // Reset cancellation state
    this.cancelledGates.clear();
    this.isCancelled = false;
  }

  /**
   * Dispose of resources held by the composite gate runner
   * Implements Rule C4: 返回需要清理的资源时，必须提供dispose方法
   */
  override dispose(): void {
    // Cancel any ongoing execution
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
    }
    this.abortController = null;
    
    // Dispose child runners
    for (const runner of this.childRunners) {
      try {
        runner.dispose();
      } catch {
        // Ignore dispose errors
      }
    }
    this.childRunners = [];
    
    // Clear state
    this.cancelledGates.clear();
    this.isCancelled = false;
    
    // Call parent dispose
    super.dispose();
  }

  /**
   * Execute child gates sequentially
   */
  private async executeSequential(
    compositeGate: CompositeGateDefinition,
    results: GateResult[]
  ): Promise<GateResult> {
    for (const childGate of compositeGate.children) {
      // Check if execution was cancelled before starting each gate
      if (this.isCancelled) {
        return this.createCancelledResult(compositeGate, results);
      }

      const runner = this.createRunnerForGate(childGate);
      
      // Pass abort signal to child runner
      if (this.abortController) {
        runner.setContext({ abortSignal: this.abortController.signal });
      }
      
      const result = await runner.check();
      results.push(result);

      if (compositeGate.failPolicy === 'fail_fast' && !result.passed) {
        // Cancel remaining child gates
        await this.cancel(`Child gate ${childGate.id} failed with fail_fast policy`);
        
        return {
          schema_version: '1.0',
          passed: false,
          reason: `Sequential composite gate failed at child gate: ${childGate.id}`,
          details: {
            failedGateId: childGate.id,
            results,
            failPolicy: compositeGate.failPolicy,
            cancelledGates: Array.from(this.cancelledGates),
          },
        };
      }
    }

    return this.aggregateResults(results, compositeGate);
  }

  /**
   * Execute child gates in parallel
   */
  private async executeParallel(
    compositeGate: CompositeGateDefinition,
    results: GateResult[]
  ): Promise<GateResult> {
    // Execute all child gates in parallel
    const childPromises = compositeGate.children.map(async (childGate) => {
      // Check if already cancelled before starting
      if (this.isCancelled) {
        this.cancelledGates.add(childGate.id);
        return this.createCancelledResultForGate(childGate.id);
      }

      const runner = this.createRunnerForGate(childGate);
      
      // Pass abort signal to child runner
      if (this.abortController) {
        runner.setContext({ abortSignal: this.abortController.signal });
      }
      
      try {
        const result = await runner.check();
        
        // Check if cancelled after execution
        if (this.isCancelled) {
          this.cancelledGates.add(childGate.id);
          return this.createCancelledResultForGate(childGate.id);
        }
        
        return result;
      } catch (error) {
        // If cancelled mid-execution
        if (this.isCancelled || (error as Error)?.name === 'AbortError') {
          this.cancelledGates.add(childGate.id);
          return this.createCancelledResultForGate(childGate.id);
        }
        throw error;
      }
    });

    const parallelResults = await Promise.all(childPromises);
    results.push(...parallelResults);

    if (compositeGate.failPolicy === 'fail_fast') {
      const failed = results.find((r) => !r.passed);
      if (failed) {
        // Cancel any remaining pending gates
        await this.cancel(`Child gate failed with fail_fast policy`);
        
        return {
          schema_version: '1.0',
          passed: false,
          reason: `Parallel composite gate failed (fail_fast)`,
          details: {
            results,
            failPolicy: compositeGate.failPolicy,
            cancelledGates: Array.from(this.cancelledGates),
          },
        };
      }
    }

    return this.aggregateResults(results, compositeGate);
  }

  /**
   * Create a cancelled result for the entire composite gate
   */
  private createCancelledResult(
    compositeGate: CompositeGateDefinition,
    results: GateResult[]
  ): GateResult {
    return {
      schema_version: '1.0',
      passed: false,
      reason: `Composite gate ${compositeGate.id} was cancelled`,
      details: {
        gateId: compositeGate.id,
        results,
        cancelledGates: Array.from(this.cancelledGates),
      },
    };
  }

  /**
   * Create a cancelled result for a single gate
   */
  private createCancelledResultForGate(gateId: string): GateResult {
    return {
      schema_version: '1.0',
      passed: false,
      reason: `Gate ${gateId} was cancelled`,
      details: {
        gateId,
        cancelled: true,
      },
    };
  }

  /**
   * Create the appropriate runner for a child gate
   */
  private createRunnerForGate(gate: GateDefinition): GateRunner {
    if (gate.type === 'simple') {
      return new SimpleGateRunner(gate as SimpleGateDefinition, this.context);
    } else {
      return new CompositeGateRunner(gate as CompositeGateDefinition, this.context);
    }
  }

  /**
   * Aggregate results from child gates
   */
  private aggregateResults(
    results: GateResult[],
    compositeGate: CompositeGateDefinition
  ): GateResult {
    const allPassed = results.every((r) => r.passed);

    if (allPassed) {
      return {
        schema_version: '1.0',
        passed: true,
        reason: 'All child gates passed',
        details: { results },
      };
    }

    const failedGates = results.filter((r) => !r.passed);
    return {
      schema_version: '1.0',
      passed: false,
      reason: `${failedGates.length} of ${compositeGate.children.length} child gates failed`,
      details: {
        total: compositeGate.children.length,
        passed: results.filter((r) => r.passed).length,
        failed: failedGates.length,
        results,
      },
    };
  }
}

/**
 * Factory function to create appropriate GateRunner based on gate type
 * @param gate The gate definition
 * @param context Optional execution context
 */
export function createGateRunner(
  gate: GateDefinition,
  context: Record<string, unknown> = {}
): GateRunner {
  if (gate.type === 'simple') {
    return new SimpleGateRunner(gate as SimpleGateDefinition, context);
  } else if (gate.type === 'composite') {
    return new CompositeGateRunner(gate as CompositeGateDefinition, context);
  }
  throw new Error(`Unknown gate type: ${(gate as GateDefinition).type}`);
}