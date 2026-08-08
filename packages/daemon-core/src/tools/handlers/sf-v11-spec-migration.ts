/**
 * sf-v11-spec-migration — v1.1 §7.6 spec_migration_path handler
 *
 * 用于 legacy specs 向项目级正式规格真相源迁移。
 * 不得静默迁移；必须生成 inventory / plan / conflicts。
 */
import { registerHandler } from '../ToolDispatcher';
import {
  generateMigrationPlan,
  inspectProjectSpecRepair,
  prepareProjectSpecRepairCandidates,
  recoverProjectSpecRepairBindingFromFailedGateAttempt,
  type ProjectSpecRepairPreparation,
  writeProjectSpecRepairInspection,
  writeMigrationPlan,
} from '../lib/spec-migration-v11';
import { readAuthoritativeState } from '../lib/state-coordinator-v11';

function parseRepairPreparation(value: unknown): ProjectSpecRepairPreparation {
  if (typeof value === 'string') return JSON.parse(value) as ProjectSpecRepairPreparation;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as ProjectSpecRepairPreparation;
  }
  throw new Error('repair_preparation must be a JSON object or JSON string');
}

registerHandler('sf_v11_spec_migration', async (args, context, deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const action = (args['action'] as string) || 'plan';

  if (!workItemId) {
    return { success: false, error: 'work_item_id is required' };
  }

  try {
    const workItemDir = args['work_item_dir'] as string ||
      `${projectRoot}/.specforge/work-items/${workItemId}`;

    if (action === 'recover_repair_binding') {
      const authoritativeState = await readAuthoritativeState({
        deps,
        projectRoot,
        workItemId,
      });
      if (authoritativeState.current_state !== 'gates_failed') {
        return {
          success: false,
          error:
            'PROJECT_SPEC_REPAIR_BINDING_RECOVERY_REQUIRES_GATES_FAILED',
          current_state: authoritativeState.current_state,
          state_source: authoritativeState.source,
        };
      }
      const recovered =
        await recoverProjectSpecRepairBindingFromFailedGateAttempt({
          projectRoot,
          workItemId,
          workItemDir,
        });
      return {
        success: true,
        work_item_id: workItemId,
        action,
        ...recovered,
        current_state: authoritativeState.current_state,
        state_source: authoritativeState.source,
        next_legal_action:
          'rerun required Candidate Gates once; do not run User Decision automatically',
      };
    }
    if (action === 'inspect_repair') {
      const authoritativeState = await readAuthoritativeState({
        deps,
        projectRoot,
        workItemId,
      });
      if (authoritativeState.current_state !== 'candidate_preparing') {
        return {
          success: false,
          error: 'PROJECT_SPEC_REPAIR_REQUIRES_CANDIDATE_PREPARING',
          current_state: authoritativeState.current_state,
          state_source: authoritativeState.source,
        };
      }
      const inspection = await inspectProjectSpecRepair(projectRoot, workItemId);
      const inspectionPath = await writeProjectSpecRepairInspection(workItemDir, inspection);
      return {
        success: true,
        work_item_id: workItemId,
        action,
        inspection_path: inspectionPath,
        manifest_sha256: inspection.manifest_sha256,
        project_spec_version: inspection.project_spec_version,
        declared_modules: inspection.declared_modules,
        module_directories: inspection.module_directories,
        issues: inspection.issues,
        requires_explicit_module_mapping: true,
      };
    }

    if (action === 'prepare_repair') {
      const authoritativeState = await readAuthoritativeState({
        deps,
        projectRoot,
        workItemId,
      });
      if (authoritativeState.current_state !== 'candidate_preparing') {
        return {
          success: false,
          error: 'PROJECT_SPEC_REPAIR_REQUIRES_CANDIDATE_PREPARING',
          current_state: authoritativeState.current_state,
          state_source: authoritativeState.source,
        };
      }
      const preparation = parseRepairPreparation(args['repair_preparation']);
      const prepared = await prepareProjectSpecRepairCandidates({
        projectRoot,
        workItemId,
        workItemDir,
        preparation,
      });
      return {
        success: true,
        work_item_id: workItemId,
        action,
        ...prepared,
        next_legal_action: 'run required Gates; do not write Project Spec directly',
      };
    }

    if (action === 'plan') {
      // Step 1: Generate migration plan (inventory + conflicts + steps)
      const plan = await generateMigrationPlan(projectRoot, workItemId);

      // Step 2: Write plan to WI directory
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

    return {
      success: false,
      error: `Unknown action: ${action}. Use 'inventory', 'plan', 'inspect_repair', 'prepare_repair', or 'recover_repair_binding'.`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
