/**
 * WorkflowPersistence Module
 * Handles workflow instance storage, state recovery, and event replay
 */

import { readFile, writeFile, unlink, readdir, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { WorkflowInstance } from './types.js';
import { EventLogReader, createEventLogReader } from './events/EventLogReader.js';
import type { WorkflowInstanceStorage, StorageConfig } from './storage/WorkflowInstanceStorage.js';
import { createStateRecoveryManager, type StateRecoveryManager } from './StateRecoveryManager.js';
import { DELETABLE_STATES } from '@specforge/types/constants';

// Schema version for persistence (REQ-18)
const SCHEMA_VERSION = '1.0';

/**
 * Persistence configuration
 */
export interface PersistenceConfig extends StorageConfig {
  storageDir: string;
  eventLogDir?: string;
  enableEventReplay?: boolean;
}

/**
 * Workflow instance stored in persistence layer
 */
export interface StoredWorkflowInstance {
  instance: WorkflowInstance;
  schemaVersion: string;
  lastEventIndex: number;
}

/**
 * Event replay result
 */
export interface EventReplayResult {
  instance: WorkflowInstance;
  replayedEvents: number;
}

/**
 * WorkflowPersistence handles storing and retrieving workflow instances
 */
export class WorkflowPersistence implements WorkflowInstanceStorage {
  private storageDir: string;
  private eventLogDir: string;
  private enableEventReplay: boolean;
  private instancesCache: Map<string, StoredWorkflowInstance> = new Map();
  private eventLogReader: EventLogReader | null = null;

  /**
   * Create a new WorkflowPersistence instance
   */
  constructor(config: PersistenceConfig) {
    this.storageDir = config.storageDir;
    this.eventLogDir = config.eventLogDir || config.storageDir;
    this.enableEventReplay = config.enableEventReplay ?? true;
    
    if (this.enableEventReplay) {
      this.eventLogReader = createEventLogReader(this.eventLogDir);
    }
  }

  /**
   * Initialize storage directory
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.storageDir)) {
      await mkdir(this.storageDir, { recursive: true });
    }
    
    if (this.eventLogReader) {
      await this.eventLogReader.initialize();
    }
  }

  /**
   * Save a workflow instance to storage
   */
  async saveInstance(instance: WorkflowInstance): Promise<void> {
    const storedInstance: StoredWorkflowInstance = {
      instance: {
        ...instance,
        createdAt: instance.createdAt instanceof Date ? instance.createdAt : new Date(instance.createdAt),
        updatedAt: instance.updatedAt instanceof Date ? instance.updatedAt : new Date(instance.updatedAt),
      },
      schemaVersion: SCHEMA_VERSION,
      lastEventIndex: instance.history.length - 1,
    };

    const filePath = this.getInstanceFilePath(instance.id);
    await writeFile(filePath, JSON.stringify(storedInstance, null, 2), 'utf-8');
    
    // Update cache
    this.instancesCache.set(instance.id, storedInstance);
  }

  /**
   * Load a workflow instance from storage
   */
  async loadInstance(id: string): Promise<WorkflowInstance | null> {
    // Check cache first
    const cached = this.instancesCache.get(id);
    if (cached) {
      return this.reconstructInstance(cached);
    }

    const filePath = this.getInstanceFilePath(id);
    
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const stored: StoredWorkflowInstance = JSON.parse(content);
      
      // Validate schema version
      if (!stored.schemaVersion) {
        throw new Error(`Invalid stored instance: missing schemaVersion`);
      }

      // Cache the raw data
      this.instancesCache.set(id, stored);
      
      return this.reconstructInstance(stored);
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a workflow instance from storage.
   *
   * v1.1 (P3): Guarded by DELETABLE_STATES. Only terminal/initial states
   * are deletable. Use `{ force: true }` to bypass (tests/admin only).
   */
  async deleteInstance(id: string, options?: { force?: boolean }): Promise<boolean> {
    // ── State guard: check if instance is in a deletable state ──
    if (!options?.force) {
      const instance = await this.loadInstance(id);
      if (instance && !DELETABLE_STATES.has(instance.currentState)) {
        throw new Error(
          `Cannot delete instance '${id}' in state '${instance.currentState}' — ` +
          `only deletable states are allowed: ${Array.from(DELETABLE_STATES).join(', ')}. ` +
          `Use { force: true } to override.`,
        );
      }
    }

    const filePath = this.getInstanceFilePath(id);
    
    if (!existsSync(filePath)) {
      return false;
    }

    await unlink(filePath);
    this.instancesCache.delete(id);
    return true;
  }

  /**
   * List all workflow instances
   */
  async listInstances(): Promise<WorkflowInstance[]> {
    const instances: WorkflowInstance[] = [];
    
    if (!existsSync(this.storageDir)) {
      return instances;
    }

    const files = await readdir(this.storageDir);
    
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      try {
        const filePath = join(this.storageDir, file);
        const content = await readFile(filePath, 'utf-8');
        const stored: StoredWorkflowInstance = JSON.parse(content);
        
        instances.push(this.reconstructInstance(stored));
      } catch (error) {
        // Skip corrupted files
        console.warn(`Failed to load instance from ${file}:`, error);
      }
    }

    return instances;
  }

  /**
   * Reconstruct instance from stored data
   */
  private reconstructInstance(stored: StoredWorkflowInstance): WorkflowInstance {
    return {
      ...stored.instance,
      createdAt: new Date(stored.instance.createdAt),
      updatedAt: new Date(stored.instance.updatedAt),
      history: stored.instance.history.map(event => ({
        ...event,
        timestamp: new Date(event.timestamp),
      })),
    };
  }

  /**
   * Recover workflow state from storage
   */
  async recoverState(instanceId: string): Promise<WorkflowInstance | null> {
    const instance = await this.loadInstance(instanceId);
    
    if (!instance) {
      return null;
    }

    // Validate recovered state
    if (!instance.id || !instance.workflowId) {
      throw new Error(`Invalid recovered instance: ${instanceId}`);
    }

    return instance;
  }

  /**
   * Recover workflow state from event log (when instance file is missing)
   */
  async recoverFromEventLog(instanceId: string, workflowId: string): Promise<WorkflowInstance | null> {
    if (!this.eventLogReader) {
      return null;
    }

    try {
      // Reconstruct state from event log
      const reconstructed = await this.eventLogReader.reconstructWorkflowState(instanceId);
      
      if (!reconstructed.lastEventTime) {
        // No events found for this instance
        return null;
      }

      // Create a new instance with reconstructed state
      const instance: WorkflowInstance = {
        schema_version: '1.0',
        id: instanceId,
        workflowId,
        currentState: reconstructed.currentState,
        status: reconstructed.status as any,
        history: [], // History will be populated from event log on replay
        createdAt: reconstructed.lastEventTime,
        updatedAt: reconstructed.lastEventTime,
      };

      return instance;
    } catch (error) {
      console.warn(`Failed to recover instance ${instanceId} from event log:`, error);
      return null;
    }
  }

  /**
   * Replay events to recover instance state
   */
  async replayEvents(instanceId: string): Promise<EventReplayResult> {
    const instance = await this.loadInstance(instanceId);
    
    if (!instance) {
      throw new Error(`Instance not found for replay: ${instanceId}`);
    }

    if (!this.enableEventReplay || !this.eventLogReader) {
      return { instance, replayedEvents: 0 };
    }

    // Try to read events from event log first
    let replayedCount = 0;
    let reconstructedFromLog = false;
    
    try {
      // Read workflow events from event log
      const logEvents = await this.eventLogReader.readWorkflowEvents(instanceId);
      
      if (logEvents.length > 0) {
        // Reconstruct state from event log
        const reconstructed = await this.eventLogReader.reconstructWorkflowState(instanceId);
        
        // Update instance with reconstructed state
        instance.currentState = reconstructed.currentState;
        instance.status = reconstructed.status as any;
        instance.updatedAt = reconstructed.lastEventTime || instance.updatedAt;
        
        replayedCount = logEvents.length;
        reconstructedFromLog = true;
      }
    } catch (error) {
      console.warn(`Failed to read events from log for instance ${instanceId}:`, error);
      // Fall back to instance history
    }

    // If no events in log or log read failed, fall back to instance history
    if (!reconstructedFromLog && instance.history.length > 0) {
      // Reconstruct state by replaying events from instance history
      let currentState = instance.history[0];
      replayedCount = 0;

      for (let i = 1; i < instance.history.length; i++) {
        const event = instance.history[i];
        
        // Apply event to reconstruct state
        if (event.type === 'workflow.state_changed' && event.data) {
          currentState = event;
        }
        
        replayedCount++;
      }

      // Update instance with replayed state
      if (currentState && currentState.data) {
        instance.currentState = (currentState.data as any).to || instance.currentState;
      }
    }

    return {
      instance,
      replayedEvents: replayedCount,
    };
  }

  /**
   * Get instance file path
   */
  private getInstanceFilePath(instanceId: string): string {
    return join(this.storageDir, `${instanceId}.json`);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.instancesCache.clear();
  }

  /**
   * Get cache size (for testing)
   */
  getCacheSize(): number {
    return this.instancesCache.size;
  }
}

/**
 * Create a WorkflowPersistence instance with default configuration
 */
export function createWorkflowPersistence(
  storageDir: string,
  enableEventReplay: boolean = true,
  eventLogDir?: string
): WorkflowInstanceStorage {
  const config: PersistenceConfig = {
    storageDir,
    enableEventReplay,
  };
  
  if (eventLogDir !== undefined) {
    config.eventLogDir = eventLogDir;
  }
  
  return new WorkflowPersistence(config);
}

/**
 * Enhanced WorkflowPersistence with StateRecoveryManager integration
 */
export class EnhancedWorkflowPersistence extends WorkflowPersistence {
  private recoveryManager: StateRecoveryManager;

  /**
   * Create a new EnhancedWorkflowPersistence instance
   */
  constructor(config: PersistenceConfig) {
    super(config);
    
    // Create recovery manager
    this.recoveryManager = createStateRecoveryManager(
      this,
      (this as any).eventLogReader,
      {
        validateConsistency: true,
        repairInconsistencies: false,
        maxRecoveryAttempts: 3,
        enableEventReplay: config.enableEventReplay ?? true,
      }
    );
  }

  /**
   * Enhanced state recovery with consistency validation
   */
  override async recoverState(instanceId: string): Promise<WorkflowInstance | null> {
    return this.recoveryManager.recoverState(instanceId);
  }

  /**
   * Perform crash recovery for all instances
   */
  async performCrashRecovery(): Promise<{
    recoveredInstances: WorkflowInstance[];
    failedRecoveries: Array<{ instanceId: string; error: string }>;
    repairedInconsistencies: import('./StateRecoveryManager.js').StateInconsistency[];
    recoveryTime: number;
  }> {
    return this.recoveryManager.performCrashRecovery();
  }

  /**
   * Validate instance consistency
   */
  async validateInstanceConsistency(instance: WorkflowInstance): Promise<{
    isValid: boolean;
    inconsistencies: import('./StateRecoveryManager.js').StateInconsistency[];
    recommendations: string[];
  }> {
    return this.recoveryManager.validateInstanceConsistency(instance);
  }

  /**
   * Create a recovery snapshot
   */
  async createRecoverySnapshot(): Promise<{
    timestamp: Date;
    instanceCount: number;
    inconsistencies: import('./StateRecoveryManager.js').StateInconsistency[];
    snapshotId: string;
  }> {
    return this.recoveryManager.createRecoverySnapshot();
  }

  /**
   * Get recovery statistics
   */
  async getRecoveryStats(): Promise<{
    totalInstances: number;
    runningInstances: number;
    pausedInstances: number;
    failedInstances: number;
    lastRecoveryTime: Date | null;
    inconsistencyCount: number;
  }> {
    return this.recoveryManager.getRecoveryStats();
  }
}

/**
 * Create an EnhancedWorkflowPersistence instance with state recovery capabilities
 */
export function createEnhancedWorkflowPersistence(
  storageDir: string,
  enableEventReplay: boolean = true,
  eventLogDir?: string
): EnhancedWorkflowPersistence {
  const config: PersistenceConfig = {
    storageDir,
    enableEventReplay,
  };
  
  if (eventLogDir !== undefined) {
    config.eventLogDir = eventLogDir;
  }
  
  return new EnhancedWorkflowPersistence(config);
}