import { registerHandler } from '../ToolDispatcher';
import { safeBashExecute } from '../lib/sf_safe_bash_core';
import { ACTOR_ROLES, type ActorRole } from '@specforge/types/actor-roles';
import { checkHardStop } from '../lib/hard-stop-latch';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

/**
 * Find the active (non-closed) work item ID from the project.
 */
function findActiveWorkItemId(projectRoot: string): string | null {
  const workItemsDir = path.join(projectRoot, SPEC_DIR_NAME, 'work-items');
  try {
    const dirs = fs.readdirSync(workItemsDir);
    for (const dir of dirs) {
      const wiPath = path.join(workItemsDir, dir, 'work_item.json');
      try {
        const content = fs.readFileSync(wiPath, 'utf-8');
        const wi = JSON.parse(content);
        if (wi.status !== 'closed' && wi.status !== 'cancelled') {
          return wi.work_item_id ?? dir;
        }
      } catch { continue; }
    }
  } catch { /* no work-items dir */ }
  return null;
}

registerHandler('sf_safe_bash', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const callerRole = extractCallerRole((context as Record<string, unknown> | undefined)?.agent);

  // v1.1 Hard Stop Guard — if active WI is blocked, reject bash execution
  const activeWiId = findActiveWorkItemId(baseDir);
  if (activeWiId) {
    const { blocked, record } = checkHardStop(baseDir, activeWiId);
    if (blocked) {
      return {
        success: false,
        error: `HARD_STOP_ACTIVE: Work item ${activeWiId} is blocked. ` +
          `Reason: ${record!.reason}. Source: ${record!.source_tool}. ` +
          `sf_safe_bash is blocked during hard_stop.`,
        hard_stop: true,
        hard_stop_record: record,
      };
    }
  }

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
