/**
 * v1.1 Workflow Definitions
 *
 * Exports v1.1 workflow definitions for each workflow type.
 * Based on the V11_TRANSITIONS state graph from daemon-core.
 */

import type {
  WorkflowState,
  StateMachine,
} from '../types/state-machine.js';
import type {
  WorkflowDefinition,
  ArtifactDefinition,
} from '../types.js';
import { ACTOR_ROLES } from '@specforge/types/actor-roles';

// ---------------------------------------------------------------------------
// Helper: build a pass-through gate
// ---------------------------------------------------------------------------

function passGate(id: string) {
  return {
    schema_version: '1.0' as const,
    id,
    name: id,
    type: 'simple' as const,
    checkFn: () => ({ schema_version: '1.0' as const, passed: true, reason: 'Default pass' }),
  };
}

// ---------------------------------------------------------------------------
// Shared state builders
// ---------------------------------------------------------------------------

function state(
  agent: string,
  gateId: string,
  skills: string[],
  next?: string | Record<string, string>,
): WorkflowState {
  return {
    schema_version: '1.0',
    agent,
    gate: passGate(gateId),
    skills,
    ...(next !== undefined && { next }),
  };
}

// ---------------------------------------------------------------------------
// Shared state segments from the v1.1 graph
// ---------------------------------------------------------------------------

/** Candidate path states (used by feature_spec, change_request) */
function candidatePathStates(): Record<string, WorkflowState> {
  return {
    candidate_preparing: state(
      ACTOR_ROLES.orchestrator,
      'candidate_preparing_gate',
      ['sf-workflow-feature-spec'],
      'candidate_prepared',
    ),
    candidate_prepared: state(
      ACTOR_ROLES.orchestrator,
      'candidate_prepared_gate',
      ['sf-workflow-feature-spec'],
      'gates_running',
    ),
    gates_running: state(
      ACTOR_ROLES.gateRunner,
      'gates_running_gate',
      ['sf-skill-git-master'],
      { pass: 'approval_required', fail: 'gates_failed' },
    ),
    gates_failed: state(
      ACTOR_ROLES.orchestrator,
      'gates_failed_gate',
      ['sf-workflow-feature-spec'],
      { pass: 'candidate_preparing', fail: 'gates_running' },
    ),
    approval_required: state(
      ACTOR_ROLES.userDecisionRecorder,
      'approval_gate',
      [],
      { pass: 'approved', fail: 'rejected' },
    ),
    approved: state(
      ACTOR_ROLES.orchestrator,
      'approved_gate',
      ['sf-skill-git-master'],
      'merge_ready',
    ),
    merge_ready: state(
      ACTOR_ROLES.mergeRunner,
      'merge_ready_gate',
      ['sf-skill-git-master'],
      'merging',
    ),
    merging: state(
      ACTOR_ROLES.mergeRunner,
      'merging_gate',
      ['sf-skill-git-master'],
      { pass: 'merged', fail: 'gates_failed' },
    ),
    merged: state(
      ACTOR_ROLES.orchestrator,
      'merged_gate',
      ['sf-skill-git-master'],
      'post_merge_verified',
    ),
    post_merge_verified: state(
      ACTOR_ROLES.orchestrator,
      'post_merge_gate',
      ['sf-skill-git-master'],
      'implementation_ready',
    ),
  };
}

/** Implementation path states (used by all workflow types) */
function implementationStates(): Record<string, WorkflowState> {
  return {
    implementation_ready: state(
      ACTOR_ROLES.orchestrator,
      'implementation_ready_gate',
      ['sf-workflow-feature-spec'],
      'implementation_running',
    ),
    implementation_running: state(
      'sf-executor',
      'implementation_gate',
      ['superpowers-subagent-driven-development'],
      'implementation_done',
    ),
    implementation_done: state(
      ACTOR_ROLES.orchestrator,
      'implementation_done_gate',
      ['sf-workflow-feature-spec'],
      'verification_running',
    ),
    verification_running: state(
      'sf-verifier',
      'verification_gate',
      ['superpowers-verification-before-completion'],
      { pass: 'verification_done', fail: 'implementation_running' },
    ),
    verification_done: state(
      ACTOR_ROLES.closeGate,
      'close_gate',
      [],
      'closed',
    ),
  };
}

