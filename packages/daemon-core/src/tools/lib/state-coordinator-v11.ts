/**
 * state-coordinator-v11.ts — SpecForge v1.1.3 state authority coordinator
 *
 * Design rule:
 * - StateManager / events.jsonl is the authoritative state source.
 * - runtime/state.json is a projection cache.
 * - work_item.json is WI metadata and must not drive governance state.
 *
 * Important:
 * This module MUST NOT call workflowEngine.transitionFull().
 * transitionFull mutates WorkflowEngine's private in-memory instances before
 * StateManager.transition() can perform optimistic locking. That creates two
 * state writers and caused the post-P0 state split.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  WI_STATUSES_V11,
  isForbiddenTransition,
  isValidV11Transition,
  checkStateEvidenceRequirement,
} from './state-machine-v11';
import { isSealTransition, getSealTransition } from '@specforge/types/seal-transitions';

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

export type TransitionWithEvidenceResult = {
  attempted: true;
  advanced: true;
  from_state: string;
  to_state: string;
  evidence: string;
  transition_result: {
    source: 'StateManager';
    workItemId: string;
    previousState: string;
    currentState: string;
    timestamp: string;
  };
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

async function ensureFileExists(filePath: string, description: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`${description} missing: ${path.basename(filePath)}`);
  }
}

async function validateTransitionRequest(input: TransitionWithEvidenceInput): Promise<void> {
  if (!input.workItemId) {
    throw new Error('STATE_COORDINATOR_TRANSITION_FAILED: workItemId is required');
  }

  if (!(WI_STATUSES_V11 as readonly string[]).includes(input.toState)) {
    throw new Error(
      `STATE_COORDINATOR_TRANSITION_FAILED: invalid target state "${input.toState}"`,
    );
  }

  if (
    input.fromState !== '' &&
    !(WI_STATUSES_V11 as readonly string[]).includes(input.fromState)
  ) {
    throw new Error(
      `STATE_COORDINATOR_TRANSITION_FAILED: invalid from_state "${input.fromState}"`,
    );
  }

  if (input.fromState !== '' && isForbiddenTransition(input.fromState, input.toState)) {
    throw new Error(
      `STATE_COORDINATOR_TRANSITION_FAILED: forbidden transition ${input.fromState} → ${input.toState}`,
    );
  }

  if (input.fromState !== '' && !isValidV11Transition(input.fromState, input.toState)) {
    throw new Error(
      `STATE_COORDINATOR_TRANSITION_FAILED: invalid transition ${input.fromState} → ${input.toState}`,
    );
  }

  if (input.fromState !== '' && isSealTransition(input.fromState, input.toState)) {
    const sealEntry = getSealTransition(input.fromState, input.toState);
    if (sealEntry && input.actorRole !== sealEntry.authorizedSubject) {
      throw new Error(
        `STATE_COORDINATOR_TRANSITION_FAILED: seal transition ${input.fromState} → ${input.toState} requires actor '${sealEntry.authorizedSubject}', got '${input.actorRole || 'none'}'`,
      );
    }

    if (sealEntry?.evidenceRequired) {
      await ensureFileExists(
        path.join(input.workItemDir, sealEntry.evidenceRequired),
        `STATE_COORDINATOR_TRANSITION_FAILED: seal transition evidence for ${input.fromState} → ${input.toState}`,
      );
    }
  }

  const evidenceResult = await checkStateEvidenceRequirement(
    input.toState,
    input.workItemDir,
  );
  if (!evidenceResult.met) {
    throw new Error(
      `STATE_COORDINATOR_TRANSITION_FAILED: evidence requirement not met for ${input.toState}. Missing: ${evidenceResult.missing}. ${evidenceResult.description ?? ''}`.trim(),
    );
  }
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

export async function transitionWithEvidence(
  input: TransitionWithEvidenceInput,
): Promise<TransitionWithEvidenceResult> {
  if (!input.deps?.projectManager) {
    throw new Error('STATE_COORDINATOR_TRANSITION_FAILED: ProjectManager not available');
  }

  await validateTransitionRequest(input);

  const projectSm = await input.deps.projectManager.getProjectStateManager(input.projectRoot);

  await projectSm.transition(
    input.workItemId,
    input.fromState,
    input.toState,
    input.actorRole,
    input.workflowType,
    {
      evidence: input.evidence,
      transition_context: {
        source: 'state_coordinator_v11',
        ...(input.transitionContext ?? {}),
      },
    },
  );

  return {
    attempted: true,
    advanced: true,
    from_state: input.fromState,
    to_state: input.toState,
    evidence: input.evidence,
    transition_result: {
      source: 'StateManager',
      workItemId: input.workItemId,
      previousState: input.fromState,
      currentState: input.toState,
      timestamp: new Date().toISOString(),
    },
  };
}
