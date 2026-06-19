/**
 * sf-v11-merge — v1.1 Merge Runner handler
 *
 * V6 state authority alignment:
 * - Merge business action remains executeMerge().
 * - Successful non-code-only merge must advance authoritative events:
 *   approved → merge_ready → merging → merged.
 * - No runtime/state.json or work_item.json.status direct state writes here.
 */

import { registerHandler } from '../ToolDispatcher';
import { executeMerge } from '../lib/merge-runner-v11';
import {
  readAuthoritativeState,
  transitionWithEvidence,
} from '../lib/state-coordinator-v11';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

function workflowTypeFromPath(workflowPath: string | undefined): string {
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
      return 'feature_spec';
  }
}

async function readJsonIfExists(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function readWorkflowFacts(workItemDir: string): Promise<{
  workflowPath?: string;
  workflowType?: string;
}> {
  const candidateManifest = await readJsonIfExists(path.join(workItemDir, 'candidate_manifest.json'));
  if (candidateManifest?.workflow_path || candidateManifest?.workflow_type) {
    return {
      workflowPath: candidateManifest.workflow_path,
      workflowType: candidateManifest.workflow_type,
    };
  }

  const workItem = await readJsonIfExists(path.join(workItemDir, 'work_item.json'));
  return {
    workflowPath: workItem?.workflow_path,
    workflowType: workItem?.workflow_type,
  };
}

async function advanceMergeState(input: {
  deps: any;
  context: any;
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  workflowPath?: string;
  workflowType?: string;
  status: string;
  mergedCount: number;
}): Promise<any> {
  if (input.status === 'not_applicable') {
    return {
      attempted: false,
      reason: 'merge_not_applicable',
    };
  }

  if (input.status !== 'success' || input.mergedCount <= 0) {
    return {
      attempted: false,
      reason: 'merge_not_successful',
      status: input.status,
      merged_count: input.mergedCount,
    };
  }

  const state = await readAuthoritativeState({
    deps: input.deps,
    projectRoot: input.projectRoot,
    workItemId: input.workItemId,
  });

  const current = state.current_state;
  const workflowType =
    input.workflowType || workflowTypeFromPath(input.workflowPath);
  const sequence = ['approved', 'merge_ready', 'merging', 'merged'];
  const currentIndex = current ? sequence.indexOf(current) : -1;

  if (current === 'merged') {
    return {
      attempted: true,
      advanced: false,
      reason: 'already_merged',
      current_state: current,
    };
  }

  if (currentIndex < 0) {
    return {
      attempted: false,
      reason: 'current_state_not_merge_recoverable',
      current_state: current,
    };
  }

  const transitionSteps: any[] = [];
  for (let i = currentIndex; i < sequence.length - 1; i += 1) {
    const fromState = sequence[i];
    const toState = sequence[i + 1];

    transitionSteps.push(
      await transitionWithEvidence({
        deps: input.deps,
        context: input.context,
        projectRoot: input.projectRoot,
        workItemId: input.workItemId,
        workItemDir: input.workItemDir,
        fromState,
        toState,
        workflowType,
        actorRole: 'merge_runner',
        evidence:
          'merge_runner authoritative post-approval transition after merge_report success',
        transitionContext: {
          source: 'sf_v11_merge',
          merge_status: input.status,
          merged_count: input.mergedCount,
        },
      }),
    );
  }

  return {
    attempted: true,
    advanced: true,
    from_state: current,
    to_state: 'merged',
    workflow_type: workflowType,
    transition_steps: transitionSteps,
  };
}

registerHandler('sf_v11_merge', async (args, context, deps) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;

  if (!workItemId) return { success: false, error: 'work_item_id is required' };

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);

  try {
    const result = await executeMerge({
      projectRoot,
      workItemId,
      workItemDir,
      candidateManifestPath: path.join(workItemDir, 'candidate_manifest.json'),
      userDecisionPath: path.join(workItemDir, 'user_decision.json'),
    });

    const status = result.status ?? (result.success ? 'success' : 'failed');
    const mergedCount = result.merged_files.filter((f) => f.status === 'success').length;
    const workflowFacts = await readWorkflowFacts(workItemDir);

    const stateAutoAdvance = result.success
      ? await advanceMergeState({
          deps,
          context,
          projectRoot,
          workItemId,
          workItemDir,
          workflowPath: workflowFacts.workflowPath,
          workflowType: workflowFacts.workflowType,
          status,
          mergedCount,
        })
      : { attempted: false, reason: 'merge_failed' };

    return {
      success: result.success,
      status,
      reason: result.reason,
      work_item_id: workItemId,
      merged_count: mergedCount,
      failed_count: result.merged_files.filter((f) => f.status === 'failed').length,
      spec_manifest_updated: result.spec_manifest_updated,
      project_spec_version: result.project_spec_version,
      errors: result.errors,
      state_auto_advance: stateAutoAdvance,
    };
  } catch (err: any) {
    return { success: false, status: 'failed', error: err.message };
  }
});
