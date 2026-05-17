/**
 * Workflow Runtime Module
 * Core exports for workflow execution engine
 */

export * from './types.js';
export { WorkflowEngine, type WorkflowEvent, type WorkflowEngineConfig } from './WorkflowEngine.js';

// Engine module exports
export * from './engine/index.js';
export {
  GateRunner,
  SimpleGateRunner,
  CompositeGateRunner,
  createGateRunner,
} from './GateRunner.js';

// Error propagation exports
export {
  ErrorPropagationManager,
  ErrorPropagationContext,
  ErrorPropagationResult,
  ErrorPropagationUtils,
  createErrorPropagationManager,
} from './error-propagation.js';
export {
  EventPublisher,
  createEventPublisher,
  type WorkflowLifecycleEventType,
  type GateEventType,
  type WorkflowEventType,
  type WorkflowLifecyclePayload,
  type GateEventPayload,
  type EventPublisherConfig,
} from './EventPublisher.js';
export type { GateCancellationPayload } from './events/EventTypes.js';
export type { IEventBus, Event, Subscription } from './types.js';

// Event Subscription exports
export {
  EventSubscriptionManager,
  createEventSubscriptionManager,
  type EventHandler,
  type EventSubscription,
} from './event-subscription.js';

// Event Filter exports
export {
  EventFilter,
  createEventFilter,
  type FilterCriteria,
} from './event-filter.js';

// Persistence exports
export {
  WorkflowPersistence,
  createWorkflowPersistence,
  type PersistenceConfig,
  type StoredWorkflowInstance,
  type EventReplayResult,
} from './WorkflowPersistence.js';

// Storage interface exports
export {
  createWorkflowInstanceStorage,
  type WorkflowInstanceStorage,
  type StorageConfig,
} from './storage/index.js';

// Error handling exports
export {
  WorkflowErrorHandler,
  WorkflowStateManager,
  createErrorHandler,
  type RetryConfig as RetryConfigLegacy,
  DEFAULT_RETRY_CONFIG as DEFAULT_RETRY_CONFIG_LEGACY,
} from './WorkflowErrorHandling.js';

// Retry mechanism exports
export {
  withRetry,
  shouldRetryError,
  calculateDelay,
  createRetryDecorator,
  getRetryStats,
  validateRetryConfig,
  DEFAULT_RETRY_CONFIG,
} from './retry.js';

// Re-export RetryConfig from types (the canonical one)
export type { RetryConfig, RetryState, RetryStrategy } from './types.js';

// Gate error handling exports (new unified error classes)
export {
  GateError,
  GateTimeoutError,
  GateExecutionError as GateExecError,
  GateValidationError,
  GateConfigurationError,
  GateDependencyError,
  GateCancellationError,
  GateResourceError,
  handleGateError,
  isGateError,
  getErrorCode,
  isRetryableError,
  getErrorType,
  createErrorResult,
} from './error-handler.js';

// Basic Gates exports
export * from './gates/index.js';

// Agent integration exports
export {
  AgentScheduler,
  WorkflowAgentRunner,
  createAgentScheduler,
  createWorkflowAgentRunner,
  type AgentRole,
  type SpawnAgentParams,
  type AgentExecutionResult,
  type AgentSchedulerConfig,
  type AgentExecutionContext,
} from './AgentRunner.js';

// Workflow Definition Loader exports
export {
  WorkflowDefinitionLoader,
  type ValidationError,
  type ValidationResult,
} from './loaders/index.js';

// Event Bus Integration exports
export {
  initializeEventBusIntegration,
  shutdownEventBusIntegration,
  subscribeToWorkflowEvents,
  unsubscribeFromWorkflowEvents,
  type EventBusIntegrationConfig,
} from './event-integration.js';

// State Recovery exports
export {
  StateRecoveryManager,
  createStateRecoveryManager,
  type StateRecoveryOptions,
  type ConsistencyValidationResult,
  type StateInconsistency,
  type CrashRecoveryResult,
} from './StateRecoveryManager.js';


// Agent Workflow Engine exports
export {
  AgentWorkflowEngine,
  createAgentWorkflowEngine,
  type AgentWorkflowEngineConfig,
} from './engine/AgentWorkflowEngine.js';