/**
 * StateMachine.ts — SpecForge v1.1 24-State Transaction State Machine
 *
 * Implements all 24 work item states with:
 * - Transition validation (forbidden transitions)
 * - State transition authorization (only authorized components)
 * - State history tracking
 *
 * Requirements: 2.1-2.43
 */

import { JsonParser } from './JsonParser.js';

// ---- Types ----

/** All 24 work item states */
export const WORK_ITEM_STATES = [
  'created',
  'intake_ready',
  'impact_analyzing',
  'impact_analyzed',
  'workflow_selected',
  'candidate_preparing',
  'candidate_prepared',
  'gates_running',
  'gates_failed',
  'approval_required',
  'approved',
  'merge_ready',
  'merging',
  'merged',
  'post_merge_verified',
  'implementation_ready',
  'implementation_running',
  'implementation_done',
  'verification_running',
  'verification_done',
  'closed',
  'blocked',
  'rejected',
  'superseded',
] as const;

export type WorkItemState = (typeof WORK_ITEM_STATES)[number];

/** Authorized callers for state transitions */
export type AuthorizedCaller =
  | 'state_machine'
  | 'gate_runner'
  | 'user_decision_recorder'
  | 'merge_runner'
  | 'code_permission_service'
  | 'close_gate';

/** State transition record */
export interface StateTransitionRecord {
  from_state: WorkItemState;
  to_state: WorkItemState;
  transitioned_at: string;
  transitioned_by: AuthorizedCaller;
  reason?: string | undefined;
}

/** State transition result */
export interface TransitionResult {
  success: boolean;
  previousState?: WorkItemState;
  newState?: WorkItemState;
  error?: string | undefined;
}

/** Work item metadata */
export interface WorkItemMetadata {
  schema_version: '1.0';
  work_item_id: string;
  title: string;
  description: string;
  current_state: WorkItemState;
  workflow_type: 'requirements-first' | 'design-first' | 'bugfix' | 'fast-task';
  created_at: string;
  updated_at: string;
  created_by: string;
  state_history: StateTransitionRecord[];
  tags?: string[];
}

// ---- Legal transitions map ----

/**
 * Legal state transitions (adjacency map).
 * Only transitions listed here are allowed.
 */
const LEGAL_TRANSITIONS: Map<WorkItemState, WorkItemState[]> = new Map([
  ['created', ['intake_ready', 'blocked']],
  ['intake_ready', ['impact_analyzing', 'blocked']],
  ['impact_analyzing', ['impact_analyzed', 'blocked']],
  ['impact_analyzed', ['workflow_selected', 'blocked']],
  ['workflow_selected', ['candidate_preparing', 'blocked']],
  ['candidate_preparing', ['candidate_prepared', 'blocked']],
  ['candidate_prepared', ['gates_running', 'superseded', 'blocked']],
  ['gates_running', ['gates_failed', 'approval_required', 'blocked']],
  ['gates_failed', ['candidate_preparing', 'blocked', 'rejected']],
  ['approval_required', ['approved', 'blocked', 'rejected', 'superseded']],
  ['approved', ['merge_ready']],
  ['merge_ready', ['merging']],
  ['merging', ['merged']],
  ['merged', ['post_merge_verified']],
  ['post_merge_verified', ['implementation_ready']],
  ['implementation_ready', ['implementation_running']],
  ['implementation_running', ['implementation_done']],
  ['implementation_done', ['verification_running']],
  ['verification_running', ['verification_done']],
  ['verification_done', ['closed']],
  ['blocked', ['intake_ready', 'impact_analyzing', 'candidate_preparing', 'gates_running']], // can resume
  ['rejected', []], // terminal
  ['superseded', []], // terminal
  ['closed', []], // terminal
]);

/**
 * Caller authorization for specific transitions.
 * Requirements: 2.37-2.43
 */
const CALLER_AUTHORIZATION: Map<string, AuthorizedCaller[]> = new Map([
  ['gates_running->gates_failed', ['gate_runner', 'state_machine']],
  ['gates_running->approval_required', ['gate_runner', 'state_machine']],
  ['approval_required->approved', ['user_decision_recorder', 'state_machine']],
  ['merging->merged', ['merge_runner', 'state_machine']],
  ['implementation_ready->implementation_running', ['code_permission_service', 'state_machine']],
  ['verification_done->closed', ['close_gate', 'state_machine']],
]);

/**
 * StateMachine — manages the 24-state transaction lifecycle.
 *
 * Requirements: 2.1-2.43
 */
export class StateMachine {
  private state: WorkItemState;
  private readonly history: StateTransitionRecord[] = [];
  private readonly workItemId: string;

  constructor(workItemId: string, initialState: WorkItemState = 'created') {
    this.workItemId = workItemId;
    this.state = initialState;
  }

  /** Get current state */
  getCurrentState(): WorkItemState {
    return this.state;
  }

  /** Get state history */
  getStateHistory(): ReadonlyArray<StateTransitionRecord> {
    return this.history;
  }

