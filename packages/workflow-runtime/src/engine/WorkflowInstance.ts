/**
 * Workflow Instance Creation and Management
 * Handles workflow instance creation, state initialization, and ID tracking
 */

import { v4 as uuidv4 } from 'uuid';
import type { WorkflowInstance, WorkflowInstanceStatus, WorkflowEventData } from '../types.js';

/**
 * Options for creating a workflow instance
 */
export interface CreateInstanceOptions {
  workflowId: string;
  initialState: string;
  initialStatus?: WorkflowInstanceStatus;
  metadata?: Record<string, unknown>;
}

/**
 * v1.1: States that MUST NOT be set via direct mutation.
 * These states require evidence enforcement through transitionFull().
 */
const CRITICAL_INSTANCE_STATES = new Set([
  'approval_required', 'merge_ready', 'merging', 'post_merge_verified',
  'implementation_ready', 'verification_done', 'closed',
]);

/**
 * Workflow Instance Factory
 * Responsible for creating and managing workflow instances
 */
export class WorkflowInstanceFactory {
  /**
   * Create a new workflow instance
   * @param options Configuration for instance creation
   * @returns A new WorkflowInstance with initialized state
   */
  static create(options: CreateInstanceOptions): WorkflowInstance {
    const now = new Date();

    const instance: WorkflowInstance = {
      schema_version: '1.0',
      id: uuidv4(),
      workflowId: options.workflowId,
      currentState: options.initialState,
      status: options.initialStatus ?? 'pending',
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    return instance;
  }

  /**
   * Create a workflow instance with initial event
   * @param options Configuration for instance creation
   * @param initialEvent Optional initial event to add to history
   * @returns A new WorkflowInstance with initial event in history
   */
  static createWithInitialEvent(
    options: CreateInstanceOptions,
    initialEvent?: WorkflowEventData
  ): WorkflowInstance {
    const instance = this.create(options);

    if (initialEvent) {
      instance.history.push(initialEvent);
    }

    return instance;
  }

  /**
   * Validate a workflow instance
   * @param instance The instance to validate
   * @returns true if instance is valid, false otherwise
   */
  static validate(instance: WorkflowInstance): boolean {
    // Check required fields
    if (!instance.id || typeof instance.id !== 'string') {
      return false;
    }

    if (!instance.workflowId || typeof instance.workflowId !== 'string') {
      return false;
    }

    if (!instance.currentState || typeof instance.currentState !== 'string') {
      return false;
    }

    if (!instance.status || !this.isValidStatus(instance.status)) {
      return false;
    }

    if (!Array.isArray(instance.history)) {
      return false;
    }

    if (!(instance.createdAt instanceof Date)) {
      return false;
    }

    if (!(instance.updatedAt instanceof Date)) {
      return false;
    }

    if (instance.schema_version !== '1.0') {
      return false;
    }

    return true;
  }

  /**
   * Check if a status is valid
   */
  private static isValidStatus(status: unknown): status is WorkflowInstanceStatus {
    const validStatuses: WorkflowInstanceStatus[] = ['pending', 'running', 'paused', 'completed', 'failed'];
    return validStatuses.includes(status as WorkflowInstanceStatus);
  }
}

/**
 * Workflow Instance Tracker
 * Tracks created instances for cleanup and monitoring
 */
export class WorkflowInstanceTracker {
  private instances: Map<string, WorkflowInstance> = new Map();
  private createdAt: Map<string, Date> = new Map();

  /**
   * Register a workflow instance
   */
  register(instance: WorkflowInstance): void {
    this.instances.set(instance.id, instance);
    this.createdAt.set(instance.id, new Date());
  }

  /**
   * Get a tracked instance by ID
   */
  get(instanceId: string): WorkflowInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Get all tracked instances
   */
  getAll(): WorkflowInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get all instances for a specific workflow
   */
  getByWorkflowId(workflowId: string): WorkflowInstance[] {
    return Array.from(this.instances.values()).filter(i => i.workflowId === workflowId);
  }

  /**
   * Get all instances with a specific status
   */
  getByStatus(status: WorkflowInstanceStatus): WorkflowInstance[] {
    return Array.from(this.instances.values()).filter(i => i.status === status);
  }

  /**
   * Unregister an instance
   */
  unregister(instanceId: string): boolean {
    const removed = this.instances.delete(instanceId);
    this.createdAt.delete(instanceId);
    return removed;
  }

