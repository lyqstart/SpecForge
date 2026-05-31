import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_state_read', async (args, context, deps) => {
  const workItemId = args['work_item_id'] as string;

  // Use project-level StateManager only
  const projectPath = (context?.directory as string) || (context?.worktree as string) || '';
  if (!projectPath) {
    return { success: false, error: 'projectPath required — provide context.directory or context.worktree' };
  }
  if (!deps.projectManager) {
    return { success: false, error: 'ProjectManager not available' };
  }
  const sm = await deps.projectManager.getProjectStateManager(projectPath);

  if (workItemId === 'all') {
    const all = await sm.getAllStates();
    return { success: true, work_items: all ?? {} };
  }

  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  const state = await sm.getState(workItemId);
  if (!state) {
    return { success: false, error: `${workItemId} not found` };
  }
  return { success: true, ...state };
});