  /** Get work item ID */
  getWorkItemId(): string {
    return this.workItemId;
  }

  /**
   * Attempt a state transition.
   * Requirements: 2.25-2.36 (illegal transition rejection)
   * Requirements: 2.37-2.43 (authorization)
   */
  transition(
    toState: WorkItemState,
    caller: AuthorizedCaller | 'agent',
    reason?: string,
  ): TransitionResult {
    // Requirement 2.37: Block all agent-initiated transitions
    if (caller === 'agent') {
      return {
        success: false,
        error: `Agent is not authorized to transition work item state from ${this.state} to ${toState}`,
      };
    }

    // Requirement 2.34: closed → any is forbidden
    if (this.state === 'closed') {
      return {
        success: false,
        error: `Cannot transition from terminal state 'closed' to '${toState}'`,
      };
    }

    // Check if the transition is legal
    const legalTargets = LEGAL_TRANSITIONS.get(this.state);
    if (!legalTargets || !legalTargets.includes(toState)) {
      return {
        success: false,
        error: `Illegal transition: ${this.state} → ${toState} is not allowed`,
      };
    }

    // Check caller authorization for restricted transitions
    const transitionKey = `${this.state}->${toState}`;
    const authorizedCallers = CALLER_AUTHORIZATION.get(transitionKey);
    if (authorizedCallers && !authorizedCallers.includes(caller)) {
      return {
        success: false,
        error: `Caller '${caller}' is not authorized for transition ${transitionKey}`,
      };
    }

    // Execute transition
    const record: StateTransitionRecord = {
      from_state: this.state,
      to_state: toState,
      transitioned_at: new Date().toISOString(),
      transitioned_by: caller,
      reason,
    };

    const previousState = this.state;
    this.history.push(record);
    this.state = toState;

    return {
      success: true,
      previousState,
      newState: toState,
    };
  }

  /**
   * Check if a transition would be legal without executing it.
   */
  canTransition(toState: WorkItemState, caller: AuthorizedCaller | 'agent'): { legal: boolean; reason?: string } {
    if (caller === 'agent') {
      return { legal: false, reason: 'Agent is not authorized for state transitions' };
    }

    if (this.state === 'closed') {
      return { legal: false, reason: 'Cannot transition from terminal state' };
    }

    const legalTargets = LEGAL_TRANSITIONS.get(this.state);
    if (!legalTargets || !legalTargets.includes(toState)) {
      return { legal: false, reason: `Illegal transition: ${this.state} → ${toState}` };
    }

    const transitionKey = `${this.state}->${toState}`;
    const authorizedCallers = CALLER_AUTHORIZATION.get(transitionKey);
    if (authorizedCallers && !authorizedCallers.includes(caller)) {
      return { legal: false, reason: `Caller '${caller}' not authorized` };
    }

    return { legal: true };
  }

  /**
   * Check if a state is terminal.
   */
  isTerminalState(state: WorkItemState): boolean {
    return state === 'closed' || state === 'rejected' || state === 'superseded';
  }

  /**
   * Serialize state machine state to a persistence object.
   */
  serialize(): { currentState: WorkItemState; history: StateTransitionRecord[] } {
    return {
      currentState: this.state,
      history: [...this.history],
    };
  }

  /**
   * Parse work item metadata from JSON.
   * Requirements: 6.4, 6.5, 6.10
   */
  static parseMetadata(jsonString: string): { success: boolean; data?: WorkItemMetadata | undefined; error?: string | undefined } {
    const result = JsonParser.parse<WorkItemMetadata>(jsonString);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Validate state is one of the 24 states
    if (!WORK_ITEM_STATES.includes(result.data!.current_state)) {
      return {
        success: false,
        error: `Invalid state: '${result.data!.current_state}' is not a valid work item state`,
      };
    }

    return { success: true, data: result.data };
  }

  /**
   * Serialize work item metadata to JSON.
   * Requirements: 6.4, 6.5
   */
  static serializeMetadata(metadata: WorkItemMetadata): { success: boolean; data?: string | undefined; error?: string | undefined } {
    return JsonParser.serialize(metadata);
  }
}

/**
 * Check if a specific transition is in the forbidden list.
 * Requirements: 2.25-2.36
 */
export function isForbiddenTransition(from: string, to: string): boolean {
  const forbidden: Array<[string, string]> = [
    ['created', 'implementation_running'],
    ['intake_ready', 'implementation_running'],
    ['impact_analyzing', 'implementation_running'],
    ['impact_analyzed', 'implementation_running'],
    ['workflow_selected', 'implementation_running'],
    ['candidate_prepared', 'merging'],
    ['approval_required', 'merging'],
    ['approval_required', 'closed'],
    ['merged', 'closed'],
    ['closed', 'any'],
    ['blocked', 'closed'],
    ['rejected', 'closed'],
  ];

  return forbidden.some(([f, t]) => (f === from) && (t === to || t === 'any'));
}
