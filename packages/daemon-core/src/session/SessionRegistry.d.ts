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
import { EventBus } from '../event-bus/EventBus';
import { AgentIdentity } from './AgentIdentity';
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
    private subscription;
    private sessionTimeoutMs;
    private cleanupTimerId;
    constructor(eventBus: EventBus, sessionTimeoutMs?: number);
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
    registerPending(agentRole: string, workflowRole: string, workItemId: string, spawnIntentId: string, parentSessionId?: string | null): AgentIdentity;
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
    activate(sessionId: string, spawnIntentId: string): AgentIdentity | null;
    /**
     * Terminate an active session
     *
     * Moves a session from active to history state.
     *
     * @param sessionId Session ID to terminate
     * @returns The terminated AgentIdentity, or null if not found
     */
    terminate(sessionId: string): AgentIdentity | null;
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
     * Update session last active timestamp
     *
     * @param sessionId Session ID
     * @returns Updated AgentIdentity, or null if not found
     */
    touch(sessionId: string): AgentIdentity | null;
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
    bindProject(sessionId: string, projectPath: string): boolean;
    /**
     * Get the project path bound to a session
     *
     * @param sessionId Session ID
     * @returns The project path if bound, null otherwise
     */
    getProjectPath(sessionId: string): string | null;
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
     * Handle session events from EventBus
     *
     * @param event Event to handle
     */
    private handleSessionEvent;
}
//# sourceMappingURL=SessionRegistry.d.ts.map