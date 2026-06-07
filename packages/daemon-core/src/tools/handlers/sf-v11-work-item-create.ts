/**
 * sf-v11-work-item-create — v1.1 Work Item 创建 handler
 *
 * 调用 work-item-lifecycle-v11 创建 WI 目录和闭环文件。
 */
import { join } from 'node:path';
import { registerHandler } from '../ToolDispatcher';
import { createWorkItem, initializeClosureFiles, updateWorkItemStatus } from '../lib/work-item-lifecycle-v11';
import { selectWorkflowPath, generateTriggerResult } from '../lib/workflow-path-selector-v11';
import * as fs from 'node:fs/promises';

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
      await fs.writeFile(
        join(wiDir, 'trigger_result.json'),
        JSON.stringify(triggerResult, null, 2) + '\n',
        'utf-8',
      );
    }

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
        'feature_spec',
        { workflow_path: workflowPath },
      );
    }

    return {
      success: true,
      work_item_id: workItemId,
      wi_dir: wiDir,
      workflow_path: workflowPath,
      status: 'intake_ready',
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
