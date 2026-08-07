/**
 * sf-v11-gate-run — v1.1 Gate Runner handler
 *
 * V6 state authority alignment:
 * - candidate gates still advance gates_running → approval_required / gates_failed;
 * - post_merge_gate advances merged → post_merge_verified;
 * - verification_gate advances implementation_done → verification_running → verification_done;
 * - all durable transitions go through state-coordinator-v11 / StateManager.
 */

import { registerHandler } from '../ToolDispatcher';
import { runRequiredGates } from '../lib/gate-runner-v11';
import type { GateIdV11, GateReportV11 } from '../lib/gate-runner-v11';
import { getRequiredGates, type CandidateGatePhaseV11 } from '../lib/required-gates';
import { readAuthoritativeState, transitionWithEvidence } from '../lib/state-coordinator-v11';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import { workItemCandidateManifest, workItemRoot } from '@specforge/types/directory-layout';
import { resolveWorkItemSpecArtifacts } from '../lib/governance-invariants-v11';

const VALID_GATE_IDS: readonly GateIdV11[] = [
  'entry_gate',
  'workflow_selection_gate',
  'required_files_gate',
  'candidate_manifest_gate',
  'path_policy_gate',
  'schema_gate',
  'spec_consistency_gate',
  'contract_integrity_gate',
  'trace_gate',
  'workflow_specific_gate',
  'gate_summary_gate',
  'merge_ready_gate',
  'post_merge_gate',
  'verification_gate',
  'close_gate',
] as const;

const POST_CANDIDATE_GATES = new Set<GateIdV11>([
  'merge_ready_gate',
  'post_merge_gate',
  'verification_gate',
  'close_gate',
]);

function isGateIdV11(value: string): value is GateIdV11 {
  return (VALID_GATE_IDS as readonly string[]).includes(value);
}

type WorkflowFacts = {
  workflowPath: string | null;
  workflowType: string | null;
  candidatePhase: CandidateGatePhaseV11 | null;
  workflowPathSource: string | null;
  workflowTypeSource: string | null;
  candidatePhaseSource: string | null;
  checkedFiles: string[];
};

const VALID_CANDIDATE_PHASES = new Set<CandidateGatePhaseV11>([
  'design',
  'requirements',
  'tasks',
  'full',
]);

function normalizeCandidatePhase(value: unknown): CandidateGatePhaseV11 | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return VALID_CANDIDATE_PHASES.has(normalized as CandidateGatePhaseV11)
    ? (normalized as CandidateGatePhaseV11)
    : null;
}

async function inferCandidatePhase(
  projectRoot: string,
  workItemId: string
): Promise<CandidateGatePhaseV11> {
  const [tasks, requirements, design] = await Promise.all([
    resolveWorkItemSpecArtifacts({ projectRoot, workItemId, kind: 'tasks' }),
    resolveWorkItemSpecArtifacts({ projectRoot, workItemId, kind: 'requirements' }),
    resolveWorkItemSpecArtifacts({ projectRoot, workItemId, kind: 'design' }),
  ]);
  if (tasks.length > 0) return 'full';
  if (requirements.length > 0) return 'requirements';
  if (design.length > 0) return 'design';
  return 'full';
}

