/**
 * Workflow Runtime Types
 * Core data models for workflow execution engine
 */

// Note: WorkflowEvent is defined locally in WorkflowEngine.ts

/**
 * Basic workflow event structure (used in WorkflowInstance history)
 */
export interface WorkflowEventData {
  type: string;
  instanceId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

/**
 * Gate execution result
 *
 * v1.1 status semantics (five-state):
 *   passed      — check function ran and approved (passed=true)
 *   failed      — check function ran and rejected (passed=false)
 *   blocked     — check function could not run due to missing prerequisites
 *   waived      — explicitly waived by policy or user (passed=true, but not verified)
 *   not_enabled — gate not configured (required=false, no checkFn) (passed=false)
 *
 * passed=true ONLY when a real check function verified and approved.
 * status supplements passed for Gate Summary visibility.
 */
export interface GateResult {
  schema_version: "1.0";
  passed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
  /** v1.1: Five-state gate status for Gate Summary */
  status?: 'passed' | 'failed' | 'blocked' | 'waived' | 'not_enabled';
}

/**
 * Gate definition types
 */
export type GateType = 'simple' | 'composite';

/**
 * Simple Gate definition
 */
export interface SimpleGateDefinition {
  schema_version: "1.0";
  type: 'simple';
  id: string;
  name: string;
  checkFn?: () => Promise<GateResult> | GateResult;
  /** Whether this gate is required (default: true). Non-required gates auto-waive when no checkFn */
  required?: boolean;
  /** Gate severity — 'soft' gates auto-waive when no checkFn */
  severity?: 'hard' | 'soft';
}

/**
 * Composite Gate execution modes
 */
export type CompositeGateMode = 'sequential' | 'parallel';

/**
 * Composite Gate failure policies
 */
export type FailPolicy = 'fail_fast' | 'collect_all';

/**
 * Composite Gate definition
 */
export interface CompositeGateDefinition {
  schema_version: "1.0";
  type: 'composite';
  id: string;
  name: string;
  mode: CompositeGateMode;
  failPolicy: FailPolicy;
  children: GateDefinition[];
}

/**
 * Union of all Gate definitions
 */
export type GateDefinition = SimpleGateDefinition | CompositeGateDefinition;

/**
 * Workflow state definition
 */
export interface WorkflowState {
  schema_version: "1.0";
  agent: string;
  gate: GateDefinition;
  skills: string[];
  next?: string | Record<string, string>;
}

/**
 * State machine definition
 */
export interface StateMachine {
  schema_version: "1.0";
  initial: string;
  states: Record<string, WorkflowState>;
}

/**
 * Artifact definition
 */
export interface ArtifactDefinition {
  id: string;
  type: string;
  content: string;
}

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
  schema_version: "1.0";
  id: string;
  displayName: string;
  intent: string;
  stateMachine: StateMachine;
  artifacts: ArtifactDefinition[];
}

/**
 * Workflow instance status
 */
export type WorkflowInstanceStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

/**
 * Workflow instance
 */
export interface WorkflowInstance {
  schema_version: "1.0";
  id: string;
  workflowId: string;
  currentState: string;
  status: WorkflowInstanceStatus;
  history: WorkflowEventData[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  instance: WorkflowInstance;
  definition: WorkflowDefinition;
}

/**
 * Event Bus interface for publishing events
 * This interface allows integration with different event bus implementations
 */
export interface IEventBus {
  publish(event: Event): void;
  subscribe(topic: string, handler: (event: Event) => void): Subscription;
  unsubscribe(subscription: Subscription): void;
  isRunning(): boolean;
  start(): void;
  stop(): void;
}

/**
 * Event structure for the Event Bus
 */
export interface Event {
  eventId: string;
  ts: number;
  projectId: string;
  action: string;
  payload: Record<string, unknown>;
  metadata: {
    schemaVersion: string;
    source: 'daemon' | 'client' | 'adapter';
  };
}

/**
 * Subscription object for unsubscribing from events
 */
export interface Subscription {
  id: string;
  topic: string;
  handler: (event: Event) => void;
}

/**
 * Retry strategy types
 */
export type RetryStrategy = 'fixed' | 'exponential' | 'linear';

/**
 * Retry configuration for gate execution
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts (default: 3)
   */
  maxAttempts?: number;
  /**
   * Initial delay in milliseconds (default: 1000)
   */
  initialDelayMs?: number;
  /**
   * Maximum delay in milliseconds (default: 10000)
   */
  maxDelayMs?: number;
  /**
   * Backoff multiplier for exponential strategy (default: 2)
   */
  backoffMultiplier?: number;
  /**
   * Retry strategy to use (default: exponential)
   */
  strategy?: RetryStrategy;
  /**
   * List of error codes that should NOT be retried
   * If empty, all retryable errors will be retried
   */
  nonRetryableCodes?: string[];
  /**
   * List of error codes that CAN be retried (whitelist mode)
   * If empty, all retryable errors will be retried
   */
  retryableCodes?: string[];
  /**
   * Callback function called before each retry
   * Return false to cancel retry
   */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => boolean | Promise<boolean>;
  /**
   * Callback function called when all retries are exhausted
   */
  onExhausted?: (error: unknown, attempts: number) => void;
}

/**
 * Retry state tracking
 */
export interface RetryState {
  attempts: number;
  lastError: unknown;
  delays: number[];
  startTime: number;
  endTime?: number;
}