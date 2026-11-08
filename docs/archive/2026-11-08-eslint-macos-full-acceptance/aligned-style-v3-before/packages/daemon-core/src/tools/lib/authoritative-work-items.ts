import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface AuthoritativeWorkItem extends Record<string, unknown> {
  work_item_id: string;
  current_state: string;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function observation(value: unknown, id?: string): AuthoritativeWorkItem {
  if (typeof value === 'string' && id !== undefined) return { work_item_id: id, current_state: value };
  if (!record(value)) throw new Error('AUTHORITATIVE_STATE_INVALID');
  const workItemId = id ?? value.work_item_id;
  if (typeof workItemId !== 'string' || typeof value.current_state !== 'string') throw new Error('AUTHORITATIVE_STATE_INVALID');
  return { ...value, work_item_id: workItemId, current_state: value.current_state };
}
/** Read through the project owner. A malformed owner response is never replaced by a projection. */
export async function readAuthoritativeWorkItems(deps: unknown, projectRoot: string): Promise<AuthoritativeWorkItem[]> {
  const projectManager = record(deps) ? deps.projectManager : undefined;
  if (!record(projectManager) || typeof projectManager.getProjectStateManager !== 'function') throw new Error('AUTHORITATIVE_STATE_UNAVAILABLE');
  const manager: unknown = await Reflect.apply(projectManager.getProjectStateManager, projectManager, [projectRoot]);
  if (!record(manager)) throw new Error('AUTHORITATIVE_STATE_UNAVAILABLE');
  if (typeof manager.rebuildState === 'function') await Reflect.apply(manager.rebuildState, manager, []);
  if (typeof manager.listWorkItems === 'function') {
    const items: unknown = await Reflect.apply(manager.listWorkItems, manager, []);
    if (!Array.isArray(items)) throw new Error('AUTHORITATIVE_STATE_INVALID');
    return items.map((item: unknown) => observation(item));
  }
  if (typeof manager.getAllStates === 'function') {
    const states: unknown = await Reflect.apply(manager.getAllStates, manager, []);
    if (!record(states)) throw new Error('AUTHORITATIVE_STATE_INVALID');
    return Object.entries(states).map(([id, state]) => observation(state, id));
  }
  if (typeof manager.getState === 'function') {
    const getState = manager.getState;
    // Directory names identify candidates only. All state facts still come from the owner.
    const ids = await readdir(join(projectRoot, SPEC_DIR_NAME, 'work-items')).catch((error: unknown) => {
      if (record(error) && error.code === 'ENOENT') return [];
      throw error;
    });
    const items = await Promise.all(ids.map(async id => {
      const state: unknown = await Reflect.apply(getState, manager, [id]);
      return state === null || state === undefined ? null : observation(state, id);
    }));
    return items.filter((item): item is AuthoritativeWorkItem => item !== null);
  }
  throw new Error('AUTHORITATIVE_STATE_UNAVAILABLE');
}
