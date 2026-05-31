/**
 * Event Logger module
 * 
 * Implements WAL (Write-Ahead Log) semantics:
 * 1. Events are written to events.jsonl first
 * 2. fsync is called to ensure data is persisted to disk
 * 3. Only after fsync succeeds, state.json can be updated
 * 
 * Multi-project support:
 * - Events are stored in events.jsonl with projectId field
 * - Project index files track events per project for efficient querying
 * - Cross-project queries work by omitting projectId filter
 * - Project-specific queries use the projectId filter
 * 
 * Implements Property 8: Serialization Round-trip
 * parse(serialize(x)) == x for all persisted data objects
 * 
 * Validates: Requirements 2.2, 2.5, Property 8, 4.1
 */

import { createReadStream, promises as fs } from 'fs';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import type { Event, EventLogger as IEventLogger, EventFilter } from '../types';

/**
 * WAL file names
 */
const EVENTS_FILE = 'events.jsonl';
const STATE_FILE = 'state.json';
const PROJECT_INDEX_DIR = 'project-indices';

/**
 * Project index file structure
 */
interface ProjectIndex {
  projectId: string;
  eventCount: number;
  firstEventTs: number;
  lastEventTs: number;
  eventIds: string[];
  lastUpdated: number;
}

/**
 * Event serialization constants
 */
const EVENT_SCHEMA_VERSION = '1.0';

/**
 * Event Logger with WAL semantics
 * 
 * Ensures crash-safe event persistence:
 * 1. Write event to events.jsonl
 * 2. Fsync to ensure data is on disk
 * 3. Only then allow state.json updates
 * 
 * Multi-project support:
 * - Each project has its own index file in project-indices/
 * - Project indices track event counts, timestamps, and event IDs
 * - Queries can filter by projectId or query across all projects
 */
export class EventLogger implements IEventLogger {
  private eventsPath: string;
  private statePath: string;
  private projectIndexDir: string;
  private lastEventId: string | null = null;
  private eventCount = 0;
  /** Map of projectId -> ProjectIndex for in-memory caching */
  private projectIndices: Map<string, ProjectIndex> = new Map();

  /**
   * Create a new EventLogger instance
   * @param basePath Base directory for event storage (default: ./data/observability)
   */
  constructor(basePath: string = './data/observability') {
    this.eventsPath = join(basePath, EVENTS_FILE);
    this.statePath = join(basePath, STATE_FILE);
    this.projectIndexDir = join(basePath, PROJECT_INDEX_DIR);
  }

  /**
   * Get the project index file path for a given projectId
   */
  private getProjectIndexPath(projectId: string): string {
    return join(this.projectIndexDir, `${projectId}.json`);
  }

  /**
   * Initialize the Event Logger storage directory
   */
  async initialize(): Promise<void> {
    // WAL is now the sole writer of events.jsonl — EventLogger only seeds
    // its internal counters from the existing file (no file/directory creation).
    
    // Load last event info and project indices
    await this.loadLastEventInfo();
    await this.loadProjectIndices();
  }

