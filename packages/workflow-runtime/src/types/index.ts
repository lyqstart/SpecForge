/**
 * Workflow Runtime Types Index
 * Re-exports all type definitions from the types directory
 */

// Gate Result
export type { GateResult } from './gate-result';

// Gate Definition (v1.1 + backward compatible)
export {
  // v1.1 additions
  GATE_IDS_V11,
  GATE_STRICTNESS,
  GATE_SUMMARY_STATUSES,
} from './gate-definition';

export type {
  // v1.1 types
  GateIdV11,
  GateStrictness,
  GateReportCheck,
  GateReportV11,
  GateSummaryStatus,
  // Original types (backward compatible)
  GateType,
  GateKind,
  CompositeGateMode,
  FailPolicy,
  GateConfig,
  GateDependency,
  BaseGateDefinition,
  SimpleGateDefinition,
  CompositeGateDefinition,
  GateDefinition
} from './gate-definition';

// State Machine (v1.1 + backward compatible)
export {
  // v1.1 additions
  WI_STATUSES_V11,
  FORBIDDEN_TRANSITIONS as V11_FORBIDDEN_TRANSITIONS,
  isForbiddenTransitionV11,
  STATE_ADVANCEMENT_SUBJECTS,
} from './state-machine';

export type {
  // v1.1 types
  WIStatusV11,
  StateAdvancementSubject,
  ResumeCheck,
  ResumePlan,
  // Original types (backward compatible)
  StateTransition, 
  StateEvent,
  WorkflowState, 
  StateMachine 
} from './state-machine';

// Workflow Definition
export type {
  WorkflowKind,
  GateRef,
  ArtifactDefinition,
  WorkflowDefinitionFile,
  WorkflowDefinition
} from './workflow-definition';

// Workflow Instance
export type { WorkflowEventData, WorkflowInstanceStatus, WorkflowInstance, WorkflowContext } from './workflow-instance';
