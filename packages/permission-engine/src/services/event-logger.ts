/**
 * Event Logger Service
 * 
 * Implements event logging for permission decisions as required by
 * Property 10: Permission Decision Traceability
 * 
 * This service writes events to events.jsonl following WAL semantics.
 * 
 * @specforge/permission-engine
 */

import fs from 'fs';
import path from 'path';
import { 
  PermissionEvent, 
  PermissionDecisionEvent,
  PermissionDeniedEvent,
  HardRuleConflictEvent,
  PluginPermissionDeniedEvent,
  BaseEventSchema,
  PermissionDecisionEventPayloadSchema,
  PermissionDeniedEventPayloadSchema,
  HardRuleConflictEventPayloadSchema,
  PluginPermissionDeniedEventPayloadSchema,
  PermissionDecisionEventPayload,
  PermissionDeniedEventPayload,
  HardRuleConflictEventPayload,
  PluginPermissionDeniedEventPayload
} from '../types/events';

export interface EventLoggerConfig {
  enabled?: boolean;
  eventsFilePath?: string;  // Path to events.jsonl file (optional for in-memory logging)
  projectId: string;        // Project identifier for events
  fsyncEnabled?: boolean;   // Whether to fsync after each write (WAL semantics)
  maxFileSize?: number;     // Maximum file size before rotation (in bytes)
}

export class EventLogger {
  private config: EventLoggerConfig;
  private fileHandle: fs.promises.FileHandle | null = null;

  constructor(config: EventLoggerConfig) {
    // Start with defaults
    const defaults = {
      enabled: true,
      fsyncEnabled: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB default
    };

    // Merge config, with config values taking precedence
    this.config = {
      ...defaults,
      ...config
    };

    // Override enabled based on config.enabled if explicitly provided
    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
    }

