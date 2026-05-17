/**
 * LLMKernelIntegration Module
 * Integrates with OpenCode Adapter's LLMKernelAdapter for Agent execution
 * 
 * Implements async resource lifecycle best practices:
 * - Promise.race败者清理（Rule C1）
 * - 超时错误包含根因和行动建议（Rule C3）
 * - 资源清理接口（Rule C4）
 */

import { v4 as uuidv4 } from 'uuid';

// Schema version (REQ-18)
const SCHEMA_VERSION = '1.0';

/**
 * LLM Kernel Agent execution parameters
 */
export interface LLMKernelAgentParams {
  agentRole: string;
  prompt: string;
  context?: Record<string, unknown>;
  timeout?: number;
  maxRetries?: number;
}

/**
 * LLM Kernel Agent execution result
 */
export interface LLMKernelAgentResult {
  schema_version: string;
  success: boolean;
  sessionId: string;
  output?: string;
  error?: string;
  duration: number;
  attempts: number;
  metadata?: Record<string, unknown>;
}

/**
 * Timeout error with detailed context
 * Implements Rule C3: 超时错误必须包含根因和行动建议
 */
export class TimeoutError extends Error {
  constructor(
    public operation: string,
    public timeoutMs: number,
    public attempts: number,
    public lastError: string,
    public suggestion: string
  ) {
    super(
      `Timeout: ${operation} exceeded ${timeoutMs}ms after ${attempts} attempt(s). ` +
      `Last error: ${lastError}. ${suggestion}`
    );
    this.name = 'TimeoutError';
  }
}

/**
 * Network error with retry information
 */
export class NetworkError extends Error {
  constructor(
    public operation: string,
    public statusCode?: number,
    public retryable: boolean = true
  ) {
    super(`Network error in ${operation}: ${statusCode ? `HTTP ${statusCode}` : 'connection failed'}`);
    this.name = 'NetworkError';
  }
}

/**
 * LLMKernelIntegration - Manages integration with OpenCode Adapter
 * Provides error handling, retry logic, and resource cleanup
 */
export class LLMKernelIntegration {
  private activeSubscriptions: Map<string, { unsubscribe: () => void }> = new Map();
  private activeSessions: Map<string, { sessionId: string; createdAt: Date }> = new Map();
  private pendingTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  /**
   * Get count of active subscriptions (for testing/monitoring)
   * Implements Rule C4: 提供检测当前活跃资源数量的方法
   */
  getActiveSubscriptionCount(): number {
    return this.activeSubscriptions.size;
  }

  /**
   * Get count of active sessions
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get count of pending timers
   */
  getPendingTimerCount(): number {
    return this.pendingTimers.size;
  }

  /**
   * Execute an agent with timeout and retry logic
   * Implements Rule C1: Promise.race败者清理
   * Implements Rule C3: 超时错误包含根因和行动建议
   */
  async executeAgent(params: LLMKernelAgentParams): Promise<LLMKernelAgentResult> {
    const sessionId = uuidv4();
    const maxRetries = params.maxRetries ?? 3;
    const timeout = params.timeout ?? 30000;

    let lastError: Error | null = null;
    let attempt = 0;

    for (attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeAgentWithTimeout(
          sessionId,
          params,
          timeout,
          attempt
        );
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          throw lastError;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff: 100ms, 200ms, 400ms
        const backoffMs = 100 * Math.pow(2, attempt - 1);
        await this.delay(backoffMs);
      }
    }

    // All retries exhausted
    const errorMessage = lastError?.message ?? 'Unknown error';

