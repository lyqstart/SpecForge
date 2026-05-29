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
import { WAL } from '../wal/WAL';
import {
  AgentIdentity,
  createPendingIdentity,
  activateIdentity,
  terminateIdentity,
  updateLastActive,
} from './AgentIdentity';

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
export class WALWriteError extends Error {
  override readonly cause: Error;
  
  constructor(message: string, cause: Error) {
    super(message);
    this.name = 'WALWriteError';
    this.cause = cause;
    // Fix: Set prototype explicitly for proper Error subclassing in ES5
    Object.setPrototypeOf(this, WALWriteError.prototype);
  }
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
export class SessionRegistry {
  private eventBus: EventBus;
  private pendingSessions: Map<string, AgentIdentity> = new Map();
  private activeSessions: Map<string, AgentIdentity> = new Map();
  private historySessions: Map<string, AgentIdentity> = new Map();
  private projectBindings: Map<string, string> = new Map();
  /**
   * Alias table: OpenCode native sessionID → daemon sessionId.
   * Built lazily when handleOpenCodeEvent resolves via daemon sessionId
   * and data carries an OpenCode sessionID.
   * In-memory only (Phase 0); daemon restart loses this mapping.
   */
  private sessionAliases: Map<string, string> = new Map();
  private subscription: Subscription | null = null;
  private sessionTimeoutMs: number;
  private cleanupTimerId: ReturnType<typeof setInterval> | null = null;
  private wal?: WAL;
  private touchThrottleMap: Map<string, number> = new Map();
  private readonly TOUCH_THROTTLE_INTERVAL_MS: number;

  constructor(eventBus: EventBus, sessionTimeoutMs: number = 30 * 60 * 1000, wal?: WAL, touchThrottleMs?: number) {
    this.eventBus = eventBus;
    this.sessionTimeoutMs = sessionTimeoutMs;
    this.wal = wal;
    this.TOUCH_THROTTLE_INTERVAL_MS = touchThrottleMs ?? 60_000;
    if (!wal) {
      console.warn('[SessionRegistry] WAL not injected — running in memory-only mode');
    }
  }

