/**
 * AgentIdentity data structure
 *
 * Represents an agent session's identity in the Session Registry.
 * Used for tracking sessions throughout their lifecycle (pending → active → history).
 */
/**
 * AgentIdentity interface
 *
 * Core identity structure for agent sessions.
 */
export interface AgentIdentity {
    /**
     * Unique session identifier (UUIDv7)
     * This is the sole identity key - never change it throughout session lifecycle
     */
    sessionId: string;
    /**
     * Agent role (e.g., "sf-orchestrator", "sf-requirements")
     */
    agentRole: string;
    /**
     * Workflow role (e.g., "requirements-phase-executor")
     */
    workflowRole: string;
    /**
     * Parent session ID for session tree support
     * null for root sessions
     */
    parentSessionId: string | null;
    /**
     * Work item ID this session is working on
     */
    workItemId: string;
    /**
     * Project ID this session is associated with
     * null if not yet bound to a project
     */
    projectId: string | null;
    /**
     * Spawn intent ID from client
     * Used for binding pending sessions to real sessions
     */
    spawnIntentId: string;
    /**
     * Creation timestamp (Unix milliseconds)
     */
    createdAt: number;
    /**
     * Last active timestamp (Unix milliseconds)
     */
    lastActiveAt: number;
    /**
     * Session status
     * - pending: Registered but not yet activated
     * - active: Currently active session
     * - history: Terminated session (moved here on termination)
     */
    status: 'pending' | 'active' | 'history';
}
/**
 * Create a new AgentIdentity in pending state
 */
export declare function createPendingIdentity(agentRole: string, workflowRole: string, workItemId: string, spawnIntentId: string, parentSessionId?: string | null, projectId?: string | null): AgentIdentity;
/**
 * Activate a pending session
 */
export declare function activateIdentity(identity: AgentIdentity): AgentIdentity;
/**
 * Terminate an active session and move to history
 */
export declare function terminateIdentity(identity: AgentIdentity): AgentIdentity;
/**
 * Update last active timestamp
 */
export declare function updateLastActive(identity: AgentIdentity): AgentIdentity;
/**
 * Check if two identities represent the same session
 * (by sessionId only, ignoring other fields)
 */
export declare function isSameSession(a: AgentIdentity, b: AgentIdentity): boolean;
//# sourceMappingURL=AgentIdentity.d.ts.map