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
import { createPendingIdentity, activateIdentity, terminateIdentity, updateLastActive, } from './AgentIdentity';
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
export class SessionRegistry {
    eventBus;
    pendingSessions = new Map();
    activeSessions = new Map();
    historySessions = new Map();
    subscription = null;
    constructor(eventBus) {
        this.eventBus = eventBus;
    }
    /**
     * Start the registry
     * Subscribes to session events from EventBus
     */
    start() {
        this.subscription = this.eventBus.subscribe('session.*', (event) => {
            this.handleSessionEvent(event);
        });
    }
    /**
     * Stop the registry
     * Unsubscribes from EventBus
     */
    stop() {
        if (this.subscription) {
            this.eventBus.unsubscribe(this.subscription);
            this.subscription = null;
        }
    }
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
    registerPending(agentRole, workflowRole, workItemId, spawnIntentId, parentSessionId = null) {
        const identity = createPendingIdentity(agentRole, workflowRole, workItemId, spawnIntentId, parentSessionId);
        this.pendingSessions.set(identity.sessionId, identity);
        return identity;
    }
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
    activate(sessionId, spawnIntentId) {
        const pending = this.pendingSessions.get(sessionId);
        if (!pending || pending.spawnIntentId !== spawnIntentId) {
            return null;
        }
        const active = activateIdentity(pending);
        this.pendingSessions.delete(sessionId);
        this.activeSessions.set(sessionId, active);
        return active;
    }
    /**
     * Terminate an active session
     *
     * Moves a session from active to history state.
     *
     * @param sessionId Session ID to terminate
     * @returns The terminated AgentIdentity, or null if not found
     */
    terminate(sessionId) {
        const active = this.activeSessions.get(sessionId);
        if (!active) {
            return null;
        }
        const history = terminateIdentity(active);
        this.activeSessions.delete(sessionId);
        this.historySessions.set(sessionId, history);
        return history;
    }
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
    lookupBySessionId(sessionId) {
        if (this.activeSessions.has(sessionId)) {
            return this.activeSessions.get(sessionId) ?? null;
        }
        if (this.pendingSessions.has(sessionId)) {
            return this.pendingSessions.get(sessionId) ?? null;
        }
        if (this.historySessions.has(sessionId)) {
            return this.historySessions.get(sessionId) ?? null;
        }
        return null;
    }
    /**
     * Get session tree for a work item
     *
     * Returns all sessions associated with a work item, ordered
     * from root to leaf based on parentSessionId relationships.
     *
     * @param workItemId Work item ID
     * @returns Array of AgentIdentity objects in tree order
     */
    getSessionTree(workItemId) {
        // First, find all sessions with matching workItemId
        const matchingSessions = Array.from(this.activeSessions.values())
            .filter(s => s.workItemId === workItemId);
        if (matchingSessions.length === 0) {
            return [];
        }
        // Find root sessions (no parent or parent not in active sessions)
        const roots = [];
        const visited = new Set();
        for (const session of matchingSessions) {
            if (!session.parentSessionId || !this.activeSessions.has(session.parentSessionId)) {
                roots.push(session);
            }
        }
        // If no roots found, use the first session as root
        if (roots.length === 0 && matchingSessions.length > 0) {
            const firstSession = matchingSessions[0];
            if (firstSession) {
                roots.push(firstSession);
            }
        }
        // Build tree from roots
        const tree = [];
        for (const root of roots) {
            let current = root;
            while (current && !visited.has(current.sessionId)) {
                visited.add(current.sessionId);
                tree.push(current);
                // Find child with this session as parent
                current = Array.from(this.activeSessions.values()).find(s => s.parentSessionId === current.sessionId && s.workItemId === workItemId) ?? null;
            }
        }
        return tree;
    }
    /**
     * Get all active sessions
     *
     * @returns Array of all active AgentIdentity objects
     */
    getActiveSessions() {
        return Array.from(this.activeSessions.values());
    }
    /**
     * Get all pending sessions
     *
     * @returns Array of all pending AgentIdentity objects
     */
    getPendingSessions() {
        return Array.from(this.pendingSessions.values());
    }
    /**
     * Get all history sessions
     *
     * @returns Array of all history AgentIdentity objects
     */
    getHistorySessions() {
        return Array.from(this.historySessions.values());
    }
    /**
     * Update session last active timestamp
     *
     * @param sessionId Session ID
     * @returns Updated AgentIdentity, or null if not found
     */
    touch(sessionId) {
        const active = this.activeSessions.get(sessionId);
        if (!active) {
            return null;
        }
        const updated = updateLastActive(active);
        this.activeSessions.set(sessionId, updated);
        return updated;
    }
    /**
     * Check if a session exists
     *
     * @param sessionId Session ID
     * @returns true if session exists in any state
     */
    hasSession(sessionId) {
        return (this.activeSessions.has(sessionId) ||
            this.pendingSessions.has(sessionId) ||
            this.historySessions.has(sessionId));
    }
    /**
     * Get session count by state
     *
     * @returns Object with counts for each state
     */
    getCounts() {
        return {
            pending: this.pendingSessions.size,
            active: this.activeSessions.size,
            history: this.historySessions.size,
        };
    }
    /**
     * Handle session events from EventBus
     *
     * @param event Event to handle
     */
    handleSessionEvent(event) {
        const payload = event.payload;
        switch (event.action) {
            case 'session.created':
                if (payload.sessionId &&
                    payload.spawnIntentId &&
                    payload.agentRole &&
                    payload.workflowRole &&
                    payload.workItemId) {
                    this.registerPending(payload.agentRole, payload.workflowRole, payload.workItemId, payload.spawnIntentId, payload.parentSessionId ?? null);
                }
                break;
            case 'session.activated':
                if (payload.sessionId && payload.spawnIntentId) {
                    this.activate(payload.sessionId, payload.spawnIntentId);
                }
                break;
            case 'session.terminated':
                if (payload.sessionId) {
                    this.terminate(payload.sessionId);
                }
                break;
            case 'session.touched':
                if (payload.sessionId) {
                    this.touch(payload.sessionId);
                }
                break;
        }
    }
}
//# sourceMappingURL=SessionRegistry.js.map