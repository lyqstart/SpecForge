import { registerHandler } from '../ToolDispatcher';
import { safeBashExecute } from '../lib/sf_safe_bash_core';
import { ACTOR_ROLES, type ActorRole } from '@specforge/types/actor-roles';
import { checkHardStop } from '../lib/hard-stop-latch';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import * as fs from 'node:fs';
import * as path from 'node:path';

const VALID_ACTOR_ROLES: ReadonlySet<ActorRole> = new Set(Object.values(ACTOR_ROLES));

function extractCallerRole(agent: unknown): string | undefined {
  if (typeof agent !== 'string' || !agent) return undefined;
  if (VALID_ACTOR_ROLES.has(agent as ActorRole)) return agent;
  return undefined;
}

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
      } catch {
        continue;
      }
    }
  } catch {
    // no work-items dir
  }
  return null;
}

function classifyWorkItemPathBashAccess(command: string): 'read' | 'write' | 'unknown' {
  const normalized = command.trim().toLowerCase();
  const writeLike =
    /(?:^|[;&|]\s*)(set-content|add-content|out-file|new-item|copy-item|move-item|remove-item|del|erase|rm|rmdir|mkdir|ni|cp|mv|touch)\b/.test(
      normalized,
    ) ||
    />\s*[^\s]*\.specforge[\\/]work-items[\\/]/i.test(command) ||
    /\.specforge[\\/]work-items[\\/].*(?:>|\|\s*tee(?:-object)?\b)/i.test(command);

  if (writeLike) return 'write';

  const readLike =
    /(?:^|[;&|]\s*)(get-content|gc|type|cat|dir|ls|gci|get-childitem|select-string|findstr)\b/.test(
      normalized,
    ) ||
    /(?:^|[;&|]\s*)certutil\s+-hashfile\b/.test(normalized) ||
    /(?:^|[;&|]\s*)(sha256sum|shasum|fciv)\b/.test(normalized);

  if (readLike) return 'read';
  return 'unknown';
}

registerHandler('sf_safe_bash', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const callerRole = extractCallerRole((context as Record<string, unknown> | undefined)?.agent);

  const activeWiId = findActiveWorkItemId(baseDir);
  if (activeWiId) {
    const { blocked, record } = checkHardStop(baseDir, activeWiId);
    if (blocked) {
      return {
        success: false,
        error:
          `HARD_STOP_ACTIVE: Work item ${activeWiId} is blocked.\n` +
          `Reason: ${record!.reason}. Source: ${record!.source_tool}. ` +
          `sf_safe_bash is blocked during hard_stop.`,
        hard_stop: true,
        hard_stop_record: record,
      };
    }
  }

  const command = (args['command'] as string) ?? '';
  const WI_ARTIFACT_PATTERN = /\.specforge[\\/]work-items[\\/]/i;

  if (WI_ARTIFACT_PATTERN.test(command)) {
    const access = classifyWorkItemPathBashAccess(command);

    if (access === 'write') {
      return {
        success: false,
        error:
          'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL: Cannot use sf_safe_bash to create/write .specforge/work-items/ paths.\n' +
          'Use sf_artifact_write for governed artifacts, or return a failure report so the orchestrator can call the controlled tool.',
        hard_stop: false,
        policy_violation: true,
        retry_allowed: true,
        blocked_command: command.slice(0, 200),
      };
    }

    if (access === 'unknown') {
      return {
        success: false,
        error:
          'WI_ARTIFACT_PATH_POLICY_REQUIRES_CONTROLLED_TOOL: sf_safe_bash command references .specforge/work-items/ but is not recognized as read-only.\n' +
          'Use a controlled SpecForge tool, or use a simple read-only command such as Get-Content, type, dir, ls, findstr, Select-String, or certutil -hashfile.',
        hard_stop: false,
        policy_violation: true,
        retry_allowed: true,
        blocked_command: command.slice(0, 200),
      };
    }
  }

  return safeBashExecute(
    {
      command,
      cwd: args['cwd'] as string | undefined,
      timeoutMs: args['timeoutMs'] as number | undefined,
      env: args['env'] as Record<string, string> | undefined,
      stdin: args['stdin'] as string | undefined,
      outputLimit: args['outputLimit'] as number | undefined,
      callerRole,
    },
    baseDir,
  );
});
