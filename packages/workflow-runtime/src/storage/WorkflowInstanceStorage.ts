/**
 * Workflow Instance Storage Interface
 * Defines the contract for workflow instance persistence
 */

import { WorkflowInstance } from '../types.js';
import { createWorkflowPersistence } from '../WorkflowPersistence.js';

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
   * Delete a workflow instance from storage.
   *
   * v1.1 (P3): Deletion is guarded by DELETABLE_STATES. Only instances in
   * terminal or initial states (created, intake_ready, closed, rejected,
   * superseded, blocked, gates_failed) may be deleted. Attempting to delete
   * an instance in a running or intermediate state will throw.
   *
   * Use `{ force: true }` to bypass the state guard (for tests or admin tools).
   *
   * @param id The instance ID to delete
   * @param options Optional: `{ force: true }` to bypass state check
   * @returns True if deleted, false if not found
   * @throws Error if instance is in a non-deletable state and force is not set
   */
  deleteInstance(id: string, options?: { force?: boolean }): Promise<boolean>;

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
  return createWorkflowPersistence(
    config.storageDir,
    config.enableEventReplay ?? true,
    config.eventLogDir
  );
}