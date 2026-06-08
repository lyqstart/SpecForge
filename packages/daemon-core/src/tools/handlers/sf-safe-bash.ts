import { registerHandler } from '../ToolDispatcher';
import { safeBashExecute } from '../lib/sf_safe_bash_core';
import { ACTOR_ROLES, type ActorRole } from '@specforge/types/actor-roles';

/** Valid ActorRole values for quick lookup */
const VALID_ACTOR_ROLES: ReadonlySet<string> = new Set<string>(Object.values(ACTOR_ROLES));

/**
 * Validate and extract callerRole from context.agent.
 * Returns a valid ActorRole or undefined (falls back to 'agent' in core).
 */
function extractCallerRole(agent: unknown): string | undefined {
  if (typeof agent !== 'string' || !agent) return undefined;
  if (VALID_ACTOR_ROLES.has(agent)) return agent;
  // Unknown agent string → do not propagate (core defaults to 'agent')
  return undefined;
}

registerHandler('sf_safe_bash', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const callerRole = extractCallerRole((context as Record<string, unknown> | undefined)?.agent);

  const result = await safeBashExecute(
    {
      command: args['command'] as string,
      cwd: args['cwd'] as string | undefined,
      timeoutMs: args['timeoutMs'] as number | undefined,
      env: args['env'] as Record<string, string> | undefined,
      stdin: args['stdin'] as string | undefined,
      outputLimit: args['outputLimit'] as number | undefined,
      callerRole,
    },
    baseDir
  );

  return result;
});
