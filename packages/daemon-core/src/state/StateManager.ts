/**
 * State Manager implementation
 * 
 * Implements WAL semantics and manages events.jsonl and state.json.
 * Ensures WAL ordering: events.jsonl fsync before state.json update.
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { Event, ProjectState } from '../types';
import { WAL } from '../wal';

export class StateManager {
  private wal: WAL;
  private statePath: string;
  private projectPath: string;

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

  async initialize(): Promise<void> {
    // Initialize WAL
    await this.wal.initialize();
    
    // Ensure state directory exists
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });

    // Check if state file exists
    try {
      await fs.access(this.statePath);
      // State exists, read it (don't rebuild from events, use existing state)
      // This allows recovery from a checkpoint
    } catch (error) {
      // State doesn't exist, create empty state
      await this.writeStateFile({
        projectPath: this.projectPath,
        schemaVersion: '1.0',
        activeSessions: [],
        workItems: [],
        lastEventId: '',
        lastEventTs: 0,
      });
    }
  }

  async appendEvent(event: Event): Promise<void> {
    // Step 1: Append event to WAL (events.jsonl) with fsync
    await this.wal.appendEvent(event);
    
    // Step 2: Update state.json AFTER WAL fsync completes
    // This ensures WAL ordering: events.jsonl is synced before state.json
    await this.updateState(event);
  }

  async getCurrentState(): Promise<ProjectState> {
    const state = await this.readStateFile();
    return state || { 
      projectPath: this.projectPath, 
      schemaVersion: '1.0', 
      activeSessions: [], 
      workItems: [], 
      lastEventId: '', 
      lastEventTs: 0 
    };
  }

  async rebuildFromEvents(events: Event[]): Promise<ProjectState> {
    // Handle empty or invalid event list
    if (!events || events.length === 0) {
      return this.createEmptyState();
    }

    // Create a new state object each time to ensure idempotence
    let lastEventId = '';
    let lastEventTs = 0;
    
    for (const event of events) {
      // Validate event has required fields
      if (event && event.eventId && event.eventId.length > 0) {
        lastEventId = event.eventId;
        lastEventTs = event.ts ?? 0;
      }
    }

    // Return a fresh new object to ensure idempotence
    return {
      projectPath: this.projectPath,
      schemaVersion: '1.0',
      activeSessions: [],
      workItems: [],
      lastEventId,
      lastEventTs,
    };
  }

  /**
   * Create an empty state object
   */
  private createEmptyState(): ProjectState {
    return {
      projectPath: this.projectPath,
      schemaVersion: '1.0',
      activeSessions: [],
      workItems: [],
      lastEventId: '',
      lastEventTs: 0,
    };
  }

  async rebuildFromEventsFile(): Promise<void> {
    const events = await this.wal.readAllEvents();
    const state = await this.rebuildFromEvents(events);
    await this.writeStateFile(state);
  }

  private async updateState(event: Event): Promise<void> {
    const state: ProjectState = {
      projectPath: this.projectPath,
      schemaVersion: '1.0',
      activeSessions: [],
      workItems: [],
      lastEventId: event.eventId,
      lastEventTs: event.ts,
    };

    // Write state.json AFTER WAL fsync completes
    await this.writeStateFile(state);
  }

  private async readStateFile(): Promise<ProjectState> {
    try {
      const content = await fs.readFile(this.statePath, 'utf-8');
      return JSON.parse(content);
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

  private async writeStateFile(state: ProjectState): Promise<void> {
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2));
    const fd = fsSync.openSync(this.statePath, 'a');
    try {
      fsSync.fsyncSync(fd);
    } finally {
      fsSync.closeSync(fd);
    }
  }
}
