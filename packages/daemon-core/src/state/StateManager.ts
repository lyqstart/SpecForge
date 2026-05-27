/**
 * State Manager implementation
 * 
 * Implements WAL semantics and manages events.jsonl and state.json.
 * Ensures WAL ordering: events.jsonl fsync before state.json update.
 * 
 * The StateManager is the Single Source of Truth for all Work Item states.
 * It maintains an in-memory state derived from the WAL, and persists
 * state.json as a checkpoint for fast restarts.
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { Event, ProjectState, WorkItemState } from '../types';
import { WAL } from '../wal';

import { ALL_STATES } from '../tools/lib/state_machine';

/**
 * Valid workflow states — sourced from the single authority in state_machine.ts.
 * All state transitions must move between these states.
 */
const VALID_STATES: readonly string[] = ALL_STATES;

/**
 * Default workflow type for new Work Items when not explicitly provided.
 */
const DEFAULT_WORKFLOW_TYPE = 'feature_spec';

export class StateManager {
  private wal: WAL;
  private statePath: string;
  private projectPath: string;

  /** In-memory state map: work_item_id → WorkItemState */
  private workItemStates: Map<string, WorkItemState> = new Map();

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.wal = new WAL(projectPath);
    
    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const projectHash = this.hashPath(projectPath);
    this.statePath = home 
      ? path.join(home, '.specforge', 'projects', projectHash, 'state.json')
      : '';
  }

  /**
   * Generate a safe filename from project path
   */
  private hashPath(projectPath: string): string {
    // Simple hash for filesystem safety
    let hash = 0;
    for (let i = 0; i < projectPath.length; i++) {
      const char = projectPath.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  // ═══════════════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════════════

  /**
   * Initialize the StateManager:
   * 1. Initialise WAL directory + seed monotonicSeq
   * 2. Ensure state.json directory exists
   * 3. Rebuild in-memory state from WAL events
   * 4. Persist rebuilt state to state.json
   */
  async initialize(): Promise<void> {
    // Step 1: Initialize WAL
    await this.wal.initialize();
    
    // Step 2: Ensure state directory exists
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });

    // Step 3: Rebuild in-memory state from WAL (authoritative source)
    await this.rebuildState();

    // Step 4: Persist rebuilt in-memory state to state.json
    await this.persistState();
  }

  // ═══════════════════════════════════════════════════
  //  Transition
  // ═══════════════════════════════════════════════════

  /**
   * Perform a state transition for a Work Item.
   * 
   * Steps:
   *   1. Validate transition is legal (from_state matches current state)
   *   2. Validate state names are in the valid workflow states list
   *   3. Create a 'state.transition' event via WAL
   *   4. Append event to WAL (with fsync)
   *   5. Update in-memory state
   *   6. Persist checkpoint to state.json
   * 
   * Optimistic locking: if `fromState` does not match the current state
   * of the Work Item, the transition is rejected with an error.
   * 
   * @param workItemId  - The Work Item to transition (e.g. 'WI-001')
   * @param fromState   - Expected current state ('' for new Work Items)
   * @param toState     - Target state
   * @param actor       - Actor performing the transition
   * @param workflowType - Workflow type (default 'feature_spec')
   * @param extraPayload - Additional payload fields
   * @throws Error if the transition is invalid
   */
  async transition(
    workItemId: string,
    fromState: string,
    toState: string,
    actor: string = 'system',
    workflowType: string = DEFAULT_WORKFLOW_TYPE,
    extraPayload: Record<string, unknown> = {},
  ): Promise<void> {
    // ── Step 1: Validate state names ──
    if (!this.isValidStateName(toState)) {
      throw new Error(
        `Invalid target state "${toState}". Valid states: ${VALID_STATES.join(', ')}`,
      );
    }

    if (fromState !== '' && !this.isValidStateName(fromState)) {
      throw new Error(
        `Invalid from_state "${fromState}". Valid states: ${VALID_STATES.join(', ')}`,
      );
    }

    // ── Step 2: Optimistic lock — verify from_state matches current state ──
    const current = this.workItemStates.get(workItemId);
    const currentState = current?.current_state ?? '';

    if (fromState !== currentState) {
      throw new Error(
        `Optimistic lock failed: expected from_state="${fromState}" ` +
        `but current state for "${workItemId}" is "${currentState}"`,
      );
    }

    // ── Step 3: Create the state.transition event ──
    const event = this.wal.createEvent(
      workItemId,
      'state',
      'state.transition',
      {
        work_item_id: workItemId,
        from_state: fromState,
        to_state: toState,
        workflow_type: workflowType,
        transitioned_at: Date.now(),
        ...extraPayload,
      },
      actor,
    );

    // ── Step 4: Append event to WAL (with fsync guarantee) ──
    await this.wal.appendEvent(event);

    // ── Step 5: Update in-memory state ──
    this.applyStateTransition(event);

    // ── Step 6: Persist checkpoint ──
    await this.persistState();
  }

  // ═══════════════════════════════════════════════════
  //  State queries
  // ═══════════════════════════════════════════════════

  /**
   * Get the current state for a Work Item.
   * Returns null if the Work Item does not exist.
   */
  getState(workItemId: string): WorkItemState | null {
    return this.workItemStates.get(workItemId) ?? null;
  }

  async getAllStates(): Promise<Record<string, WorkItemState>> {
    const result: Record<string, WorkItemState> = {};
    for (const [key, value] of this.workItemStates) {
      result[key] = value;
    }
    return result;
  }

  /**
   * List all known Work Items with their current states.
   * Returns a copy (not a reference) so callers cannot mutate internal state.
   */
  listWorkItems(): WorkItemState[] {
    return Array.from(this.workItemStates.values());
  }

  // ═══════════════════════════════════════════════════
  //  Rebuild
  // ═══════════════════════════════════════════════════

  /**
   * Rebuild the in-memory state by replaying all WAL events.
   * 
   * This is the authoritative reconstruction: the WAL is the single
   * source of truth. The ProjectState is derived from events, never
   * edited directly.
   * 
   * After rebuild, state.json is updated to match.
   */
  async rebuildState(): Promise<ProjectState> {
    const events = await this.wal.readAllEvents();
    
    // Clear and rebuild
    this.workItemStates.clear();

    let lastEventId = '';
    let lastEventTs = 0;

    for (const event of events) {
      if (!event || !event.eventId) continue;

      lastEventId = event.eventId;
      lastEventTs = event.ts ?? 0;

      if (event.action === 'state.transition') {
        this.applyStateTransition(event);
      }
    }

    const state: ProjectState = {
      projectPath: this.projectPath,
      schemaVersion: '1.0',
      activeSessions: [],
      workItems: Array.from(this.workItemStates.values()),
      lastEventId,
      lastEventTs,
    };

    return state;
  }

  /**
   * Rebuild state from WAL events and persist to state.json.
   * Convenience wrapper around rebuildState() + persistState().
   */
  async rebuildFromEventsFile(): Promise<void> {
    await this.rebuildState();
    await this.persistState();
  }

  // ═══════════════════════════════════════════════════
  //  Legacy API (kept for backward compat)
  // ═══════════════════════════════════════════════════

  /**
   * Append an event and persist state.json checkpoint.
   * 
   * WAL ordering: events.jsonl is fsynced BEFORE state.json is written.
   * This guarantees that on crash recovery, the WAL is always ahead of state.json.
   * 
   * @deprecated Use transition() for state changes.
   */
  async appendEvent(event: Event): Promise<void> {
    // Step 1: Append event to WAL (events.jsonl) with fsync
    await this.wal.appendEvent(event);
    
    // Step 2: Apply event to in-memory state
    if (event.action === 'state.transition') {
      this.applyStateTransition(event);
    }

    // Step 3: Persist state.json AFTER WAL fsync completes
    await this.persistState();
  }

  /**
   * Get the current ProjectState (from in-memory state).
   */
  async getCurrentState(): Promise<ProjectState> {
    return this.buildProjectState();
  }

  /**
   * @deprecated Use rebuildState() instead.
   */
  async rebuildFromEvents(events: Event[]): Promise<ProjectState> {
    if (!events || events.length === 0) {
      return this.buildProjectState();
    }

    // Rebuild from the provided events
    this.workItemStates.clear();
    let lastEventId = '';
    let lastEventTs = 0;

    for (const event of events) {
      if (!event || !event.eventId) continue;
      lastEventId = event.eventId;
      lastEventTs = event.ts ?? 0;

      if (event.action === 'state.transition') {
        this.applyStateTransition(event);
      }
    }

    return {
      projectPath: this.projectPath,
      schemaVersion: '1.0',
      activeSessions: [],
      workItems: Array.from(this.workItemStates.values()),
      lastEventId,
      lastEventTs,
    };
  }

  // ═══════════════════════════════════════════════════
  //  Internal helpers
  // ═══════════════════════════════════════════════════

  /**
   * Apply a state.transition event to the in-memory state map.
   * Idempotent: replaying the same events produces the same result.
   */
  private applyStateTransition(event: Event): void {
    const payload = event.payload as {
      work_item_id?: string;
      from_state?: string;
      to_state?: string;
      workflow_type?: string;
    };

    const workItemId = payload?.work_item_id ?? event.projectId;
    if (!workItemId) return;

    const toState = payload?.to_state ?? '';
    if (!toState) return;

    const workflowType = payload?.workflow_type ?? DEFAULT_WORKFLOW_TYPE;
    const now = event.ts ?? Date.now();
    const existing = this.workItemStates.get(workItemId);

    if (existing) {
      // Update existing Work Item
      this.workItemStates.set(workItemId, {
        work_item_id: workItemId,
        workflow_type: existing.workflow_type,
        current_state: toState,
        created_at: existing.created_at,
        updated_at: now,
      });
    } else {
      // Create new Work Item
      this.workItemStates.set(workItemId, {
        work_item_id: workItemId,
        workflow_type: workflowType,
        current_state: toState,
        created_at: now,
        updated_at: now,
      });
    }
  }

  /**
   * Check if a state name is in the valid workflow states list.
   */
  private isValidStateName(state: string): boolean {
    return VALID_STATES.includes(state);
  }

  /**
   * Build a ProjectState from the in-memory work item states.
   */
  private buildProjectState(): ProjectState {
    const workItems = Array.from(this.workItemStates.values());
    // Find the latest updated_at to calculate lastEventId/Ts
    let lastEventId = '';
    let lastEventTs = 0;
    for (const wi of workItems) {
      if (wi.updated_at > lastEventTs) {
        lastEventTs = wi.updated_at;
      }
    }

    return {
      projectPath: this.projectPath,
      schemaVersion: '1.0',
      activeSessions: [],
      workItems,
      lastEventId,
      lastEventTs,
    };
  }

  /**
   * Persist the current in-memory state to state.json.
   * Always called AFTER WAL fsync to maintain ordering invariant.
   */
  private async persistState(): Promise<void> {
    const state = this.buildProjectState();
    await this.writeStateFile(state);
  }

  /**
   * Write state.json with fsync for crash safety.
   */
  private async writeStateFile(state: ProjectState): Promise<void> {
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2), 'utf-8');
    const fd = fsSync.openSync(this.statePath, 'a');
    try {
      fsSync.fsyncSync(fd);
    } finally {
      fsSync.closeSync(fd);
    }
  }

  /**
   * @deprecated Use in-memory state via getState() / listWorkItems() instead.
   */
  private async readStateFile(): Promise<ProjectState> {
    try {
      const content = await fs.readFile(this.statePath, 'utf-8');
      return JSON.parse(content) as ProjectState;
    } catch (error) {
      return {
        projectPath: this.projectPath,
        schemaVersion: '1.0',
        activeSessions: [],
        workItems: [],
        lastEventId: '',
        lastEventTs: 0,
      };
    }
  }
}
