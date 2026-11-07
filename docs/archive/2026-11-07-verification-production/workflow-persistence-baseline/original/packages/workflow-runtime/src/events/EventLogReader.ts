/**
 * EventLogReader Module
 * Reads workflow events from events.jsonl for replay and recovery
 */

import { readFile, writeFile, appendFile, stat, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

// Schema version for events (REQ-18)
const SCHEMA_VERSION = '1.0';

/**
 * Event structure in events.jsonl
 */
export interface EventLogEntry {
  eventId: string;
  ts: number;
  projectId: string;
  action: string;
  payload: Record<string, unknown>;
  metadata: {
    schemaVersion: string;
    source: 'daemon' | 'client' | 'adapter';
  };
}

/**
 * Workflow event filter for replay
 */
export interface EventFilter {
  instanceId?: string;
  workflowId?: string;
  action?: string | string[];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

/**
 * Event replay result
 */
export interface EventReplayResult {
  events: EventLogEntry[];
  totalEvents: number;
  filteredEvents: number;
}

/**
 * EventLogReader reads workflow events from events.jsonl
 */
export class EventLogReader {
  private logDir: string;
  private logFile: string;

  /**
   * Create a new EventLogReader
   */
  constructor(logDir: string) {
    this.logDir = logDir;
    this.logFile = join(logDir, 'events.jsonl');
  }

  /**
   * Initialize the log directory
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.logDir)) {
      await mkdir(this.logDir, { recursive: true });
    }
    
    if (!existsSync(this.logFile)) {
      await writeFile(this.logFile, '', 'utf-8');
    }
  }

  /**
   * Read all events from the log file
   */
  async readAllEvents(): Promise<EventLogEntry[]> {
    if (!existsSync(this.logFile)) {
      return [];
    }

    try {
      const content = await readFile(this.logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      return lines.map(line => {
        try {
          return JSON.parse(line) as EventLogEntry;
        } catch (error) {
          console.warn(`Failed to parse event line: ${line}`, error);
          return null;
        }
      }).filter((event): event is EventLogEntry => event !== null);
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Read events with filtering
   */
  async readEvents(filter: EventFilter = {}): Promise<EventReplayResult> {
    const allEvents = await this.readAllEvents();
    
    // Apply filters
    let filteredEvents = allEvents;
    
    if (filter.instanceId) {
      filteredEvents = filteredEvents.filter(event => 
        event.payload.instanceId === filter.instanceId
      );
    }
    
    if (filter.workflowId) {
      filteredEvents = filteredEvents.filter(event => 
        event.payload.workflowId === filter.workflowId
      );
    }
    
    if (filter.action) {
      const actions = Array.isArray(filter.action) ? filter.action : [filter.action];
      filteredEvents = filteredEvents.filter(event => 
        actions.includes(event.action)
      );
    }
    
    if (filter.startTime) {
      const startTs = filter.startTime.getTime();
      filteredEvents = filteredEvents.filter(event => event.ts >= startTs);
    }
    
    if (filter.endTime) {
      const endTs = filter.endTime.getTime();
      filteredEvents = filteredEvents.filter(event => event.ts <= endTs);
    }
    
    if (filter.limit && filter.limit > 0) {
      filteredEvents = filteredEvents.slice(0, filter.limit);
    }
    
    return {
      events: filteredEvents,
      totalEvents: allEvents.length,
      filteredEvents: filteredEvents.length,
    };
  }

  /**
   * Read workflow events for a specific instance
   */
  async readWorkflowEvents(instanceId: string): Promise<EventLogEntry[]> {
    const result = await this.readEvents({
      instanceId,
      action: [
        'workflow.started',
        'workflow.state_changed',
        'workflow.gate.started',
        'workflow.gate.completed',
        'workflow.completed',
        'workflow.failed',
        'workflow.paused',
        'workflow.resumed',
      ],
    });
    
    return result.events;
  }

  /**
   * Reconstruct workflow state from events
   */
  async reconstructWorkflowState(instanceId: string): Promise<{
    currentState: string;
    status: string;
    lastEventTime: Date | null;
  }> {
    const events = await this.readWorkflowEvents(instanceId);
    
    if (events.length === 0) {
      return {
        currentState: 'initial',
        status: 'pending',
        lastEventTime: null,
      };
    }
    
    // Sort events by timestamp
    const sortedEvents = events.sort((a, b) => a.ts - b.ts);
    
    let currentState = 'initial';
    let status = 'pending';
    let lastEventTime = new Date(sortedEvents[sortedEvents.length - 1].ts);
    
    // Replay events to reconstruct state
    for (const event of sortedEvents) {
      switch (event.action) {
        case 'workflow.started':
          status = 'running';
          break;
          
        case 'workflow.state_changed':
          if (event.payload.toState) {
            currentState = event.payload.toState as string;
          }
          break;
          
        case 'workflow.completed':
          status = 'completed';
          break;
          
        case 'workflow.failed':
          status = 'failed';
          break;
          
        case 'workflow.paused':
          status = 'paused';
          break;
          
        case 'workflow.resumed':
          status = 'running';
          break;
      }
    }
    
    return {
      currentState,
      status,
      lastEventTime,
    };
  }

  /**
   * Get log file statistics
   */
  async getStats(): Promise<{
    fileSize: number;
    eventCount: number;
    lastModified: Date;
  }> {
    if (!existsSync(this.logFile)) {
      return {
        fileSize: 0,
        eventCount: 0,
        lastModified: new Date(0),
      };
    }
    
    const stats = await stat(this.logFile);
    const content = await readFile(this.logFile, 'utf-8');
    const eventCount = content.trim().split('\n').filter(line => line.trim()).length;
    
    return {
      fileSize: stats.size,
      eventCount,
      lastModified: stats.mtime,
    };
  }

  /**
   * Clear all events (for testing)
   */
  async clearEvents(): Promise<void> {
    await writeFile(this.logFile, '', 'utf-8');
  }

  /**
   * Append an event to the log
   */
  async appendEvent(event: Omit<EventLogEntry, 'eventId' | 'ts' | 'metadata'> & {
    eventId?: string;
    ts?: number;
    metadata?: Partial<EventLogEntry['metadata']>;
  }): Promise<void> {
    const fullEvent: EventLogEntry = {
      eventId: event.eventId || crypto.randomUUID(),
      ts: event.ts || Date.now(),
      projectId: event.projectId,
      action: event.action,
      payload: event.payload,
      metadata: {
        schemaVersion: SCHEMA_VERSION,
        source: 'daemon',
        ...event.metadata,
      },
    };
    
    await appendFile(this.logFile, JSON.stringify(fullEvent) + '\n', 'utf-8');
  }
}

/**
 * Create an EventLogReader with default configuration
 */
export function createEventLogReader(logDir: string): EventLogReader {
  return new EventLogReader(logDir);
}