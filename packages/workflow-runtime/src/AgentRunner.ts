/**
 * AgentRunner Module
 * Handles integration with the Agent system for workflow execution
 */

import { v4 as uuidv4 } from 'uuid';
import { WorkflowInstance, WorkflowDefinition, GateResult } from './types.js';

// Schema version (REQ-18)
const SCHEMA_VERSION = '1.0';

/**
 * Agent role types available in workflow
 */
export type AgentRole =
  | 'dev'
  | 'reviewer'
  | 'orchestrator'
  | 'requirements'
  | 'design'
  | 'task-planner'
  | 'verifier'
  | 'general';

/**
 * Agent task parameters for spawning
 */
export interface SpawnAgentParams {
  agentRole: AgentRole;
  spawnIntentId: string;
  prompt: string;
  context?: Record<string, unknown>;
  timeout?: number;
}

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
  schema_version: string;
  success: boolean;
  sessionId?: string;
  output?: string;
  error?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Agent scheduler configuration
 */
export interface AgentSchedulerConfig {
  maxConcurrentAgents?: number;
  defaultTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Agent execution context
 */
export interface AgentExecutionContext {
  instance: WorkflowInstance;
  definition: WorkflowDefinition;
  currentState: string;
  previousState?: string;
  gateResult?: GateResult;
  metadata?: Record<string, unknown>;
}

/**
 * Agent state for tracking execution
 */
interface AgentState {
  sessionId: string;
  role: AgentRole;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  result?: AgentExecutionResult;
}

/**
 * AgentScheduler - Manages agent scheduling and execution
 * Provides integration with the Agent system for workflow execution
 */
export class AgentScheduler {
  private config: Required<AgentSchedulerConfig>;
  private activeAgents: Map<string, AgentState> = new Map();
  private pendingTasks: Array<{
    params: SpawnAgentParams;
    context: AgentExecutionContext;
    resolve: (result: AgentExecutionResult) => void;
    reject: (error: Error) => void;
  }> = [];

  /**
   * Create a new AgentScheduler
   */
  constructor(config: AgentSchedulerConfig = {}) {
    this.config = {
      maxConcurrentAgents: config.maxConcurrentAgents ?? 5,
      defaultTimeout: config.defaultTimeout ?? 300000, // 5 minutes
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };
  }

  /**
   * Get the current number of active agents
   */
  getActiveCount(): number {
    return this.activeAgents.size;
  }

  /**
   * Check if scheduler can accept new tasks
   */
  canAcceptTasks(): boolean {
    return this.activeAgents.size < this.config.maxConcurrentAgents;
  }

  /**
   * Get all active agent sessions
   */
  getActiveAgents(): string[] {
    return Array.from(this.activeAgents.keys());
  }

  /**
   * Schedule an agent to run
   * @param params Agent spawn parameters
   * @param context Execution context
   * @returns Promise resolving to agent execution result
   */
  async scheduleAgent(
    params: SpawnAgentParams,
    context: AgentExecutionContext
  ): Promise<AgentExecutionResult> {
    // Check if we can run immediately
    if (this.canAcceptTasks()) {
      return this.executeAgent(params, context);
    }

    // Queue the task
    return new Promise((resolve, reject) => {
      this.pendingTasks.push({ params, context, resolve, reject });

      // Auto-start queue processor when capacity becomes available
      this.processQueue();
    });
  }

