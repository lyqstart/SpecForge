/**
 * @specforge/service-management
 *
 * Service Management subsystem for SpecForge V6
 * Provides cross-platform OS service lifecycle management
 */

// Re-export all public APIs

// Types (excluding ShutdownPriority which is exported as both type+value from shutdown/)
export type {
  ServiceState,
  ServiceInstallSpec,
  ServiceStatus,
  ServiceUnitMetadata,
  EnvironmentPrecheck,
  PrecheckIssue,
  OrchestrationResult,
  NssmCommand,
  ShutdownTask,
  ShutdownTaskEntry,
  HandshakeFile,
  HealthCheckResponse,
  ServicesStatusJsonPayload,
  ServiceStatusJsonEntry,
  ServiceOperationJsonPayload,
} from './types/index.js';

// Unit Generator (Phase 2)
export * from './unit-generator/index.js';

// Service Manager (Phase 3)
export * from './service-manager/index.js';

// Orchestrator (Phase 4 - ServiceLifecycleOrchestrator)
export * from './orchestrator/index.js';

// Graceful Shutdown (Phase 6 - Task 6.1)
// ShutdownPriority is exported here as both type and value
export * from './shutdown/index.js';

// Plugin Reconnecting Daemon Client (Phase 7 - Task 7.1)
export * from './plugin/index.js';

// Errors
export * from './errors/index.js';

/**
 * Package version
 */
export const SERVICE_MANAGEMENT_VERSION = '0.1.0';