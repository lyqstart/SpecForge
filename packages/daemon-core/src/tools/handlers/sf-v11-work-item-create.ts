/**
 * sf-v11-work-item-create — v1.1 Work Item 创建 handler
 *
 * V12:
 * - workflow_type is preserved from classification when available.
 * - workflow_path remains the coarse route.
 * - bugfix_spec must not be silently persisted as feature_spec.
 */
import { join } from 'node:path';
import { registerHandler } from '../ToolDispatcher';
import { createWorkItem, initializeClosureFiles, updateWorkItemStatus } from '../lib/work-item-lifecycle-v11';
import { selectWorkflowPath, generateTriggerResult } from '../lib/workflow-path-selector-v11';
import {
  WORKFLOW_TYPE_TO_PATH,
  resolveWorkflowTypeForPath,
  type WorkflowPath,
  type WorkflowType,
} from '../lib/state_machine';
import * as fs from 'node:fs/promises';

function isKnownWorkflowType(value: string | undefined): value is WorkflowType {
  return !!value && Object.prototype.hasOwnProperty.call(WORKFLOW_TYPE_TO_PATH, value);
}

function normalizeWorkflowPath(value: string | null | undefined): WorkflowPath | undefined {
  return value ? (value as WorkflowPath) : undefined;
}

function workflowCompatibilityError(workflowType: string, workflowPath: string | null | undefined): Error {
  return new Error(
    `INCOMPATIBLE_WORKFLOW_TYPE_AND_PATH: workflow_type=${workflowType}; workflow_path=${workflowPath ?? '(none)'}`,
  );
}

function resolveExplicitWorkflowType(workflowType: string, workflowPath: string | null | undefined): WorkflowType {
  if (!isKnownWorkflowType(workflowType)) {
    throw new Error(`UNKNOWN_WORKFLOW_TYPE: ${workflowType}`);
  }

  const resolved = resolveWorkflowTypeForPath(normalizeWorkflowPath(workflowPath), workflowType);
  if (!resolved) {
    throw workflowCompatibilityError(workflowType, workflowPath);
  }
  return resolved;
}

function resolveDefaultWorkflowType(workflowPath: string | null | undefined): WorkflowType {
  const resolved = resolveWorkflowTypeForPath(normalizeWorkflowPath(workflowPath));
  if (resolved) return resolved;
  if (workflowPath) {
    throw new Error(`UNSUPPORTED_WORKFLOW_PATH_WITHOUT_WORKFLOW_TYPE: ${workflowPath}`);
  }
  return 'feature_spec';
}

function inferWorkflowTypeFromClassification(classification: any, workflowPath: string | null): WorkflowType {
  const explicit = classification?.workflow_type ?? classification?.workflowType;
  if (explicit) {
    return resolveExplicitWorkflowType(String(explicit), workflowPath);
  }

  const intent = String(
    classification?.intent ??
      classification?.change_type ??
      classification?.trigger_type ??
      classification?.classification ??
      '',
  ).toLowerCase();

  if (intent.includes('bug') || intent.includes('fix') || intent.includes('defect')) {
    return resolveExplicitWorkflowType('bugfix_spec', workflowPath);
  }
  if (intent.includes('quick')) {
    return resolveExplicitWorkflowType('quick_change', workflowPath);
  }

  return resolveDefaultWorkflowType(workflowPath);
}

registerHandler('sf_v11_work_item_create', async (args, context, deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const userRequest = args['user_request'] as string;

  if (!workItemId || !userRequest) {
    return { success: false, error: 'work_item_id and user_request are required' };
  }

  if (!/^WI-[0-9]{4}$/.test(workItemId)) {
    return { success: false, error: `Invalid work_item_id format: ${workItemId}. Must be WI-NNNN` };
  }

  try {
    // 1. Create WI directory
    const wiDir = await createWorkItem({
      projectRoot,
      workItemId,
      userRequest,
    });

    // 2. Read classification if provided
    const classification = args['classification'] as any;
    let workflowPath: string | null = null;
    if (classification) {
      workflowPath = selectWorkflowPath(classification);

      // 3. Generate trigger_result.json
      const triggerResult = generateTriggerResult(workItemId, classification, []);
      const workflowType = inferWorkflowTypeFromClassification(classification, workflowPath);
      await fs.writeFile(
        join(wiDir, 'trigger_result.json'),
        JSON.stringify({ ...triggerResult, workflow_type: workflowType, workflow_path: workflowPath }, null, 2) + '\n',
        'utf-8',
      );
    }

    const workflowType = inferWorkflowTypeFromClassification(classification, workflowPath);

    // 4. Initialize closure files
    await initializeClosureFiles(wiDir, workItemId, workflowPath);

    // 5. Update status to intake_ready
    await updateWorkItemStatus(wiDir, 'intake_ready');

    // 6. Persist to StateManager
    const projectPath = (context?.directory as string) || (context?.worktree as string) || '';
    if (projectPath && deps.projectManager) {
      const sm = await deps.projectManager.getProjectStateManager(projectPath);
      await sm.transition(
        workItemId,
        '',
        'intake_ready',
        context?.agent ?? 'sf-orchestrator',
        workflowType,
        { workflow_path: workflowPath },
      );
    }

    return {
      success: true,
      work_item_id: workItemId,
      wi_dir: wiDir,
      workflow_type: workflowType,
      workflow_path: workflowPath,
      status: 'intake_ready',
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
