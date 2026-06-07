/**
 * sf-v11-spec-migration — v1.1 §7.6 spec_migration_path handler
 *
 * 用于 legacy specs 向项目级正式规格真相源迁移。
 * 不得静默迁移；必须生成 inventory / plan / conflicts。
 */
import { registerHandler } from '../ToolDispatcher';
import {
  generateMigrationPlan,
  writeMigrationPlan,
} from '../lib/spec-migration-v11';

registerHandler('sf_v11_spec_migration', async (args, context, _deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const action = (args['action'] as string) || 'plan';

  if (!workItemId) {
    return { success: false, error: 'work_item_id is required' };
  }

  try {
    if (action === 'plan') {
      // Step 1: Generate migration plan (inventory + conflicts + steps)
      const plan = await generateMigrationPlan(projectRoot, workItemId);

      // Step 2: Write plan to WI directory
      const workItemDir = args['work_item_dir'] as string ||
        `${projectRoot}/.specforge/work-items/${workItemId}`;
      const planPath = await writeMigrationPlan(workItemDir, plan);

      return {
        success: true,
        work_item_id: workItemId,
        action: 'plan',
        plan_path: planPath,
        can_auto_migrate: plan.canAutoMigrate,
        total_legacy_files: plan.inventory.stats.total,
        conflicts_count: plan.conflicts.length,
        steps_count: plan.steps.length,
        requires_user_confirmation: plan.requiresUserConfirmation,
      };
    }

    if (action === 'inventory') {
      const { buildMigrationInventory } = await import('../lib/spec-migration-v11');
      const inventory = await buildMigrationInventory(projectRoot);
      return {
        success: true,
        work_item_id: workItemId,
        action: 'inventory',
        total: inventory.stats.total,
        by_type: inventory.stats.byType,
        legacy_files: inventory.legacyFiles.map(f => ({
          path: f.relativePath,
          type: f.type,
          size: f.size,
        })),
        project_files: inventory.projectFiles,
      };
    }

    return { success: false, error: `Unknown action: ${action}. Use 'plan' or 'inventory'.` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
