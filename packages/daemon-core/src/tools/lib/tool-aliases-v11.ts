/**
 * tool-aliases-v11.ts — SpecForge v1.1 tool name alias table.
 *
 * User-level OpenCode tools historically invoked sf_* names, while several
 * daemon v1.1 handlers register sf_v11_* names.  Dispatcher must normalize
 * these names at the daemon boundary so Agent-facing tool names stay stable
 * and the Runtime still reaches the v1.1 handlers.
 */

export interface ToolAliasResolution {
  requestedTool: string;
  canonicalTool: string;
  aliasUsed: boolean;
}

export const TOOL_ALIASES_V11: Readonly<Record<string, string>> = {
  sf_gate_run: 'sf_v11_gate_run',
  sf_code_permission: 'sf_v11_code_permission',
  sf_merge_run: 'sf_v11_merge',
  sf_user_decision_record: 'sf_v11_decision',
} as const;

export function resolveToolAlias(toolName: string): ToolAliasResolution {
  const canonicalTool = TOOL_ALIASES_V11[toolName] ?? toolName;
  return {
    requestedTool: toolName,
    canonicalTool,
    aliasUsed: canonicalTool !== toolName,
  };
}
