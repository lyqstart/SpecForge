/**
 * Daemon Core types and interfaces
 */

export interface AgentIdentity {
  sessionId: string;
  agentRole: string;
  workflowRole: string;
  parentSessionId: string | null;
  workItemId: string;
  spawnIntentId: string;
  createdAt: number;
  lastActiveAt: number;
  status: 'pending' | 'active' | 'history';
}

/**
 * Event category union type — aligned with @specforge/observability EventCategory.
 */
export type EventCategory =
  | 'workflow'
  | 'gate'
  | 'permission'
  | 'session'
  | 'tool'
  | 'heal'
  | 'modality'
  | 'system'
  | 'llm';

/**
 * Unified Event Schema for SpecForge WAL.
 *
 * All WAL events conform to this schema. Fields are ordered by category:
 * identity fields first, then routing, then action, then payload.
 *
 * New unified fields (schema_version, monotonicSeq, actor) are optional
 * in the type definition for backward compatibility with legacy event
 * producers. Code that creates new events (e.g. WAL.createEvent) must
 * include all unified fields.
 */
export interface Event {
  /** Schema version identifier — '1.0' for V6+ events */
  schema_version?: '1.0';
  /** UUIDv7 event identifier (time-ordered unique ID) */
  eventId: string;
  /** Event creation timestamp in milliseconds since epoch */
  ts: number;
  /** Monotonically increasing sequence number within the WAL */
  monotonicSeq?: number;
  /** Project or Work Item identifier this event belongs to */
  projectId?: string;
  /** Work Item identifier (e.g. 'WI-001') */
  workItemId?: string;
  /** Actor (agent role or user) that triggered the event */
  actor?: string;
  /** Event category for routing (e.g. 'state', 'session', 'system') */
  category?: string;
  /** Event action verb (e.g. 'state.transition', 'session.activated') */
  action: string;
  /** Event payload — arbitrary structured data */
  payload: Record<string, unknown>;

  /** @deprecated Deprecated — use action field context */
  target?: string;
  /** @deprecated Deprecated — use action field context */
  success?: boolean;
  /** @deprecated Deprecated — use action field context */
  data?: Record<string, unknown>;
  /** @deprecated Deprecated — use schema_version instead */
  metadata: {
    schemaVersion: string;
    source: 'daemon' | 'client' | 'adapter';
  };
}

/**
 * Work Item state compatible with V5 workflow state model.
 *
 * Used by StateManager to track each Work Item's current workflow position.
 */
export interface WorkItemState {
  /** Work Item identifier (e.g. 'WI-001') */
  work_item_id: string;
  /** Workflow type (e.g. 'feature_spec', 'bugfix_spec', 'refactor') */
  workflow_type: string;
  /** Current workflow state (e.g. 'intake', 'requirements', 'design', etc.) */
  current_state: string;
  /** Creation timestamp in milliseconds */
  created_at: number;
  /** Last update timestamp in milliseconds */
  updated_at: number;
}

/**
 * Project state — the derived in-memory snapshot of all Work Items.
 *
 * This is the authoritative runtime state for the daemon, rebuilt from
 * WAL events on startup via rebuildState().
 */
export interface ProjectState {
  stateVersion: number;
  projectPath: string;
  schemaVersion: string;
  activeSessions: string[];
  workItems: WorkItemState[];
  lastEventId: string;
  lastEventTs: number;
}

export interface HandshakeFile {
  schema_version: string;
  pid: number;
  port: number;
  token: string;
  startedAt: number;
  version: string;
  serviceMode: boolean;
}

export interface Lock {
  id: string;
  projectPath: string;
  acquiredAt: number;
  expiresAt: number;
}

export interface Subscription {
  id: string;
  topic: string;
  handler: (event: Event) => void;
}

export interface ConsistencyCheckResult {
  isValid: boolean;
  issues: ConsistencyIssue[];
}

export interface ConsistencyIssue {
  type: 'missing_event' | 'state_mismatch' | 'out_of_order';
  description: string;
  affectedEventId?: string;
  affectedProjectPath?: string;
}

export interface RepairResult {
  success: boolean;
  repairedState: ProjectState;
  repairEvents: Event[];
}

/**
 * API response types for HTTP server
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  requestId: string;
  timestamp: number;
}

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

/**
 * Daemon error class for structured error handling
 * Used by HTTPServer for global error handling
 */
export class DaemonError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'DaemonError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// ── HTTP API Request/Response Types ──

/**
 * Request to read the current state of a Work Item.
 */
export interface StateReadRequest {
  /** The Work Item identifier */
  workItemId: string;
}

/**
 * Request to perform a state transition for a Work Item.
 */
export interface StateTransitionRequest {
  /** The Work Item identifier */
  workItemId: string;
  /** Expected current state ('' for new Work Items) */
  fromState: string;
  /** Target state to transition to */
  toState: string;
  /** Actor performing the transition (default 'system') */
  actor?: string;
  /** Workflow type (default 'feature_spec') */
  workflowType?: string;
  /** Additional payload fields */
  extraPayload?: Record<string, unknown>;
}

/**
 * Request to log an event to the WAL.
 */
export interface EventLogRequest {
  /** Project or Work Item identifier */
  projectId: string;
  /** Event category for routing */
  category: string;
  /** Event action verb */
  action: string;
  /** Event payload */
  payload: Record<string, unknown>;
  /** Actor that triggered the event (default 'system') */
  actor?: string;
  /** Event source (default 'daemon') */
  source?: 'daemon' | 'client' | 'adapter';
}

/**
 * Request to query events from the WAL with filters.
 */
export interface EventQueryRequest {
  /** Filter by projectId */
  projectId?: string;
  /** Filter by category */
  category?: string;
  /** Filter by action */
  action?: string;
  /** Filter by actor */
  actor?: string;
  /** Filter by minimum timestamp */
  fromTs?: number;
  /** Filter by maximum timestamp */
  toTs?: number;
  /** Maximum number of results */
  limit?: number;
  /** Number of results to skip */
  offset?: number;
}

/**
 * Request to invoke a tool via the unified Tool invocation API.
 */
export interface ToolInvokeRequest {
  /** Tool name */
  tool: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** Optional execution context */
  context?: Record<string, unknown>;
}

/**
 * Response from a tool invocation.
 */
export interface ToolInvokeResponse {
  /** Whether the invocation succeeded */
  success: boolean;
  /** Response data on success */
  data?: unknown;
  /** Error message on failure */
  error?: string;
}