/** Terminal states */
function terminalStates(): Record<string, WorkflowState> {
  return {
    blocked: state(
      ACTOR_ROLES.orchestrator,
      'blocked_gate',
      ['sf-workflow-feature-spec'],
      { pass: 'candidate_preparing', fail: 'gates_running' },
    ),
    rejected: state(
      ACTOR_ROLES.orchestrator,
      'rejected_gate',
      [],
    ),
    superseded: state(
      ACTOR_ROLES.orchestrator,
      'superseded_gate',
      [],
    ),
    closed: state(
      ACTOR_ROLES.closeGate,
      'closed_gate',
      [],
    ),
  };
}

// ---------------------------------------------------------------------------
// Intake / impact analysis states
// ---------------------------------------------------------------------------

function intakeStates(): Record<string, WorkflowState> {
  return {
    created: state(
      ACTOR_ROLES.orchestrator,
      'entry_gate',
      [],
      'intake_ready',
    ),
    intake_ready: state(
      ACTOR_ROLES.orchestrator,
      'intake_gate',
      ['superpowers-brainstorming'],
      'impact_analyzing',
    ),
    impact_analyzing: state(
      ACTOR_ROLES.orchestrator,
      'impact_analysis_gate',
      [],
      'impact_analyzed',
    ),
    impact_analyzed: state(
      ACTOR_ROLES.orchestrator,
      'impact_analyzed_gate',
      [],
      'workflow_selected',
    ),
    workflow_selected: state(
      ACTOR_ROLES.orchestrator,
      'workflow_selection_gate',
      [],
      { pass: 'candidate_preparing', fail: 'implementation_ready' },
    ),
  };
}

// ---------------------------------------------------------------------------
// Workflow Definition builder
// ---------------------------------------------------------------------------

/**
 * Build a v1.1 WorkflowDefinition compatible with the WorkflowEngine.
 * The engine expects `definition.stateMachine.states` and `definition.stateMachine.initial`.
 */
function buildDefinition(
  id: string,
  displayName: string,
  intent: string,
  initial: string,
  states: Record<string, WorkflowState>,
): WorkflowDefinition {
  const stateMachine: StateMachine = {
    schema_version: '1.0',
    initial,
    states,
  };

  return {
    schema_version: '1.0',
    id,
    displayName,
    intent,
    stateMachine,
    artifacts: [] as ArtifactDefinition[],
  };
}

// ---------------------------------------------------------------------------
// feature_spec — full v1.1 path
// ---------------------------------------------------------------------------

export const featureSpecDefinition: WorkflowDefinition = buildDefinition(
  'feature_spec',
  'Feature Spec (Requirements-First)',
  'Standard feature workflow: intake → requirements → design → tasks → development → review → verification → closed',
  'created',
  {
    ...intakeStates(),
    ...candidatePathStates(),
    ...implementationStates(),
    ...terminalStates(),
  },
);

// ---------------------------------------------------------------------------
// change_request — full path similar to feature_spec
// ---------------------------------------------------------------------------

export const changeRequestDefinition: WorkflowDefinition = buildDefinition(
  'change_request',
  'Change Request',
  'Change request workflow: full candidate + implementation + verification path',
  'created',
  {
    ...intakeStates(),
    ...candidatePathStates(),
    ...implementationStates(),
    ...terminalStates(),
  },
);

// ---------------------------------------------------------------------------
// bugfix_spec — starts at implementation_ready (skip candidate path)
// ---------------------------------------------------------------------------

export const bugfixSpecDefinition: WorkflowDefinition = buildDefinition(
  'bugfix_spec',
  'Bugfix Spec',
  'Bugfix workflow: intake → implementation → verification → closed (no candidate path)',
  'created',
  {
    created: state(ACTOR_ROLES.orchestrator, 'entry_gate', [], 'intake_ready'),
    intake_ready: state(
      ACTOR_ROLES.orchestrator,
      'intake_gate',
      ['sf-workflow-bugfix-spec'],
      'impact_analyzing',
    ),
    impact_analyzing: state(
      ACTOR_ROLES.orchestrator,
      'impact_analysis_gate',
      [],
      'impact_analyzed',
    ),
    impact_analyzed: state(
      ACTOR_ROLES.orchestrator,
      'impact_analyzed_gate',
      [],
      'workflow_selected',
    ),
    workflow_selected: state(
      ACTOR_ROLES.orchestrator,
      'workflow_selection_gate',
      [],
      'implementation_ready',
    ),
    ...implementationStates(),
    ...terminalStates(),
  },
);