  /**
   * Load project indices from disk into memory
   */
  private async loadProjectIndices(): Promise<void> {
    this.projectIndices.clear();
    
    try {
      await fs.access(this.projectIndexDir);
    } catch {
      // Directory doesn't exist, no indices to load
      return;
    }

    const files = await fs.readdir(this.projectIndexDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const content = await fs.readFile(join(this.projectIndexDir, file), 'utf8');
        const index = JSON.parse(content) as ProjectIndex;
        this.projectIndices.set(index.projectId, index);
      } catch {
        // Skip invalid index files
      }
    }
  }

  /**
   * Update or create a project index when a new event is added
   */
  private async updateProjectIndex(event: Event): Promise<void> {
    const projectId = event.projectId;
    let index = this.projectIndices.get(projectId);
    
    if (!index) {
      // Create new index for this project
      index = {
        projectId,
        eventCount: 0,
        firstEventTs: event.ts,
        lastEventTs: event.ts,
        eventIds: [],
        lastUpdated: Date.now()
      };
    }
    
    // Update index
    index.eventCount++;
    if (event.ts < index.firstEventTs) {
      index.firstEventTs = event.ts;
    }
    if (event.ts > index.lastEventTs) {
      index.lastEventTs = event.ts;
    }
    index.eventIds.push(event.eventId);
    index.lastUpdated = Date.now();
    
    // Keep only last 1000 event IDs in memory to avoid memory bloat
    if (index.eventIds.length > 1000) {
      index.eventIds = index.eventIds.slice(-1000);
    }
    
    // Store in memory
    this.projectIndices.set(projectId, index);
    
    // Persist to disk
    await fs.mkdir(dirname(this.getProjectIndexPath(projectId)), { recursive: true });
    await fs.writeFile(
      this.getProjectIndexPath(projectId),
      JSON.stringify(index, null, 2),
      'utf8'
    );
  }

  /**
   * Get list of all known project IDs
   * Returns project IDs that have been indexed
   */
  async getKnownProjects(): Promise<string[]> {
    await this.loadProjectIndices();
    return Array.from(this.projectIndices.keys());
  }

  /**
   * Get project-specific statistics
   */
  async getProjectStats(projectId: string): Promise<{
    eventCount: number;
    firstEventTs: number;
    lastEventTs: number;
  } | null> {
    await this.loadProjectIndices();
    const index = this.projectIndices.get(projectId);
    
    if (!index) {
      return null;
    }
    
    return {
      eventCount: index.eventCount,
      firstEventTs: index.firstEventTs,
      lastEventTs: index.lastEventTs
    };
  }

  /**
   * Query events across multiple projects (cross-project query)
   * When projectId is not specified, queries all projects
   */
  async getEventsAcrossAllProjects(filter?: EventFilter): Promise<Event[]> {
    const events: Event[] = [];
    for await (const event of this.getEvents(filter)) {
      events.push(event);
    }
    return events;
  }

  /**
   * Load last event information from the events file
   */
  private async loadLastEventInfo(): Promise<void> {
    try {
      const stat = await fs.stat(this.eventsPath);
      if (stat.size === 0) {
        this.lastEventId = null;
        this.eventCount = 0;
        return;
      }

      // Read the last line to get the last event ID
      const lastLine = await this.readLastLine(this.eventsPath);
      if (lastLine) {
        try {
          const event = JSON.parse(lastLine) as Event;
          this.lastEventId = event.eventId;
          this.eventCount = await this.getLineCount(this.eventsPath);
        } catch {
          this.lastEventId = null;
          this.eventCount = 0;
        }
      }
    } catch {
      this.lastEventId = null;
      this.eventCount = 0;
    }
  }

  /**
   * Read the last line of a file
   */
  private async readLastLine(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const results: string[] = [];
      const stream = createReadStream(filePath, { encoding: 'utf8' });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });

      rl.on('line', (line) => {
        if (line.trim()) {
          results.push(line);
        }
      });

      rl.on('close', () => {
        resolve(results[results.length - 1] || '');
      });

      rl.on('error', reject);
    });
  }

  /**
   * Get the number of lines in a file
   */
  private async getLineCount(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      let count = 0;
      const stream = createReadStream(filePath, { encoding: 'utf8' });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });

      rl.on('line', () => {
        count++;
      });

      rl.on('close', () => {
        resolve(count);
      });

      rl.on('error', reject);
    });
  }

  /**
   * Track an event in-memory (no disk write — WAL is the sole writer of events.jsonl).
   * 
   * Updates internal counters and project indices so that read queries
   * (getEvents, getStats, getKnownProjects, etc.) reflect the new event.
   * 
   * Does NOT write to events.jsonl or state.json.
   * 
   * @param event Event to track
   */
  async trackEvent(event: Event): Promise<void> {
    // Validate event has required fields
    this.validateEvent(event);

    // Update in-memory counters only (no file write)
    this.lastEventId = event.eventId;
    this.eventCount++;
    
    // Update project index
    await this.updateProjectIndex(event);
  }

  /**
   * @deprecated Use trackEvent() instead.
   * Compatibility wrapper that delegates to trackEvent().
   */
  async append(event: Event): Promise<void> {
    return this.trackEvent(event);
  }

  /**
   * Validate event has all required fields
   */
  private validateEvent(event: Event): void {
    if (!event.eventId) {
      throw new Error('Event must have eventId');
    }
    if (!event.ts) {
      throw new Error('Event must have ts (timestamp)');
    }
    if (!event.projectId) {
      throw new Error('Event must have projectId');
    }
    if (!event.category) {
      throw new Error('Event must have category');
    }
    if (!event.action) {
      throw new Error('Event must have action');
    }
  }

  /**
   * Get events from the WAL with optional filtering
   * 
   * @param filter Optional filter criteria
   * @yield Events matching the filter
   */
  async *getEvents(filter?: EventFilter): AsyncIterable<Event> {
    try {
      const stat = await fs.stat(this.eventsPath);
      if (stat.size === 0) {
        return;
      }
    } catch {
      return;
    }

    const stream = createReadStream(this.eventsPath, { encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let count = 0;
    const limit = filter?.limit ?? Infinity;

    for await (const line of rl) {
      if (!line.trim()) continue;
      
      try {
        const event = JSON.parse(line) as Event;
        
        // Apply filter
        if (this.matchesFilter(event, filter)) {
          yield event;
          count++;
          
          if (count >= limit) {
            break;
          }
        }
      } catch {
        // Skip invalid lines
        continue;
      }
    }
  }

  /**
   * Check if an event matches the filter criteria
   */
  private matchesFilter(event: Event, filter?: EventFilter): boolean {
    if (!filter) return true;

    if (filter.projectId && event.projectId !== filter.projectId) {
      return false;
    }

    if (filter.workItemId && event.workItemId !== filter.workItemId) {
      return false;
    }

    if (filter.category && event.category !== filter.category) {
      return false;
    }

    if (filter.action && !event.action.includes(filter.action)) {
      return false;
    }

    if (filter.startTs && event.ts < filter.startTs) {
      return false;
    }

    if (filter.endTs && event.ts > filter.endTs) {
      return false;
    }

    if (filter.actor) {
      if (filter.actor.sessionId && event.actor?.sessionId !== filter.actor.sessionId) {
        return false;
      }
      // AgentIdentity has no 'name' field — filter by sessionId or agentRole instead
      if (filter.actor.agentRole && event.actor?.agentRole !== filter.actor.agentRole) {
        return false;
      }
    }

    return true;
  }

  /**
   * Rebuild state from events.jsonl
   * 
   * This reconstructs the derived state from the WAL,
   * which can be used for fast startup after a crash
   * 
   * @returns Reconstructed state
   */
  async rebuildState(): Promise<{
    schema_version: string;
    events: Event[];
    lastEventId: string | null;
    eventCount: number;
  }> {
    const events: Event[] = [];
    
    for await (const event of this.getEvents()) {
      events.push(event);
    }

    // Get latest state
    let lastEventId: string | null = null;
    if (events.length > 0) {
      lastEventId = events[events.length - 1].eventId;
    }

    // State is no longer persisted by EventLogger — StateManager is the sole writer
    // of state.json via its optimistic concurrency control (DD-2).

    return {
      schema_version: EVENT_SCHEMA_VERSION,
      events,
      lastEventId,
      eventCount: events.length,
    };
  }

  /**
   * Get the last event ID
   * 
   * @returns Last event ID or null if no events
   */
  getLastEventId(): string | null {
    return this.lastEventId;
  }

  /**
   * Get the event count
   * 
   * @returns Total number of events in the WAL
   */
  getEventCount(): number {
    return this.eventCount;
  }

  /**
   * Get the events file path
   */
  getEventsPath(): string {
    return this.eventsPath;
  }

  /**
   * Get the state file path
   */
  getStatePath(): string {
    return this.statePath;
  }

  /**
   * Serialize an event to JSON string
   * Implements Property 8: Serialization Round-trip
   * 
   * @param event Event to serialize
   * @returns JSON string
   */
  static serialize(event: Event): string {
    return JSON.stringify(event);
  }

  /**
   * Deserialize a JSON string to an event
   * Implements Property 8: Serialization Round-trip
   * 
   * @param json JSON string to deserialize
   * @returns Event object
   */
  static deserialize(json: string): Event {
    return JSON.parse(json) as Event;
  }

  /**
   * Verify serialization round-trip for an event
   * Implements Property 8: parse(serialize(x)) == x
   * 
   * @param event Event to verify
   * @returns true if round-trip is successful
   */
  static verifySerializationRoundTrip(event: Event): boolean {
    const serialized = EventLogger.serialize(event);
    const deserialized = EventLogger.deserialize(serialized);
    
    return (
      deserialized.eventId === event.eventId &&
      deserialized.ts === event.ts &&
      deserialized.monotonicSeq === event.monotonicSeq &&
      deserialized.projectId === event.projectId &&
      deserialized.category === event.category &&
      deserialized.action === event.action &&
      JSON.stringify(deserialized.payload) === JSON.stringify(event.payload)
    );
  }

  /**
   * Clear all events (for testing)
   */
  async clear(): Promise<void> {
    await fs.writeFile(this.eventsPath, '', 'utf8');
    await fs.writeFile(this.statePath, JSON.stringify({ schema_version: EVENT_SCHEMA_VERSION, events: [], lastEventId: null, eventCount: 0 }), 'utf8');
    this.lastEventId = null;
    this.eventCount = 0;
    
    // Clear project indices
    try {
      await fs.access(this.projectIndexDir);
      const files = await fs.readdir(this.projectIndexDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(join(this.projectIndexDir, file));
        }
      }
    } catch {
      // Directory doesn't exist, nothing to clear
    }
    this.projectIndices.clear();
  }

  /**
   * Get WAL statistics
   */
  async getStats(): Promise<{
    eventCount: number;
    lastEventId: string | null;
    fileSize: number;
  }> {
    let fileSize = 0;
    try {
      const stat = await fs.stat(this.eventsPath);
      fileSize = stat.size;
    } catch {
      fileSize = 0;
    }

    return {
      eventCount: this.eventCount,
      lastEventId: this.lastEventId,
      fileSize,
    };
  }
}

/**
 * Create an EventLogger instance
 * 
 * @param basePath Optional base path for storage
 * @returns Configured EventLogger instance
 */
export function createEventLogger(basePath?: string): EventLogger {
  return new EventLogger(basePath);
}