/**
 * OpenCode Adapter for SpecForge V6
 *
 * This module implements the LLMKernelAdapter interface for OpenCode,
 * providing isolation between OpenCode implementation details and Daemon core.
 *
 * @package @specforge/opencode-adapter
 * @version 1.0.0
 */

// Re-export public types
export * from './types';

// Export error types (Task 7.1: Error classification and handling)
export * from './errors';

// Export main adapter class
export { OpenCodeAdapter, SessionInitializationError, PromptDeliveryError } from './OpenCodeAdapter';

// Export translators
export { ContextTranslator } from './translators/ContextTranslator';
export { EventTranslator } from './translators/EventTranslator';
export { ToolTranslator } from './translators/ToolTranslator';
export { CapabilityTranslator } from './translators/CapabilityTranslator';

// Export version compatibility
export { VersionChecker } from './version/VersionChecker';

// Export functional version-checker API (per task 1.3)
export {
  parseVersion,
  parseRange,
  compareVersions,
  satisfies,
  checkCompatibility,
  suggestAction,
  buildVersionMismatchEvent,
} from './version-checker';
export type {
  CompatibilityResult,
  ParsedVersion,
  AdapterVersionMismatchEvent,
} from './version-checker';

// Export integration components (Thin Plugin communication)
export { ThinPluginClient, ThinPluginClientError, ThinPluginClientErrorCode } from './integration/ThinPluginClient';
export type {
  ThinPluginClientConfig,
  ThinPluginEventReportRequest,
  ThinPluginEventReportResponse,
  EventReportResult,
  ThinPluginSessionBindRequest,
  ThinPluginSessionBindResponse,
  SessionBindResult,
  ThinPluginCommandRequest,
  ThinPluginCommandResponse,
  CommandResult,
  ThinPluginHealthCheckResponse,
} from './integration/types';

// Export event logger (Task 7.2: Event logging)
export { EventLogger, createEventLogger } from './event-logger/EventLogger';
export type {
  EventLoggerConfig,
  EventBusLike,
  DaemonEvent,
} from './event-logger/EventLogger';

// Export diagnostics logger (Task 7.3: Diagnostics and logging)
export { DiagnosticsLogger } from './diagnostics/DiagnosticsLogger';
export type {
  DiagnosticsConfig,
  LogLevel,
  LogEntry,
  PerformanceMetric,
  CompatibilityWarning,
  TranslationLogEntry,
} from './diagnostics/DiagnosticsLogger';

// Export configuration system (Task 8.1: Configuration system)
export {
  loadConfig,
  validateConfig,
  mergeConfigs,
  getEnvVarName,
  getAllEnvVarNames,
  DEFAULT_CONFIG,
  CONFIG_SCHEMA_VERSION,
  CONFIG_PRIORITY,
  CONFIG_ENV_PREFIX,
} from './configuration';
export type {
  LoadConfigOptions,
  LoadedConfig,
} from './configuration';
