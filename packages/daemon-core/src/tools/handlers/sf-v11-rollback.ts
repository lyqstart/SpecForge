/**
 * sf-v11-rollback — §16 回滚与 superseded handler
 */
import { registerHandler } from '../ToolDispatcher';
import {
  generateRollbackPlan,
  generateRollbackDelta,
  markOriginalSuperseded,
  writeRollbackPlan,
  writeRollbackDelta,
} from '../lib/rollback-runner-v11';
import * as path from 'node:path';

registerHandler('sf_v11_rollback', async (args, context, _deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const action = (args['action'] as string) || 'plan';

  try {
    if (action === 'plan') {
      const rollbackWiId = args['rollback_work_item_id'] as string;
      const originalWiId = args['original_work_item_id'] as string;
      if (!rollbackWiId || !originalWiId) {
        return { success: false, error: 'rollback_work_item_id and original_work_item_id are required' };
      }

      const workItemsRoot = path.join(projectRoot, '.specforge', 'work-items');
      const plan = await generateRollbackPlan({
        rollbackWorkItemId: rollbackWiId,
        originalWorkItemId: originalWiId,
        workItemsRoot,
        projectRoot,
      });

      const rollbackWiDir = path.join(workItemsRoot, rollbackWiId);
      const planPath = await writeRollbackPlan(rollbackWiDir, plan);

      return {
        success: true,
        action: 'plan',
        plan_path: planPath,
        can_auto_rollback: plan.canAutoRollback,
        steps_count: plan.steps.length,
        risks_count: plan.risks.length,
        target_spec_version: plan.targetSpecVersion,
      };
    }

    if (action === 'delta') {
      const rollbackWiId = args['rollback_work_item_id'] as string;
      const originalWiId = args['original_work_item_id'] as string;
      const planJson = args['rollback_plan'] as any;

      if (!rollbackWiId || !originalWiId || !planJson) {
        return { success: false, error: 'rollback_work_item_id, original_work_item_id, and rollback_plan are required' };
      }

      const delta = await generateRollbackDelta({
        rollbackWorkItemId: rollbackWiId,
        originalWorkItemId: originalWiId,
        rollbackPlan: planJson,
      });

      const workItemsRoot = path.join(projectRoot, '.specforge', 'work-items');
      const rollbackWiDir = path.join(workItemsRoot, rollbackWiId);
      const deltaPath = await writeRollbackDelta(rollbackWiDir, delta);

      return { success: true, action: 'delta', delta_path: deltaPath };
    }

    if (action === 'supersede') {
      const originalWiId = args['original_work_item_id'] as string;
      const supersededByWiId = args['superseded_by_work_item_id'] as string;
      if (!originalWiId || !supersededByWiId) {
        return { success: false, error: 'original_work_item_id and superseded_by_work_item_id are required' };
      }

      const workItemsRoot = path.join(projectRoot, '.specforge', 'work-items');
      const originalWiDir = path.join(workItemsRoot, originalWiId);
      const result = await markOriginalSuperseded({
        originalWiDir,
        originalWorkItemId: originalWiId,
        supersededByWorkItemId: supersededByWiId,
      });

      return { success: true, action: 'supersede', ...result };
    }

    return { success: false, error: `Unknown action: ${action}. Use 'plan', 'delta', or 'supersede'.` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
