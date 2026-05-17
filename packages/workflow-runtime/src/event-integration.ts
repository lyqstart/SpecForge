/**
 * Event Bus Integration Module
 * Provides utilities for integrating workflow runtime with daemon-core Event Bus
 * 
 * Feature: Workflow Event System Integration
 * Property 6: Event Ordering - For all workflow instances w, events must be ordered by time
 * Validates: Requirements 4.1, 4.2, 4.3
 */

import { EventBus } from '@specforge/daemon-core/src/event-bus/EventBus';
import { EventPublisher, createEventPublisher } from './events/EventPublisher.js';
import { WorkflowEngine } from './WorkflowEngine.js';
import type { IEventBus } from './types.js';

/**
 * Configuration for Event Bus integration
 */
export interface EventBusIntegrationConfig {
  projectId: string;
  eventBus?: IEventBus;
  source?: 'daemon' | 'client' | 'adapter';
}

/**
 * Initialize Event Bus integration for workflow runtime
 * Creates an EventPublisher and optionally creates an EventBus if not provided
 * 
 * @param config Configuration for Event Bus integration
 * @returns Object containing EventBus, EventPublisher, and WorkflowEngine
 */
export function initializeEventBusIntegration(
  config: EventBusIntegrationConfig
): {
  eventBus: IEventBus;
  eventPublisher: EventPublisher;
  workflowEngine: WorkflowEngine;
} {
  // Create or use provided EventBus
  const eventBus = config.eventBus || (new EventBus() as unknown as IEventBus);

  // Start EventBus if it's a daemon-core EventBus instance
  if (eventBus && typeof (eventBus as any).start === 'function') {
    (eventBus as any).start();
  }

  // Create EventPublisher
  const eventPublisher = createEventPublisher(
    eventBus,
    config.projectId,
    config.source ?? 'daemon'
  );

  // Create WorkflowEngine with EventPublisher
  const workflowEngine = new WorkflowEngine({
    eventPublisher,
  });

  return {
    eventBus,
    eventPublisher,
    workflowEngine,
  };
}

/**
 * Shutdown Event Bus integration
 * Stops the EventBus and cleans up resources
 * 
 * @param eventBus The EventBus instance to shutdown
 */
export function shutdownEventBusIntegration(eventBus: IEventBus): void {
  if (eventBus && typeof (eventBus as any).stop === 'function') {
    (eventBus as any).stop();
  }
}

/**
 * Subscribe to workflow events from the Event Bus
 * 
 * @param eventBus The EventBus instance
 * @param topic The event topic pattern (e.g., 'workflow.*', 'workflow.gate.*')
 * @param handler The event handler function
 * @returns Subscription ID for unsubscribing
 */
export function subscribeToWorkflowEvents(
  eventBus: IEventBus,
  topic: string,
  handler: (event: any) => void
): string {
  const subscription = eventBus.subscribe(topic, handler);
  return subscription.id;
}

/**
 * Unsubscribe from workflow events
 * 
 * @param eventBus The EventBus instance
 * @param subscription The subscription object to unsubscribe
 */
export function unsubscribeFromWorkflowEvents(
  eventBus: IEventBus,
  subscription: any
): void {
  eventBus.unsubscribe(subscription);
}

// Re-export commonly used types and functions
export {
  EventPublisher,
  createEventPublisher,
  type EventPublisherConfig,
} from './events/EventPublisher.js';

export type {
  WorkflowLifecycleEventType,
  GateEventType,
  WorkflowEventType,
  WorkflowLifecyclePayload,
  GateEventPayload,
  StateChangeEventType,
  StateChangePayload,
} from './events/EventTypes.js';

export { WorkflowEngine, type WorkflowEngineConfig } from './WorkflowEngine.js';

export type { IEventBus, Event, Subscription } from './types.js';
