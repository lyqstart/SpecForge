/**
 * AgentIdentity data structure
 * 
 * Represents an agent session's identity in the Session Registry.
 * Used for tracking sessions throughout their lifecycle (pending → active → history).
 */

import { v7 as uuidv7 } from 'uuid';

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
export function createPendingIdentity(
  agentRole: string,
  workflowRole: string,
  workItemId: string,
  spawnIntentId: string,
  parentSessionId: string | null = null,
  projectId: string | null = null
): AgentIdentity {
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
export function activateIdentity(identity: AgentIdentity): AgentIdentity {
  return {
    ...identity,
    status: 'active' as const,
    lastActiveAt: Date.now(),
  };
}

/**
 * Terminate an active session and move to history
 */
export function terminateIdentity(identity: AgentIdentity): AgentIdentity {
  return {
    ...identity,
    status: 'history' as const,
    lastActiveAt: Date.now(),
  };
}

/**
 * Update last active timestamp
 */
export function updateLastActive(identity: AgentIdentity): AgentIdentity {
  return {
    ...identity,
    lastActiveAt: Date.now(),
  };
}

/**
 * Check if two identities represent the same session
 * (by sessionId only, ignoring other fields)
 */
export function isSameSession(a: AgentIdentity, b: AgentIdentity): boolean {
  return a.sessionId === b.sessionId;
}
