import { registerHandler } from '../ToolDispatcher';
import { safeBashExecute } from '../lib/sf_safe_bash_core';
import { ACTOR_ROLES, type ActorRole } from '@specforge/types/actor-roles';
import { checkHardStop } from '../lib/hard-stop-latch';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { enforceRuntimeWriteGuardForShell, extractShellWriteTargets } from '../lib/write-guard-runtime-v12';
import * as fs from 'node:fs';
import * as path from 'node:path';

const VALID_ACTOR_ROLES: ReadonlySet<string> = new Set(Object.values(ACTOR_ROLES));
const VALID_WI_ID = /^WI-(\d{3,4}|\d{8}-\d{4})$/;

function isValidWorkItemId(value: unknown): value is string {
  return typeof value === 'string' && VALID_WI_ID.test(value);
}

function normalizeSlashes(value: string): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

function normalizePathForCompare(value: string): string {
  return normalizeSlashes(value).replace(/^\.\//, '').toLowerCase();
}

function extractCallerRole(agent: unknown): string | undefined {
  if (typeof agent !== 'string' || !agent) return undefined;
  if (VALID_ACTOR_ROLES.has(agent as ActorRole)) return agent;
  return undefined;
}

function readJsonIfExists(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function toProjectRelative(projectRoot: string, cwd: string | undefined, targetPath: string): string | null {
  const cleaned = String(targetPath ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!cleaned) return null;
  const base = cwd && path.isAbsolute(cwd) ? cwd : projectRoot;
  const absolute = path.isAbsolute(cleaned) ? path.resolve(cleaned) : path.resolve(base, cleaned);
  const projectAbs = path.resolve(projectRoot);
  const rel = path.relative(projectAbs, absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return normalizeSlashes(rel);
}

function readRuntimeWorkItems(projectRoot: string): any[] {
  const state = readJsonIfExists(path.join(projectRoot, SPEC_DIR_NAME, 'runtime', 'state.json'));
  return Array.isArray(state?.workItems) ? state.workItems : [];
}

function readWorkItem(projectRoot: string, workItemId: string): any | null {
  return readJsonIfExists(path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId, 'work_item.json'));
}

function allowedWriteEntryMatches(projectRoot: string, cwd: string | undefined, entry: any, targetRelative: string): boolean {
  const raw = typeof entry === 'string' ? entry : entry?.path;
  if (typeof raw !== 'string') return false;
  const rel = toProjectRelative(projectRoot, cwd, raw) ?? normalizeSlashes(raw);
  return normalizePathForCompare(rel) === normalizePathForCompare(targetRelative);
}

function timestampValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '');
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return Date.parse(text) || 0;
}

function sortByFreshest(a: any, b: any): number {
  const au = timestampValue(a?.updated_at ?? a?.last_updated_at ?? a?.created_at);
  const bu = timestampValue(b?.updated_at ?? b?.last_updated_at ?? b?.created_at);
  return bu - au;
}

function isParentDirectoryOfAnyTarget(directoryTarget: string, targets: string[]): boolean {
  const directory = normalizePathForCompare(directoryTarget).replace(/\/+$/, '');
  if (!directory || directory === '.' || directory.startsWith('.specforge/')) return false;
  return targets.some((target) => {
    const normalized = normalizePathForCompare(target).replace(/\/+$/, '');
    return normalized !== directory && normalized.startsWith(directory + '/');
  });
}

function filterDirectoryPreparationTargets(targets: string[]): string[] {
  return targets.filter((target) => !isParentDirectoryOfAnyTarget(target, targets));
}

export function findActiveWorkItemIdForWrite(
  projectRoot: string,
  args: Record<string, unknown>,
  command: string,
): string | null {
  const explicit = args['work_item_id'] ?? args['workItemId'] ?? args['wi'];
  if (isValidWorkItemId(explicit)) return explicit;

  const cwd = args['cwd'] as string | undefined;
  const targets = filterDirectoryPreparationTargets(
    extractShellWriteTargets(command)
      .map((target) => toProjectRelative(projectRoot, cwd, target.path))
      .filter((value): value is string => typeof value === 'string'),
  );

  const running = readRuntimeWorkItems(projectRoot)
    .filter((item) => item?.current_state === 'implementation_running' || item?.status === 'implementation_running')
    .filter((item) => isValidWorkItemId(item?.work_item_id))
    .sort(sortByFreshest);

  if (running.length === 0) return null;

  for (const item of running) {
    const wi = readWorkItem(projectRoot, String(item.work_item_id));
    if (!wi || wi.code_change_allowed !== true || wi.code_permission_revoked === true) continue;
    const allowed = Array.isArray(wi.allowed_write_files) ? wi.allowed_write_files : [];
    if (targets.length > 0 && targets.every((target) => allowed.some((entry: any) => allowedWriteEntryMatches(projectRoot, cwd, entry, target)))) {
      return String(item.work_item_id);
    }
  }

  return String(running[0].work_item_id);
}

