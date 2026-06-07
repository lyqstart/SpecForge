/**
 * StateRecoveryManager Module
 * Handles workflow state recovery, consistency validation, and crash recovery scenarios
 */

import { WorkflowPersistence } from './WorkflowPersistence.js';
import { EventLogReader } from './events/EventLogReader.js';
import type { WorkflowInstance, WorkflowDefinition } from './types.js';

// Schema version for recovery (REQ-18)
const SCHEMA_VERSION = '1.0';

/**
 * State recovery options
 */
export interface StateRecoveryOptions {
  validateConsistency: boolean;
  repairInconsistencies: boolean;
  maxRecoveryAttempts: number;
  enableEventReplay: boolean;
}

/**
 * State consistency validation result
 */
export interface ConsistencyValidationResult {
  isValid: boolean;
  inconsistencies: StateInconsistency[];
  recommendations: string[];
}

/**
 * State inconsistency details
 */
export interface StateInconsistency {
  type: 'missing_instance' | 'missing_events' | 'state_mismatch' | 'event_sequence' | 'timestamp_order';
  severity: 'low' | 'medium' | 'high';
  description: string;
  instanceId?: string;
  details?: Record<string, unknown>;
}

/**
 * Crash recovery result
 */
export interface CrashRecoveryResult {
  recoveredInstances: WorkflowInstance[];
  failedRecoveries: Array<{ instanceId: string; error: string }>;
  repairedInconsistencies: StateInconsistency[];
  recoveryTime: number;
}

/**
 * StateRecoveryManager handles workflow state recovery and consistency validation
 */
export class StateRecoveryManager {
  private persistence: WorkflowPersistence;
  private eventLogReader: EventLogReader | null;
  private options: StateRecoveryOptions;

  /**
   * Create a new StateRecoveryManager
   */
  constructor(
    persistence: WorkflowPersistence,
    eventLogReader: EventLogReader | null,
    options: Partial<StateRecoveryOptions> = {}
  ) {
    this.persistence = persistence;
    this.eventLogReader = eventLogReader;
    this.options = {
      validateConsistency: true,
      repairInconsistencies: false,
      maxRecoveryAttempts: 3,
      enableEventReplay: true,
      ...options,
    };
  }

  /**
   * Recover workflow state from storage
   */
  async recoverState(instanceId: string): Promise<WorkflowInstance | null> {
    const startTime = Date.now();
    
    try {
      // Try to load from persistence first
      let instance = await this.persistence.loadInstance(instanceId);
      
      if (!instance && this.eventLogReader) {
        // Try to recover from event log
        instance = await this.recoverFromEventLog(instanceId);
      }
      
      if (!instance) {
        return null;
      }
      
      // Validate consistency if enabled
      if (this.options.validateConsistency) {
        const validation = await this.validateInstanceConsistency(instance);
        
        if (!validation.isValid) {
          console.warn(`State inconsistencies found for instance ${instanceId}:`, validation.inconsistencies);
          
          if (this.options.repairInconsistencies) {
            instance = await this.repairInconsistencies(instance, validation.inconsistencies);
          }
        }
      }
      
      // Replay events if enabled
      if (this.options.enableEventReplay) {
        const replayResult = await this.persistence.replayEvents(instanceId);
        instance = replayResult.instance;
      }
      
      const recoveryTime = Date.now() - startTime;
      console.log(`State recovery completed for ${instanceId} in ${recoveryTime}ms`);
      
      return instance;
    } catch (error) {
      console.error(`Failed to recover state for instance ${instanceId}:`, error);
      return null;
    }
  }

  /**
   * Recover workflow state from event log
   */
  private async recoverFromEventLog(instanceId: string): Promise<WorkflowInstance | null> {
    if (!this.eventLogReader) {
      return null;
    }

    try {
      // Read events for this instance
      const events = await this.eventLogReader.readWorkflowEvents(instanceId);
      
      if (events.length === 0) {
        return null;
      }
      
      // Find workflow ID from events
      const workflowEvent = events.find(e => e.action === 'workflow.started');
      const workflowId = workflowEvent?.payload.workflowId as string || 'unknown';
      
      // Reconstruct state from events
      const reconstructed = await this.eventLogReader.reconstructWorkflowState(instanceId);
      
      // Create a new instance with reconstructed state
      const instance: WorkflowInstance = {
        schema_version: SCHEMA_VERSION,
        id: instanceId,
        workflowId,
        currentState: reconstructed.currentState,
        status: reconstructed.status as any,
        history: events.map(event => ({
          type: event.action,
          instanceId,
          timestamp: new Date(event.ts),
          data: event.payload,
        })),
        createdAt: reconstructed.lastEventTime || new Date(),
        updatedAt: reconstructed.lastEventTime || new Date(),
      };
      
      // Save the recovered instance
      await this.persistence.saveInstance(instance);
      
      return instance;
    } catch (error) {
      console.warn(`Failed to recover instance ${instanceId} from event log:`, error);
      return null;
    }
  }