// ---------------------------------------------------------------------------
// ops_task — simplified path
// ---------------------------------------------------------------------------

export const opsTaskDefinition: WorkflowDefinition = buildDefinition(
  'ops_task',
  'Ops Task',
  'Operational task workflow: intake → implementation → verification → closed',
  'created',
  {
    created: state(ACTOR_ROLES.orchestrator, 'entry_gate', [], 'intake_ready'),
    intake_ready: state(
      ACTOR_ROLES.orchestrator,
      'intake_gate',
      ['sf-workflow-ops-task'],
      'implementation_ready',
    ),
    implementation_ready: state(
      ACTOR_ROLES.orchestrator,
      'implementation_ready_gate',
      ['sf-workflow-ops-task'],
      'implementation_running',
    ),
    implementation_running: state(
      'sf-executor',
      'implementation_gate',
      ['sf-workflow-ops-task'],
      'implementation_done',
    ),
    implementation_done: state(
      ACTOR_ROLES.orchestrator,
      'implementation_done_gate',
      ['sf-workflow-ops-task'],
      'verification_running',
    ),
    verification_running: state(
      'sf-verifier',
      'verification_gate',
      ['superpowers-verification-before-completion'],
      { pass: 'verification_done', fail: 'implementation_running' },
    ),
    verification_done: state(
      ACTOR_ROLES.closeGate,
      'close_gate',
      [],
      'closed',
    ),
    blocked: state(
      ACTOR_ROLES.orchestrator,
      'blocked_gate',
      ['sf-workflow-ops-task'],
      'implementation_ready',
    ),
    rejected: state(ACTOR_ROLES.orchestrator, 'rejected_gate', []),
    superseded: state(ACTOR_ROLES.orchestrator, 'superseded_gate', []),
    closed: state(ACTOR_ROLES.closeGate, 'closed_gate', []),
  },
);

// ---------------------------------------------------------------------------
// investigation — simplified path
// ---------------------------------------------------------------------------

export const investigationDefinition: WorkflowDefinition = buildDefinition(
  'investigation',
  'Investigation',
  'Investigation workflow: intake → implementation (research/root-cause) → closed',
  'created',
  {
    created: state(ACTOR_ROLES.orchestrator, 'entry_gate', [], 'intake_ready'),
    intake_ready: state(
      ACTOR_ROLES.orchestrator,
      'intake_gate',
      ['sf-workflow-investigation'],
      'implementation_ready',
    ),
    implementation_ready: state(
      ACTOR_ROLES.orchestrator,
      'implementation_ready_gate',
      ['sf-workflow-investigation'],
      'implementation_running',
    ),
    implementation_running: state(
      'sf-investigator',
      'implementation_gate',
      ['sf-workflow-investigation'],
      'implementation_done',
    ),
    implementation_done: state(
      ACTOR_ROLES.orchestrator,
      'implementation_done_gate',
      ['sf-workflow-investigation'],
      'verification_running',
    ),
    verification_running: state(
      'sf-verifier',
      'verification_gate',
      ['superpowers-verification-before-completion'],
      { pass: 'verification_done', fail: 'implementation_running' },
    ),
    verification_done: state(
      ACTOR_ROLES.closeGate,
      'close_gate',
      [],
      'closed',
    ),
    blocked: state(
      ACTOR_ROLES.orchestrator,
      'blocked_gate',
      ['sf-workflow-investigation'],
      'implementation_ready',
    ),
    rejected: state(ACTOR_ROLES.orchestrator, 'rejected_gate', []),
    superseded: state(ACTOR_ROLES.orchestrator, 'superseded_gate', []),
    closed: state(ACTOR_ROLES.closeGate, 'closed_gate', []),
  },
);

