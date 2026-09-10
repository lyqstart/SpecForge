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
import {
  SPEC_DIR_NAME,
  WRITE_GUARD_AUTHORIZATION_SCHEMA_VERSION,
  type WriteGuardAuthorizationRecord,
} from '@specforge/types';
import { createWriteGuardAuthorizationLogSchemaDescriptor } from '@specforge/migration';

export type WriteGuardAuthorizationEntry = WriteGuardAuthorizationRecord;

function policyDir(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, 'project', 'policies');
}

export function writeGuardAuthorizationLogPath(projectRoot: string): string {
  return path.join(policyDir(projectRoot), 'write_guard_authorizations.jsonl');
}

export function readWriteGuardAuthorizations(projectRoot: string): WriteGuardAuthorizationEntry[] {
  const logPath = writeGuardAuthorizationLogPath(projectRoot);
  if (!fs.existsSync(logPath)) return [];
  try {
    const entries = fs
      .readFileSync(logPath, 'utf-8')
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown);
    if (entries.length === 0) throw new Error('FILE_PARSE_FAILED: JSONL file is empty');
    const descriptor = createWriteGuardAuthorizationLogSchemaDescriptor();
    for (const entry of entries) {
      const observed = typeof entry === 'object' && entry !== null && !Array.isArray(entry)
        ? (entry as Record<string, unknown>).schema_version
        : undefined;
      if (observed !== WRITE_GUARD_AUTHORIZATION_SCHEMA_VERSION) {
        throw new Error('CHAIN_GAP: unsupported write_guard_authorization schema_version');
      }
      if (!descriptor.validateCurrent(entry)) {
        throw new Error('VALIDATION_FAILED: invalid write_guard_authorization record');
      }
    }
    return entries as WriteGuardAuthorizationEntry[];
  } catch (error) {
    throw new Error(
      `WRITE_GUARD_AUTHORIZATION_LOG_INVALID: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function appendWriteGuardAuthorization(
  projectRoot: string,
  entry: Record<string, unknown>,
): WriteGuardAuthorizationEntry {
  readWriteGuardAuthorizations(projectRoot);
  const now = new Date().toISOString();
  const completed = {
    schema_version: WRITE_GUARD_AUTHORIZATION_SCHEMA_VERSION,
    authorization_id: entry.authorization_id ?? `AUTH-${Date.now()}`,
    created_at: now,
    scope: entry.scope ?? 'work_item',
    tool: entry.tool ?? 'sf_safe_bash',
    expires_when: entry.expires_when ?? 'work_item_closed',
    ...entry,
  };

  const descriptor = createWriteGuardAuthorizationLogSchemaDescriptor();
  if (!descriptor.validateCurrent(completed)) {
    throw new Error('WRITE_GUARD_AUTHORIZATION_RECORD_INVALID');
  }

  fs.mkdirSync(policyDir(projectRoot), { recursive: true });
  fs.appendFileSync(writeGuardAuthorizationLogPath(projectRoot), JSON.stringify(completed) + '\n', 'utf-8');
  return completed as WriteGuardAuthorizationEntry;
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
