/**
 * Integration module exports
 *
 * This module provides integration components for Thin Plugin communication
 * and session binding.
 *
 * Requirements: 4.1, 4.2
 */

export { ThinPluginClient, ThinPluginClientError, ThinPluginClientErrorCode } from './ThinPluginClient';
export { SessionRegistry, SessionRegistryError } from './SessionRegistry';
export { DaemonStartupManager, DaemonStartupError, DaemonStartupErrorCode, createDaemonStartupManager, ensureDaemonRunning } from './DaemonStartupManager';

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
  ThinPluginErrorResponse,
  DaemonStartupConfig,
  DaemonStatus,
  StartupResult,
  DaemonHealthCheckResult,
} from './types';

export type {
  SessionBinding,
  SessionBindingRequest,
  SessionBindingResult,
  SessionQuery,
  BindingState,
} from './SessionRegistry';