  /**
   * Start the registry
   * Subscribes to session events from EventBus
   */
  start(): void {
    this.subscription = this.eventBus.subscribe('session.*', (event) => {
      void this.handleSessionEvent(event);
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
   * Register a plugin session for a project
   *
   * Creates a new pending AgentIdentity bound to the given project.
   * Idempotent: if the projectPath already has a session, returns the existing one.
   *
   * @param projectId Project identifier
   * @param projectPath Project filesystem path
   * @returns The created or existing AgentIdentity
   */
  async registerPluginSession(projectId: string, projectPath: string): Promise<AgentIdentity> {
    // Idempotency: check if this projectPath already has a session
    for (const [sid, pp] of this.projectBindings) {
      if (pp === projectPath) {
        const existing = this.lookupBySessionId(sid);
        if (existing) return existing;
      }
    }

    const identity = createPendingIdentity(
      'plugin',
      'plugin-daemon-bridge',
      '',
      '',
      null,
      projectId,
    );

    // WAL-first: write to WAL before in-memory mutation
    if (this.wal) {
      try {
        const event = this.wal.createEvent(projectId, 'session', 'session.registered', {
          sessionId: identity.sessionId,
          agentRole: identity.agentRole,
          workflowRole: identity.workflowRole,
          workItemId: identity.workItemId,
          spawnIntentId: identity.spawnIntentId,
          parentSessionId: identity.parentSessionId,
          projectPath,
        });
        await this.wal.appendEvent(event);
      } catch (cause) {
        throw new WALWriteError('Failed to write session.registered event', cause as Error);
      }
    }

    this.pendingSessions.set(identity.sessionId, identity);
    this.projectBindings.set(identity.sessionId, projectPath);
    return identity;
  }

  /**
   * Get the count of active sessions
   *
   * @returns Number of active sessions (not including pending)
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
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
  async registerPending(
    agentRole: string,
    workflowRole: string,
    workItemId: string,
    spawnIntentId: string,
    parentSessionId: string | null = null
  ): Promise<AgentIdentity> {
    const identity = createPendingIdentity(
      agentRole,
      workflowRole,
      workItemId,
      spawnIntentId,
      parentSessionId
    );

    // WAL-first: write to WAL before in-memory mutation
    if (this.wal) {
      try {
        const event = this.wal.createEvent(workItemId, 'session', 'session.registered', {
          sessionId: identity.sessionId,
          agentRole,
          workflowRole,
          workItemId,
          spawnIntentId,
          parentSessionId,
        });
        await this.wal.appendEvent(event);
      } catch (cause) {
        throw new WALWriteError('Failed to write session.registered event', cause as Error);
      }
    }

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
  async activate(sessionId: string, spawnIntentId: string): Promise<AgentIdentity | null> {
    const pending = this.pendingSessions.get(sessionId);

    if (!pending || pending.spawnIntentId !== spawnIntentId) {
      return null;
    }

    // WAL-first: write to WAL before in-memory mutation
    if (this.wal) {
      try {
        const event = this.wal.createEvent('session', 'session', 'session.activated', { sessionId, spawnIntentId });
        await this.wal.appendEvent(event);
      } catch (err) {
        throw new WALWriteError(
          `WAL write failed for session.activated: ${sessionId}`,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
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
  async terminate(sessionId: string): Promise<AgentIdentity | null> {
    const active = this.activeSessions.get(sessionId);

    if (!active) {
      return null;
    }

    // WAL-first: write to WAL before in-memory mutation
    if (this.wal) {
      try {
        const event = this.wal.createEvent('session', 'session', 'session.terminated', { sessionId });
        await this.wal.appendEvent(event);
      } catch (err) {
        throw new WALWriteError(
          `WAL write failed for session.terminated: ${sessionId}`,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
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
   * Update session last active timestamp with WAL write throttle
   * 
   * In-memory lastActiveAt is updated EVERY call (no throttle).
   * WAL write is throttled: only writes if enough time has passed since
   * the last WAL write for this session, or if this is the first touch.
   * 
   * @param sessionId Session ID
   * @returns Updated AgentIdentity, or null if not found
   */
  async touch(sessionId: string): Promise<AgentIdentity | null> {
    const active = this.activeSessions.get(sessionId);
    if (!active) {
      return null;
    }

    const now = Date.now();
    const updated = { ...active, lastActiveAt: now };
    this.activeSessions.set(sessionId, updated);

    if (this.wal) {
      const lastWalTouch = this.touchThrottleMap.get(sessionId);
      if (lastWalTouch === undefined || now - lastWalTouch >= this.TOUCH_THROTTLE_INTERVAL_MS) {
        try {
          const event = this.wal.createEvent(
            'session',
            'session',
            'session.touched',
            { sessionId, lastActiveAt: now },
          );
          await this.wal.appendEvent(event);
          this.touchThrottleMap.set(sessionId, now);
        } catch (err) {
          throw new WALWriteError(
            `WAL write failed for session.touched: ${sessionId}`,
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }
    }

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
  async bindProject(sessionId: string, projectPath: string): Promise<boolean> {
    // Compute projectId from the last segment of the project path
    const normalizedPath = projectPath.replace(/\\/g, '/');
    const segments = normalizedPath.split('/');
    const lastSegment = segments[segments.length - 1];
    const projectId = lastSegment ?? projectPath;

    // (1) Validation: find the session in whichever state it's in
    const pending = this.pendingSessions.get(sessionId);
    const active = this.activeSessions.get(sessionId);
    const history = this.historySessions.get(sessionId);

    if (!pending && !active && !history) {
      return false;
    }

    // (2) WAL-first: persist event before in-memory mutation
    if (this.wal) {
      try {
        const event = this.wal.createEvent(sessionId, 'session', 'session.bound', { sessionId, projectPath });
        await this.wal.appendEvent(event);
      } catch (err) {
        throw new WALWriteError(
          `Failed to write session.bound WAL event for session ${sessionId}`,
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }

    // (3) In-memory apply
    if (pending) {
      this.pendingSessions.set(sessionId, { ...pending, projectId });
      this.projectBindings.set(sessionId, projectPath);
      return true;
    }

    if (active) {
      this.activeSessions.set(sessionId, { ...active, projectId });
      this.projectBindings.set(sessionId, projectPath);
      return true;
    }

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
  async handleOpenCodeEvent(subType: string, data: Record<string, unknown>): Promise<void> {
    const projectPath = data.projectPath as string | undefined;

    // Resolve the daemon's internal sessionId
    let internalSessionId: string | null = null;

    // 1. Check if daemon sessionId is directly provided (from plugin)
    const daemonSessionId = data.sessionId as string | undefined;
    if (daemonSessionId && this.projectBindings.has(daemonSessionId)) {
      internalSessionId = daemonSessionId;
    }

    // 2. If not found, try OpenCode sessionID via alias table
    const opencodeSessionId = data.sessionID as string | undefined;
    if (!internalSessionId && opencodeSessionId) {
      const aliased = this.sessionAliases.get(opencodeSessionId);
      if (aliased && this.projectBindings.has(aliased)) {
        internalSessionId = aliased;
      } else if (this.projectBindings.has(opencodeSessionId)) {
        // Fallback: direct projectBindings check (backward compat)
        internalSessionId = opencodeSessionId;
      }
    }

    // 3. If still not found, try to find by projectPath
    if (!internalSessionId && projectPath) {
      for (const [sid, pp] of this.projectBindings) {
        if (pp === projectPath) {
          internalSessionId = sid;
          break;
        }
      }
    }

    // 4. Handle cases where no mapping exists
    if (!internalSessionId) {
      if (subType === 'session.created' && projectPath) {
        // B2: No longer auto-create sessions. Project must be registered via ingest/register first.
        // If we get here, ingest/register was not called or failed (possibly PROJECT_NOT_INITIALIZED)
        console.warn(`[SessionRegistry] No session binding for project: ${projectPath}. Project may not be initialized. Skipping auto-registration.`);
        return;
      } else {
        console.warn(`[SessionRegistry] No session binding found for OpenCode event subtype: ${subType}, projectPath: ${projectPath}`);
        return;
      }
    }

    // Lazy-alias: establish OpenCode sessionID → daemon sessionId mapping
    if (internalSessionId && opencodeSessionId && !this.sessionAliases.has(opencodeSessionId)) {
      // alias_bound WAL event: only on FIRST alias establishment
      if (this.wal) {
        try {
          const aliasEvent = this.wal.createEvent(internalSessionId, 'session', 'session.alias_bound', { sessionId: internalSessionId, opencodeSessionId });
          await this.wal.appendEvent(aliasEvent);
        } catch (err) {
          throw new WALWriteError(
            `Failed to write session.alias_bound WAL event for session ${internalSessionId}`,
            err instanceof Error ? err : new Error(String(err))
          );
        }
      }
      this.sessionAliases.set(opencodeSessionId, internalSessionId);
    }

    switch (subType) {
      case 'session.created':
        // Session already created via registerPluginSession above
        break;
      case 'session.idle':
        await this.touch(internalSessionId);
        break;
      case 'session.error':
        await this.terminate(internalSessionId);
        break;
      default:
        // Unrecognized subtype: log WARNING, do not interrupt
        console.warn(`[SessionRegistry] Unhandled opencode event subtype: ${subType}`);
    }
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
   * Replay WAL events to restore in-memory state after daemon restart.
   *
   * Only performs in-memory mutations — never calls this.wal.appendEvent().
   * Idempotent: calling twice with the same events produces identical Map states.
   *
   * @param events Array of WAL events to replay (already filtered by caller)
   * @returns ReplaySummary with counts of replayed events, restored bindings and aliases
   */
  async startupReplay(events: Event[]): Promise<ReplaySummary> {
    // 1. Sort events by monotonicSeq (fallback to timestamp)
    const sorted = [...events].sort((a, b) =>
      (a.monotonicSeq ?? 0) - (b.monotonicSeq ?? 0) ||
      a.ts - b.ts
    );

    let replayedCount = 0;
    let restoredBindings = 0;
    let restoredAliases = 0;

    for (const event of sorted) {
      const action = event.action;
      const payload = event.payload;

      switch (action) {
        case 'session.registered': {
          const sessionId = payload.sessionId as string;
          if (!sessionId) break;
          // Idempotent: only set if session doesn't exist in any map
          if (
            !this.pendingSessions.has(sessionId) &&
            !this.activeSessions.has(sessionId) &&
            !this.historySessions.has(sessionId)
          ) {
            const identity: AgentIdentity = {
              sessionId,
              agentRole: (payload.agentRole as string) ?? '',
              workflowRole: (payload.workflowRole as string) ?? '',
              parentSessionId: (payload.parentSessionId as string | null) ?? null,
              workItemId: (payload.workItemId as string) ?? '',
              projectId: null,
              spawnIntentId: (payload.spawnIntentId as string) ?? '',
              createdAt: event.ts,
              lastActiveAt: event.ts,
              status: 'pending',
            };
            this.pendingSessions.set(sessionId, identity);
            if (payload.projectPath) {
              this.projectBindings.set(sessionId, payload.projectPath as string);
              restoredBindings++;
            }
          }
          replayedCount++;
          break;
        }

        case 'session.activated': {
          const sessionId = payload.sessionId as string;
          if (!sessionId) break;
          if (this.pendingSessions.has(sessionId)) {
            const identity = this.pendingSessions.get(sessionId)!;
            this.pendingSessions.delete(sessionId);
            this.activeSessions.set(sessionId, {
              ...identity,
              status: 'active',
              lastActiveAt: event.ts,
            });
            restoredBindings++;
          }
          replayedCount++;
          break;
        }

        case 'session.bound': {
          const sessionId = payload.sessionId as string;
          const projectPath = payload.projectPath as string;
          if (sessionId && projectPath) {
            this.projectBindings.set(sessionId, projectPath);
            restoredBindings++;
          }
          replayedCount++;
          break;
        }

        case 'session.terminated': {
          const sessionId = payload.sessionId as string;
          if (!sessionId) break;
          if (this.activeSessions.has(sessionId)) {
            const identity = this.activeSessions.get(sessionId)!;
            this.activeSessions.delete(sessionId);
            this.historySessions.set(sessionId, {
              ...identity,
              status: 'history',
              lastActiveAt: event.ts,
            });
          }
          replayedCount++;
          break;
        }

        case 'session.alias_bound': {
          const opencodeSessionId = payload.opencodeSessionId as string;
          const daemonSessionId = payload.sessionId as string;
          if (opencodeSessionId && daemonSessionId) {
            this.sessionAliases.set(opencodeSessionId, daemonSessionId);
            restoredAliases++;
          }
          replayedCount++;
          break;
        }

        case 'session.touched': {
          const sessionId = payload.sessionId as string;
          if (!sessionId) break;
          // Update lastActiveAt only (no WAL write — avoid circular writes)
          if (this.activeSessions.has(sessionId)) {
            const identity = this.activeSessions.get(sessionId)!;
            identity.lastActiveAt = (payload.lastActiveAt as number) ?? event.ts;
          }
          replayedCount++;
          break;
        }

        default:
          // Skip unknown actions
          break;
      }
    }

    return { replayedCount, restoredBindings, restoredAliases };
  }

  /**
   * Handle session events from EventBus
   * 
   * @param event Event to handle
   */
  private async handleSessionEvent(event: Event): Promise<void> {
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
          await this.registerPending(
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
          await this.activate(payload.sessionId, payload.spawnIntentId);
        }
        break;

      case 'session.terminated':
        if (payload.sessionId) {
          await this.terminate(payload.sessionId);
        }
        break;

      case 'session.touched':
        if (payload.sessionId) {
          await this.touch(payload.sessionId);
        }
        break;
    }
  }
}
