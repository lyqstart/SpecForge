/**
 * Type definitions for ThinPluginClient
 *
 * Defines all request/response types for Thin Plugin HTTP communication.
 *
 * Requirements: 4.1, 4.2
 */

// ============================================================
// Configuration
// ============================================================

/**
 * Configuration for ThinPluginClient
 */
export interface ThinPluginClientConfig {
  /** Base URL for Thin Plugin HTTP server */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseRetryDelay?: number;
  /** Maximum delay for exponential backoff in ms (default: 30000) */
  maxRetryDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  retryMultiplier?: number;
  /** Custom fetch function for testing */
  fetchFn?: typeof fetch;
}

// ============================================================
// Event Reporting
// ============================================================

/**
 * Request to report an event to the Daemon
 */
export interface ThinPluginEventReportRequest {
  /** Event type in OpenCode format */
  eventType: string;
  /** Event payload data */
  payload: unknown;
  /** Session ID (OpenCode's sid) */
  sessionId: string;
  /** Spawn intent ID for first-contact binding */
  spawnIntentId?: string;
  /** Event timestamp (ms since epoch) */
  timestamp?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Response from event report endpoint
 */
export interface ThinPluginEventReportResponse {
  /** Whether the event was accepted */
  accepted?: boolean;
  /** Unique event ID */
  event_id?: string;
  /** Processing timestamp */
  timestamp?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of event report operation
 */
export interface EventReportResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Event ID from the server */
  eventId: string;
  /** Server timestamp */
  timestamp: number;
}

// ============================================================
// Session Binding
// ============================================================

/**
 * Request to bind session ID to spawn intent ID
 * Implements first-contact binding strategy
 */
export interface ThinPluginSessionBindRequest {
  /** Pre-generated spawn intent ID from Daemon */
  spawnIntentId: string;
  /** Actual session ID from OpenCode */
  sessionId: string;
  /** Agent role for the session */
  agentRole: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Response from session bind endpoint
 */
export interface ThinPluginSessionBindResponse {
  /** Whether binding succeeded */
  bound?: boolean;
  /** Error message if failed */
  error?: string;
  /** Bound timestamp */
  timestamp?: number;
}

/**
 * Result of session bind operation
 */
export interface SessionBindResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The spawn intent ID */
  spawnIntentId: string;
  /** The bound session ID */
  sessionId: string;
  /** Whether the session was newly bound */
  bound: boolean;
}

// ============================================================
// Command Execution
// ============================================================

/**
 * Request to send a command to OpenCode
 */
export interface ThinPluginCommandRequest {
  /** Command name */
  command: string;
  /** Target session ID */
  sessionId: string;
  /** Command parameters */
  params?: Record<string, unknown>;
  /** Command timeout in ms */
  timeout?: number;
}

/**
 * Response from command endpoint
 */
export interface ThinPluginCommandResponse {
  /** Command result */
  result?: unknown;
  /** Command output (for stdout/stderr) */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Exit code if applicable */
  exitCode?: number;
}

/**
 * Result of command execution
 */
export interface CommandResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The command that was executed */
  command: string;
  /** Session ID */
  sessionId: string;
  /** Command result data */
  result: unknown;
  /** Command output */
  output?: string;
}

// ============================================================
// Health Check
// ============================================================

/**
 * Response from health check endpoint
 */
export interface ThinPluginHealthCheckResponse {
  /** Health status */
  status?: 'ok' | 'error';
  /** Whether the service is healthy */
  healthy?: boolean;
  /** Service version */
  version?: string;
  /** Error message if unhealthy */
  error?: string;
  /** Current timestamp */
  timestamp?: number;
}

// ============================================================
// Error Types
// ============================================================

/**
 * Error response from Thin Plugin
 */
export interface ThinPluginErrorResponse {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional details */
  details?: unknown;
}
// ============================================================
// Daemon Startup Management
// ============================================================

/**
 * Configuration for DaemonStartupManager
 */
export interface DaemonStartupConfig {
  /** Command to start the Daemon */
  daemonCommand: string;
  /** Arguments for the Daemon command */
  daemonArgs: string[];
  /** Startup timeout in milliseconds (default: 30000) */
  startupTimeout?: number;
  /** Health check interval in ms (default: 1000) */
  healthCheckInterval?: number;
  /** Maximum number of startup retries (default: 3) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 2000) */
  retryDelay?: number;
  /** Working directory for Daemon process */
  cwd?: string;
  /** Environment variables for Daemon process */
  env?: Record<string, string>;
  /** Whether to auto-restart on crash (default: false) */
  autoRestart?: boolean;
  /** Health check URL (default: http://localhost:3000/health) */
  healthCheckUrl?: string;
  /** Whether to run in foreground (default: false) */
  foreground?: boolean;
  /** Custom spawn function for testing */
  spawnFn?: typeof import('child_process').spawn;
}

/**
 * Daemon status information
 */
export interface DaemonStatus {
  /** Current state */
  state: 'stopped' | 'starting' | 'running' | 'error';
  /** Whether Daemon is running */
  running: boolean;
  /** Uptime in milliseconds */
  uptime?: number;
  /** Process ID */
  pid?: number;
}

/**
 * Result of Daemon startup
 */
export interface StartupResult {
  /** Whether startup succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Process ID if started */
  pid?: number;
  /** Number of attempts made */
  attempts?: number;
  /** Whether Daemon was already running */
  alreadyRunning?: boolean;
}

/**
 * Result of health check
 */
export interface DaemonHealthCheckResult {
  /** Whether Daemon is healthy */
  healthy: boolean;
  /** HTTP status code */
  statusCode?: number;
  /** Response latency in ms */
  latency?: number;
  /** Error message if unhealthy */
  error?: string;
}