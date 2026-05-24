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

import { Event, Subscription } from '../types';
import { EventBus } from '../event-bus/EventBus';
import {
  AgentIdentity,
  createPendingIdentity,
  activateIdentity,
  terminateIdentity,
  updateLastActive,
} from './AgentIdentity';

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
export class SessionRegistry {
  private eventBus: EventBus;
  private pendingSessions: Map<string, AgentIdentity> = new Map();
  private activeSessions: Map<string, AgentIdentity> = new Map();
  private historySessions: Map<string, AgentIdentity> = new Map();
  private projectBindings: Map<string, string> = new Map();
  private subscription: Subscription | null = null;
  private sessionTimeoutMs: number;
  private cleanupTimerId: ReturnType<typeof setInterval> | null = null;

  constructor(eventBus: EventBus, sessionTimeoutMs: number = 30 * 60 * 1000) {
    this.eventBus = eventBus;
    this.sessionTimeoutMs = sessionTimeoutMs;
  }

  /**
   * Start the registry
   * Subscribes to session events from EventBus
   */
  start(): void {
    this.subscription = this.eventBus.subscribe('session.*', (event) => {
      this.handleSessionEvent(event);
    });
  }

  /**
   * Stop the registry
   * Unsubscribes from EventBus and stops the cleanup timer
   */
  stop(): void {
    if (this.subscription) {
      this.eventBus.unsubscribe(this.subscription);
      this.subscription = null;
    }
    this.stopCleanup();
  }

