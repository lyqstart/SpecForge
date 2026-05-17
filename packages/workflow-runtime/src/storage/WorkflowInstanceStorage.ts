/**
 * Workflow Instance Storage Interface
 * Defines the contract for workflow instance persistence
 */

import { WorkflowInstance } from '../types.js';

/**
 * Workflow instance storage interface
 */
export interface WorkflowInstanceStorage {
  /**
   * Save a workflow instance to storage
   * @param instance The workflow instance to save
   */
  saveInstance(instance: WorkflowInstance): Promise<void>;

  /**
   * Load a workflow instance from storage
   * @param id The instance ID to load
   * @returns The loaded instance or null if not found
   */
  loadInstance(id: string): Promise<WorkflowInstance | null>;

  /**
   * Delete a workflow instance from storage
   * @param id The instance ID to delete
   * @returns True if deleted, false if not found
   */
  deleteInstance(id: string): Promise<boolean>;

  /**
   * List all workflow instances in storage
   * @returns Array of all workflow instances
   */
  listInstances(): Promise<WorkflowInstance[]>;

  /**
   * Recover workflow state from storage
   * @param instanceId The instance ID to recover
   * @returns The recovered instance or null if not found
   */
  recoverState(instanceId: string): Promise<WorkflowInstance | null>;

  /**
   * Replay events to recover instance state
   * @param instanceId The instance ID to replay events for
   * @returns Event replay result
   */
  replayEvents(instanceId: string): Promise<{
    instance: WorkflowInstance;
    replayedEvents: number;
  }>;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  storageDir: string;
  enableEventReplay?: boolean;
  eventLogDir?: string;
}

/**
 * Factory function to create workflow instance storage
 * @param config Storage configuration
 * @returns Workflow instance storage implementation
 */
export function createWorkflowInstanceStorage(config: StorageConfig): WorkflowInstanceStorage {
  // Import dynamically to avoid circular dependencies
  const { createWorkflowPersistence } = require('../WorkflowPersistence.js');
  return createWorkflowPersistence(
    config.storageDir,
    config.enableEventReplay ?? true,
    config.eventLogDir
  );
}