/**
 * AgentIdentity data structure
 *
 * Represents an agent session's identity in the Session Registry.
 * Used for tracking sessions throughout their lifecycle (pending → active → history).
 */
import { v7 as uuidv7 } from 'uuid';
/**
 * Create a new AgentIdentity in pending state
 */
export function createPendingIdentity(agentRole, workflowRole, workItemId, spawnIntentId, parentSessionId = null, projectId = null) {
    const now = Date.now();
    return {
        sessionId: uuidv7(),
        agentRole,
        workflowRole,
        parentSessionId,
        workItemId,
        projectId,
        spawnIntentId,
        createdAt: now,
        lastActiveAt: now,
        status: 'pending',
    };
}
/**
 * Activate a pending session
 */
export function activateIdentity(identity) {
    return {
        ...identity,
        status: 'active',
        lastActiveAt: Date.now(),
    };
}
/**
 * Terminate an active session and move to history
 */
export function terminateIdentity(identity) {
    return {
        ...identity,
        status: 'history',
        lastActiveAt: Date.now(),
    };
}
/**
 * Update last active timestamp
 */
export function updateLastActive(identity) {
    return {
        ...identity,
        lastActiveAt: Date.now(),
    };
}
/**
 * Check if two identities represent the same session
 * (by sessionId only, ignoring other fields)
 */
export function isSameSession(a, b) {
    return a.sessionId === b.sessionId;
}
//# sourceMappingURL=AgentIdentity.js.map