  /**
   * Start the periodic cleanup timer for expired sessions
   * 
   * Runs cleanupExpiredSessions() every 60 seconds.
   * Automatically called on first registerPending if not already started.
   */
  startCleanup(): void {
    if (this.cleanupTimerId !== null) {
      return; // Already started
    }
    this.cleanupTimerId = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60_000);
  }

  /**
   * Stop the periodic cleanup timer
   */
  stopCleanup(): void {
    if (this.cleanupTimerId !== null) {
      clearInterval(this.cleanupTimerId);
      this.cleanupTimerId = null;
    }
  }

  /**
   * Run cleanup now: move expired pending/active sessions to history
   * 
   * A session is considered expired if it has been inactive for longer
   * than sessionTimeoutMs (configurable in constructor, default 30 min).
   * Only pending and active sessions are affected; history sessions are kept.
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let cleanedCount = 0;

    // Clean expired pending sessions
    for (const [sessionId, identity] of this.pendingSessions) {
      if (now - identity.lastActiveAt > this.sessionTimeoutMs) {
        this.pendingSessions.delete(sessionId);
        this.historySessions.set(sessionId, {
          ...identity,
          status: 'history' as const,
          lastActiveAt: now,
        });
        cleanedCount++;
      }
    }

    // Clean expired active sessions
    for (const [sessionId, identity] of this.activeSessions) {
      if (now - identity.lastActiveAt > this.sessionTimeoutMs) {
        this.activeSessions.delete(sessionId);
        this.historySessions.set(sessionId, {
          ...identity,
          status: 'history' as const,
          lastActiveAt: now,
        });
        cleanedCount++;
      }
    }

    return cleanedCount;
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
  registerPending(
    agentRole: string,
    workflowRole: string,
    workItemId: string,
    spawnIntentId: string,
    parentSessionId: string | null = null
  ): AgentIdentity {
    const identity = createPendingIdentity(
      agentRole,
      workflowRole,
      workItemId,
      spawnIntentId,
      parentSessionId
    );

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
  activate(sessionId: string, spawnIntentId: string): AgentIdentity | null {
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
  terminate(sessionId: string): AgentIdentity | null {
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
  lookupBySessionId(sessionId: string): AgentIdentity | null {
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
  getSessionTree(workItemId: string): AgentIdentity[] {
    // First, find all sessions with matching workItemId
    const matchingSessions = Array.from(this.activeSessions.values())
      .filter(s => s.workItemId === workItemId);
    
    if (matchingSessions.length === 0) {
      return [];
    }
    
    // Find root sessions (no parent or parent not in active sessions)
    const roots: AgentIdentity[] = [];
    const visited = new Set<string>();
    
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
    const tree: AgentIdentity[] = [];
    
    for (const root of roots) {
      let current: AgentIdentity | null = root;
      while (current && !visited.has(current.sessionId)) {
        visited.add(current.sessionId);
        tree.push(current);
        // Find child with this session as parent
        current = Array.from(this.activeSessions.values()).find(
          s => s.parentSessionId === current!.sessionId && s.workItemId === workItemId
        ) ?? null;
      }
    }

    return tree;
  }

  /**
   * Get all active sessions
   * 
   * @returns Array of all active AgentIdentity objects
   */
  getActiveSessions(): AgentIdentity[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get all pending sessions
   * 
   * @returns Array of all pending AgentIdentity objects
   */
  getPendingSessions(): AgentIdentity[] {
    return Array.from(this.pendingSessions.values());
  }

  /**
   * Get all history sessions
   * 
   * @returns Array of all history AgentIdentity objects
   */
  getHistorySessions(): AgentIdentity[] {
    return Array.from(this.historySessions.values());
  }

  /**
   * Update session last active timestamp
   * 
   * @param sessionId Session ID
   * @returns Updated AgentIdentity, or null if not found
   */
  touch(sessionId: string): AgentIdentity | null {
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
  hasSession(sessionId: string): boolean {
    return (
      this.activeSessions.has(sessionId) ||
      this.pendingSessions.has(sessionId) ||
      this.historySessions.has(sessionId)
    );
  }

  /**
   * Get session count by state
   * 
   * @returns Object with counts for each state
   */
  getCounts(): { pending: number; active: number; history: number } {
    return {
      pending: this.pendingSessions.size,
      active: this.activeSessions.size,
      history: this.historySessions.size,
    };
  }

  /**
   * List all sessions across all states (pending, active, history)
   * 
   * @returns Array of all AgentIdentity objects
   */
  listSessions(): AgentIdentity[] {
    return [
      ...Array.from(this.pendingSessions.values()),
      ...Array.from(this.activeSessions.values()),
      ...Array.from(this.historySessions.values()),
    ];
  }

  /**
   * Get a session by sessionId across all states
   * 
   * Convenience alias for lookupBySessionId.
   * 
   * @param sessionId Session ID to look up
   * @returns The AgentIdentity if found, null otherwise
   */
  getSession(sessionId: string): AgentIdentity | null {
    return this.lookupBySessionId(sessionId);
  }

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
  bindProject(sessionId: string, projectPath: string): boolean {
    // Compute projectId from the last segment of the project path
    const normalizedPath = projectPath.replace(/\\/g, '/');
    const segments = normalizedPath.split('/');
    const lastSegment = segments[segments.length - 1];
    const projectId = lastSegment ?? projectPath;

    // Update the session in whichever state it's in
    const pending = this.pendingSessions.get(sessionId);
    if (pending) {
      this.pendingSessions.set(sessionId, { ...pending, projectId });
      this.projectBindings.set(sessionId, projectPath);
      return true;
    }

    const active = this.activeSessions.get(sessionId);
    if (active) {
      this.activeSessions.set(sessionId, { ...active, projectId });
      this.projectBindings.set(sessionId, projectPath);
      return true;
    }

    const history = this.historySessions.get(sessionId);
    if (history) {
      this.historySessions.set(sessionId, { ...history, projectId });
      this.projectBindings.set(sessionId, projectPath);
      return true;
    }

    return false;
  }

  /**
   * Get the project path bound to a session
   * 
   * @param sessionId Session ID
   * @returns The project path if bound, null otherwise
   */
  getProjectPath(sessionId: string): string | null {
    return this.projectBindings.get(sessionId) ?? null;
  }

  /**
   * Get a snapshot of all sessions for daemon restart reconnect support
   * 
   * Returns the full serializable state of the registry.
   * Can be restored via restoreFromSnapshot().
   * 
   * @returns SessionSnapshot object
   */
  getSnapshot(): SessionSnapshot {
    return {
      pendingSessions: Array.from(this.pendingSessions.entries()),
      activeSessions: Array.from(this.activeSessions.entries()),
      historySessions: Array.from(this.historySessions.entries()),
      projectBindings: Array.from(this.projectBindings.entries()),
      timestamp: Date.now(),
    };
  }

  /**
   * Restore session state from a snapshot
   * 
   * Used for daemon restart reconnect support.
   * Replaces all current state with the snapshot data.
   * 
   * @param snapshot SessionSnapshot to restore from
   */
  restoreFromSnapshot(snapshot: SessionSnapshot): void {
    this.pendingSessions = new Map(snapshot.pendingSessions);
    this.activeSessions = new Map(snapshot.activeSessions);
    this.historySessions = new Map(snapshot.historySessions);
    this.projectBindings = new Map(snapshot.projectBindings);
  }

  /**
   * Handle session events from EventBus
   * 
   * @param event Event to handle
   */
  private handleSessionEvent(event: Event): void {
    const payload = event.payload as {
      sessionId?: string;
      spawnIntentId?: string;
      agentRole?: string;
      workflowRole?: string;
      workItemId?: string;
      parentSessionId?: string | null;
    };

    switch (event.action) {
      case 'session.created':
        if (
          payload.sessionId &&
          payload.spawnIntentId &&
          payload.agentRole &&
          payload.workflowRole &&
          payload.workItemId
        ) {
          this.registerPending(
            payload.agentRole,
            payload.workflowRole,
            payload.workItemId,
            payload.spawnIntentId,
            payload.parentSessionId ?? null
          );
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
