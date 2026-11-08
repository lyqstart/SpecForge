/**
 * EventPublisher Module
 * Publishes workflow events to the Event Bus
 */

import { v4 as uuidv4 } from 'uuid';
import {
  WorkflowInstance,
  GateResult,
  IEventBus,
  Event,
} from '../types.js';

// Schema version for events (REQ-18)
const SCHEMA_VERSION = '1.0';

/**
 * EventPublisher configuration
 */
export interface EventPublisherConfig {
  projectId: string;
  eventBus: IEventBus;
  source?: 'daemon' | 'client' | 'adapter';
}

/**
 * Publishes workflow events to the Event Bus
 * Supports workflow lifecycle events and gate execution events
 */
export class EventPublisher {
  private config: EventPublisherConfig;

  /**
   * Create a new EventPublisher
   */
  constructor(config: EventPublisherConfig) {
    this.config = {
      source: 'daemon',
      ...config,
    };
  }

  /**
   * Publish a workflow started event
   */
  publishWorkflowStarted(instance: WorkflowInstance, currentState: string): void {
    this.publish({
      action: 'workflow.started',
      payload: {
        instanceId: instance.id,
        workflowId: instance.workflowId,
        currentState,
        status: instance.status,
      },
    });
  }

  /**
   * Publish a workflow paused event
   */
  publishWorkflowPaused(instance: WorkflowInstance, reason?: string): void {
    this.publish({
      action: 'workflow.paused',
      payload: {
        instanceId: instance.id,
        workflowId: instance.workflowId,
        currentState: instance.currentState,
        reason,
      },
    });
  }

  /**
   * Publish a workflow resumed event
   */
  publishWorkflowResumed(instance: WorkflowInstance): void {
    this.publish({
      action: 'workflow.resumed',
      payload: {
        instanceId: instance.id,
        workflowId: instance.workflowId,
        currentState: instance.currentState,
      },
    });
  }

  /**
   * Publish a workflow completed event
   */
  publishWorkflowCompleted(instance: WorkflowInstance, finalState: string): void {
    this.publish({
      action: 'workflow.completed',
      payload: {
        instanceId: instance.id,
        workflowId: instance.workflowId,
        finalState,
        historyLength: instance.history.length,
      },
    });
  }

  /**
   * Publish a workflow failed event
   */
  publishWorkflowFailed(instance: WorkflowInstance, error: string): void {
    this.publish({
      action: 'workflow.failed',
      payload: {
        instanceId: instance.id,
        workflowId: instance.workflowId,
        currentState: instance.currentState,
        error,
      },
    });
  }

  /**
   * Publish a gate execution started event
   */
  publishGateStarted(
    instance: WorkflowInstance,
    state: string,
    gateId: string,
    gateType: 'simple' | 'composite'
  ): void {
    this.publish({
      action: 'workflow.gate.started',
      payload: {
        instanceId: instance.id,
        workflowId: instance.workflowId,
        state,
        gateId,
        gateType,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Publish a gate execution completed event
   */
  publishGateCompleted(
    instance: WorkflowInstance,
    state: string,
    gateId: string,
    gateType: 'simple' | 'composite',
    result: GateResult
  ): void {
    this.publish({
      action: 'workflow.gate.completed',
      payload: {
        instanceId: instance.id,
        workflowId: instance.workflowId,
        state,
        gateId,
        gateType,
        passed: result.passed,
        reason: result.reason,
        details: result.details,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Publish a gate execution failed event
   */
  publishGateFailed(
    instance: WorkflowInstance,
    state: string,
    gateId: string,
    gateType: 'simple' | 'composite',
    error: string
  ): void {
    this.publish({
      action: 'workflow.gate.failed',
      payload: {
        instanceId: instance.id,
        workflowId: instance.workflowId,
        state,
        gateId,
        gateType,
        error,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Publish a state changed event
   */
  publishStateChanged(
    instance: WorkflowInstance,
    fromState: string,
    toState: string,
    gatePassed: boolean
  ): void {
    this.publish({
      action: 'workflow.state_changed',
      payload: {
        instanceId: instance.id,
        workflowId: instance.workflowId,
        fromState,
        toState,
        gatePassed,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Publish a gate cancellation event
   */
  publishGateCancelled(
    instance: WorkflowInstance,
    state: string,
    gateId: string,
    gateType: 'simple' | 'composite',
    reason: string,
    childGateIds?: string[]
  ): void {
    this.publish({
      action: 'workflow.gate.cancelled',
      payload: {
        instanceId: instance.id,
        workflowId: instance.workflowId,
        state,
        gateId,
        gateType,
        cancelledAt: new Date().toISOString(),
        reason,
        childGateIds,
      },
    });
  }

  /**
   * Publish an event to the Event Bus
   */
  private publish(params: {
    action: string;
    payload: Record<string, unknown>;
  }): void {
    const event: Event = {
      eventId: uuidv4(),
      ts: Date.now(),
      projectId: this.config.projectId,
      action: params.action,
      payload: params.payload,
      metadata: {
        schemaVersion: SCHEMA_VERSION,
        source: this.config.source ?? 'daemon',
      },
    };

    this.config.eventBus.publish(event);
  }

  /**
   * Get the Event Bus instance
   */
  getEventBus(): IEventBus {
    return this.config.eventBus;
  }

  /**
   * Get the project ID
   */
  getProjectId(): string {
    return this.config.projectId;
  }
}

/**
 * Create an EventPublisher from an existing EventBus instance
 */
export function createEventPublisher(
  eventBus: IEventBus,
  projectId: string,
  source: 'daemon' | 'client' | 'adapter' = 'daemon'
): EventPublisher {
  return new EventPublisher({
    projectId,
    eventBus,
    source,
  });
}

// Re-export types for convenience
export type {
  WorkflowLifecycleEventType,
  GateEventType,
  WorkflowEventType,
  WorkflowLifecyclePayload,
  GateEventPayload,
  GateCancellationPayload,
} from './EventTypes.js';