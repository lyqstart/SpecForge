import * as fs from 'node:fs';
import * as path from 'node:path';
import { ACTOR_ROLES, type ActorRole } from '@specforge/types/actor-roles';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { checkWrite } from './write-guard-v11';
import { appendWriteGuardLog } from './write-guard-log';
import { setHardStop } from './hard-stop-latch';

export type RuntimeWriteOperation = 'create' | 'modify' | 'delete';

export interface RuntimeWriteTarget {
  path: string;
  operation: RuntimeWriteOperation;
}

export interface RuntimeWriteGuardResult {
  checked: boolean;
  allowed: boolean;
  targets: RuntimeWriteTarget[];
  violations: string[];
  hard_stop?: boolean;
}

function normalizeSlashes(value: string): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

function stripQuotes(value: string): string {
  return String(value ?? '').trim().replace(/^["']|["']$/g, '');
}

function uniqueTargets(targets: RuntimeWriteTarget[]): RuntimeWriteTarget[] {
  const seen = new Set<string>();
  const result: RuntimeWriteTarget[] = [];

  for (const target of targets) {
    const key = target.operation + ':' + normalizeSlashes(target.path).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ path: normalizeSlashes(target.path), operation: target.operation });
  }

  return result;
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeEscapedShellQuotes(command: string): string {
  /*
   * Tests and OpenCode logs may contain escaped quotes, for example:
   * Out-File -FilePath \"src/todos/b.md\"
   * Normalize only shell quote escapes so path extraction can treat them like
   * normal quoted arguments. This does not modify Windows path separators.
   */
  return String(command ?? '').replace(/\\"/g, '"').replace(/\\'/g, "'");
}

function extractPowerShellArgument(command: string, verb: string, namedArgs: string[]): string[] {
  const text = normalizeEscapedShellQuotes(command);
  const results: string[] = [];
  const namePattern = namedArgs.map(escapeRegExp).join('|');
  const escapedVerb = escapeRegExp(verb);

  const quoted = new RegExp(
    "\\b" + escapedVerb + "\\b[\\s\\S]{0,600}?-(?:" + namePattern + ")\\s+[\"']([^\"']+)[\"']",
    'ig',
  );

  const unquoted = new RegExp(
    '\\b' + escapedVerb + '\\b[\\s\\S]{0,600}?-(?:' + namePattern + ')\\s+([^\\s;|]+)',
    'ig',
  );

  let match: RegExpExecArray | null;
  while ((match = quoted.exec(text)) !== null) results.push(stripQuotes(match[1] ?? ''));
  while ((match = unquoted.exec(text)) !== null) results.push(stripQuotes(match[1] ?? ''));

  return results.filter((value) => value.length > 0);
}

function isShellRedirectionSink(rawTarget: string): boolean {
  const cleaned = stripQuotes(rawTarget).trim();
  const normalized = cleaned.replace(/\\/g, '/').toLowerCase();

  // File descriptor duplication / closing, e.g. 2>&1, 1>&2, >&2, 2>&-
  if (/^&\d+$/.test(cleaned) || cleaned === '&-') return true;

  // Null sinks are not business writes. Treat Unix and Windows spellings alike.
  if (normalized === '/dev/null' || normalized === 'dev/null') return true;
  if (normalized === 'nul' || normalized === 'nul:' || normalized === 'null') return true;

  return false;
}

function pushShellTarget(targets: RuntimeWriteTarget[], rawPath: string, operation: RuntimeWriteOperation): void {
  const cleaned = stripQuotes(rawPath);
  if (!cleaned || isShellRedirectionSink(cleaned)) return;
  targets.push({ path: cleaned, operation });
}

export function extractShellWriteTargets(command: string): RuntimeWriteTarget[] {
  const text = normalizeEscapedShellQuotes(String(command ?? ''));
  const targets: RuntimeWriteTarget[] = [];

  for (const p of extractPowerShellArgument(text, 'Set-Content', ['Path', 'LiteralPath'])) {
    pushShellTarget(targets, p, 'create');
  }

  for (const p of extractPowerShellArgument(text, 'Add-Content', ['Path', 'LiteralPath'])) {
    pushShellTarget(targets, p, 'modify');
  }

  for (const p of extractPowerShellArgument(text, 'Out-File', ['FilePath', 'LiteralPath'])) {
    pushShellTarget(targets, p, 'create');
  }

  for (const p of extractPowerShellArgument(text, 'New-Item', ['Path', 'LiteralPath', 'Name'])) {
    pushShellTarget(targets, p, 'create');
  }

  for (const p of extractPowerShellArgument(text, 'Remove-Item', ['Path', 'LiteralPath'])) {
    pushShellTarget(targets, p, 'delete');
  }

  for (const p of extractPowerShellArgument(text, 'Copy-Item', ['Destination'])) {
    pushShellTarget(targets, p, 'create');
  }

  for (const p of extractPowerShellArgument(text, 'Move-Item', ['Destination'])) {
    pushShellTarget(targets, p, 'create');
  }

  /*
   * Shell redirection is a real write only when the target is a file path.
   * v1.2 incorrectly treated FD duplication and null sinks as project writes:
   *   2>&1       -> target "&1"
   *   >/dev/null -> target "/dev/null"
   * That false positive triggered HardStop in normal read/debug commands.
   */
  const redirection = /(?:^|[\s;|])(?:\d*>>?|\d*>&)\s*["']?([^"'\s;|]+)["']?/g;
  let match: RegExpExecArray | null;
  while ((match = redirection.exec(text)) !== null) {
    pushShellTarget(targets, match[1] ?? '', 'modify');
  }

  const tee = /\btee(?:-object)?\s+(?:-FilePath\s+)?["']?([^"'\s;|]+)["']?/gi;
  while ((match = tee.exec(text)) !== null) {
    pushShellTarget(targets, match[1] ?? '', 'modify');
  }

  const shellCommands: Array<[RegExp, RuntimeWriteOperation]> = [
    [/\btouch\s+["']?([^"'\s;|]+)["']?/gi, 'create'],
    [/\brm\s+(?:-[a-zA-Z]+\s+)*["']?([^"'\s;|]+)["']?/gi, 'delete'],
    [/\bcp\s+["']?[^"'\s;|]+["']?\s+["']?([^"'\s;|]+)["']?/gi, 'create'],
    [/\bmv\s+["']?[^"'\s;|]+["']?\s+["']?([^"'\s;|]+)["']?/gi, 'create'],
  ];

  for (const [pattern, operation] of shellCommands) {
    while ((match = pattern.exec(text)) !== null) {
      pushShellTarget(targets, match[1] ?? '', operation);
    }
  }

  return uniqueTargets(targets.filter((target) => target.path.length > 0));
}

function toProjectRelative(
  projectRoot: string,
  cwd: string | undefined,
  targetPath: string,
): { relative?: string; violation?: string } {
  const cleaned = stripQuotes(targetPath);
  if (!cleaned) return { violation: 'empty target path' };

  const base = cwd && path.isAbsolute(cwd) ? cwd : projectRoot;
  const absolute = path.isAbsolute(cleaned) ? path.resolve(cleaned) : path.resolve(base, cleaned);
  const projectAbs = path.resolve(projectRoot);
  const rel = path.relative(projectAbs, absolute);

  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { violation: 'write target is outside project root: ' + cleaned };
  }

  return { relative: normalizeSlashes(rel) };
}