  /**
   * Validate workflow instance consistency
   */
  async validateInstanceConsistency(instance: WorkflowInstance): Promise<ConsistencyValidationResult> {
    const inconsistencies: StateInconsistency[] = [];
    const recommendations: string[] = [];
    
    // Check 1: Basic instance validation
    if (!instance.id || !instance.workflowId) {
      inconsistencies.push({
        type: 'missing_instance',
        severity: 'high',
        description: 'Instance missing required fields (id or workflowId)',
        instanceId: instance.id,
      });
      recommendations.push('Create a new instance with valid data');
    }
    
    // Check 2: State machine consistency
    if (instance.currentState === 'unknown' || instance.currentState === '') {
      inconsistencies.push({
        type: 'state_mismatch',
        severity: 'medium',
        description: 'Instance has invalid current state',
        instanceId: instance.id,
        details: { currentState: instance.currentState },
      });
      recommendations.push('Reset instance state to initial');
    }
    
    // Check 3: Event sequence validation
    if (instance.history.length > 0) {
      // Check for duplicate events
      const eventIds = new Set<string>();
      const duplicates = instance.history.filter(event => {
        const key = `${event.type}-${event.timestamp.getTime()}`;
        if (eventIds.has(key)) {
          return true;
        }
        eventIds.add(key);
        return false;
      });
      
      if (duplicates.length > 0) {
        inconsistencies.push({
          type: 'event_sequence',
          severity: 'low',
          description: 'Duplicate events found in history',
          instanceId: instance.id,
          details: { duplicateCount: duplicates.length },
        });
        recommendations.push('Remove duplicate events from history');
      }
      
      // Check timestamp order
      for (let i = 1; i < instance.history.length; i++) {
        const prevTime = instance.history[i - 1].timestamp.getTime();
        const currTime = instance.history[i].timestamp.getTime();
        
        if (currTime < prevTime) {
          inconsistencies.push({
            type: 'timestamp_order',
            severity: 'medium',
            description: 'Events are not in chronological order',
            instanceId: instance.id,
            details: { 
              eventIndex: i,
              prevTimestamp: instance.history[i - 1].timestamp,
              currTimestamp: instance.history[i].timestamp,
            },
          });
          recommendations.push('Sort events by timestamp');
          break;
        }
      }
    }
    
    // Check 4: Cross-validation with event log
    if (this.eventLogReader) {
      try {
        const logEvents = await this.eventLogReader.readWorkflowEvents(instance.id);
        
        if (logEvents.length > 0 && instance.history.length === 0) {
          inconsistencies.push({
            type: 'missing_events',
            severity: 'medium',
            description: 'Instance has no history but event log contains events',
            instanceId: instance.id,
            details: { logEventCount: logEvents.length },
          });
          recommendations.push('Replay events from event log to populate history');
        }
      } catch (error) {
        // Event log read failed, but that's not a consistency issue
        console.warn(`Failed to read event log for consistency check:`, error);
      }
    }
    
    return {
      isValid: inconsistencies.length === 0,
      inconsistencies,
      recommendations,
    };
  }

  /**
   * Repair state inconsistencies
   */
  private async repairInconsistencies(
    instance: WorkflowInstance,
    inconsistencies: StateInconsistency[]
  ): Promise<WorkflowInstance> {
    let repairedInstance = { ...instance };
    
    for (const inconsistency of inconsistencies) {
      switch (inconsistency.type) {
        case 'state_mismatch':
          if (repairedInstance.currentState === 'unknown' || repairedInstance.currentState === '') {
            repairedInstance.currentState = 'initial';
            repairedInstance.status = 'pending';
          }
          break;
          
        case 'event_sequence':
          // Remove duplicate events
          const uniqueEvents: typeof instance.history = [];
          const seenKeys = new Set<string>();
          
          for (const event of repairedInstance.history) {
            const key = `${event.type}-${event.timestamp.getTime()}`;
            if (!seenKeys.has(key)) {
              uniqueEvents.push(event);
              seenKeys.add(key);
            }
          }
          
          repairedInstance.history = uniqueEvents;
          break;
          
        case 'timestamp_order':
          // Sort events by timestamp
          repairedInstance.history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          break;
          
        case 'missing_events':
          if (this.eventLogReader) {
            try {
              const logEvents = await this.eventLogReader.readWorkflowEvents(instance.id);
              if (logEvents.length > 0) {
                // Add events from log to history
                const newEvents = logEvents.map(event => ({
                  type: event.action,
                  instanceId: instance.id,
                  timestamp: new Date(event.ts),
                  data: event.payload,
                }));
                
                // Merge and deduplicate
                const allEvents = [...repairedInstance.history, ...newEvents];
                const uniqueEvents = Array.from(
                  new Map(allEvents.map(event => [`${event.type}-${event.timestamp.getTime()}`, event])).values()
                );
                
                repairedInstance.history = uniqueEvents;
              }
            } catch (error) {
              console.warn(`Failed to read events from log for repair:`, error);
            }
          }
          break;
      }
    }
    
    // Update timestamps
    repairedInstance.updatedAt = new Date();
    
    // Save repaired instance
    await this.persistence.saveInstance(repairedInstance);
    
    return repairedInstance;
  }

