import { registerHandler } from '../ToolDispatcher';
import { checkUserLevelInstallation } from '../lib/sf_doctor_core';

function componentStatus(value: unknown): 'ok' | 'missing' {
  return value ? 'ok' : 'missing';
}

registerHandler('sf_doctor', async (args, context, deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  try {
    const report = await checkUserLevelInstallation(baseDir);

    let projectStateManager: 'ok' | 'missing' | 'error' = 'missing';
    let projectStateManagerError: string | undefined;
    let canRebuildFromEvents: boolean | null = null;
    let stateReadSource: 'StateManager/events' | 'missing' = 'missing';

    if (deps.projectManager?.getProjectStateManager) {
      try {
        const projectSm = await deps.projectManager.getProjectStateManager(baseDir);
        projectStateManager = projectSm ? 'ok' : 'missing';
        if (projectSm && typeof projectSm.rebuildFromEventsFile === 'function') {
          await projectSm.rebuildFromEventsFile();
          canRebuildFromEvents = true;
        } else {
          canRebuildFromEvents = false;
        }
        if (projectSm && typeof projectSm.getState === 'function') {
          stateReadSource = 'StateManager/events';
        }
      } catch (err) {
        projectStateManager = 'error';
        projectStateManagerError = err instanceof Error ? err.message : String(err);
        canRebuildFromEvents = false;
      }
    }

    const daemonComponents = {
      projectManager: componentStatus(deps.projectManager),
      projectStateManager,
      projectStateManagerError,
      stateAuthority: {
        source: stateReadSource,
        events_jsonl: 'authoritative_append_only_source',
        runtime_state_json: 'projection_cache',
        work_item_json: 'metadata_not_state_source',
        can_rebuild_from_events: canRebuildFromEvents,
      },
      legacyStateManager: deps.stateManager ? 'present_ignored' : 'absent_ignored',
      workflowEngine: componentStatus(deps.workflowEngine),
      eventBus: componentStatus(deps.eventBus),
      eventLogger: componentStatus(deps.eventLogger),
      permissionEngine: componentStatus(deps.permissionEngine),
    };

    return {
      success: true,
      healthy: report.overall === 'healthy',
      installation: report,
      daemon_components: daemonComponents,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