function readWorkItem(projectRoot: string, workItemId: string): any | null {
  try {
    const wiPath = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId, 'work_item.json');
    return JSON.parse(fs.readFileSync(wiPath, 'utf-8'));
  } catch {
    return null;
  }
}

function readRuntimeState(projectRoot: string): any | null {
  try {
    const statePath = path.join(projectRoot, SPEC_DIR_NAME, 'runtime', 'state.json');
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  } catch {
    return null;
  }
}

function authoritativeWorkItemState(projectRoot: string, workItemId: string, fallback: string): string {
  const state = readRuntimeState(projectRoot);
  const items = Array.isArray(state?.workItems) ? state.workItems : [];
  const match = items.find((item: any) => item?.work_item_id === workItemId);
  return typeof match?.current_state === 'string' && match.current_state.length > 0 ? match.current_state : fallback;
}

function normalizeForCompare(value: string): string {
  return normalizeSlashes(String(value ?? '')).replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();
}

function allowedPathToProjectRelative(projectRoot: string, cwd: string | undefined, value: string): string | null {
  const resolved = toProjectRelative(projectRoot, cwd, value);
  if (resolved.relative) return resolved.relative;

  const cleaned = stripQuotes(value);
  return cleaned ? normalizeSlashes(cleaned) : null;
}

function isAllowedDirectoryPreparation(
  projectRoot: string,
  cwd: string | undefined,
  wi: any,
  targetRelative: string,
): boolean {
  if (wi?.code_change_allowed !== true || wi?.code_permission_revoked === true) return false;

  const allowed = Array.isArray(wi?.allowed_write_files) ? wi.allowed_write_files : [];
  const directory = normalizeForCompare(targetRelative);
  if (!directory || directory === '.' || directory.startsWith('.specforge/')) return false;

  return allowed.some((entry: any) => {
    const raw = typeof entry === 'string' ? entry : entry?.path;
    if (typeof raw !== 'string' || raw.trim() === '') return false;

    const allowedRelative = allowedPathToProjectRelative(projectRoot, cwd, raw);
    if (!allowedRelative) return false;

    const allowedPath = normalizeForCompare(allowedRelative);
    return allowedPath !== directory && allowedPath.startsWith(directory + '/');
  });
}

