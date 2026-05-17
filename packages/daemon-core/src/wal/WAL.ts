/**
 * Write-Ahead Log (WAL) implementation
 * 
 * Implements events.jsonl file format with append + fsync semantics.
 * Ensures WAL ordering: events.jsonl fsync before state.json update.
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { v7 as uuidv7 } from 'uuid';
import { Event } from '../types';

export class WAL {
  private eventsPath: string;
  private schemaVersion: string = '1.0';

  constructor(projectPath: string) {
    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const projectHash = this.hashPath(projectPath);
    this.eventsPath = home 
      ? path.join(home, '.specforge', 'projects', projectHash, 'events.jsonl')
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

  /**
   * Initialize WAL directory and file
   */
  async initialize(): Promise<void> {
    const dir = path.dirname(this.eventsPath);
    await fs.mkdir(dir, { recursive: true });

    try {
      await fs.access(this.eventsPath);
    } catch (error) {
      // File doesn't exist, create empty file
      await fs.writeFile(this.eventsPath, '');
    }
  }

  /**
   * Append an event to the WAL with fsync semantics
   * 
   * This method ensures that the event is written to disk and fsynced
   * before returning, guaranteeing durability.
   */
  async appendEvent(event: Event): Promise<void> {
    const line = JSON.stringify(event) + '\n';
    
    // Append event to events.jsonl
    await fs.appendFile(this.eventsPath, line);
    
    // fsync to ensure data is flushed to disk
    const fd = fsSync.openSync(this.eventsPath, 'a');
    try {
      fsSync.fsyncSync(fd);
    } finally {
      fsSync.closeSync(fd);
    }
  }

  /**
   * Create a new event with auto-generated eventId and timestamp
   */
  createEvent(
    projectId: string,
    action: string,
    payload: Record<string, unknown>,
    source: 'daemon' | 'client' | 'adapter' = 'daemon'
  ): Event {
    return {
      eventId: uuidv7(),
      ts: Date.now(),
      projectId,
      action,
      payload,
      metadata: {
        schemaVersion: this.schemaVersion,
        source,
      },
    };
  }

  /**
   * Read all events from the WAL
   */
  async readAllEvents(): Promise<Event[]> {
    try {
      const content = await fs.readFile(this.eventsPath, 'utf-8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line)) as Event[];
    } catch (error) {
      // File might not exist or be empty
      return [];
    }
  }

  /**
   * Get the last event from the WAL
   */
  async getLastEvent(): Promise<Event | null> {
    const events = await this.readAllEvents();
    return events.length > 0 ? events[events.length - 1]! : null;
  }

  /**
   * Get the path to the events.jsonl file
   */
  getEventsPath(): string {
    return this.eventsPath;
  }

  /**
   * Get the schema version
   */
  getSchemaVersion(): string {
    return this.schemaVersion;
  }
}