  /**
   * Execute an agent directly
   */
  private async executeAgent(
    params: SpawnAgentParams,
    context: AgentExecutionContext
  ): Promise<AgentExecutionResult> {
    const sessionId = uuidv4();
    const startTime = new Date();

    // Track this agent
    const agentState: AgentState = {
      sessionId,
      role: params.agentRole,
      status: 'running',
      startTime,
    };
    this.activeAgents.set(sessionId, agentState);

    try {
      // Execute the agent (actual implementation delegates to external system)
      const result = await this.invokeAgent(params, context, sessionId);

      // Update state
      agentState.status = result.success ? 'completed' : 'failed';
      agentState.endTime = new Date();
      agentState.result = result;

      return result;
    } catch (error) {
      agentState.status = 'failed';
      agentState.endTime = new Date();
      agentState.result = {
        schema_version: SCHEMA_VERSION,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      throw error;
    } finally {
      // Clean up and process queue
      this.activeAgents.delete(sessionId);
      this.processQueue();
    }
  }

  /**
   * Invoke the actual agent (integration point)
   * This method should be overridden or replaced with actual agent system integration
   */
  protected async invokeAgent(
    params: SpawnAgentParams,
    context: AgentExecutionContext,
    sessionId: string
  ): Promise<AgentExecutionResult> {
    // Default implementation - simulates agent execution
    // In production, this would call the actual Agent system (invoke_sub_agent)

    const timeout = params.timeout ?? this.config.defaultTimeout;

    // Create a promise that simulates agent execution
    const executionPromise = this.simulateAgentExecution(params, context);

    // Add timeout handling (Rule C1: Promise.race with cleanup)
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<AgentExecutionResult>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Agent execution timeout after ${timeout}ms`));
      }, timeout);
    });

    try {
      const result = await Promise.race([executionPromise, timeoutPromise]);
      return result;
    } catch (error) {
      // Check if it's a timeout error
      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          schema_version: SCHEMA_VERSION,
          success: false,
          sessionId,
          error: error.message,
          duration: timeout,
        };
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }

  /**
   * Simulate agent execution for testing
   * Replace with actual agent invocation in production
   */
  protected async simulateAgentExecution(
    params: SpawnAgentParams,
    context: AgentExecutionContext
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    // Simulate processing time based on role
    const processingTime = Math.random() * 100 + 50;

    await new Promise((resolve) => setTimeout(resolve, processingTime));

    // Simulate success/failure based on prompt content
    const simulateFailure = params.prompt.toLowerCase().includes('fail');
    const simulateError = params.prompt.toLowerCase().includes('error');

    if (simulateError) {
      return {
        schema_version: SCHEMA_VERSION,
        success: false,
        sessionId: uuidv4(),
        error: 'Simulated agent error',
        duration: Date.now() - startTime,
        metadata: {
          role: params.agentRole,
          intentId: params.spawnIntentId,
        },
      };
    }

    const output = simulateFailure
      ? undefined
      : `Agent [${params.agentRole}] completed task: ${params.spawnIntentId}`;

    const result: AgentExecutionResult = {
      schema_version: SCHEMA_VERSION,
      success: !simulateFailure,
      sessionId: uuidv4(),
      duration: Date.now() - startTime,
      metadata: {
        role: params.agentRole,
        intentId: params.spawnIntentId,
        contextState: context.currentState,
      },
    };

    if (output) {
      result.output = output;
    }
    if (simulateFailure) {
      result.error = 'Simulated task failure';
    }

    return result;
  }

  /**
   * Process queued tasks when capacity becomes available
   */
  private processQueue(): void {
    if (!this.canAcceptTasks() || this.pendingTasks.length === 0) {
      return;
    }

    // Process next pending task
    const task = this.pendingTasks.shift();
    if (task) {
      this.executeAgent(task.params, task.context)
        .then(task.resolve)
        .catch(task.reject);
    }
  }

  /**
   * Cancel a running agent
   */
  async cancelAgent(sessionId: string): Promise<boolean> {
    const agentState = this.activeAgents.get(sessionId);
    if (!agentState) {
      return false;
    }

    agentState.status = 'cancelled';
    agentState.endTime = new Date();
    this.activeAgents.delete(sessionId);

    // Process queue after cancellation
    this.processQueue();

    return true;
  }

  /**
   * Cancel all running agents
   */
  async cancelAll(): Promise<void> {
    const sessionIds = Array.from(this.activeAgents.keys());
    await Promise.all(sessionIds.map((id) => this.cancelAgent(id)));
  }

  /**
   * Get agent execution state
   */
  getAgentState(sessionId: string): AgentState | undefined {
    return this.activeAgents.get(sessionId);
  }

  /**
   * Get scheduler statistics
   */
  getStats(): {
    active: number;
    pending: number;
    maxConcurrent: number;
  } {
    return {
      active: this.activeAgents.size,
      pending: this.pendingTasks.length,
      maxConcurrent: this.config.maxConcurrentAgents,
    };
  }
}

/**
 * WorkflowAgentRunner - Runs agents as part of workflow execution
 * Integrates with WorkflowEngine to execute agent-based steps
 */
export class WorkflowAgentRunner {
  private scheduler: AgentScheduler;

  /**
   * Create a new WorkflowAgentRunner
   */
  constructor(scheduler?: AgentScheduler) {
    this.scheduler = scheduler ?? new AgentScheduler();
  }

  /**
   * Get the scheduler
   */
  getScheduler(): AgentScheduler {
    return this.scheduler;
  }

  /**
   * Run an agent for a workflow state
   */
  async runAgentForState(
    agentRole: AgentRole,
    intentId: string,
    prompt: string,
    context: AgentExecutionContext
  ): Promise<AgentExecutionResult> {
    const params: SpawnAgentParams = {
      agentRole,
      spawnIntentId: intentId,
      prompt,
    };

    // Only add context if it's defined
    if (context.metadata) {
      params.context = context.metadata;
    }

    return this.scheduler.scheduleAgent(params, context);
  }

  /**
   * Determine which agent role to use based on state
   */
  static determineAgentRole(stateName: string, _gateType?: string): AgentRole {
    const stateLower = stateName.toLowerCase();

    // Map state names to agent roles
    if (stateLower.includes('requirement') || stateLower.startsWith('req_')) {
      return 'requirements';
    }
    if (stateLower.includes('design')) {
      return 'design';
    }
    if (stateLower.includes('task') || stateLower.includes('implement')) {
      return 'dev';
    }
    if (stateLower.includes('review') || stateLower.includes('verify')) {
      return 'reviewer';
    }
    if (stateLower.includes('test') || stateLower.includes('verification')) {
      return 'verifier';
    }
    if (stateLower.includes('plan') || stateLower.includes('orchestrat')) {
      return 'orchestrator';
    }

    return 'general';
  }
}

/**
 * Create a new AgentScheduler with default configuration
 */
export function createAgentScheduler(config?: AgentSchedulerConfig): AgentScheduler {
  return new AgentScheduler(config);
}

/**
 * Create a new WorkflowAgentRunner
 */
export function createWorkflowAgentRunner(scheduler?: AgentScheduler): WorkflowAgentRunner {
  return new WorkflowAgentRunner(scheduler);
}