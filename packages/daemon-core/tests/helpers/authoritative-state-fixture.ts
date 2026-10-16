/** Explicit owner fixture. Projection files are never used as the test authority. */
export function authoritativeStateFixture(states: Record<string, string>): any {
  return { projectManager: { getProjectStateManager: async () => ({
    rebuildState: async () => undefined,
    listWorkItems: () => Object.entries(states).map(([work_item_id, current_state]) => ({ work_item_id, current_state })),
    getState: (id: string) => states[id] ? { work_item_id: id, current_state: states[id] } : null,
  }) } };
}