async function readWorkflowFacts(projectRoot: string, workItemId: string): Promise<WorkflowFacts> {
  const workItemDir = workItemRoot(projectRoot, workItemId);
  const candidates = [
    path.join(workItemDir, 'trigger_result.json'),
    path.join(workItemDir, 'work_item.json'),
    workItemCandidateManifest(projectRoot, workItemId),
  ];
  const checkedFiles: string[] = [];
  const facts: WorkflowFacts = {
    workflowPath: null,
    workflowType: null,
    candidatePhase: null,
    workflowPathSource: null,
    workflowTypeSource: null,
    candidatePhaseSource: null,
    checkedFiles,
  };

  for (const file of candidates) {
    checkedFiles.push(file);
    try {
      const json = JSON.parse(await fs.readFile(file, 'utf-8'));
      if (!facts.workflowPath && typeof json.workflow_path === 'string' && json.workflow_path) {
        facts.workflowPath = json.workflow_path;
        facts.workflowPathSource = file;
      }
      if (!facts.workflowType && typeof json.workflow_type === 'string' && json.workflow_type) {
        facts.workflowType = json.workflow_type;
        facts.workflowTypeSource = file;
      }
      if (file === workItemCandidateManifest(projectRoot, workItemId)) {
        const phase = normalizeCandidatePhase(json.candidate_phase);
        if (phase) {
          facts.candidatePhase = phase;
          facts.candidatePhaseSource = file;
        }
      }
    } catch {
      // try next source
    }
  }

  if (!facts.candidatePhase) {
    facts.candidatePhase = await inferCandidatePhase(projectRoot, workItemId);
    facts.candidatePhaseSource = 'artifact_inference';
  }
  return facts;
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function workflowTypeFromPath(workflowPath: string): string {
  switch (workflowPath) {
    case 'requirement_change_path':
      return 'feature_spec';
    case 'design_change_path':
      return 'design_change';
    case 'architecture_change_path':
      return 'architecture_change';
    case 'task_change_path':
      return 'task_change';
    case 'code_only_fast_path':
      return 'quick_change';
    case 'spec_migration_path':
      return 'spec_migration';
    case 'contract_change_path':
      return 'contract_change';
    case 'rollback_path':
      return 'rollback';
    default:
      return 'quick_change';
  }
}

function gateStatusCountsAsPassed(report: Pick<GateReportV11, 'status'> | undefined): boolean {
  if (!report) return false;
  return ['passed', 'skipped', 'not_applicable'].includes(String(report.status));
}

export function evaluateVerificationGateAutoAdvanceEligibility(input: {
  reports: Array<Pick<GateReportV11, 'gate_id' | 'status'>>;
  summaryStatus: string;
}): {
  allowed: boolean;
  reason: string;
  failed_gate_ids: string[];
  missing_gate_ids: string[];
} {
  const reportById = new Map(input.reports.map(report => [report.gate_id, report]));
  const requiredGateIds: GateIdV11[] = ['verification_gate', 'formal_version_gate'];
  const missingGateIds = requiredGateIds.filter(gateId => !reportById.has(gateId));
  const failedGateIds = requiredGateIds.filter(
    gateId => reportById.has(gateId) && !gateStatusCountsAsPassed(reportById.get(gateId)),
  );

  if (missingGateIds.length > 0) {
    return {
      allowed: false,
      reason: 'verification_owned_gate_missing',
      failed_gate_ids: failedGateIds,
      missing_gate_ids: missingGateIds,
    };
  }
  if (failedGateIds.length > 0) {
    return {
      allowed: false,
      reason: 'verification_owned_gate_failed',
      failed_gate_ids: failedGateIds,
      missing_gate_ids: [],
    };
  }
  if (input.summaryStatus !== 'passed') {
    return {
      allowed: false,
      reason: 'verification_gate_summary_not_passed',
      failed_gate_ids: [],
      missing_gate_ids: [],
    };
  }
  return {
    allowed: true,
    reason: 'verification_and_formal_version_gates_passed',
    failed_gate_ids: [],
    missing_gate_ids: [],
  };
}

function defaultGateAliasForState(currentState: string | null, workflowType?: string): string {
  if (currentState === 'merged') return 'post_merge';
  if (
    currentState === 'implementation_done' ||
    currentState === 'verification_running' ||
    (['investigation', 'contract_change'].includes(String(workflowType)) &&
      currentState === 'post_merge_verified')
  ) {
    return 'verification';
  }
  return 'candidate';
}

function normalizeGateIds(
  input: unknown,
  gateType: unknown,
  workflowPath: string,
  currentState: string | null,
  candidatePhase: CandidateGatePhaseV11,
  workflowType?: string
): { gateIds: GateIdV11[]; aliasesUsed: string[]; directStageGate: boolean } {
  const aliasesUsed: string[] = [];
  const explicitGateType = String(gateType ?? '')
    .trim()
    .toLowerCase();
  const rawIds =
    Array.isArray(input) && input.length > 0
      ? input.map(String)
      : explicitGateType
        ? [explicitGateType]
        : [defaultGateAliasForState(currentState, workflowType)];
  const gateIds: GateIdV11[] = [];
  let directStageGate = false;

  for (const rawValue of rawIds) {
    const raw = String(rawValue).trim().toLowerCase();
    switch (raw) {
      case 'design':
      case 'requirements':
        aliasesUsed.push(raw);
        directStageGate = true;
        gateIds.push('workflow_specific_gate');
        break;
      case 'all':
      case 'candidate':
        aliasesUsed.push(raw);
        gateIds.push(...getRequiredGates(workflowPath, 'candidate', candidatePhase, workflowType));
        break;
      case 'tasks':
        aliasesUsed.push(raw);
        gateIds.push(...getRequiredGates(workflowPath, 'candidate', 'full', workflowType));
        break;
      case 'merge':
        aliasesUsed.push(raw);
        gateIds.push(...getRequiredGates(workflowPath, 'merge', 'full', workflowType));
        break;
      case 'post_merge':
      case 'post-merge':
        aliasesUsed.push(raw);
        gateIds.push('post_merge_gate');
        break;
      case 'post_implementation':
      case 'post-implementation':
        aliasesUsed.push(raw);
        gateIds.push(
          ...getRequiredGates(workflowPath, 'post_implementation', 'full', workflowType)
        );
        break;
      case 'full':
        aliasesUsed.push(raw);
        gateIds.push(...getRequiredGates(workflowPath, 'all', 'full', workflowType));
        break;
      case 'verification':
        aliasesUsed.push(raw);
        gateIds.push('verification_gate');
        break;
      case 'close':
        aliasesUsed.push(raw);
        gateIds.push('close_gate');
        break;
      default:
        if (!isGateIdV11(raw)) {
          throw new Error(
            `UNKNOWN_GATE_ID: ${raw}. Allowed canonical Gate IDs: ${VALID_GATE_IDS.join(
              ', '
            )}. Supported stage aliases: design, requirements, candidate, tasks, merge, post_merge, verification, close.`
          );
        }
        gateIds.push(raw);
    }
  }

  if (workflowPath === 'code_only_fast_path') {
    return {
      gateIds: dedupe(gateIds.filter(id => id !== 'required_files_gate')),
      aliasesUsed,
      directStageGate,
    };
  }

  return { gateIds: dedupe(gateIds), aliasesUsed, directStageGate };
}

function candidateGateSetCoversRequiredGates(input: {
  workflowPath: string;
  candidatePhase: CandidateGatePhaseV11;
  workflowType: string;
  reports: GateReportV11[];
}):
  | { ok: true; requiredGateIds: GateIdV11[]; failedRequiredGateIds: GateIdV11[] }
  | { ok: false; reason: string; details: unknown } {
  const requiredGateIds = getRequiredGates(
    input.workflowPath,
    'candidate',
    input.candidatePhase,
    input.workflowType
  );
  const reportById = new Map<GateIdV11, GateReportV11>();

  for (const report of input.reports) {
    reportById.set(report.gate_id, report);
  }

  const postCandidateSeen = input.reports
    .map(r => r.gate_id)
    .filter(gateId => POST_CANDIDATE_GATES.has(gateId));

  if (postCandidateSeen.length > 0) {
    return {
      ok: false,
      reason: 'post_candidate_gates_present',
      details: { post_candidate_gates: postCandidateSeen },
    };
  }

  const missingRequired = requiredGateIds.filter(gateId => !reportById.has(gateId));
  if (missingRequired.length > 0) {
    return {
      ok: false,
      reason: 'required_candidate_gates_missing',
      details: { missing_required_candidate_gates: missingRequired },
    };
  }

  const failedRequiredGateIds = requiredGateIds.filter(
    gateId => !gateStatusCountsAsPassed(reportById.get(gateId))
  );

  // Coverage and verdict are separate facts. Once every required Candidate
  // Gate produced a report, the authoritative state must leave gates_running:
  // pass/waiver -> approval_required; hard failure -> gates_failed.
  return { ok: true, requiredGateIds, failedRequiredGateIds };
}

async function transitionGateState(
  input: {
    deps: any;
    context: any;
    projectRoot: string;
    workItemId: string;
    workItemDir: string;
    workflowPath: string;
    reports: GateReportV11[];
    summaryStatus: string;
  },
  fromState: string,
  toState: string,
  workflowType: string,
  evidence: string
): Promise<unknown> {
  return transitionWithEvidence({
    deps: input.deps,
    context: input.context,
    projectRoot: input.projectRoot,
    workItemId: input.workItemId,
    workItemDir: input.workItemDir,
    fromState,
    toState,
    workflowType,
    actorRole: 'gate_runner',
    evidence,
    transitionContext: {
      source: 'sf_v11_gate_run',
      summary_status: input.summaryStatus,
      report_gate_ids: input.reports.map(report => report.gate_id),
    },
  });
}

export function candidateGateRecoverySequence(
  currentState: string,
  workflowType: string
): string[] {
  if (currentState === 'gates_failed') {
    return [
      'gates_failed',
      'candidate_preparing',
      'candidate_prepared',
      'gates_running',
    ];
  }

  return workflowType === 'contract_change'
    ? [
        'created',
        'intake_ready',
        'candidate_preparing',
        'candidate_prepared',
        'gates_running',
      ]
    : [
        'created',
        'intake_ready',
        'impact_analyzing',
        'impact_analyzed',
        'workflow_selected',
        'candidate_preparing',
        'candidate_prepared',
        'gates_running',
      ];
}

// GATE_RETRY_STATE_V27
async function autoAdvanceCandidateState(input: {
  deps: any;
  context: any;
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  workflowPath: string;
  workflowType: string;
  candidatePhase: CandidateGatePhaseV11;
  directStageGate: boolean;
  reports: GateReportV11[];
  summaryStatus: string;
  currentState: string | null;
}): Promise<any> {
  if (input.directStageGate) {
    return { attempted: false, reason: 'direct_stage_gate_does_not_finalize_candidate' };
  }
  const coverage = candidateGateSetCoversRequiredGates({
    workflowPath: input.workflowPath,
    candidatePhase: input.candidatePhase,
    workflowType: input.workflowType,
    reports: input.reports,
  });

  if (!coverage.ok) {
    return { attempted: false, reason: coverage.reason, details: coverage.details };
  }

  const currentState = input.currentState;
  const recoverableGateStates = [
    'created',
    'intake_ready',
    'impact_analyzing',
    'impact_analyzed',
    'workflow_selected',
    'candidate_preparing',
    'candidate_prepared',
    'gates_running',
    'gates_failed',
  ];

  if (!currentState || !recoverableGateStates.includes(currentState)) {
    return {
      attempted: false,
      reason: 'current_state_is_not_candidate_gate_recoverable',
      current_state: currentState,
    };
  }

  const passed = ['passed', 'passed_with_waiver_required'].includes(String(input.summaryStatus));
  const finalState = passed ? 'approval_required' : 'gates_failed';
  const workflowType = input.workflowType;
  const evidence =
    'gate_runner auto-advance after required candidate gates coverage: summary_status=' +
    input.summaryStatus;
  const transitionSteps: unknown[] = [];

  const sequence = candidateGateRecoverySequence(currentState, workflowType);
  let index = sequence.indexOf(currentState);
  while (index >= 0 && sequence[index] !== 'gates_running') {
    const from = sequence[index];
    const to = sequence[index + 1];
    transitionSteps.push(
      await transitionGateState(
        input,
        from,
        to,
        workflowType,
        evidence + ' | state authority recovery step ' + from + '->' + to
      )
    );
    index += 1;
  }

  transitionSteps.push(
    await transitionGateState(
      input,
      'gates_running',
      finalState,
      workflowType,
      evidence + ' | state authority step gates_running->' + finalState
    )
  );

  return {
    attempted: true,
    advanced: true,
    from_state: currentState,
    to_state: finalState,
    workflow_type: workflowType,
    evidence,
    transition_steps: transitionSteps,
  };
}

async function autoAdvancePostMergeState(input: {
  deps: any;
  context: any;
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  workflowPath: string;
  workflowType: string;
  reports: GateReportV11[];
  summaryStatus: string;
  currentState: string | null;
}): Promise<any> {
  const report = input.reports.find(r => r.gate_id === 'post_merge_gate');
  if (!report) {
    return { attempted: false, reason: 'post_merge_gate_not_run' };
  }
  if (!gateStatusCountsAsPassed(report)) {
    return {
      attempted: false,
      reason: 'post_merge_gate_not_passed',
      status: report.status,
    };
  }
  if (input.currentState !== 'merged') {
    return {
      attempted: false,
      reason: 'current_state_not_merged',
      current_state: input.currentState,
    };
  }

  const workflowType = input.workflowType;
  const step = await transitionGateState(
    input,
    'merged',
    'post_merge_verified',
    workflowType,
    'post_merge_gate passed; authoritative transition merged->post_merge_verified'
  );

  return {
    attempted: true,
    advanced: true,
    from_state: 'merged',
    to_state: 'post_merge_verified',
    workflow_type: workflowType,
    transition_steps: [step],
  };
}

async function autoAdvanceVerificationState(input: {
  deps: any;
  context: any;
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  workflowPath: string;
  workflowType: string;
  reports: GateReportV11[];
  summaryStatus: string;
  currentState: string | null;
}): Promise<any> {
  const eligibility = evaluateVerificationGateAutoAdvanceEligibility({
    reports: input.reports,
    summaryStatus: input.summaryStatus,
  });
  if (!eligibility.allowed) {
    return {
      attempted: false,
      reason: eligibility.reason,
      failed_gate_ids: eligibility.failed_gate_ids,
      missing_gate_ids: eligibility.missing_gate_ids,
      summary_status: input.summaryStatus,
    };
  }
  if (
    input.currentState !== 'implementation_done' &&
    input.currentState !== 'verification_running' &&
    !(input.workflowType === 'investigation' && input.currentState === 'post_merge_verified')
  ) {
    return {
      attempted: false,
      reason: 'current_state_not_verification_recoverable',
      current_state: input.currentState,
    };
  }

  const workflowType = input.workflowType;
  const steps: unknown[] = [];

  if (
    input.currentState === 'implementation_done' ||
    input.currentState === 'post_merge_verified'
  ) {
    steps.push(
      await transitionGateState(
        input,
        input.currentState,
        'verification_running',
        workflowType,
        `verification_gate passed; recovery step ${input.currentState}->verification_running`
      )
    );
  }

  steps.push(
    await transitionGateState(
      input,
      'verification_running',
      'verification_done',
      workflowType,
      'verification_gate passed; authoritative transition verification_running->verification_done'
    )
  );

  return {
    attempted: true,
    advanced: true,
    from_state: input.currentState,
    to_state: 'verification_done',
    workflow_type: workflowType,
    transition_steps: steps,
  };
}

async function autoAdvanceStateAfterGateRun(input: {
  deps: any;
  context: any;
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  workflowPath: string;
  workflowType: string;
  candidatePhase: CandidateGatePhaseV11;
  directStageGate: boolean;
  reports: GateReportV11[];
  summaryStatus: string;
  currentState: string | null;
}): Promise<any> {
  if (input.reports.some(r => r.gate_id === 'post_merge_gate')) {
    return autoAdvancePostMergeState(input);
  }

  if (input.reports.some(r => r.gate_id === 'verification_gate')) {
    return autoAdvanceVerificationState(input);
  }

  return autoAdvanceCandidateState(input);
}

function normalizeReconcileAttemptId(value: unknown): string | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const normalized = String(value).trim();
  if (!/^attempt-\d{4}$/.test(normalized)) {
    throw new Error(
      `RECONCILE_ATTEMPT_ID_INVALID: expected attempt-NNNN, got ${JSON.stringify(normalized)}`
    );
  }
  return normalized;
}