function workItemDir(projectRoot: string, workItemId: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);
}

function isKnownActorRole(value: string | undefined): value is ActorRole {
  return !!value && Object.values(ACTOR_ROLES).includes(value as ActorRole);
}

export function enforceRuntimeWriteGuardForShell(input: {
  projectRoot: string;
  workItemId: string | null;
  command: string;
  cwd?: string;
  callerRole?: string;
  tool?: string;
}): RuntimeWriteGuardResult {
  const targets = extractShellWriteTargets(input.command);

  if (targets.length === 0) return { checked: false, allowed: true, targets: [], violations: [] };

  if (!input.workItemId) {
    return {
      checked: true,
      allowed: false,
      targets,
      violations: ['no active work_item_id for shell write command'],
      hard_stop: false,
    };
  }

  const wi = readWorkItem(input.projectRoot, input.workItemId);
  if (!wi) {
    return {
      checked: true,
      allowed: false,
      targets,
      violations: ['work_item.json not found for shell write guard'],
      hard_stop: true,
    };
  }

  const actor = isKnownActorRole(input.callerRole) ? input.callerRole : ACTOR_ROLES.agent;
  const allViolations: string[] = [];
  const normalizedTargets: RuntimeWriteTarget[] = [];

  for (const target of targets) {
    const targetViolations: string[] = [];
    const resolved = toProjectRelative(input.projectRoot, input.cwd, target.path);
    const relative = resolved.relative ?? target.path;
    const normalizedTarget = { path: relative, operation: target.operation };

    normalizedTargets.push(normalizedTarget);

    if (resolved.violation) {
      targetViolations.push(resolved.violation);
    }

    const currentState = authoritativeWorkItemState(
      input.projectRoot,
      input.workItemId,
      String(wi.status ?? ''),
    );

    if (actor !== ACTOR_ROLES.mergeRunner && currentState !== 'implementation_running') {
      targetViolations.push('write requires implementation_running state: current=' + currentState);
    }

    const directoryPreparationAllowed =
      target.operation === 'create' &&
      !resolved.violation &&
      currentState === 'implementation_running' &&
      isAllowedDirectoryPreparation(input.projectRoot, input.cwd, wi, relative);

    if (!resolved.violation && !directoryPreparationAllowed) {
      const check = checkWrite(
        {
          hasActiveWI: true,
          workItem: {
            work_item_id: String(wi.work_item_id ?? input.workItemId),
            status: currentState,
            code_change_allowed: wi.code_change_allowed === true,
            allowed_write_files: Array.isArray(wi.allowed_write_files) ? wi.allowed_write_files : [],
            workflow_path: wi.workflow_path ?? null,
          },
          callerRole: actor,
          isFrozen: false,
        },
        relative,
        target.operation,
      );

      if (!check.allowed) targetViolations.push(...check.violations);
    }

    appendWriteGuardLog(workItemDir(input.projectRoot, input.workItemId), {
      timestamp: new Date().toISOString(),
      path: relative,
      operation: target.operation,
      actor,
      allowed: targetViolations.length === 0,
      violations: targetViolations,
      tool: input.tool ?? 'sf_safe_bash',
      command: input.command,
    });

    allViolations.push(...targetViolations);
  }

  if (allViolations.length > 0) {
    const uniqueViolations = Array.from(new Set(allViolations));

    setHardStop(
      input.projectRoot,
      input.workItemId,
      'WRITE_GUARD_RUNTIME_BLOCKED: ' + uniqueViolations.join('; '),
      input.tool ?? 'sf_safe_bash',
    );

    return {
      checked: true,
      allowed: false,
      targets: normalizedTargets,
      violations: uniqueViolations,
      hard_stop: true,
    };
  }

  return { checked: true, allowed: true, targets: normalizedTargets, violations: [] };
}

export function parseChangedFilesAuditPass(auditText: string): { passed: boolean; reason?: string } {
  const text = String(auditText ?? '');
  if (!text.trim()) return { passed: false, reason: 'changed_files_audit.md is empty' };
  if (/##\s*Result:\s*FAIL/i.test(text)) return { passed: false, reason: 'changed_files_audit result is FAIL' };
  if (!/##\s*Result:\s*PASS/i.test(text)) return { passed: false, reason: 'changed_files_audit result is not PASS' };

  const numericChecks = [
    { label: 'Out of scope', pattern: /-\s*Out of scope:\s*([0-9]+)/i },
    { label: 'Violations', pattern: /-\s*Violations:\s*([0-9]+)/i },
    { label: 'Blocked write attempts', pattern: /-\s*Blocked write attempts:\s*([0-9]+)/i },
  ];

  for (const check of numericChecks) {
    const match = check.pattern.exec(text);
    if (match && Number(match[1]) > 0) {
      return { passed: false, reason: check.label + ' is ' + match[1] };
    }
  }

  return { passed: true };
}
