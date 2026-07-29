/**
 * Session Registry implementation
 *
 * Manages session lifecycle (pending → active → history) and
 * maintains AgentIdentity mappings.
 *
 * Key Design Decisions:
 * - sessionId is the sole identity key (REQ-6.5, Property 5)
 * - Supports session tree via parentSessionId (REQ-6.4)
 * - Three record types: pending, active, history (REQ-6.2)
 */
import { Event } from '../types';
import { EventBus } from '../event-bus/EventBus';
import { WAL } from '../wal/WAL';
import { AgentIdentity } from './AgentIdentity';
/**
 * Summary returned by startupReplay after replaying WAL events.
 */
export interface ReplaySummary {
    replayedCount: number;
    restoredBindings: number;
    restoredAliases: number;
}
/**
 * Error thrown when a WAL write operation fails.
 * Wraps the underlying cause for diagnostic purposes.
 */
export declare class WALWriteError extends Error {
    readonly cause: Error;
    constructor(message: string, cause: Error);
}
/**
 * SessionSnapshot for daemon restart reconnect support.
 * Contains the full serializable state of the registry at a point in time.
 */
export interface SessionSnapshot {
    pendingSessions: Array<[string, AgentIdentity]>;
    activeSessions: Array<[string, AgentIdentity]>;
    historySessions: Array<[string, AgentIdentity]>;
    projectBindings: Array<[string, string]>;
    timestamp: number;
}
/**
 * Session Registry
 *
 * Central registry for managing agent sessions throughout their lifecycle.
 * Provides:
 * - Session registration (pending state)
 * - Session activation (pending → active)
 * - Session termination (active → history)
 * - Session lookup by sessionId
 * - Session tree support via parentSessionId
 *
 * Property 5 Compliance: Uses sessionId as sole identity key,
 * never relying on OpenCode-provided agent field.
 */