    throw new TimeoutError(
      'agent.execution',
      timeout,
      attempt,
      errorMessage,
      'Check daemon status: `specforge daemon status`. Ensure network connectivity and model availability.'
    );
  }

  /**
   * Execute agent with timeout protection
   * Implements Rule C1: Promise.race败者清理
   */
  private async executeAgentWithTimeout(
    sessionId: string,
    params: LLMKernelAgentParams,
    timeout: number,
    attempt: number
  ): Promise<LLMKernelAgentResult> {
    const startTime = Date.now();

    // Create timeout promise with cleanup
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new TimeoutError(
            'agent.execution',
            timeout,
            attempt,
            'timeout exceeded',
            'Increase timeout or check daemon performance.'
          )
        );
      }, timeout);
    });

    // Track timer for cleanup
    this.pendingTimers.add(timeoutHandle!);

    try {
      // Execute agent (simulated for now, will be replaced with actual OpenCode call)
      const executionPromise = this.simulateAgentExecution(params);

      // Race with timeout - Rule C1: 败者必须清理
      const result = await Promise.race([executionPromise, timeoutPromise]);

      return {
        schema_version: SCHEMA_VERSION,
        success: true,
        sessionId,
        output: result.output,
        duration: Date.now() - startTime,
        attempts: attempt,
        metadata: {
          role: params.agentRole,
          retried: attempt > 1,
        },
      };
    } catch (error) {
      // Re-throw with context
      if (error instanceof TimeoutError) {
        throw error;
      }
      throw new Error(
        `Agent execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      // Rule C1: 败者timer必须清理
      clearTimeout(timeoutHandle!);
      this.pendingTimers.delete(timeoutHandle!);
    }
  }

  /**
   * Subscribe to agent events
   * Implements Rule C4: 返回需要清理的资源时，必须提供dispose方法
   */
  subscribeToAgentEvents(sessionId: string): AsyncIterable<AgentEvent> {
    const subscription = {
      unsubscribe: () => {
        this.activeSubscriptions.delete(sessionId);
      },
    };

    this.activeSubscriptions.set(sessionId, subscription);

    return this.createEventStream(sessionId, subscription);
  }

  /**
   * Unsubscribe from agent events
   */
  unsubscribeFromAgentEvents(sessionId: string): void {
    const subscription = this.activeSubscriptions.get(sessionId);
    if (subscription) {
      subscription.unsubscribe();
    }
  }

  /**
   * Create event stream for agent
   * Implements Rule A2: 无限循环必须有外部可达的终止条件
   */
  private async *createEventStream(
    sessionId: string,
    subscription: { unsubscribe: () => void }
  ): AsyncIterable<AgentEvent> {
    const queue: AgentEvent[] = [];
    let done = false;
    let resolver: (() => void) | null = null;

    // Simulate event generation
    const eventGenerator = this.generateAgentEvents(sessionId);

    try {
      for await (const event of eventGenerator) {
        if (done) break;

        queue.push(event);

        const currentResolver = resolver as (() => void) | null;
        if (currentResolver !== null) {
          (currentResolver as () => void)();
          resolver = null;
        }

        yield event;
      }
    } finally {
      done = true;
      subscription.unsubscribe();
    }
  }

  /**
   * Generate agent events
   * Implements Rule A2: 无限循环必须有外部可达的终止条件
   */
  private async *generateAgentEvents(sessionId: string): AsyncIterable<AgentEvent> {
    const maxEvents = 5;
    let eventCount = 0;

    while (eventCount < maxEvents) {
      // Simulate event generation with delay
      await this.delay(100);

      yield {
        type: 'agent.event',
        sessionId,
        timestamp: new Date(),
        data: {
          eventNumber: eventCount + 1,
          message: `Event ${eventCount + 1} for session ${sessionId}`,
        },
      };

      eventCount++;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Network errors are retryable
    if (
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('network')
    ) {
      return true;
    }

    // Timeout errors are retryable
    if (message.includes('timeout')) {
      return true;
    }

    // Model unavailable is retryable
    if (message.includes('model') && message.includes('unavailable')) {
      return true;
    }

    return false;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const handle = setTimeout(resolve, ms);
      this.pendingTimers.add(handle);

      // Cleanup after delay completes
      Promise.resolve().then(() => {
        this.pendingTimers.delete(handle);
      });
    });
  }

  /**
   * Simulate agent execution (placeholder for actual OpenCode integration)
   */
  private async simulateAgentExecution(
    params: LLMKernelAgentParams
  ): Promise<{ output: string }> {
    // Simulate processing time
    await this.delay(Math.random() * 100 + 50);

    // Simulate occasional failures for testing
    if (params.prompt.toLowerCase().includes('fail')) {
      throw new Error('Simulated agent failure');
    }

    return {
      output: `Agent [${params.agentRole}] completed: ${params.prompt}`,
    };
  }

  /**
   * Clean up all resources
   * Implements Rule C4: 创建者负责销毁
   */
  async dispose(): Promise<void> {
    // Unsubscribe all active subscriptions
    for (const [, subscription] of this.activeSubscriptions) {
      subscription.unsubscribe();
    }
    this.activeSubscriptions.clear();

    // Clear all pending timers
    for (const timer of this.pendingTimers) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();

    // Clear active sessions
    this.activeSessions.clear();
  }
}

/**
 * Agent event type
 */
export interface AgentEvent {
  type: string;
  sessionId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

/**
 * Create a new LLMKernelIntegration instance
 */
export function createLLMKernelIntegration(): LLMKernelIntegration {
  return new LLMKernelIntegration();
}
