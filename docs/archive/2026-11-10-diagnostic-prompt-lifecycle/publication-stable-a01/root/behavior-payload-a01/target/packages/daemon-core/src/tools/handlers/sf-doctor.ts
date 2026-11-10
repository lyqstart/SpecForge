import { registerHandler } from '../ToolDispatcher';
import { checkUserLevelInstallation } from '../lib/sf_doctor_core';
import { loadAcceptedConfigSync } from '@specforge/configuration';
import { precheckProjectRegistrationSchemas } from '../../project/project-schema-descriptors';

function componentStatus(value: unknown): 'ok' | 'missing' {
  return value ? 'ok' : 'missing';
}

function diagnosticErrorCode(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  // Parse errors can embed original file bytes. Only stable owner codes belong
  // in a model-visible diagnostic or its observation payload.
  return /^[A-Z][A-Z0-9_]+(?=$|:)/.exec(message)?.[0] ?? fallback;
}

registerHandler('sf_doctor', async (args, context, deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  try {
    const report = await checkUserLevelInstallation(baseDir);
    const schemas = await precheckProjectRegistrationSchemas(baseDir);
    const manifest = schemas.checks.find(check => check.descriptorId === 'project-spec-manifest');
    const projectStatus =
      manifest?.errorCode === 'FILE_REQUIRED'
        ? 'not_initialized'
        : schemas.ok
          ? 'initialized'
          : 'invalid';
    let configuration: { valid: boolean; error?: string };
    try {
      // Parse and validate only. Diagnosis must never activate this configuration.
      loadAcceptedConfigSync({ projectPath: baseDir });
      configuration = { valid: true };
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      configuration = {
        valid: false,
        error: /^CONFIGURATION_[A-Z_]+$/.test(code) ? code : 'CONFIGURATION_ACCEPTANCE_FAILED',
      };
    }

    let projectStateManager: 'ok' | 'missing' | 'error' = 'missing';
    let projectStateManagerError: string | undefined;
    let canRebuildFromEvents: boolean | null = null;
    let stateReadSource: 'StateManager/events' | 'missing' = 'missing';

    if (schemas.ok && configuration.valid && deps.projectManager?.inspectProjectState) {
      try {
        await deps.projectManager.inspectProjectState(baseDir);
        projectStateManager = 'ok';
        canRebuildFromEvents = true;
        stateReadSource = 'StateManager/events';
      } catch (err) {
        projectStateManager = 'error';
        projectStateManagerError = diagnosticErrorCode(err, 'RUNTIME_STATE_INSPECTION_FAILED');
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
      healthy:
        report.overall === 'healthy' &&
        schemas.ok &&
        configuration.valid &&
        canRebuildFromEvents === true,
      installation: report,
      project: {
        status: projectStatus,
        configuration,
        schemas: schemas.checks.map(check => ({
          descriptorId: check.descriptorId,
          status: check.status,
          ...(check.errorCode ? { errorCode: check.errorCode } : {}),
        })),
      },
      daemon_components: daemonComponents,
    };
  } catch (err) {
    return { success: false, error: diagnosticErrorCode(err, 'DIAGNOSTIC_READ_FAILED') };
  }
});
