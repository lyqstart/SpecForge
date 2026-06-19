/**
 * sf-v11-gate-run — v1.1 Gate Runner handler
 *
 * State authority alignment:
 * - Gate Runner produces gate evidence and requests state transition.
 * - It does not maintain work_item.json.status.
 * - Current state comes from StateManager through state-coordinator-v11.
 */

import { registerHandler } from '../ToolDispatcher';
import { runRequiredGates } from '../lib/gate-runner-v11';
import type { GateIdV11 } from '../lib/gate-runner-v11';
import { getRequiredGates } from '../lib/required-gates';
import { readAuthoritativeState, transitionWithEvidence } from '../lib/state-coordinator-v11';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { validateWorkItemId } from '../lib/work-item-id-validator';

const VALID_GATE_IDS: readonly GateIdV11[] = [
  'entry_gate',
  'workflow_selection_gate',
  'required_files_gate',
  'candidate_manifest_gate',
  'path_policy_gate',
  'schema_gate',
  'spec_consistency_gate',
  'trace_gate',
  'workflow_specific_gate',
  'gate_summary_gate',
  'merge_ready_gate',
  'post_merge_gate',
  'verification_gate',
  'close_gate',
  'extension_gate',
] as const;

function isGateIdV11(value: string): value is GateIdV11 {
  return (VALID_GATE_IDS as readonly string[]).includes(value);
}

interface WorkflowPathReadResult {
  workflowPath: string | null;
  source: string | null;
  checkedFiles: string[];
}