  /**
   * Perform crash recovery for all instances
   */
  async performCrashRecovery(): Promise<CrashRecoveryResult> {
    const startTime = Date.now();
    const recoveredInstances: WorkflowInstance[] = [];
    const failedRecoveries: Array<{ instanceId: string; error: string }> = [];
    const repairedInconsistencies: StateInconsistency[] = [];
    
    try {
      // List all instances
      const instances = await this.persistence.listInstances();
      
      for (const instance of instances) {
        try {
          // Recover each instance
          const recovered = await this.recoverState(instance.id);
          
          if (recovered) {
            recoveredInstances.push(recovered);
            
            // Validate consistency
            if (this.options.validateConsistency) {
              const validation = await this.validateInstanceConsistency(recovered);
              repairedInconsistencies.push(...validation.inconsistencies);
            }
          }
        } catch (error) {
          failedRecoveries.push({
            instanceId: instance.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      
      // Also check for instances that exist in event log but not in storage
      if (this.eventLogReader) {
        try {
          const allEvents = await this.eventLogReader.readAllEvents();
          const instanceIds = new Set(allEvents.map(e => e.payload.instanceId as string).filter(Boolean));
          
          for (const instanceId of instanceIds) {
            if (!instances.some(i => i.id === instanceId)) {
              try {
                const recovered = await this.recoverFromEventLog(instanceId);
                if (recovered) {
                  recoveredInstances.push(recovered);
                }
              } catch (error) {
                // Skip failed recoveries from event log
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to read event log for crash recovery:`, error);
        }
      }
      
      const recoveryTime = Date.now() - startTime;
      
      return {
        recoveredInstances,
        failedRecoveries,
        repairedInconsistencies,
        recoveryTime,
      };
    } catch (error) {
      console.error(`Crash recovery failed:`, error);
      throw error;
    }
  }

  /**
   * Validate workflow definition consistency
   */
  async validateWorkflowDefinition(
    instance: WorkflowInstance,
    definition: WorkflowDefinition
  ): Promise<ConsistencyValidationResult> {
    const inconsistencies: StateInconsistency[] = [];
    const recommendations: string[] = [];
    
    // Check if instance workflow ID matches definition
    if (instance.workflowId !== definition.id) {
      inconsistencies.push({
        type: 'state_mismatch',
        severity: 'high',
        description: 'Instance workflow ID does not match definition',
        instanceId: instance.id,
        details: {
          instanceWorkflowId: instance.workflowId,
          definitionId: definition.id,
        },
      });
      recommendations.push('Update instance workflow ID or use correct definition');
    }
    
    // Check if current state exists in definition
    if (!definition.stateMachine.states[instance.currentState]) {
      inconsistencies.push({
        type: 'state_mismatch',
        severity: 'high',
        description: 'Instance current state not found in workflow definition',
        instanceId: instance.id,
        details: {
          currentState: instance.currentState,
          definedStates: Object.keys(definition.stateMachine.states),
        },
      });
      recommendations.push('Reset instance to initial state or update workflow definition');
    }
    
    return {
      isValid: inconsistencies.length === 0,
      inconsistencies,
      recommendations,
    };
  }

  /**
   * Create a recovery snapshot
   */
  async createRecoverySnapshot(): Promise<{
    timestamp: Date;
    instanceCount: number;
    inconsistencies: StateInconsistency[];
    snapshotId: string;
  }> {
    const instances = await this.persistence.listInstances();
    const inconsistencies: StateInconsistency[] = [];
    
    // Validate all instances
    for (const instance of instances) {
      const validation = await this.validateInstanceConsistency(instance);
      inconsistencies.push(...validation.inconsistencies);
    }
    
    return {
      timestamp: new Date(),
      instanceCount: instances.length,
      inconsistencies,
      snapshotId: `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
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
    const instances = await this.persistence.listInstances();
    
    let inconsistencyCount = 0;
    for (const instance of instances) {
      const validation = await this.validateInstanceConsistency(instance);
      inconsistencyCount += validation.inconsistencies.length;
    }
    
    return {
      totalInstances: instances.length,
      runningInstances: instances.filter(i => i.status === 'running').length,
      pausedInstances: instances.filter(i => i.status === 'paused').length,
      failedInstances: instances.filter(i => i.status === 'failed').length,
      lastRecoveryTime: instances.length > 0 
        ? new Date(Math.max(...instances.map(i => i.updatedAt.getTime())))
        : null,
      inconsistencyCount,
    };
  }
}

/**
 * Create a StateRecoveryManager with default configuration
 */
export function createStateRecoveryManager(
  persistence: WorkflowPersistence,
  eventLogReader: EventLogReader | null = null,
  options: Partial<StateRecoveryOptions> = {}
): StateRecoveryManager {
  return new StateRecoveryManager(persistence, eventLogReader, options);
}