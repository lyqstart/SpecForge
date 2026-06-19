import { registerHandler } from '../ToolDispatcher';

/**
 * sf_state_read
 *
 * State authority rule:
 * - read from project-level StateManager only;
 * - rebuild StateManager from events.jsonl before reading when supported;
 * - do not read work_item.json.status or runtime/state.json directly.
 */
registerHandler('sf_state_read', async (args, context, deps) => {
  const workItemId = args['work_item_id'] as string;

  const projectPath =
    (context?.directory as string) || (context?.worktree as string) || '';

  if (!projectPath) {
    return {
      success: false,
      error: 'projectPath required — provide context.directory or context.worktree',
    };
  }

  if (!deps.projectManager) {
    return { success: false, error: 'ProjectManager not available' };
  }

  const sm = await deps.projectManager.getProjectStateManager(projectPath);

  let rebuilt_from_events = false;
  if (typeof sm.rebuildFromEventsFile === 'function') {
    await sm.rebuildFromEventsFile();
    rebuilt_from_events = true;
  }

  if (workItemId === 'all') {
    const all = await sm.getAllStates();
    return { success: true, rebuilt_from_events, work_items: all ?? {} };
  }

  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  const state = await sm.getState(workItemId);
  if (!state) {
    return { success: false, rebuilt_from_events, error: `${workItemId} not found` };
  }

  return { success: true, rebuilt_from_events, ...state };
});
