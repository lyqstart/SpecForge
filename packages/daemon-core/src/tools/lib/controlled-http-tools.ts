/** Official tools whose owner is an authenticated HTTP endpoint, not ToolDispatcher. */
export const CONTROLLED_HTTP_TOOLS = {
  sf_project_init: { method: 'POST', path: '/api/v1/project/ensure' },
} as const;

export function isControlledHttpTool(tool: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONTROLLED_HTTP_TOOLS, tool);
}
