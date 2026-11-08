/**
 * Workflow Runtime Module
 * Core exports for workflow execution engine
 */

import './types.js';
export {
  type ArtifactDefinition,
  type CompositeGateDefinition,
  type CompositeGateMode,
  type FailPolicy,
  type GateDefinition,
  type GateResult,
  type GateType,
  type SimpleGateDefinition,
  type StateMachine,
  SUPPORTED_WORKFLOW_DEFINITION_SCHEMAS,
  type WorkflowContext,
  type WorkflowDefinition,
  type WorkflowDefinitionSchemaVersion,
  type WorkflowEventData,
  type WorkflowInstance,
  type WorkflowInstanceStatus,
  type WorkflowState,
} from './types.js';
export { WorkflowEngine, type WorkflowEvent, type WorkflowEngineConfig } from './WorkflowEngine.js';

// Engine module exports
import './engine/index.js';
export {
  type CreateInstanceOptions,
  WorkflowInstanceFactory,
  WorkflowInstanceStateManager,
  WorkflowInstanceTracker,
  WorkflowLoader,
} from './engine/index.js';
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
export { STATE_ADVANCEMENT_SUBJECTS } from './types/state-machine.js';
export type { StateAdvancementSubject } from './types/state-machine.js';

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
import './gates/index.js';
export {
  AgentGateRunner,
  BaseGate,
  CompositeGateSerializer,
  createAgentGateRunner,
  createBasicGate,
  DesignGate,
  RequirementsGate,
  type SerializedCompositeGate,
  type SerializedGateDefinition,
  type SerializedSimpleGate,
  TasksGate,
  validateCompositeGate,
  VerificationGate,
} from './gates/index.js';

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


// Agent Workflow Engine exports
export {
  AgentWorkflowEngine,
  createAgentWorkflowEngine,
  type AgentWorkflowEngineConfig,
} from './engine/AgentWorkflowEngine.js';

// RBAC module exports (Phase 1)
import './rbac/index.js';
export {
  type AuditSink,
  AuthorizationAuditLogger,
  type AuthorizationAuditRecord,
  createAuthorizationAuditLogger,
  createFileAuthorizationPolicy,
  createPrincipalResolver,
  createRBACEngine,
  createTransitionAuthorizer,
  type FileAuthorizationInput,
  FileAuthorizationPolicy,
  InMemoryAuditSink,
  matchProtectedFile,
  type Operation,
  type Permission,
  type PermissionContext,
  type PermissionDecision,
  type Principal,
  PrincipalResolver,
  type PrincipalRole,
  type PrincipalSource,
  ProtectedFileMatcher,
  type RBACConfig,
  RBACEngine,
  type ResourceType,
  type SealTransitionEntry,
  type TransitionAuthorizationInput,
  TransitionAuthorizer,
  type TransitionAuthorizerConfig,
} from './rbac/index.js';