export declare class SessionRegistry {
    private eventBus;
    private pendingSessions;
    private activeSessions;
    private historySessions;
    private projectBindings;
    /**
     * Alias table: OpenCode native sessionID → daemon sessionId.
     * Built lazily when handleOpenCodeEvent resolves via daemon sessionId
     * and data carries an OpenCode sessionID.
     * In-memory only (Phase 0); daemon restart loses this mapping.
     */
    private sessionAliases;
    private subscription;
    private sessionTimeoutMs;
    private cleanupTimerId;
    private wal?;
    private touchThrottleMap;
    private readonly TOUCH_THROTTLE_INTERVAL_MS;
    constructor(eventBus: EventBus, sessionTimeoutMs?: number, wal?: WAL, touchThrottleMs?: number);
    /**
     * Start the registry
     * Subscribes to session events from EventBus
     */
    start(): void;
    /**
     * Stop the registry
     * Unsubscribes from EventBus and stops the cleanup timer
     */
    stop(): void;
    /**
     * Start the periodic cleanup timer for expired sessions
     *
     * Runs cleanupExpiredSessions() every 60 seconds.
     * Automatically called on first registerPending if not already started.
     */
    startCleanup(): void;
    /**
     * Stop the periodic cleanup timer
     */
    stopCleanup(): void;
    /**
     * Run cleanup now: move expired pending/active sessions to history
     *
     * A session is considered expired if it has been inactive for longer
     * than sessionTimeoutMs (configurable in constructor, default 30 min).
     * Only pending and active sessions are affected; history sessions are kept.
     */
    cleanupExpiredSessions(): number;
    /**
     * Register a plugin session for a project
     *
     * Creates a new pending AgentIdentity bound to the given project.
     * Idempotent: if the projectPath already has a session, returns the existing one.
     *
     * @param projectId Project identifier
     * @param projectPath Project filesystem path
     * @returns The created or existing AgentIdentity
     */
    registerPluginSession(projectId: string, projectPath: string): Promise<AgentIdentity>;
    /**
     * Get the count of active sessions
     *
     * @returns Number of active sessions (not including pending)
     */
    getActiveSessionCount(): number;
    /**
     * Register a new pending session
     *
     * Creates a new AgentIdentity with pending status and stores it
     * in the pending sessions map.
     *
     * @param agentRole Agent role (e.g., "sf-orchestrator")
     * @param workflowRole Workflow role (e.g., "requirements-phase-executor")
     * @param workItemId Work item ID this session is working on
     * @param spawnIntentId Spawn intent ID from client
     * @param parentSessionId Optional parent session ID for tree structure
     * @returns The created AgentIdentity
     */
    registerPending(agentRole: string, workflowRole: string, workItemId: string, spawnIntentId: string, parentSessionId?: string | null): Promise<AgentIdentity>;
    /**
     * Activate a pending session
     *
     * Moves a session from pending to active state.
     * Validates that the spawnIntentId matches the registered session.
     *
     * @param sessionId Session ID to activate
     * @param spawnIntentId Spawn intent ID for validation
     * @returns The activated AgentIdentity, or null if validation fails
     */
    activate(sessionId: string, spawnIntentId: string): Promise<AgentIdentity | null>;
    /**
     * Terminate an active session
     *
     * Moves a session from active to history state.
     *
     * @param sessionId Session ID to terminate
     * @returns The terminated AgentIdentity, or null if not found
     */
    terminate(sessionId: string): Promise<AgentIdentity | null>;
    /**
     * Lookup session by sessionId
     *
     * Searches across all states (pending, active, history).
     *
     * Property 5 Compliance: Uses sessionId as the sole identity key,
     * ensuring identity stability throughout session lifecycle.
     *
     * @param sessionId Session ID to lookup
     * @returns The AgentIdentity if found, null otherwise
     */
    lookupBySessionId(sessionId: string): AgentIdentity | null;
    /**
     * Get session tree for a work item
     *
     * Returns all sessions associated with a work item, ordered
     * from root to leaf based on parentSessionId relationships.
     *
     * @param workItemId Work item ID
     * @returns Array of AgentIdentity objects in tree order
     */
    getSessionTree(workItemId: string): AgentIdentity[];
    /**
     * Get all active sessions
     *
     * @returns Array of all active AgentIdentity objects
     */
    getActiveSessions(): AgentIdentity[];
    /**
     * Get all pending sessions
     *
     * @returns Array of all pending AgentIdentity objects
     */
    getPendingSessions(): AgentIdentity[];
    /**
     * Get all history sessions
     *
     * @returns Array of all history AgentIdentity objects
     */
    getHistorySessions(): AgentIdentity[];
    /**
     * Update session last active timestamp with WAL write throttle
     *
     * In-memory lastActiveAt is updated EVERY call (no throttle).
     * WAL write is throttled: only writes if enough time has passed since
     * the last WAL write for this session, or if this is the first touch.
     *
     * @param sessionId Session ID
     * @returns Updated AgentIdentity, or null if not found
     */
    touch(sessionId: string): Promise<AgentIdentity | null>;
    /**
     * Check if a session exists
     *
     * @param sessionId Session ID
     * @returns true if session exists in any state
     */
    hasSession(sessionId: string): boolean;
    /**
     * Get session count by state
     *
     * @returns Object with counts for each state
     */
    getCounts(): {
        pending: number;
        active: number;
        history: number;
    };
    /**
     * List all sessions across all states (pending, active, history)
     *
     * @returns Array of all AgentIdentity objects
     */
    listSessions(): AgentIdentity[];
    /**
     * Get a session by sessionId across all states
     *
     * Convenience alias for lookupBySessionId.
     *
     * @param sessionId Session ID to look up
     * @returns The AgentIdentity if found, null otherwise
     */
    getSession(sessionId: string): AgentIdentity | null;
    /**
     * Bind a project to a session
     *
     * Associates a project path with a session and updates the session's
     * projectId metadata. The projectId is derived from the last segment
     * of the project path.
     *
     * @param sessionId Session ID to bind
     * @param projectPath Project filesystem path
     * @returns true if the session was found and bound, false otherwise
     */
    bindProject(sessionId: string, projectPath: string): Promise<boolean>;
    /**
     * Get the project path bound to a session
     *
     * @param sessionId Session ID
     * @returns The project path if bound, null otherwise
     */
    getProjectPath(sessionId: string): string | null;
    /**
     * Handle OpenCode event from the ingest pipeline
     *
     * Routes OpenCode native events to SessionRegistry operations based on subType:
     * - session.created → register a new session if not already registered
     * - session.idle → touch the session to update active timestamp
     * - session.error → terminate the session
     * - other → log WARNING (no error thrown)
     *
     * All operations are safe and idempotent.
     *
     * @param subType OpenCode event subtype (e.g., "session.created")
     * @param data Event payload containing sessionID and optional projectPath
     */
    handleOpenCodeEvent(subType: string, data: Record<string, unknown>): Promise<void>;
    /**
     * Get a snapshot of all sessions for daemon restart reconnect support
     *
     * Returns the full serializable state of the registry.
     * Can be restored via restoreFromSnapshot().
     *
     * @returns SessionSnapshot object
     */
    getSnapshot(): SessionSnapshot;
    /**
     * Restore session state from a snapshot
     *
     * Used for daemon restart reconnect support.
     * Replaces all current state with the snapshot data.
     *
     * @param snapshot SessionSnapshot to restore from
     */
    restoreFromSnapshot(snapshot: SessionSnapshot): void;
    /**
     * Replay WAL events to restore in-memory state after daemon restart.
     *
     * Only performs in-memory mutations — never calls this.wal.appendEvent().
     * Idempotent: calling twice with the same events produces identical Map states.
     *
     * @param events Array of WAL events to replay (already filtered by caller)
     * @returns ReplaySummary with counts of replayed events, restored bindings and aliases
     */
    startupReplay(events: Event[]): Promise<ReplaySummary>;
    /**
     * Handle session events from EventBus
     *
     * @param event Event to handle
     */
    private handleSessionEvent;
}
//# sourceMappingURL=SessionRegistry.d.ts.map