// ---------------------------------------------------------------------------
// quick_change — simplified path
// ---------------------------------------------------------------------------

export const quickChangeDefinition: WorkflowDefinition = buildDefinition(
  'quick_change',
  'Quick Change',
  'Quick change workflow: intake → implementation → verification → closed',
  'created',
  {
    created: state(ACTOR_ROLES.orchestrator, 'entry_gate', [], 'intake_ready'),
    intake_ready: state(
      ACTOR_ROLES.orchestrator,
      'intake_gate',
      ['sf-workflow-quick-change'],
      'implementation_ready',
    ),
    implementation_ready: state(
      ACTOR_ROLES.orchestrator,
      'implementation_ready_gate',
      ['sf-workflow-quick-change'],
      'implementation_running',
    ),
    implementation_running: state(
      'sf-executor',
      'implementation_gate',
      ['sf-workflow-quick-change'],
      'implementation_done',
    ),
    implementation_done: state(
      ACTOR_ROLES.orchestrator,
      'implementation_done_gate',
      ['sf-workflow-quick-change'],
      'verification_running',
    ),
    verification_running: state(
      'sf-verifier',
      'verification_gate',
      ['superpowers-verification-before-completion'],
      { pass: 'verification_done', fail: 'implementation_running' },
    ),
    verification_done: state(
      ACTOR_ROLES.closeGate,
      'close_gate',
      [],
      'closed',
    ),
    blocked: state(
      ACTOR_ROLES.orchestrator,
      'blocked_gate',
      ['sf-workflow-quick-change'],
      'implementation_ready',
    ),
    rejected: state(ACTOR_ROLES.orchestrator, 'rejected_gate', []),
    superseded: state(ACTOR_ROLES.orchestrator, 'superseded_gate', []),
    closed: state(ACTOR_ROLES.closeGate, 'closed_gate', []),
  },
);

// ---------------------------------------------------------------------------
// refactor — simplified path
// ---------------------------------------------------------------------------

export const refactorDefinition: WorkflowDefinition = buildDefinition(
  'refactor',
  'Refactor',
  'Refactor workflow: intake → implementation → verification → closed (behavior-preserving)',
  'created',
  {
    created: state(ACTOR_ROLES.orchestrator, 'entry_gate', [], 'intake_ready'),
    intake_ready: state(
      ACTOR_ROLES.orchestrator,
      'intake_gate',
      ['sf-workflow-refactor'],
      'implementation_ready',
    ),
    implementation_ready: state(
      ACTOR_ROLES.orchestrator,
      'implementation_ready_gate',
      ['sf-workflow-refactor'],
      'implementation_running',
    ),
    implementation_running: state(
      'sf-executor',
      'implementation_gate',
      ['superpowers-subagent-driven-development'],
      'implementation_done',
    ),
    implementation_done: state(
      ACTOR_ROLES.orchestrator,
      'implementation_done_gate',
      ['sf-workflow-refactor'],
      'verification_running',
    ),
    verification_running: state(
      'sf-verifier',
      'verification_gate',
      ['superpowers-verification-before-completion'],
      { pass: 'verification_done', fail: 'implementation_running' },
    ),
    verification_done: state(
      ACTOR_ROLES.closeGate,
      'close_gate',
      [],
      'closed',
    ),
    blocked: state(
      ACTOR_ROLES.orchestrator,
      'blocked_gate',
      ['sf-workflow-refactor'],
      'implementation_ready',
    ),
    rejected: state(ACTOR_ROLES.orchestrator, 'rejected_gate', []),
    superseded: state(ACTOR_ROLES.orchestrator, 'superseded_gate', []),
    closed: state(ACTOR_ROLES.closeGate, 'closed_gate', []),
  },
);

// ---------------------------------------------------------------------------
// All v1.1 definitions
// ---------------------------------------------------------------------------

/**
 * All v1.1 workflow definitions, keyed by workflow type id.
 */
export const V11_WORKFLOW_DEFINITIONS: readonly WorkflowDefinition[] = [
  featureSpecDefinition,
  changeRequestDefinition,
  bugfixSpecDefinition,
  opsTaskDefinition,
  investigationDefinition,
  quickChangeDefinition,
  refactorDefinition,
];
