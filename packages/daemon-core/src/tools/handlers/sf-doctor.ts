import { registerHandler } from '../ToolDispatcher';
import { checkUserLevelInstallation } from '../lib/sf_doctor_core';

registerHandler('sf_doctor', async (args, context, deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  try {
    const report = await checkUserLevelInstallation(baseDir);

    // Also check daemon components
    const daemonComponents = {
      stateManager: deps.stateManager ? 'ok' : 'missing',
      workflowEngine: deps.workflowEngine ? 'ok' : 'missing',
      eventBus: deps.eventBus ? 'ok' : 'missing',
      eventLogger: deps.eventLogger ? 'ok' : 'missing',
      permissionEngine: deps.permissionEngine ? 'ok' : 'missing',
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
