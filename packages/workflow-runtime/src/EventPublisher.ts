/**
 * EventPublisher Module
 * Re-exports from events module for backward compatibility
 */

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
} from './events/EventTypes.js';