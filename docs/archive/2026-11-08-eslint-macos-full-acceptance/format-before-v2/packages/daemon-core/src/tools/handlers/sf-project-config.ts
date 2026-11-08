import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_project_config', async (args, context, deps) => {
  if (context?.agent !== 'sf-orchestrator') return { success: false, error: 'CONFIGURATION_ORCHESTRATOR_ONLY' };
  const root = context?.directory ?? context?.projectPath;
  if (typeof root !== 'string' || !root) return { success: false, error: 'CONFIGURATION_PROJECT_REQUIRED' };
  if (!deps.projectManager?.manageProjectConfiguration) return { success: false, error: 'CONFIGURATION_OWNER_UNAVAILABLE' };
  try { return await deps.projectManager.manageProjectConfiguration(root, args); }
  catch (error) {
    // Never expose filesystem/JSON diagnostics containing input values or arbitrary property names.
    const message = error instanceof Error ? error.message : '';
    const code = /^CONFIGURATION_[A-Z_]+$/.test(message) ? message : 'CONFIGURATION_OPERATION_FAILED';
    return { success: false, error: code };
  }
});
