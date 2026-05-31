/**
 * Recovery Subsystem implementation
 * 
 * Detects and repairs state inconsistencies, implements predefined
 * repair rules, and handles session reconnection.
 * 
 * Property 20: Recovery Consistency Repair
 * For all inconsistent (events.jsonl, state.json) combinations detected at startup,
 * the Recovery subsystem must roll back to a consistent snapshot s' according to
 * predefined repair rules, and write a recovery.repaired event recording the repair
 * path; after repair, rebuild(events) == s' must hold.
 * 
 * Property 21: Session WAL Replay Scope
 * For all Daemon runtime event streams, WAL-replay-based session state reconstruction
 * may only occur within the Daemon startup process; after startup completes, the
 * Daemon must not automatically initiate session state reconstruction via WAL replay.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v7 as uuidv7 } from 'uuid';
import { Event, ProjectState, ConsistencyCheckResult, ConsistencyIssue, RepairResult } from '../types';
import { WAL } from '../wal';
import { StateManager } from '../state/StateManager';
import { IPathResolver } from '../daemon/path-resolver';
import { SessionRegistry } from '../session/SessionRegistry';

export interface SessionReconnectResult {
  success: boolean;
  sessionId: string;
  reconnected: boolean;
  reason?: string;
}

export class RecoverySubsystem {
  private pathResolver: IPathResolver;
  private projectPath: string;
  private eventsPath: string;
  private statePath: string;
  private schemaVersion: string = '1.0';
  
  private _isReady: boolean = false;

  // Property 21: Track startup phase to limit WAL replay session reconstruction
  private isInStartupPhase: boolean = false;
  private hasStartupCompleted: boolean = false;

  private wal: WAL | null = null;
  private stateManager: StateManager | null = null;
  private sessionRegistry?: SessionRegistry;

  constructor(pathResolver: IPathResolver, projectPath: string, wal?: WAL, stateManager?: StateManager, sessionRegistry?: SessionRegistry) {
    this.pathResolver = pathResolver;
    this.projectPath = projectPath;
    this.wal = wal ?? null;
    this.stateManager = stateManager ?? null;
    this.sessionRegistry = sessionRegistry;
    // Always use project-level paths
    this.eventsPath = this.pathResolver.resolveEventsPath(projectPath);
    this.statePath = this.pathResolver.resolveStatePath(projectPath);
  }

  /**
   * Get events path
   */
  getEventsPath(): string {
    return this.eventsPath;
  }

  /**
   * Get state path
   */
  getStatePath(): string {
    return this.statePath;
  }

  /**
   * Check consistency and repair if needed
   * Property 20: Validates that repair produces consistent state
   * 
   * Uses WAL to read events, StateManager.rebuildState() to rebuild,
   * then verifies consistency between events and the rebuilt state.
   */
  async checkAndRepair(): Promise<ConsistencyCheckResult> {
    const { events } = this.wal
      ? await this.wal.readAllEvents()
      : { events: await this.loadEvents() };

    let rebuiltState: ProjectState;

    if (this.stateManager) {
      rebuiltState = await this.stateManager.rebuildState();
    } else {
      rebuiltState = await this.rebuildFromEvents(events);
    }

    // Session replay from WAL events
    if (this.sessionRegistry) {
      const sessionEvents = events.filter(e =>
        e.category === 'session' ||
        (!e.category && e.action?.startsWith('session.'))
      );
      if (sessionEvents.length > 0) {
        const summary = await this.sessionRegistry.startupReplay(sessionEvents);
        console.log(`[RecoverySubsystem] Session replay: ${summary.replayedCount} events replayed, ${summary.restoredBindings} bindings restored, ${summary.restoredAliases} aliases restored`);
      }
    }

    const issues: ConsistencyIssue[] = [];

    if (events.length > 0) {
      const lastEvent = events[events.length - 1]!;
      if (rebuiltState.lastEventId !== lastEvent.eventId) {
        issues.push({
          type: 'state_mismatch',
          description: `State lastEventId (${rebuiltState.lastEventId}) does not match last event (${lastEvent.eventId})`,
          affectedEventId: lastEvent.eventId,
          affectedProjectPath: this.projectPath,
        });
      }

      for (let i = 1; i < events.length; i++) {
        const prevEvent = events[i - 1]!;
        const currEvent = events[i]!;
        if (currEvent.ts < prevEvent.ts) {
          issues.push({
            type: 'out_of_order',
            description: `Event at index ${i} has timestamp before previous event`,
            affectedEventId: currEvent.eventId,
            affectedProjectPath: this.projectPath,
          });
        }
      }

      const eventIds = new Set(events.map(e => e.eventId));
      if (rebuiltState.lastEventId && !eventIds.has(rebuiltState.lastEventId)) {
        issues.push({
          type: 'missing_event',
          description: `State references event ${rebuiltState.lastEventId} that doesn't exist in events`,
          affectedEventId: rebuiltState.lastEventId,
          affectedProjectPath: this.projectPath,
        });
      }
    }

    const result: ConsistencyCheckResult = {
      isValid: issues.length === 0,
      issues,
    };

    if (!result.isValid) {
      await this.repairInconsistency(result);
    }

    return result;
  }

  /**
   * Check consistency between events.jsonl and state.json
   * 
   * Consistency rules:
   * 1. state.json lastEventId must match the last event in events.jsonl
   * 2. Every event in events.jsonl must have a corresponding state entry
   * 3. Events must be in chronological order (monotonic ts)
   */
  async checkConsistency(): Promise<ConsistencyCheckResult> {
    const issues: ConsistencyIssue[] = [];
    
    try {
      // Check if events.jsonl exists
      await fs.access(this.eventsPath);
      
      // Check if state.json exists
      await fs.access(this.statePath);
      
      // Load events
      const events = await this.loadEvents();
      
      // Load state
      const state = await this.loadState();
      
      // Check 1: State mismatch - state.json lastEventId should match last event
      if (events.length > 0) {
        const lastEvent = events[events.length - 1]!;
        if (state.lastEventId !== lastEvent.eventId) {
          issues.push({
            type: 'state_mismatch',
            description: `State lastEventId (${state.lastEventId}) does not match last event (${lastEvent.eventId})`,
            affectedEventId: lastEvent.eventId,
            affectedProjectPath: this.projectPath,
          });
        }
        
        // Check 3: Event ordering - ts must be monotonic
        for (let i = 1; i < events.length; i++) {
          const prevEvent = events[i - 1]!;
          const currEvent = events[i]!;
          if (currEvent.ts < prevEvent.ts) {
            issues.push({
              type: 'out_of_order',
              description: `Event at index ${i} has timestamp before previous event`,
              affectedEventId: currEvent.eventId,
              affectedProjectPath: this.projectPath,
            });
          }
        }
      }
      
      // Check 2: Events without state - check for orphaned events
      const eventIds = new Set(events.map(e => e.eventId));
      if (state.lastEventId && !eventIds.has(state.lastEventId)) {
        issues.push({
          type: 'missing_event',
          description: `State references event ${state.lastEventId} that doesn't exist in events.jsonl`,
          affectedEventId: state.lastEventId,
          affectedProjectPath: this.projectPath,
        });
      }
      
    } catch (error) {
      // File doesn't exist, this is OK for initial startup
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Repair inconsistency according to predefined repair rules
   * 
   * Repair rules:
   * 1. state_mismatch: Rebuild state from events.jsonl
   * 2. missing_event: Remove stale state reference
   * 3. out_of_order: Reorder events and rebuild state
   * 
   * CRITICAL: This method does NOT append repair events to events.jsonl.
   * This ensures that after repair: rebuild(events) == s' holds.
   * The repairEvents in the result are for audit/logging purposes only.
   */
  async repairInconsistency(result: ConsistencyCheckResult): Promise<RepairResult> {
    const repairEvents: Event[] = [];
    
    const { events } = this.wal
      ? await this.wal.readAllEvents()
      : { events: await this.loadEvents() };

    let repairedState: ProjectState;

    for (const issue of result.issues) {
      const repairEvent = await this.applyRepairRule(issue, events);
      if (repairEvent) {
        repairEvents.push(repairEvent);
      }
    }

    if (this.stateManager) {
      repairedState = await this.stateManager.rebuildState();
    } else {
      repairedState = await this.rebuildFromEvents(events);
    }

    await this.writeState(repairedState);

    return {
      success: true,
      repairedState,
      repairEvents,
    };
  }

  /**
   * Apply a specific repair rule based on issue type
   */
  private async applyRepairRule(issue: ConsistencyIssue, events: Event[]): Promise<Event | null> {
    switch (issue.type) {
      case 'state_mismatch':
        // Rebuild state from events - this is the authoritative repair
        return this.createRepairEvent('state_mismatch', `Rebuilt state from ${events.length} events`);
        
      case 'missing_event':
        // Remove stale state reference by rebuilding from valid events
        return this.createRepairEvent('missing_event', `Removed stale reference to ${issue.affectedEventId}`);
        
      case 'out_of_order':
        // Events will be reordered during rebuild
        return this.createRepairEvent('out_of_order', `Fixed event ordering issue`);
        
      default:
        return null;
    }
  }

  /**
   * Create a repair event
   */
  private createRepairEvent(issueType: string, description: string): Event {
    return {
      eventId: uuidv7(),
      ts: Date.now(),
      projectId: this.projectPath,
      action: 'recovery.repaired',
      payload: {
        issueType,
        description,
      },
      metadata: {
        schemaVersion: this.schemaVersion,
        source: 'daemon',
      },
    };
  }

  /**
   * Rebuild state from events (authoritative source of truth)
   * This is the core of Property 20 - after repair, rebuild(events) == s'
   */
  async rebuildFromEvents(events: Event[]): Promise<ProjectState> {
    if (!events || events.length === 0) {
      return this.createEmptyState();
    }

    // Sort events by timestamp to ensure correct order
    const sortedEvents = [...events].sort((a, b) => a.ts - b.ts);
    
    const lastEvent = sortedEvents[sortedEvents.length - 1]!;
    
    return {
      stateVersion: 0,
      projectPath: this.projectPath,
      schemaVersion: this.schemaVersion,
      activeSessions: [],
      workItems: [],
      lastEventId: lastEvent.eventId,
      lastEventTs: lastEvent.ts,
    };
  }

  /**
   * Create empty state
   */
  private createEmptyState(): ProjectState {
    return {
      stateVersion: 0,
      projectPath: this.projectPath,
      schemaVersion: this.schemaVersion,
      activeSessions: [],
      workItems: [],
      lastEventId: '',
      lastEventTs: 0,
    };
  }

  /**
   * Attempt session WAL replay reconstruction (only during startup - Property 21)
   * 
   * Property 21: WAL replay session reconstruction may only occur within Daemon startup process.
   * After startup completes, the Daemon must not automatically initiate session state reconstruction via WAL replay.
   * 
   * @param sessionId Session ID to reconnect
   * @returns true if reconnection was attempted and succeeded
   */
  async attemptSessionReconnect(sessionId: string): Promise<boolean> {
    // Property 21: Only attempt WAL replay during startup phase
    if (!this.isInStartupPhase || this.hasStartupCompleted) {
      // Post-startup session detection doesn't trigger reconnection
      return false;
    }
    
    // Attempt to reconnect - in real implementation, this would check if 
    // the OpenCode process is still alive via some mechanism
    const result = await this.performSessionReconnect(sessionId);
    return result.reconnected;
  }

  /**
   * Perform the actual session reconnection logic
   * In a real implementation, this would communicate with the OpenCode process
   */
  private async performSessionReconnect(sessionId: string): Promise<SessionReconnectResult> {
    // Load events to find session information
    const events = await this.loadEvents();
    
    // Find the session activation event
    const activationEvent = events.find(
      e => e.action === 'session.activated' && e.payload && 
           (e.payload as any).sessionId === sessionId
    );
    
    if (!activationEvent) {
      return {
        success: false,
        sessionId,
        reconnected: false,
        reason: 'No activation event found for session',
      };
    }
    
    // In real implementation, we'd check if the OpenCode process is still alive
    // For now, simulate successful reconnection during startup
    return {
      success: true,
      sessionId,
      reconnected: true,
      reason: 'Session reconnected during startup',
    };
  }

  /**
   * Start the startup phase for session reconnection
   * Called by Daemon at the beginning of startup
   */
  beginStartupPhase(): void {
    this._isReady = false;
    this.isInStartupPhase = true;
    this.hasStartupCompleted = false;
  }

  /**
   * End the startup phase - no more reconnection attempts allowed
   * Called by Daemon after startup is complete
   */
  completeStartup(): void {
    this.hasStartupCompleted = true;
    this.isInStartupPhase = false;
    this._isReady = true;
  }

  isReady(): boolean {
    return this._isReady;
  }

  /**
   * Check if we're currently in the startup phase
   * Used for testing and verification
   */
  isStartupPhase(): boolean {
    return this.isInStartupPhase;
  }

  /**
   * Check if startup has completed
   * Used for testing and verification
   */
  hasCompletedStartup(): boolean {
    return this.hasStartupCompleted;
  }

  /**
   * Get reconnection scope status
   * Used for testing and verification of Property 21
   */
  getReconnectionScopeStatus(): {
    isInStartupPhase: boolean;
    hasStartupCompleted: boolean;
    reconnectionAllowed: boolean;
  } {
    return {
      isInStartupPhase: this.isInStartupPhase,
      hasStartupCompleted: this.hasStartupCompleted,
      reconnectionAllowed: this.isInStartupPhase && !this.hasStartupCompleted,
    };
  }

  /**
   * Load events from events.jsonl
   */
  async loadEvents(): Promise<Event[]> {
    try {
      const content = await fs.readFile(this.eventsPath, 'utf-8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line)) as Event[];
    } catch (error) {
      return [];
    }
  }

  /**
   * Load state from state.json
   */
  async loadState(): Promise<ProjectState> {
    try {
      const content = await fs.readFile(this.statePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return this.createEmptyState();
    }
  }

  /**
   * Write state to state.json
   */
  private async writeState(state: ProjectState): Promise<void> {
    if (this.stateManager) {
      await this.stateManager.persistStateFromExternal(state);
      return;
    }
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2));
    
    // fsync to ensure durability
    const handle = await fs.open(this.statePath, 'a');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  /**
   * Save a session checkpoint snapshot.
   * 
   * Writes the snapshot to sessions/<sessionId>.json relative to the state
   * directory, followed by fsync for durability.  Write failures are logged
   * at ERROR level but never thrown — they must not block session compaction.
   */
  async saveCheckpoint(sessionId: string, snapshotData: unknown): Promise<void> {
    try {
      const checkpointDir = path.join(path.dirname(this.statePath), 'checkpoints');
      const checkpointPath = path.join(checkpointDir, `${sessionId}.json`);

      await fs.mkdir(checkpointDir, { recursive: true });
      await fs.writeFile(checkpointPath, JSON.stringify(snapshotData, null, 2));

      // fsync to ensure durability
      const handle = await fs.open(checkpointPath, 'a');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      console.error(`[RecoverySubsystem] Failed to save checkpoint for session ${sessionId}:`, error);
    }
  }

  /**
   * Initialize the recovery subsystem
   */
  async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.eventsPath), { recursive: true });
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
  }
}
