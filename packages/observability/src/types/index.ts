/**
 * Core types for the Observability module
 */

// TODO: Import from @specforge/types when available
// import type { AgentIdentity } from '@specforge/types';

/**
 * Agent Identity — core identity structure for agent sessions.
 * Aligned with daemon-core's session/AgentIdentity.ts.
 */
export interface AgentIdentity {
  sessionId: string;
  agentRole: string;
  workflowRole: string;
  parentSessionId: string | null;
  workItemId: string;
  spawnIntentId: string;
}

// Export event utilities
export * from './event-utils';

/**
 * Three-tier observability mode
 */
export type ObservabilityMode = 'minimal' | 'standard' | 'deep';

/**
 * Event categories
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
 * Event interface (Property 30: Multi-sync Readiness)
 */
export interface Event {
  schema_version: '1.0';
  eventId: string;                 // UUIDv7 (globally unique, time-ordered)
  ts: number;                      // Monotonic timestamp (nanoseconds)
  monotonicSeq: number;            // Process-internal sequence for same-ts ordering
  projectId: string;               // SHA-256 of project root path (truncated)
  workItemId: string | null;
  actor: AgentIdentity | null;
  category: EventCategory;
  action: string;                  // e.g., "workflow.started", "permission.evaluated"
  payload?: unknown;
  payloadBlobRef?: string;         // "blob://<sha256>" for payloads > 64 KiB
}

/**
 * Event filter for querying
 */
export interface EventFilter {
  projectId?: string;
  workItemId?: string;
  category?: EventCategory;
  action?: string;
  actor?: Partial<AgentIdentity>;
  startTs?: number;
  endTs?: number;
  limit?: number;
}

/**
 * Permission decision event (Property 10: Traceability)
 */
export interface PermissionDecisionEvent extends Event {
  category: 'permission';
  action: 'permission.evaluated';
  payload: {
    actor: AgentIdentity;
    action: string;                // e.g., "tool.invoke"
    resource: { type: string; id: string };
    matched_rule: string;          // Rule ID
    rule_layer: 'hard' | 'builtin' | 'user';
    reason: string;
    effect: 'allow' | 'deny';
  };
}

/**
 * North Star troubleshooting scenarios
 */
export type NorthStarScenario =
  | 'gate-repeated-failure'
  | 'agent-deviation'
  | 'tool-invocation-error'
  | 'permission-denial'
  | 'upgrade-installation-failure'
  | 'state-machine-stuck'
  | 'concurrency-deadlock'
  | 'skill-invocation-check'
  | 'workflow-execution-check'
  | 'workflow-result-deviation';

/**
 * Analysis result
 */
export interface AnalysisResult {
  scenario: NorthStarScenario;
  rootCause: string | null;
  confidence: number;  // 0-1
  evidence: Event[];
  recommendations: string[];
  timeToIdentify: number;  // milliseconds
}

/**
 * Permission trace
 */
export interface PermissionTrace {
  decision: PermissionDecisionEvent;
  rule: unknown;  // PermissionRule from @specforge/permission-engine
  context: Record<string, unknown>;
  relatedEvents: Event[];  // Events leading to the decision
}

/**
 * Time range for queries
 */
export interface TimeRange {
  start: number;  // timestamp in milliseconds
  end: number;    // timestamp in milliseconds
}

/**
 * Event Bus interface
 */
export interface EventBus {
  emit(event: Omit<Event, 'eventId' | 'ts' | 'monotonicSeq' | 'schema_version'>): Promise<void>;
  subscribe(pattern: string): AsyncIterable<Event>;
  getMode(): ObservabilityMode;
  setMode(mode: ObservabilityMode): void;
}

/**
 * CAS (Content-Addressable Storage) interface
 */
export interface CAS {
  store(content: Uint8Array | string): Promise<string>;  // Returns "blob://<sha256>"
  retrieve(ref: string): Promise<Uint8Array | string | null>;
  exists(ref: string): Promise<boolean>;
  delete(ref: string): Promise<void>;
}

/**
 * Event Logger interface
 */
