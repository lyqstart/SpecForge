/**
 * state-coordinator-v11.ts — SpecForge v1.1.3 state authority coordinator
 *
 * StateManager / events.jsonl is the authoritative state source.
 * runtime/state.json is a projection cache.
 * work_item.json is WI metadata and must not drive governance state.
 * MUST NOT call workflowEngine.transitionFull()
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
import { ACTOR_ROLES } from '@specforge/types/actor-roles';

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
  try { await fs.access(filePath); }
  catch { throw new Error(`${description} missing: ${path.basename(filePath)}`); }
}

export function isCanonicalNoCodeVerificationCandidateManifest(input: {
  manifest: Record<string, unknown>;
  workItemId: string;
  workflowType: string;
}): boolean {
  const manifest = input.manifest;
  const integrationEffect = manifest.project_integration_effect;
  const entries = manifest.entries;
  if (input.workflowType === 'investigation') {
    return manifest.workflow_type === 'investigation' &&
      manifest.no_project_spec_change === true &&
      typeof integrationEffect === 'string' &&
      integrationEffect.trim().toLowerCase() === 'evidence_only' &&
      manifest.merge_required === false &&
      manifest.merge_applicable === false &&
      Array.isArray(entries) &&
      entries.length === 0;
  }
  if (input.workflowType === 'contract_change') {
    return manifest.workflow_type === 'contract_change' &&
      manifest.workflow_path === 'contract_change_path' &&
      manifest.merge_required === true &&
      Array.isArray(entries) &&
      entries.length > 0 &&
      entries.every(entry => entry && typeof entry === 'object' &&
        String((entry as Record<string, unknown>).target_path ?? '').replace(/\\/g, '/')
          .endsWith('.specforge/project/extension_registry.json'));
  }
  if (input.workflowType === 'spec_migration') {
    const baseSpecVersion = manifest.base_spec_version;
    const precondition = manifest.project_spec_precondition_sha256;
    const repairEvidencePaths = manifest.repair_evidence_paths;
    return manifest.schema_version === '1.1' &&
      manifest.work_item_id === input.workItemId &&
      manifest.workflow_type === 'spec_migration' &&
      manifest.workflow_path === 'spec_migration_path' &&
      typeof baseSpecVersion === 'string' &&
      /^PSV-[0-9]{4,}$/.test(baseSpecVersion) &&
      typeof precondition === 'string' &&
      /^sha256:[0-9a-f]{64}$/i.test(precondition) &&
      Array.isArray(repairEvidencePaths) &&
      repairEvidencePaths.length > 0 &&
      repairEvidencePaths.every(value =>
        typeof value === 'string' &&
        value.startsWith('.specforge/project/') &&
        !value.split('/').includes('..')
      ) &&
      manifest.merge_required === true &&
      Array.isArray(entries) &&
      entries.length > 0 &&
      entries.every(entry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
        const record = entry as Record<string, unknown>;
        const candidatePath = String(record.candidate_path ?? '').replace(/\\/g, '/');
        const targetPath = String(record.target_path ?? '').replace(/\\/g, '/');
        return record.operation === 'replace' &&
          candidatePath.startsWith('candidates/') &&
          !candidatePath.split('/').includes('..') &&
          targetPath.startsWith('.specforge/project/') &&
          !targetPath.split('/').includes('..');
      });
  }
  return false;
}
async function assertNoCodeVerificationTransition(input: TransitionWithEvidenceInput): Promise<void> {
  if (input.fromState !== 'post_merge_verified' || input.toState !== 'verification_running') return;
  if (!['investigation', 'contract_change', 'spec_migration'].includes(input.workflowType)) {
    throw new Error('STATE_COORDINATOR_TRANSITION_FAILED: post_merge_verified → verification_running is reserved for no-code verification workflows');
  }
  const manifestPath = path.join(input.workItemDir, 'candidate_manifest.json');
  let manifest: Record<string, unknown>;
  try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as Record<string, unknown>; }
  catch { throw new Error('STATE_COORDINATOR_TRANSITION_FAILED: no-code verification requires valid candidate_manifest.json'); }
  if (!isCanonicalNoCodeVerificationCandidateManifest({
    manifest,
    workItemId: input.workItemId,
    workflowType: input.workflowType,
  })) {
    throw new Error('STATE_COORDINATOR_TRANSITION_FAILED: no-code verification requires a canonical workflow-specific candidate manifest');
  }
}

async function assertFormalVersionBeforeClose(input: TransitionWithEvidenceInput): Promise<void> {
  if (input.fromState !== 'verification_done' || input.toState !== 'closed') return;

  // Rollout compatibility: Formal Version Gate is mandatory for Work Items
  // created under the Architecture Consistency governance contract. Older WIs
  // do not have Impact Scope and must remain closable while the project is
  // bootstrapped through spec_migration. Investigation/rollback are not version
  // publication workflows and therefore do not require this gate.
  if (input.workflowType === 'investigation' || input.workflowType === 'rollback') return;

  let triggerResult: any = null;
  try {
    triggerResult = JSON.parse(
      await fs.readFile(path.join(input.workItemDir, 'trigger_result.json'), 'utf-8'),
    );
  } catch {
    triggerResult = null;
  }
  let governanceScope: any = null;
  let gitContext: any = null;
  try {
    governanceScope = JSON.parse(
      await fs.readFile(path.join(input.workItemDir, 'governance_scope.json'), 'utf-8'),
    );
  } catch {
    governanceScope = null;
  }
  try {
    gitContext = JSON.parse(
      await fs.readFile(path.join(input.workItemDir, 'git_context.json'), 'utf-8'),
    );
  } catch {
    gitContext = null;
  }
  const governedByFormalVersionContract =
    (triggerResult?.impact_scope &&
      typeof triggerResult.impact_scope === 'object' &&
      !Array.isArray(triggerResult.impact_scope)) ||
    governanceScope?.active === true ||
    gitContext?.git_enabled === true;
  if (!governedByFormalVersionContract) return;

  const reportPath = path.join(input.workItemDir, 'gates', 'formal_version_gate.json');
  let report: any = null;
  try { report = JSON.parse(await fs.readFile(reportPath, 'utf-8')); } catch { report = null; }
  if (report?.status !== 'passed') {
    throw new Error('STATE_COORDINATOR_TRANSITION_FAILED: formal_version_gate must pass before verification_done → closed');
  }
}

async function validateTransitionRequest(input: TransitionWithEvidenceInput): Promise<void> {
  if (!input.workItemId) throw new Error('STATE_COORDINATOR_TRANSITION_FAILED: workItemId is required');
  if (!(WI_STATUSES_V11 as readonly string[]).includes(input.toState)) {
    throw new Error(`STATE_COORDINATOR_TRANSITION_FAILED: invalid target state "${input.toState}"`);
  }
  if (input.fromState !== '' && !(WI_STATUSES_V11 as readonly string[]).includes(input.fromState)) {
    throw new Error(`STATE_COORDINATOR_TRANSITION_FAILED: invalid from_state "${input.fromState}"`);
  }
  if (input.fromState !== '' && isForbiddenTransition(input.fromState, input.toState)) {
    throw new Error(`STATE_COORDINATOR_TRANSITION_FAILED: forbidden transition ${input.fromState} → ${input.toState}`);
  }
  if (input.fromState !== '' && !isValidV11Transition(input.fromState, input.toState)) {
    throw new Error(`STATE_COORDINATOR_TRANSITION_FAILED: invalid transition ${input.fromState} → ${input.toState}`);
  }
  if (input.fromState === 'intake_ready' && input.toState === 'candidate_preparing' && input.workflowType !== 'contract_change') {
    throw new Error('STATE_COORDINATOR_TRANSITION_FAILED: intake_ready → candidate_preparing is reserved for workflow_type=contract_change');
  }
  if (input.fromState === 'approved' && input.toState === 'blocked') {
    const source = input.transitionContext?.source;
    if (input.actorRole !== ACTOR_ROLES.userDecisionRecorder || source !== 'approval_invalidation') {
      throw new Error("STATE_COORDINATOR_TRANSITION_FAILED: approved → blocked is reserved for the atomic approval-invalidation flow");
    }
    await ensureFileExists(path.join(input.workItemDir, 'approval_invalidation.json'), 'STATE_COORDINATOR_TRANSITION_FAILED: approval invalidation evidence');
  }

  await assertNoCodeVerificationTransition(input);
  await assertFormalVersionBeforeClose(input);

  if (input.fromState !== '' && isSealTransition(input.fromState, input.toState)) {
    const sealEntry = getSealTransition(input.fromState, input.toState);
    if (sealEntry && input.actorRole !== sealEntry.authorizedSubject) {
      throw new Error(`STATE_COORDINATOR_TRANSITION_FAILED: seal transition ${input.fromState} → ${input.toState} requires actor '${sealEntry.authorizedSubject}', got '${input.actorRole || 'none'}'`);
    }
    if (sealEntry?.evidenceRequired) {
      await ensureFileExists(path.join(input.workItemDir, sealEntry.evidenceRequired), `STATE_COORDINATOR_TRANSITION_FAILED: seal transition evidence for ${input.fromState} → ${input.toState}`);
    }
  }
  const evidenceResult = await checkStateEvidenceRequirement(input.toState, input.workItemDir);
  if (!evidenceResult.met) {
    throw new Error(`STATE_COORDINATOR_TRANSITION_FAILED: evidence requirement not met for ${input.toState}. Missing: ${evidenceResult.missing}. ${evidenceResult.description ?? ''}`.trim());
  }
}

export async function readAuthoritativeState(input: { deps: any; projectRoot: string; workItemId: string; }): Promise<AuthoritativeStateRead> {
  const projectManager = input.deps?.projectManager;
  if (!projectManager?.getProjectStateManager) return { current_state: null, source: 'missing', rebuilt_from_events: false };
  const projectSm = await projectManager.getProjectStateManager(input.projectRoot);
  let rebuilt = false;
  if (typeof projectSm?.rebuildFromEventsFile === 'function') {
    const rebuildResult = await projectSm.rebuildFromEventsFile();
    rebuilt = rebuildResult?.replayed ?? false;
  }
  if (typeof projectSm?.getState === 'function') {
    const state = normalizeState(await projectSm.getState(input.workItemId));
    if (state) return { current_state: state, source: 'StateManager', rebuilt_from_events: rebuilt };
  }
  return { current_state: null, source: 'missing', rebuilt_from_events: rebuilt };
}

export async function transitionWithEvidence(input: TransitionWithEvidenceInput): Promise<TransitionWithEvidenceResult> {
  if (!input.deps?.projectManager) throw new Error('STATE_COORDINATOR_TRANSITION_FAILED: ProjectManager not available');
  await validateTransitionRequest(input);
  const projectSm = await input.deps.projectManager.getProjectStateManager(input.projectRoot);
  await projectSm.transition(
    input.workItemId, input.fromState, input.toState, input.actorRole, input.workflowType,
    { evidence: input.evidence, transition_context: { source: 'state_coordinator_v11', ...(input.transitionContext ?? {}) } },
  );
  return {
    attempted: true, advanced: true, from_state: input.fromState, to_state: input.toState, evidence: input.evidence,
    transition_result: {
      source: 'StateManager', workItemId: input.workItemId, previousState: input.fromState,
      currentState: input.toState, timestamp: new Date().toISOString(),
    },
  };
}

export async function recoverInvalidClosureWithEvidence(input: {
  deps: any;
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  workflowType: string;
  evidence: string;
  invalidityReasons: string[];
}): Promise<TransitionWithEvidenceResult> {
  if (!input.deps?.projectManager) {
    throw new Error('STATE_COORDINATOR_CLOSURE_RECOVERY_FAILED: ProjectManager not available');
  }
  if (input.invalidityReasons.length === 0) {
    throw new Error(
      'STATE_COORDINATOR_CLOSURE_RECOVERY_FAILED: at least one verified invalidity reason is required',
    );
  }

  const recoveryPath = path.join(input.workItemDir, 'closure_recovery.json');
  let recovery: any = null;
  try {
    recovery = JSON.parse(await fs.readFile(recoveryPath, 'utf-8'));
  } catch {
    recovery = null;
  }
  if (
    recovery?.work_item_id !== input.workItemId ||
    recovery?.recovery_action !== 'closed_to_implementation_ready' ||
    recovery?.status !== 'authorized'
  ) {
    throw new Error(
      'STATE_COORDINATOR_CLOSURE_RECOVERY_FAILED: authorized closure_recovery.json is required',
    );
  }

  const projectSm = await input.deps.projectManager.getProjectStateManager(input.projectRoot);
  if (typeof projectSm?.rebuildFromEventsFile === 'function') {
    await projectSm.rebuildFromEventsFile();
  }
  const current = normalizeState(await projectSm.getState(input.workItemId));
  if (current !== 'closed') {
    throw new Error(
      `STATE_COORDINATOR_CLOSURE_RECOVERY_FAILED: expected authoritative state closed, got ${current ?? 'null'}`,
    );
  }

  await projectSm.transition(
    input.workItemId,
    'closed',
    'implementation_ready',
    ACTOR_ROLES.closeGate,
    input.workflowType,
    {
      evidence: input.evidence,
      transition_context: {
        source: 'closure_invalidation',
        recovery_record: 'closure_recovery.json',
        invalidity_reasons: input.invalidityReasons,
        compensating_transition: true,
      },
    },
  );

  return {
    attempted: true,
    advanced: true,
    from_state: 'closed',
    to_state: 'implementation_ready',
    evidence: input.evidence,
    transition_result: {
      source: 'StateManager',
      workItemId: input.workItemId,
      previousState: 'closed',
      currentState: 'implementation_ready',
      timestamp: new Date().toISOString(),
    },
  };
}
