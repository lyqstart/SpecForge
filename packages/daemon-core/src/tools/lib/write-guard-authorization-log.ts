/**
 * write-guard-authorization-log.ts
 *
 * Project-level scoped authorizations for Write Guard.
 *
 * A hard_stop resolution explains why the current latch can be cleared.
 * A write_guard_authorization explains which future operations may be allowed
 * without repeatedly stopping the same Work Item.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

export type WriteGuardAuthorizationScope = 'command' | 'task' | 'work_item' | 'project' | string;

export type WriteGuardAuthorizationType =
  | 'user_accepted_external_ops'
  | 'user_authorized_retry'
  | 'false_positive_pattern'
  | 'expected_negative_test'
  | string;

export interface WriteGuardAuthorizationEntry {
  schema_version?: string;
  authorization_id?: string;
  created_at?: string;
  created_by?: string;
  source_hard_stop_id?: string | null;
  work_item_id?: string;
  authorization_type?: WriteGuardAuthorizationType;
  scope?: WriteGuardAuthorizationScope;
  tool?: string;
  intent?: string;
  command_family?: string;
  host_path_prefix?: string;
  container_targets?: string[];
  image?: string;
  allowed_pattern?: Record<string, unknown>;
  expires_when?: string;
  max_uses?: number;
  user_response_quote?: string;
  reason?: string;
}

function policyDir(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, 'project', 'policies');
}

export function writeGuardAuthorizationLogPath(projectRoot: string): string {
  return path.join(policyDir(projectRoot), 'write_guard_authorizations.jsonl');
}

export function readWriteGuardAuthorizations(projectRoot: string): WriteGuardAuthorizationEntry[] {
  const logPath = writeGuardAuthorizationLogPath(projectRoot);
  try {
    if (!fs.existsSync(logPath)) return [];
    return fs
      .readFileSync(logPath, 'utf-8')
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as WriteGuardAuthorizationEntry);
  } catch {
    return [];
  }
}

export function appendWriteGuardAuthorization(
  projectRoot: string,
  entry: WriteGuardAuthorizationEntry,
): WriteGuardAuthorizationEntry {
  const now = new Date().toISOString();
  const completed: WriteGuardAuthorizationEntry = {
    schema_version: '1.2.8',
    authorization_id: entry.authorization_id ?? `AUTH-${Date.now()}`,
    created_at: now,
    scope: entry.scope ?? 'work_item',
    tool: entry.tool ?? 'sf_safe_bash',
    expires_when: entry.expires_when ?? 'work_item_closed',
    ...entry,
  };

  fs.mkdirSync(policyDir(projectRoot), { recursive: true });
  fs.appendFileSync(writeGuardAuthorizationLogPath(projectRoot), JSON.stringify(completed) + '\n', 'utf-8');
  return completed;
}

function normalize(value: unknown): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

function unquote(value: string): string {
  return value.replace(/^['"]|['"]$/g, '');
}

function commandLooksLikeDockerRun(command: string): boolean {
  return /(^|[;&|]\s*)docker\s+run\b/i.test(command);
}

function commandLooksLikeSsh(command: string): boolean {
  return /(^|[;&|]\s*)ssh\s+\S+\s+/i.test(command);
}

function commandFamilyMatches(command: string, family: string): boolean {
  const f = family.toLowerCase();
  if (!f || f === 'any' || f === 'any_shell_command') return true;
  if (f === 'docker_run') return commandLooksLikeDockerRun(command);
  if (f === 'ssh_remote') return commandLooksLikeSsh(command);
  return normalize(command).includes(normalize(f));
}

function hostPathMatches(command: string, hostPathPrefix?: string): boolean {
  const prefix = unquote(String(hostPathPrefix ?? '').trim());
  if (!prefix) return true;
  const cmd = normalize(command);
  const p = normalize(prefix).replace(/\/+$/, '');
  if (!p) return true;
  return cmd.includes(p) || cmd.includes(p.replace(/^.*\/([^/]+)$/, '$1'));
}

function containerTargetsMatch(command: string, targets?: string[]): boolean {
  if (!Array.isArray(targets) || targets.length === 0) return true;
  const cmd = normalize(command);
  return targets.some((target) => {
    const t = normalize(target).replace(/\/+$/, '');
    if (!t) return false;
    return cmd.includes(`:${t}`) || cmd.includes(`target=${t}`) || cmd.includes(`dst=${t}`) || cmd.includes(`destination=${t}`);
  });
}

function imageMatches(command: string, image?: string): boolean {
  const img = String(image ?? '').trim();
  if (!img) return true;
  return normalize(command).includes(normalize(img));
}

function scopeMatches(entry: WriteGuardAuthorizationEntry, workItemId?: string | null): boolean {
  const scope = String(entry.scope ?? 'work_item').toLowerCase();
  if (scope === 'project') return true;
  if (scope === 'work_item' || scope === 'task' || scope === 'command') {
    return !!workItemId && entry.work_item_id === workItemId;
  }
  return !!workItemId && (!entry.work_item_id || entry.work_item_id === workItemId);
}

function isClosedOrExpired(entry: WriteGuardAuthorizationEntry): boolean {
  const expiresWhen = String(entry.expires_when ?? '').toLowerCase();
  if (expiresWhen === 'revoked' || expiresWhen === 'expired') return true;
  return false;
}

export function commandMatchesWriteGuardAuthorization(
  command: string,
  entry: WriteGuardAuthorizationEntry,
  workItemId?: string | null,
): boolean {
  if (!scopeMatches(entry, workItemId)) return false;
  if (isClosedOrExpired(entry)) return false;
  if (entry.tool && entry.tool !== 'sf_safe_bash') return false;

  const family = String(entry.command_family ?? entry.intent ?? 'any_shell_command');
  return (
    commandFamilyMatches(command, family) &&
    hostPathMatches(command, entry.host_path_prefix) &&
    containerTargetsMatch(command, entry.container_targets) &&
    imageMatches(command, entry.image)
  );
}

export function findMatchingWriteGuardAuthorization(
  projectRoot: string,
  command: string,
  workItemId?: string | null,
): WriteGuardAuthorizationEntry | null {
  const authorizations = readWriteGuardAuthorizations(projectRoot);
  for (let index = authorizations.length - 1; index >= 0; index -= 1) {
    const entry = authorizations[index];
    if (commandMatchesWriteGuardAuthorization(command, entry, workItemId)) return entry;
  }
  return null;
}

export function authorizationText(entry: WriteGuardAuthorizationEntry): string {
  return [
    entry.authorization_id,
    entry.authorization_type,
    entry.source_hard_stop_id,
    entry.work_item_id,
    entry.scope,
    entry.tool,
    entry.intent,
    entry.command_family,
    entry.host_path_prefix,
    ...(entry.container_targets ?? []),
    entry.image,
    entry.user_response_quote,
    entry.reason,
  ]
    .filter((value) => typeof value === 'string' && value.length > 0)
    .join('\n');
}