export interface EventLogger {
  trackEvent(event: Event): Promise<void>;
  getEvents(filter?: EventFilter): AsyncIterable<Event>;
  getEventsAcrossAllProjects(filter?: EventFilter): Promise<Event[]>;
  rebuildState(): Promise<unknown>;  // Returns ProjectState
  getLastEventId(): string | null;
  getEventCount(): number;
  getEventsPath(): string;
  getStatePath(): string;
  initialize(): Promise<void>;
  /** Get list of all known project IDs */
  getKnownProjects(): Promise<string[]>;
  /** Get project-specific statistics */
  getProjectStats(projectId: string): Promise<{ eventCount: number; firstEventTs: number; lastEventTs: number } | null>;
  clear(): Promise<void>;
}

/**
 * Query options for pagination
 */
export interface QueryOptions {
  /**
   * Page number (0-indexed)
   */
  page?: number;
  /**
   * Number of events per page
   */
  pageSize?: number;
  /**
   * Sort order (default: ascending by timestamp)
   */
  sortOrder?: 'asc' | 'desc';
  /**
   * Include related events in results
   */
  includeRelated?: boolean;
}

/**
 * Paginated query result
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Query API interface
 */
export interface QueryAPI {
  /**
   * Query events with pagination support
   */
  queryEvents(filter: EventFilter, options?: QueryOptions): Promise<PaginatedResult<Event>>;
  /**
   * Query events synchronously (simple version without pagination)
   */
  queryEventsSync(filter: EventFilter): Promise<Event[]>;
  /**
   * Query events across all projects (cross-project query)
   */
  queryEventsCrossProject(filter: EventFilter, options?: QueryOptions): Promise<{
    items: Event[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
    projects: { projectId: string; eventCount: number }[];
    totalProjects: number;
  }>;
  analyzeScenario(scenario: NorthStarScenario, timeRange: TimeRange): Promise<AnalysisResult>;
  getPermissionTrace(decisionId: string): Promise<PermissionTrace>;
  getBlobContent(ref: string): Promise<Uint8Array | string | null>;
  /** Get list of all known project IDs */
  getKnownProjects(): Promise<string[]>;
  /** Get project-specific statistics */
  getProjectStats(projectId: string): Promise<{ eventCount: number; firstEventTs: number; lastEventTs: number } | null>;
  /** Get statistics across all projects */
  getAllProjectStats(): Promise<Map<string, { eventCount: number; firstEventTs: number; lastEventTs: number }>>;
  /** Set the observability mode for a specific project */
  setProjectMode(projectId: string, mode: 'minimal' | 'standard' | 'deep'): void;
  /** Get the observability mode for a specific project */
  getProjectMode(projectId: string): 'minimal' | 'standard' | 'deep';
  /** Set the default mode for projects without specific configuration */
  setDefaultMode(mode: 'minimal' | 'standard' | 'deep'): void;
  /** Get the default mode */
  getDefaultMode(): 'minimal' | 'standard' | 'deep';
  /** Remove project-specific mode configuration */
  removeProjectMode(projectId: string): void;
  /** Get all project-specific mode configurations */
  getAllProjectModes(): { projectId: string; mode: 'minimal' | 'standard' | 'deep' }[];
}

/**
 * Analyst Engine interface
 */
export interface AnalystEngine {
  analyzeGateFailures(workItemId: string, timeRange: TimeRange): Promise<AnalysisResult>;
  analyzeAgentDeviation(sessionId: string): Promise<AnalysisResult>;
  analyzeToolErrors(toolId: string, timeRange: TimeRange): Promise<AnalysisResult>;
  analyzePermissionDenials(projectId: string, timeRange: TimeRange): Promise<AnalysisResult>;
  analyzeUpgradeFailures(projectId: string, timeRange: TimeRange): Promise<AnalysisResult>;
  analyzeStateMachineStuck(workItemId: string): Promise<AnalysisResult>;
  analyzeConcurrencyDeadlocks(projectId: string, timeRange: TimeRange): Promise<AnalysisResult>;
  analyzeSkillInvocation(skillId: string, timeRange: TimeRange): Promise<AnalysisResult>;
  analyzeWorkflowExecution(workflowId: string, timeRange: TimeRange): Promise<AnalysisResult>;
  analyzeWorkflowResultDeviation(workItemId: string): Promise<AnalysisResult>;
}