function gateAttemptNumber(attemptId: string): number {
  return Number(attemptId.slice('attempt-'.length));
}

async function readJsonFile<T>(filePath: string, errorCode: string): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch (error: any) {
    throw new Error(`${errorCode}: ${filePath}: ${error.message}`);
  }
}

function resolveGateInputPath(projectRoot: string, inputFile: string): string {
  return path.isAbsolute(inputFile)
    ? path.normalize(inputFile)
    : path.resolve(projectRoot, inputFile);
}

export async function inspectCandidateGateAttemptForReconciliation(input: {
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  workflowPath: string;
  workflowType: string;
  candidatePhase: CandidateGatePhaseV11;
  attemptId: string;
}): Promise<{
  attempt_id: string;
  attempt_path: string;
  summary_status: 'passed';
  reports: GateReportV11[];
  required_gate_ids: GateIdV11[];
  latest_view_matches: true;
  input_freshness_check: 'pass';
  freshness_mode: 'attempt_input_snapshot';
  checked_input_files: string[];
  non_materialized_input_paths: string[];
}> {
  const attemptsRoot = path.join(input.workItemDir, 'gate_attempts');
  let attemptIds: string[] = [];
  try {
    attemptIds = (await fs.readdir(attemptsRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && /^attempt-\d{4}$/.test(entry.name))
      .map(entry => entry.name)
      .sort((left, right) => gateAttemptNumber(left) - gateAttemptNumber(right));
  } catch (error: any) {
    throw new Error(`RECONCILE_ATTEMPTS_READ_FAILED: ${error.message}`);
  }

  if (attemptIds.length === 0 || attemptIds[attemptIds.length - 1] !== input.attemptId) {
    throw new Error(
      `RECONCILE_ATTEMPT_NOT_LATEST: requested=${input.attemptId}; latest=${attemptIds[attemptIds.length - 1] ?? 'none'}`
    );
  }

  const attemptPath = path.join(attemptsRoot, input.attemptId);
  const attemptResult = await readJsonFile<Record<string, unknown>>(
    path.join(attemptPath, 'attempt-result.json'),
    'RECONCILE_ATTEMPT_RESULT_INVALID',
  );
  if (
    attemptResult.attempt_id !== input.attemptId ||
    attemptResult.work_item_id !== input.workItemId ||
    attemptResult.source !== 'gate_run' ||
    attemptResult.summary_status !== 'passed'
  ) {
    throw new Error(
      `RECONCILE_ATTEMPT_NOT_PASSED_GATE_RUN: attempt=${input.attemptId}; source=${String(
        attemptResult.source,
      )}; summary_status=${String(attemptResult.summary_status)}`
    );
  }

  const completedAt = Date.parse(String(attemptResult.completed_at ?? ''));
  if (!Number.isFinite(completedAt)) {
    throw new Error(`RECONCILE_ATTEMPT_COMPLETED_AT_INVALID: attempt=${input.attemptId}`);
  }

  const gatesPath = path.join(attemptPath, 'gates');
  const gateNames = (await fs.readdir(gatesPath))
    .filter(name => name.endsWith('.json'))
    .sort();
  const reports: GateReportV11[] = [];
  for (const name of gateNames) {
    const report = await readJsonFile<GateReportV11>(
      path.join(gatesPath, name),
      'RECONCILE_GATE_REPORT_INVALID',
    );
    if (report.work_item_id !== input.workItemId) {
      throw new Error(
        `RECONCILE_GATE_REPORT_WORK_ITEM_MISMATCH: gate=${report.gate_id}; work_item_id=${report.work_item_id}`
      );
    }
    reports.push(report);
  }

  const coverage = candidateGateSetCoversRequiredGates({
    workflowPath: input.workflowPath,
    candidatePhase: input.candidatePhase,
    workflowType: input.workflowType,
    reports,
  });
  if (!coverage.ok) {
    throw new Error(
      `RECONCILE_CANDIDATE_GATE_COVERAGE_INVALID: ${coverage.reason}: ${JSON.stringify(
        coverage.details,
      )}`
    );
  }
  if (coverage.failedRequiredGateIds.length > 0) {
    throw new Error(
      `RECONCILE_CANDIDATE_GATE_NOT_PASSED: ${coverage.failedRequiredGateIds.join(',')}`
    );
  }

  const reportById = new Map(reports.map(report => [report.gate_id, report]));
  for (const gateId of coverage.requiredGateIds) {
    const report = reportById.get(gateId);
    if (!report || report.status !== 'passed') {
      throw new Error(
        `RECONCILE_REQUIRED_GATE_NOT_STRICTLY_PASSED: gate=${gateId}; status=${report?.status ?? 'missing'}`
      );
    }

    const attemptBytes = await fs.readFile(path.join(gatesPath, `${gateId}.json`));
    let latestBytes: Buffer;
    try {
      latestBytes = await fs.readFile(
        path.join(input.workItemDir, 'gates', `${gateId}.json`),
      );
    } catch (error: any) {
      throw new Error(
        `RECONCILE_LATEST_GATE_VIEW_MISSING: gate=${gateId}: ${error.message}`
      );
    }
    if (!attemptBytes.equals(latestBytes)) {
      throw new Error(`RECONCILE_LATEST_GATE_VIEW_MISMATCH: gate=${gateId}`);
    }
  }

  const attemptSummary = await fs.readFile(path.join(attemptPath, 'gate_summary.md'));
  let latestSummary: Buffer;
  try {
    latestSummary = await fs.readFile(path.join(input.workItemDir, 'gate_summary.md'));
  } catch (error: any) {
    throw new Error(`RECONCILE_LATEST_SUMMARY_MISSING: ${error.message}`);
  }
  if (!attemptSummary.equals(latestSummary)) {
    throw new Error('RECONCILE_LATEST_SUMMARY_MISMATCH');
  }

  const inputSnapshotPath = path.join(attemptPath, 'input-snapshot.json');
  let inputSnapshot: {
    schema_version?: unknown;
    attempt_id?: unknown;
    work_item_id?: unknown;
    captured_at?: unknown;
    inputs?: unknown;
  };
  try {
    inputSnapshot = await readJsonFile<typeof inputSnapshot>(
      inputSnapshotPath,
      'RECONCILE_INPUT_SNAPSHOT_INVALID',
    );
  } catch (error: any) {
    if (String(error?.message ?? '').includes('ENOENT')) {
      throw new Error(
        `RECONCILE_INPUT_SNAPSHOT_REQUIRED: attempt=${input.attemptId}; historical Attempt predates GATE-ATTEMPT-INPUT-SNAPSHOT-001 and cannot be safely reconciled without a new Gate Attempt`
      );
    }
    throw error;
  }

  if (
    inputSnapshot.schema_version !== '1.0' ||
    inputSnapshot.attempt_id !== input.attemptId ||
    inputSnapshot.work_item_id !== input.workItemId ||
    !Array.isArray(inputSnapshot.inputs)
  ) {
    throw new Error(
      `RECONCILE_INPUT_SNAPSHOT_SCHEMA_INVALID: attempt=${input.attemptId}`
    );
  }

  const checkedInputFiles: string[] = [];
  const nonMaterializedInputPaths: string[] = [];
  for (const raw of inputSnapshot.inputs) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(
        `RECONCILE_INPUT_SNAPSHOT_ENTRY_INVALID: attempt=${input.attemptId}`
      );
    }
    const entry = raw as Record<string, unknown>;
    const inputPath = String(entry.path ?? '').trim();
    const expectedExists = entry.exists === true;
    const expectedKind = String(entry.kind ?? '').trim();
    if (!inputPath || !['file', 'directory', 'other', 'missing'].includes(expectedKind)) {
      throw new Error(
        `RECONCILE_INPUT_SNAPSHOT_ENTRY_INVALID: attempt=${input.attemptId}; path=${JSON.stringify(inputPath)}; kind=${JSON.stringify(expectedKind)}`
      );
    }

    if (!expectedExists) {
      try {
        await fs.access(inputPath);
        throw new Error(
          `RECONCILE_INPUT_EXISTENCE_CHANGED: path=${inputPath}; expected=missing; actual=exists`
        );
      } catch (error: any) {
        if (String(error?.message ?? '').startsWith('RECONCILE_INPUT_EXISTENCE_CHANGED:')) {
          throw error;
        }
        if (error?.code !== 'ENOENT') {
          throw new Error(
            `RECONCILE_INPUT_STATE_READ_FAILED: path=${inputPath}: ${error?.message ?? String(error)}`
          );
        }
      }
      nonMaterializedInputPaths.push(inputPath);
      continue;
    }

    let stats;
    try {
      stats = await fs.stat(inputPath);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new Error(
          `RECONCILE_INPUT_EXISTENCE_CHANGED: path=${inputPath}; expected=exists; actual=missing`
        );
      }
      throw new Error(
        `RECONCILE_INPUT_STATE_READ_FAILED: path=${inputPath}: ${error?.message ?? String(error)}`
      );
    }

    const actualKind = stats.isFile()
      ? 'file'
      : stats.isDirectory()
        ? 'directory'
        : 'other';
    if (actualKind !== expectedKind) {
      throw new Error(
        `RECONCILE_INPUT_KIND_CHANGED: path=${inputPath}; expected=${expectedKind}; actual=${actualKind}`
      );
    }

    if (actualKind === 'file') {
      const expectedSha256 = String(entry.sha256 ?? '').trim();
      if (!/^[0-9a-f]{64}$/i.test(expectedSha256)) {
        throw new Error(
          `RECONCILE_INPUT_SNAPSHOT_HASH_INVALID: path=${inputPath}`
        );
      }
      const bytes = await fs.readFile(inputPath);
      const actualSha256 = createHash('sha256').update(bytes).digest('hex');
      if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
        throw new Error(
          `RECONCILE_INPUT_HASH_CHANGED: path=${inputPath}; expected=${expectedSha256}; actual=${actualSha256}`
        );
      }
    }

    checkedInputFiles.push(inputPath);
  }

  const freshnessMode = 'attempt_input_snapshot';
  return {
    attempt_id: input.attemptId,
    attempt_path: attemptPath,
    summary_status: 'passed',
    reports,
    required_gate_ids: coverage.requiredGateIds,
    latest_view_matches: true,
    input_freshness_check: 'pass',
    freshness_mode: freshnessMode,
    checked_input_files: checkedInputFiles,
    non_materialized_input_paths: nonMaterializedInputPaths,
  };
}