async function readWorkflowPath(workItemDir: string): Promise<WorkflowPathReadResult> {
  const candidates = [
    path.join(workItemDir, 'trigger_result.json'),
    path.join(workItemDir, 'work_item.json'),
    path.join(workItemDir, 'candidate_manifest.json'),
  ];
  const checkedFiles: string[] = [];

  for (const file of candidates) {
    checkedFiles.push(file);
    try {
      const json = JSON.parse(await fs.readFile(file, 'utf-8'));
      const workflowPath = json.workflow_path;
      if (typeof workflowPath === 'string' && workflowPath.length > 0) {
        return { workflowPath, source: file, checkedFiles };
      }
    } catch {
      // try next source
    }
  }

  return { workflowPath: null, source: null, checkedFiles };
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeGateIds(
  input: unknown,
  workflowPath: string,
): { gateIds: GateIdV11[]; aliasesUsed: string[] } {
  const aliasesUsed: string[] = [];
  const rawIds =
    Array.isArray(input) && input.length > 0 ? input.map(String) : ['all'];
  const gateIds: GateIdV11[] = [];

  for (const raw of rawIds) {
    switch (raw) {
      case 'all':
        aliasesUsed.push(raw);
        gateIds.push(...getRequiredGates(workflowPath, 'candidate'));
        break;
      case 'tasks':
        aliasesUsed.push(raw);
        if (workflowPath === 'code_only_fast_path') {
          gateIds.push('candidate_manifest_gate', 'path_policy_gate');
        } else {
          gateIds.push('required_files_gate', 'candidate_manifest_gate', 'trace_gate');
        }
        break;
      case 'candidate':
        aliasesUsed.push(raw);
        gateIds.push(...getRequiredGates(workflowPath, 'candidate'));
        break;
      case 'merge':
        aliasesUsed.push(raw);
        gateIds.push(...getRequiredGates(workflowPath, 'merge'));
        break;
      case 'post_implementation':
      case 'post-implementation':
        aliasesUsed.push(raw);
        gateIds.push(...getRequiredGates(workflowPath, 'post_implementation'));
        break;
      case 'full':
        aliasesUsed.push(raw);
        gateIds.push(...getRequiredGates(workflowPath, 'all'));
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
              ', ',
            )}. Legacy aliases accepted only for normalization: all, tasks, verification, close.`,
          );
        }
        gateIds.push(raw);
    }
  }

  if (workflowPath === 'code_only_fast_path') {
    return {
      gateIds: dedupe(gateIds.filter((id) => id !== 'required_files_gate')),
      aliasesUsed,
    };
  }

  return { gateIds: dedupe(gateIds), aliasesUsed };
}

type GateAutoAdvanceResult =
  | { attempted: false; reason: string; current_state?: string | null }
  | {
      attempted: true;
      advanced: true;
      from_state: string;
      to_state: string;
      workflow_type: string;
      evidence: string;
      transition_result?: unknown;
      transition_steps?: unknown[];
    };

function sameGateSet(a: readonly GateIdV11[], b: readonly GateIdV11[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  return b.every((item) => left.has(item));
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
    case 'rollback_path':
      return 'rollback';
    default:
      return 'quick_change';
  }
}

async function transitionGateState(
  input: {
    deps: any;
    context: any;
    projectRoot: string;
    workItemId: string;
    workItemDir: string;
    workflowPath: string;
    normalizedGateIds: GateIdV11[];
    summaryStatus: string;
  },
  fromState: string,
  toState: string,
  workflowType: string,
  evidence: string,
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
      normalized_gate_ids: input.normalizedGateIds,
    },
  });
}

async function autoAdvanceGateStateAfterGateRun(input: {
  deps: any;
  context: any;
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  workflowPath: string;
  normalizedGateIds: GateIdV11[];
  summaryStatus: string;
}): Promise<GateAutoAdvanceResult> {
  const requiredGateIds = getRequiredGates(input.workflowPath, 'candidate');
  if (!sameGateSet(input.normalizedGateIds, requiredGateIds)) {
    return { attempted: false, reason: 'not_full_required_gate_run' };
  }

  const authoritativeState = await readAuthoritativeState({
    deps: input.deps,
    projectRoot: input.projectRoot,
    workItemId: input.workItemId,
  });
  const currentState = authoritativeState.current_state;

  const recoverableGateStates = [
    'created',
    'intake_ready',
    'impact_analyzing',
    'impact_analyzed',
    'workflow_selected',
    'candidate_preparing',
    'candidate_prepared',
    'gates_running',
  ];

  if (!currentState || !recoverableGateStates.includes(currentState)) {
    return {
      attempted: false,
      reason: 'current_state_is_not_gate_auto_advance_recoverable',
      current_state: currentState,
    };
  }

  const passed = String(input.summaryStatus).startsWith('passed');
  const finalState = passed ? 'approval_required' : 'gates_failed';
  const workflowType = workflowTypeFromPath(input.workflowPath);
  const evidence =
    'gate_runner auto-advance after full candidate gate run: summary_status=' +
    input.summaryStatus;
  const transitionSteps: unknown[] = [];

  const sequence = [
    'created',
    'intake_ready',
    'impact_analyzing',
    'impact_analyzed',
    'workflow_selected',
    'candidate_preparing',
    'candidate_prepared',
    'gates_running',
  ];

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
        evidence + ' | state authority recovery step ' + from + '->' + to,
      ),
    );
    index += 1;
  }

  transitionSteps.push(
    await transitionGateState(
      input,
      'gates_running',
      finalState,
      workflowType,
      evidence + ' | state authority step gates_running->' + finalState,
    ),
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

registerHandler('sf_v11_gate_run', async (args, context, deps) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;

  const idError = validateWorkItemId(workItemId);
  if (idError) {
    return { success: false, error: idError };
  }

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  try {
    await fs.access(workItemDir);
  } catch {
    return { success: false, error: `Work Item directory not found: ${workItemDir}` };
  }

  try {
    const workflowPathResult = await readWorkflowPath(workItemDir);
    if (!workflowPathResult.workflowPath) {
      return {
        success: false,
        error:
          'WORKFLOW_PATH_NOT_FOUND: cannot run v1.1 gates before workflow_path is recorded in trigger_result.json, work_item.json, or candidate_manifest.json.',
        work_item_id: workItemId,
        checked_files: workflowPathResult.checkedFiles.map((p) =>
          path.relative(projectRoot, p).replace(/\\/g, '/'),
        ),
      };
    }

    const workflowPath = workflowPathResult.workflowPath;
    const normalized = normalizeGateIds(args['gate_ids'], workflowPath);
    const ctx = {
      workItemId,
      workItemDir,
      projectRoot,
    };

    const { reports, summaryStatus, summaryPath } = await runRequiredGates(
      normalized.gateIds,
      ctx,
    );

    const stateAutoAdvance = await autoAdvanceGateStateAfterGateRun({
      deps,
      context,
      projectRoot,
      workItemId,
      workItemDir,
      workflowPath,
      normalizedGateIds: normalized.gateIds,
      summaryStatus,
    });

    return {
      success: true,
      work_item_id: workItemId,
      workflow_path: workflowPath,
      workflow_path_source: workflowPathResult.source
        ? path.relative(projectRoot, workflowPathResult.source).replace(/\\/g, '/')
        : null,
      requested_gate_ids: args['gate_ids'] ?? [],
      normalized_gate_ids: normalized.gateIds,
      aliases_used: normalized.aliasesUsed,
      summary_status: summaryStatus,
      summary_path: path.relative(projectRoot, summaryPath).replace(/\\/g, '/'),
      gate_count: reports.length,
      passed: reports.filter((r) => r.status === 'passed').length,
      failed: reports.filter((r) => r.status === 'failed').length,
      state_auto_advance: stateAutoAdvance,
      reports: reports.map((r) => ({
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
