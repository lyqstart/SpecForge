/**
 * state-coordinator-v11.ts — SpecForge v1.1.3 state authority coordinator
 *
 * Design rule:
 * - StateManager / events.jsonl is the authoritative state source.
 * - runtime/state.json is a projection cache.
 * - work_item.json is WI metadata and must not drive governance state.
 */

export type AuthoritativeStateRead = {
  current_state: string | null;
  source: 'StateManager' | 'missing';
  rebuilt_from_events: boolean;
};

export type TransitionWithEvidenceInput = {
  deps: any;
  context?: any;
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  fromState: string;
  toState: string;
  workflowType: string;
  actorRole: string;
  evidence: string;
  transitionContext?: Record<string, unknown>;
};

function normalizeState(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.current_state === 'string') return obj.current_state;
    if (typeof obj.currentState === 'string') return obj.currentState;
    if (typeof obj.status === 'string') return obj.status;
    if (typeof obj.state === 'string') return obj.state;
  }
  return null;
}

export async function readAuthoritativeState(input: {
  deps: any;
  projectRoot: string;
  workItemId: string;
}): Promise<AuthoritativeStateRead> {
  const projectManager = input.deps?.projectManager;
  if (!projectManager?.getProjectStateManager) {
    return { current_state: null, source: 'missing', rebuilt_from_events: false };
  }

  const projectSm = await projectManager.getProjectStateManager(input.projectRoot);
  let rebuilt = false;

  if (typeof projectSm?.rebuildFromEventsFile === 'function') {
    await projectSm.rebuildFromEventsFile();
    rebuilt = true;
  }

  if (typeof projectSm?.getState === 'function') {
    const state = normalizeState(await projectSm.getState(input.workItemId));
    if (state) {
      return { current_state: state, source: 'StateManager', rebuilt_from_events: rebuilt };
    }
  }

  return { current_state: null, source: 'missing', rebuilt_from_events: rebuilt };
}

export async function transitionWithEvidence(input: TransitionWithEvidenceInput): Promise<{
  attempted: true;
  advanced: true;
  from_state: string;
  to_state: string;
  evidence: string;
  transition_result?: unknown;
}> {
  if (!input.deps?.workflowEngine) {
    throw new Error('STATE_COORDINATOR_TRANSITION_FAILED: WorkflowEngine not available');
  }
  if (!input.deps?.projectManager) {
    throw new Error('STATE_COORDINATOR_TRANSITION_FAILED: ProjectManager not available');
  }

  const transitionResult = await input.deps.workflowEngine.transitionFull({
    workItemId: input.workItemId,
    fromState: input.fromState,
    toState: input.toState,
    evidence: input.evidence,
    workflowType: input.workflowType,
    transitionContext: {
      source: 'state_coordinator_v11',
      ...(input.transitionContext ?? {}),
    },
    actor: {
      agentRole: input.actorRole,
      sessionId: input.context?.sessionID ?? input.actorRole,
    },
    workItemDir: input.workItemDir,
  });

  const projectSm = await input.deps.projectManager.getProjectStateManager(input.projectRoot);
  await projectSm.transition(
    input.workItemId,
    input.fromState,
    input.toState,
    input.actorRole,
    input.workflowType,
    { evidence: input.evidence },
  );

  return {
    attempted: true,
    advanced: true,
    from_state: input.fromState,
    to_state: input.toState,
    evidence: input.evidence,
    transition_result: transitionResult,
  };
}