function classifyWorkItemPathBashAccess(command: string): 'read' | 'write' | 'unknown' {
  const normalized = command.trim().toLowerCase();
  const writeLike =
    /(?:^|[;&|]\s*)(set-content|add-content|out-file|new-item|copy-item|move-item|remove-item|del|erase|rm|rmdir|mkdir|ni|cp|mv|touch)\b/.test(normalized) ||
    />\s*[^\s]*\.specforge[\\/]work-items[\\/]/i.test(command) ||
    /\.specforge[\\/]work-items[\\/].*(?:>|\|\s*tee(?:-object)?\b)/i.test(command);
  if (writeLike) return 'write';

  const readLike =
    /(?:^|[;&|]\s*)(get-content|gc|type|cat|dir|ls|gci|get-childitem|select-string|findstr)\b/.test(normalized) ||
    /(?:^|[;&|]\s*)certutil\s+-hashfile\b/.test(normalized) ||
    /(?:^|[;&|]\s*)(sha256sum|shasum|fciv)\b/.test(normalized);
  if (readLike) return 'read';
  return 'unknown';
}

function commandMentionsProtectedSpecForgePath(command: string): boolean {
  const text = normalizePathForCompare(command);
  return (
    text.includes('.specforge/project/') ||
    text.includes('.specforge/runtime/') ||
    text.includes('.specforge/work-items/') ||
    text.includes('.specforge/logs/') ||
    text.includes('.specforge/specs/') ||
    text.includes('.specforge/cas/')
  );
}

function commandWritesOnlyReportPaths(projectRoot: string, command: string, cwd?: string): boolean {
  const targets = extractShellWriteTargets(command);
  if (targets.length === 0) return false;
  return targets.every((target) => {
    const rel = toProjectRelative(projectRoot, cwd, target.path);
    if (!rel) return false;
    const normalized = normalizePathForCompare(rel);
    return normalized === '.specforge/reports' || normalized.startsWith('.specforge/reports/');
  });
}

registerHandler('sf_safe_bash', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const callerRole = extractCallerRole((context as Record<string, unknown> | undefined)?.agent);
  const command = (args['command'] as string) ?? '';
  const cwd = args['cwd'] as string | undefined;

  if (commandMentionsProtectedSpecForgePath(command)) {
    const WI_ARTIFACT_PATTERN = /\.specforge[\\/]work-items[\\/]/i;
    if (WI_ARTIFACT_PATTERN.test(command)) {
      const access = classifyWorkItemPathBashAccess(command);
      if (access === 'read') {
        return safeBashExecute({ command, cwd, timeoutMs: args['timeoutMs'] as number | undefined, env: args['env'] as Record<string, string> | undefined, stdin: args['stdin'] as string | undefined, outputLimit: args['outputLimit'] as number | undefined, callerRole }, baseDir);
      }
    }
    return {
      success: false,
      error:
        'SPEC_FORGE_PROTECTED_PATH_WRITE_REQUIRES_CONTROLLED_TOOL: sf_safe_bash cannot write protected .specforge paths. ' +
        'Use sf_artifact_write for work-item artifacts or merge_runner for .specforge/project/**.',
      hard_stop: false,
      policy_violation: true,
      retry_allowed: true,
      blocked_command: command.slice(0, 240),
    };
  }

  if (commandWritesOnlyReportPaths(baseDir, command, cwd)) {
    return safeBashExecute({ command, cwd, timeoutMs: args['timeoutMs'] as number | undefined, env: args['env'] as Record<string, string> | undefined, stdin: args['stdin'] as string | undefined, outputLimit: args['outputLimit'] as number | undefined, callerRole }, baseDir);
  }

  const activeWiId = findActiveWorkItemIdForWrite(baseDir, args as Record<string, unknown>, command);
  if (activeWiId) {
    const { blocked, record } = checkHardStop(baseDir, activeWiId);
    if (blocked) {
      return {
        success: false,
        error:
          `HARD_STOP_ACTIVE: Work item ${activeWiId} is blocked.\n` +
          `Reason: ${record!.reason}.\nSource: ${record!.source_tool}.\n` +
          'sf_safe_bash is blocked only for the affected work item.',
        hard_stop: true,
        hard_stop_record: record,
      };
    }
  }

  const runtimeGuard = enforceRuntimeWriteGuardForShell({
    projectRoot: baseDir,
    workItemId: activeWiId,
    command,
    cwd,
    callerRole,
    tool: 'sf_safe_bash',
  });

  if (runtimeGuard.checked && !runtimeGuard.allowed) {
    return {
      success: false,
      error:
        'WRITE_GUARD_RUNTIME_BLOCKED: sf_safe_bash refused to execute a write command before it could modify files.\n' +
        'Violations: ' + runtimeGuard.violations.join('; '),
      hard_stop: runtimeGuard.hard_stop === true,
      policy_violation: true,
      retry_allowed: false,
      blocked_command: command.slice(0, 240),
      write_guard_targets: runtimeGuard.targets,
    };
  }

  return safeBashExecute(
    {
      command,
      cwd,
      timeoutMs: args['timeoutMs'] as number | undefined,
      env: args['env'] as Record<string, string> | undefined,
      stdin: args['stdin'] as string | undefined,
      outputLimit: args['outputLimit'] as number | undefined,
      callerRole,
    },
    baseDir,
  );
});