  /**
   * Clear all tracked instances
   */
  clear(): void {
    this.instances.clear();
    this.createdAt.clear();
  }

  /**
   * Get the number of tracked instances
   */
  size(): number {
    return this.instances.size;
  }

  /**
   * Check if an instance is tracked
   */
  has(instanceId: string): boolean {
    return this.instances.has(instanceId);
  }

  /**
   * Update a tracked instance
   */
  update(instance: WorkflowInstance): void {
    if (this.instances.has(instance.id)) {
      this.instances.set(instance.id, instance);
    }
  }

  /**
   * Get creation time of an instance
   */
  getCreatedAt(instanceId: string): Date | undefined {
    return this.createdAt.get(instanceId);
  }

  /**
   * Get instances created within a time range
   */
  getCreatedBetween(startTime: Date, endTime: Date): WorkflowInstance[] {
    return Array.from(this.instances.entries())
      .filter(([id]) => {
        const created = this.createdAt.get(id);
        return created && created >= startTime && created <= endTime;
      })
      .map(([, instance]) => instance);
  }
}

/**
 * Workflow Instance State Manager
 * Manages state transitions and history tracking
 */
export class WorkflowInstanceStateManager {
  /**
   * Add an event to instance history
   */
  static addEvent(instance: WorkflowInstance, event: WorkflowEventData): void {
    instance.history.push(event);
    instance.updatedAt = new Date();
  }

  /**
   * Transition instance to a new state.
   *
   * @deprecated v1.1: TEST SCAFFOLDING ONLY for non-critical states.
   * Critical states (CRITICAL_INSTANCE_STATES) are hard-blocked — use
   * WorkflowEngine.transitionFull() instead.
   */
  static transitionState(
    instance: WorkflowInstance,
    newState: string,
    event?: WorkflowEventData
  ): void {
    // v1.1: Block direct mutation of critical states
    if (CRITICAL_INSTANCE_STATES.has(newState)) {
      throw new Error(
        `Cannot directly set state to '${newState}' via transitionState() — ` +
        `use WorkflowEngine.transitionFull() with evidence enforcement`
      );
    }

    void instance.currentState;
    instance.currentState = newState;
    instance.updatedAt = new Date();

    if (event) {
      this.addEvent(instance, event);
    }
  }

  /**
   * Update instance status
   */
  static updateStatus(
    instance: WorkflowInstance,
    newStatus: WorkflowInstanceStatus,
    event?: WorkflowEventData
  ): void {
    instance.status = newStatus;
    instance.updatedAt = new Date();

    if (event) {
      this.addEvent(instance, event);
    }
  }

  /**
   * Get instance history for a specific event type
   */
  static getEventsByType(instance: WorkflowInstance, eventType: string): WorkflowEventData[] {
    return instance.history.filter(e => e.type === eventType);
  }

  /**
   * Get the last event in history
   */
  static getLastEvent(instance: WorkflowInstance): WorkflowEventData | undefined {
    return instance.history[instance.history.length - 1];
  }

  /**
   * Get instance history within a time range
   */
  static getEventsBetween(
    instance: WorkflowInstance,
    startTime: Date,
    endTime: Date
  ): WorkflowEventData[] {
    return instance.history.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  /**
   * Clear instance history.
   *
   * @unsafe This method destroys the audit trail for a workflow instance.
   *   Production code MUST NOT call this method — it is only for test
   *   scaffolding or explicit admin maintenance scenarios where history
   *   reset is intentional. History is the authoritative record of all
   *   state transitions, gate results, and evidence checks.
   */
  static clearHistory(instance: WorkflowInstance): void {
    instance.history = [];
    instance.updatedAt = new Date();
  }

  /**
   * Get instance state summary
   */
  static getSummary(instance: WorkflowInstance): {
    id: string;
    workflowId: string;
    currentState: string;
    status: WorkflowInstanceStatus;
    eventCount: number;
    createdAt: Date;
    updatedAt: Date;
    duration: number;
  } {
    const duration = instance.updatedAt.getTime() - instance.createdAt.getTime();

    return {
      id: instance.id,
      workflowId: instance.workflowId,
      currentState: instance.currentState,
      status: instance.status,
      eventCount: instance.history.length,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
      duration,
    };
  }
}