    if (!this.config.projectId) {
      throw new Error('Project ID is required for event logging');
    }
  }

  /**
   * Initialize the event logger
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled || !this.config.eventsFilePath) {
      return;
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.eventsFilePath);
      await fs.promises.mkdir(dir, { recursive: true });

      // Open file for appending
      this.fileHandle = await fs.promises.open(this.config.eventsFilePath, 'a');
      
      // Write initialization event
      await this.logSystemEvent('event_logger.initialized', {
        timestamp: new Date().toISOString(),
        config: {
          enabled: this.config.enabled,
          fsyncEnabled: this.config.fsyncEnabled,
          maxFileSize: this.config.maxFileSize
        }
      });
    } catch (error) {
      console.error('Failed to initialize event logger:', error);
      // Continue without event logging if initialization fails
      this.config.enabled = false;
    }
  }

  /**
   * Log a permission decision event
   */
  async logPermissionDecision(payload: PermissionDecisionEventPayload): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Validate payload
      const validatedPayload = PermissionDecisionEventPayloadSchema.parse(payload);
      
      const event: PermissionDecisionEvent = {
        eventId: this.generateEventId(),
        ts: Date.now(),
        projectId: this.config.projectId,
        action: 'permission.evaluated',
        payload: validatedPayload
      };

      await this.writeEvent(event);
    } catch (error) {
      console.error('Failed to log permission decision event:', error);
    }
  }

  /**
   * Log a permission denied event (authentication/authorization failure)
   */
  async logPermissionDenied(payload: PermissionDeniedEventPayload): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const validatedPayload = PermissionDeniedEventPayloadSchema.parse(payload);
      
      const event: PermissionDeniedEvent = {
        eventId: this.generateEventId(),
        ts: Date.now(),
        projectId: this.config.projectId,
        action: 'permission.denied',
        payload: validatedPayload
      };

      await this.writeEvent(event);
    } catch (error) {
      console.error('Failed to log permission denied event:', error);
    }
  }

  /**
   * Log a hard rule conflict event
   */
  async logHardRuleConflict(payload: HardRuleConflictEventPayload): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const validatedPayload = HardRuleConflictEventPayloadSchema.parse(payload);
      
      const event: HardRuleConflictEvent = {
        eventId: this.generateEventId(),
        ts: Date.now(),
        projectId: this.config.projectId,
        action: 'config.hard_rule_conflict',
        payload: validatedPayload
      };

      await this.writeEvent(event);
    } catch (error) {
      console.error('Failed to log hard rule conflict event:', error);
    }
  }

  /**
   * Log a plugin permission denied event
   */
  async logPluginPermissionDenied(payload: PluginPermissionDeniedEventPayload): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const validatedPayload = PluginPermissionDeniedEventPayloadSchema.parse(payload);
      
      const event: PluginPermissionDeniedEvent = {
        eventId: this.generateEventId(),
        ts: Date.now(),
        projectId: this.config.projectId,
        action: 'plugin.load_denied',
        payload: validatedPayload
      };

      await this.writeEvent(event);
    } catch (error) {
      console.error('Failed to log plugin permission denied event:', error);
    }
  }

  /**
   * Log a system event (for internal logging)
   */
  private async logSystemEvent(action: string, payload: Record<string, any>): Promise<void> {
    if (!this.config.enabled || !this.fileHandle) {
      return;
    }

    const event = {
      eventId: this.generateEventId(),
      ts: Date.now(),
      projectId: this.config.projectId,
      action,
      payload
    };

    await this.writeEvent(event);
  }

  /**
   * Write an event to the events.jsonl file
   */
  private async writeEvent(event: PermissionEvent | any): Promise<void> {
    if (!this.config.enabled || !this.fileHandle) {
      return;
    }

    try {
      // Validate event structure
      BaseEventSchema.parse(event);

      // Convert to JSONL format (one JSON object per line)
      const eventLine = JSON.stringify(event) + '\n';
      
      // Write to file
      await this.fileHandle.write(eventLine);
      
      // fsync for WAL semantics (Property 7: WAL Ordering)
      if (this.config.fsyncEnabled) {
        await this.fileHandle.sync();
      }

      // Check file size and rotate if needed
      await this.checkAndRotateFile();
    } catch (error) {
      console.error('Failed to write event:', error);
      // Don't throw - event logging failures shouldn't break the application
    }
  }

  /**
   * Check file size and rotate if necessary
   */
  private async checkAndRotateFile(): Promise<void> {
    if (!this.fileHandle || !this.config.maxFileSize) {
      return;
    }

    try {
      const stats = await this.fileHandle.stat();
      if (stats.size > this.config.maxFileSize) {
        await this.rotateFile();
      }
    } catch (error) {
      console.error('Failed to check file size:', error);
    }
  }

  /**
   * Rotate the events file
   */
  private async rotateFile(): Promise<void> {
    if (!this.fileHandle || !this.config.eventsFilePath) {
      return;
    }

    try {
      // Close current file
      await this.fileHandle.close();
      
      // Create backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${this.config.eventsFilePath}.${timestamp}.bak`;
      
      // Rename current file to backup
      await fs.promises.rename(this.config.eventsFilePath, backupPath);
      
      // Reopen file for appending (creates new file)
      this.fileHandle = await fs.promises.open(this.config.eventsFilePath, 'a');
      
      // Log rotation event
      await this.logSystemEvent('event_logger.file_rotated', {
        timestamp: new Date().toISOString(),
        backupPath,
        maxFileSize: this.config.maxFileSize
      });
    } catch (error) {
      console.error('Failed to rotate event log file:', error);
      // Try to reopen the file even if rotation fails
      try {
        this.fileHandle = await fs.promises.open(this.config.eventsFilePath!, 'a');
      } catch (reopenError) {
        console.error('Failed to reopen event log file:', reopenError);
        this.config.enabled = false;
      }
    }
  }

  /**
   * Generate a unique event ID (UUIDv7 style)
   */
  private generateEventId(): string {
    // Use crypto.randomUUID if available (Node.js 15+)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    
    // Fallback for environments without crypto.randomUUID
    // This is a simplified version - in production, use a proper UUIDv7 library
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp.toString(16)}-${random}`;
  }

  /**
   * Get current configuration
   */
  getConfig(): EventLoggerConfig {
    return { ...this.config };
  }

  /**
   * Check if event logging is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled === true;
  }

  /**
   * Disable event logging
   */
  disable(): void {
    this.config.enabled = false;
  }

  /**
   * Enable event logging
   */
  enable(): void {
    this.config.enabled = true;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.fileHandle) {
      try {
        await this.fileHandle.close();
      } catch (error) {
        console.error('Failed to close event log file:', error);
      }
      this.fileHandle = null;
    }
  }

  /**
   * Get mock event logger for testing or when file logging is not available
   */
  static createMockLogger(projectId: string): EventLogger {
    const config: any = {
      enabled: false,
      projectId
    };
    // Don't set eventsFilePath when disabled
    return new EventLogger(config);
  }

  /**
   * Create an in-memory event logger for testing
   */
  static createInMemoryLogger(projectId: string): {
    logger: EventLogger;
    getEvents: () => PermissionEvent[];
    clearEvents: () => void;
  } {
    const events: PermissionEvent[] = [];
    
    const mockFileHandle = {
      write: async (data: string) => {
        // Parse the JSONL line and add to events array
        const event = JSON.parse(data.trim());
        events.push(event);
        return { bytesWritten: data.length };
      },
      sync: async () => {},
      stat: async () => ({ size: 0 }),
      close: async () => {}
    } as any;

    const logger = new EventLogger({
      enabled: true,
      projectId,
      eventsFilePath: ':memory:'
    });

    // Override fileHandle with mock
    (logger as any).fileHandle = mockFileHandle;

    return {
      logger,
      getEvents: () => [...events],
      clearEvents: () => events.length = 0
    };
  }
}