registerHandler('sf_v11_gate_run', async (args, context, deps) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;

  const idError = validateWorkItemId(workItemId);
  if (idError) {
    return { success: false, error: idError };
  }

  const workItemDir = workItemRoot(projectRoot, workItemId);
  try {
    await fs.access(workItemDir);
  } catch {
    return { success: false, error: `Work Item directory not found: ${workItemDir}` };
  }

  try {
    const workflowFacts = await readWorkflowFacts(projectRoot, workItemId);
    if (!workflowFacts.workflowPath) {
      return {
        success: false,
        error:
          'WORKFLOW_PATH_NOT_FOUND: cannot run v1.1 gates before workflow_path is recorded in trigger_result.json, work_item.json, or candidate_manifest.json.',
        work_item_id: workItemId,
        checked_files: workflowFacts.checkedFiles.map(p =>
          path.relative(projectRoot, p).replace(/\\/g, '/')
        ),
      };
    }

    const authoritativeState = await readAuthoritativeState({
      deps,
      projectRoot,
      workItemId,
    });
    const currentState = authoritativeState.current_state;

    const workflowPath = workflowFacts.workflowPath;
    const requestedPhase = normalizeCandidatePhase(args['candidate_phase']);
    const gateTypePhase = normalizeCandidatePhase(args['gate_type']);
    const candidatePhase =
      requestedPhase ?? gateTypePhase ?? workflowFacts.candidatePhase ?? 'full';
    const workflowType =
      (typeof args['workflow_type'] === 'string' && args['workflow_type']) ||
      workflowFacts.workflowType ||
      workflowTypeFromPath(workflowPath);
    const reconcileAttemptId = normalizeReconcileAttemptId(args['reconcile_attempt_id']);
    if (reconcileAttemptId) {
      if (
        (Array.isArray(args['gate_ids']) && args['gate_ids'].length > 0) ||
        (typeof args['gate_type'] === 'string' && args['gate_type'].trim().length > 0)
      ) {
        throw new Error(
          'RECONCILE_ATTEMPT_ARGUMENT_CONFLICT: reconcile_attempt_id cannot be combined with gate_ids or gate_type'
        );
      }
      if (
        !currentState ||
        !['gates_failed', 'candidate_preparing', 'candidate_prepared', 'gates_running'].includes(
          currentState,
        )
      ) {
        throw new Error(
          `RECONCILE_STATE_NOT_ALLOWED: expected Candidate retry state, got ${currentState ?? 'null'}`
        );
      }

      const reconciliation = await inspectCandidateGateAttemptForReconciliation({
        projectRoot,
        workItemId,
        workItemDir,
        workflowPath,
        workflowType,
        candidatePhase,
        attemptId: reconcileAttemptId,
      });

      const stateAutoAdvance = await autoAdvanceCandidateState({
        deps,
        context,
        projectRoot,
        workItemId,
        workItemDir,
        workflowPath,
        workflowType,
        candidatePhase,
        directStageGate: false,
        reports: reconciliation.reports,
        summaryStatus: reconciliation.summary_status,
        currentState,
      });

      return {
        success: true,
        work_item_id: workItemId,
        workflow_path: workflowPath,
        workflow_type: workflowType,
        authoritative_state_before_reconciliation: currentState,
        reconciliation_mode: true,
        reconciled_attempt_id: reconciliation.attempt_id,
        reconciled_attempt_path: path
          .relative(projectRoot, reconciliation.attempt_path)
          .replace(/\\/g, '/'),
        summary_status: reconciliation.summary_status,
        required_gate_ids: reconciliation.required_gate_ids,
        gate_count: reconciliation.reports.length,
        latest_view_matches: reconciliation.latest_view_matches,
        input_freshness_check: reconciliation.input_freshness_check,
        freshness_mode: reconciliation.freshness_mode,
        non_materialized_input_paths: reconciliation.non_materialized_input_paths.map(file =>
          path.isAbsolute(file)
            ? path.relative(projectRoot, file).replace(/\\/g, '/')
            : file.replace(/\\/g, '/'),
        ),
        checked_input_files: reconciliation.checked_input_files.map(file =>
          path.isAbsolute(file)
            ? path.relative(projectRoot, file).replace(/\\/g, '/')
            : file.replace(/\\/g, '/'),
        ),
        gate_run_action: 'NOT_PERFORMED',
        new_gate_attempt_created: false,
        state_auto_advance: stateAutoAdvance,
      };
    }

    const normalized = normalizeGateIds(
      args['gate_ids'],
      args['gate_type'],
      workflowPath,
      currentState,
      candidatePhase,
      workflowType
    );
    const ctx = {
      workItemId,
      workItemDir,
      projectRoot,
      workflowPath,
      workflowType,
      candidatePhase,
    };

    const { reports, summaryStatus, summaryPath, attemptId, attemptPath } = await runRequiredGates(normalized.gateIds, ctx);

    const stateAutoAdvance = await autoAdvanceStateAfterGateRun({
      deps,
      context,
      projectRoot,
      workItemId,
      workItemDir,
      workflowPath,
      workflowType,
      candidatePhase,
      directStageGate: normalized.directStageGate,
      reports,
      summaryStatus,
      currentState,
    });

    return {
      success: true,
      work_item_id: workItemId,
      workflow_path: workflowPath,
      workflow_type: workflowType,
      workflow_type_source: workflowFacts.workflowTypeSource,
      candidate_phase: candidatePhase,
      candidate_phase_source: workflowFacts.candidatePhaseSource,
      workflow_path_source: workflowFacts.workflowPathSource
        ? path.relative(projectRoot, workflowFacts.workflowPathSource).replace(/\\/g, '/')
        : null,
      authoritative_state_before_gate: currentState,
      requested_gate_ids: args['gate_ids'] ?? [],
      requested_gate_type: args['gate_type'] ?? null,
      normalized_gate_ids: normalized.gateIds,
      aliases_used: normalized.aliasesUsed,
      summary_status: summaryStatus,
      summary_path: path.relative(projectRoot, summaryPath).replace(/\\/g, '/'),
      gate_attempt_id: attemptId,
      gate_attempt_path: path.relative(projectRoot, attemptPath).replace(/\\/g, '/'),
      gate_count: reports.length,
      passed: reports.filter(r => r.status === 'passed').length,
      failed: reports.filter(r => r.status === 'failed').length,
      state_auto_advance: stateAutoAdvance,
      reports: reports.map(r => ({
        gate_id: r.gate_id,
        status: r.status,
        blocking_issues: r.blocking_issues.length,
        warnings: r.warnings.length,
      })),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      work_item_id: workItemId,
    };
  }
});
