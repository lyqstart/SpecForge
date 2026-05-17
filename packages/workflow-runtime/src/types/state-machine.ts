/**
 * State Machine Interface
 * Defines the structure for workflow state machines
 */

import type { GateDefinition } from './gate-definition';

/**
 * State transition definition
 */
export interface StateTransition {
  from: string;
  event: string;
  to: string;
  condition?: string;
}

/**
 * Workflow state event handler
 */
export interface StateEvent {
  name: string;
  handler: string;
  payload?: Record<string, unknown>;
}

/**
 * Workflow state definition
 */
export interface WorkflowState {
  schema_version: "1.0";
  agent: string;
  gate: GateDefinition;
  skills: string[];
  next?: string | Record<string, string>;
  events?: StateEvent[];
}

/**
 * State machine definition
 * Contains all necessary components for workflow state management
 */
export interface StateMachine {
  schema_version: "1.0";
  /** Initial state identifier */
  initial: string;
  /** Collection of states, keyed by state ID */
  states: Record<string, WorkflowState>;
  /** Transition rules defining valid state changes */
  transitions?: StateTransition[];
  /** Event handlers for state machine events */
  events?: StateEvent[];
}