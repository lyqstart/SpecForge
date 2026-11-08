import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
/** Read through the project owner; never infer state from the projection file. */
export async function readAuthoritativeWorkItems(deps: any, projectRoot: string): Promise<any[]> {
  const manager = await deps?.projectManager?.getProjectStateManager?.(projectRoot);
  if (!manager) throw new Error('AUTHORITATIVE_STATE_UNAVAILABLE');
  if (typeof manager.rebuildState === 'function') await manager.rebuildState();
  if (typeof manager.listWorkItems === 'function') return manager.listWorkItems();
  if (typeof manager.getAllStates === 'function') {
    return Object.entries(await manager.getAllStates()).map(([id, state]) =>
      typeof state === 'string' ? { work_item_id: id, current_state: state }
        : { ...(state as object), work_item_id: id });
  }
  if (typeof manager.getState === 'function') {
    // Metadata directory names identify candidates only; states still come
    // exclusively from the owner. This supports owners exposing point reads.
    const ids = await readdir(join(projectRoot, '.specforge', 'work-items')).catch(error => {
      if (error.code === 'ENOENT') return [] as string[];
      throw error;
    });
    const items = await Promise.all(ids.map(async id => {
      const state = await manager.getState(id);
      return typeof state === 'string' ? { work_item_id: id, current_state: state }
        : state ? { ...state, work_item_id: id } : null;
    }));
    return items.filter(Boolean);
  }
  throw new Error('AUTHORITATIVE_STATE_UNAVAILABLE');
}
