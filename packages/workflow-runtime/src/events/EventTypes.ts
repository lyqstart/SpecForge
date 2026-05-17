/**
 * Event Types for Workflow Runtime
 * Standardized event type definitions
 */

// Re-export GateResult from types for convenience
export type { GateResult } from '../types.js';

/**
 * Workflow lifecycle event types
 */
export type WorkflowLifecycleEventType =
  | 'workflow.started'
  | 'workflow.paused'
  | 'workflow.resumed'
  | 'workflow.completed'
  | 'workflow.failed';

/**
 * Gate execution event types
 */
export type GateEventType =
  | 'workflow.gate.started'
  | 'workflow.gate.completed'
  | 'workflow.gate.failed'
  | 'workflow.gate.cancelled';

/**
 * State change event type
 */
export type StateChangeEventType = 'workflow.state_changed';

/**
 * All workflow event types
 */
export type WorkflowEventType = WorkflowLifecycleEventType | GateEventType | StateChangeEventType;

/**
 * Event payload for workflow lifecycle events
 */
export interface WorkflowLifecyclePayload {
  instanceId: string;
  workflowId: string;
  currentState?: string;
  previousState?: string;
  reason?: string;
  status?: string;
  finalState?: string;
  historyLength?: number;
  error?: string;
}

/**
 * Event payload for gate execution events
 */
export interface GateEventPayload {
  instanceId: string;
  workflowId: string;
  state: string;
  gateId: string;
  gateType: 'simple' | 'composite';
  passed?: boolean;
  reason?: string;
  details?: Record<string, unknown>;
  error?: string;
  timestamp?: string;
}

/**
 * Event payload for state change events
 */
export interface StateChangePayload {
  instanceId: string;
  workflowId: string;
  fromState: string;
  toState: string;
  gatePassed: boolean;
  timestamp?: string;
}

/**
 * Event payload for gate cancellation events
 */
export interface GateCancellationPayload {
  instanceId: string;
  workflowId: string;
  state: string;
  gateId: string;
  gateType: 'simple' | 'composite';
  cancelledAt: string;
  reason: string;
  childGateIds?: string[];
}