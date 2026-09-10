import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendWriteGuardAuthorization,
  readWriteGuardAuthorizations,
  writeGuardAuthorizationLogPath,
} from '../../src/tools/lib/write-guard-authorization-log.js';

describe('WriteGuard Authorization persistent owner', () => {
  const roots: string[] = [];

  async function projectRoot(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'sf-write-guard-authorization-'));
    roots.push(root);
    await mkdir(path.dirname(writeGuardAuthorizationLogPath(root)), { recursive: true });
    return root;
  }

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });

  it('fails closed when an existing authorization record has an unknown schema', async () => {
    const root = await projectRoot();
    const logPath = writeGuardAuthorizationLogPath(root);
    const bytes = '{"schema_version":"9.9","authorization_id":"AUTH-unknown"}\n';
    await writeFile(logPath, bytes, 'utf8');

    expect(() => readWriteGuardAuthorizations(root)).toThrow(
      'WRITE_GUARD_AUTHORIZATION_LOG_INVALID',
    );
    expect(await readFile(logPath, 'utf8')).toBe(bytes);
  });

  it('rejects an incomplete current-schema record instead of treating it as policy', async () => {
    const root = await projectRoot();
    const logPath = writeGuardAuthorizationLogPath(root);
    const bytes = '{"schema_version":"1.2.8","authorization_id":"AUTH-incomplete"}\n';
    await writeFile(logPath, bytes, 'utf8');

    expect(() => readWriteGuardAuthorizations(root)).toThrow(
      'WRITE_GUARD_AUTHORIZATION_LOG_INVALID',
    );
    expect(await readFile(logPath, 'utf8')).toBe(bytes);
  });

  it('does not append after malformed authorization history', async () => {
    const root = await projectRoot();
    const logPath = writeGuardAuthorizationLogPath(root);
    const bytes = '{broken-history\n';
    await writeFile(logPath, bytes, 'utf8');

    expect(() =>
      appendWriteGuardAuthorization(root, {
        source_hard_stop_id: 'HS-1',
        work_item_id: 'WI-0001',
        authorization_type: 'user_authorized_retry',
        scope: 'work_item',
        tool: 'sf_safe_bash',
        command_family: 'docker_run',
        expires_when: 'work_item_closed',
        user_response_quote: '用户明确授权当前工作项内的同类操作',
        reason: 'Explicit bounded authorization from the current user.',
        created_by: 'sf-orchestrator',
      }),
    ).toThrow('WRITE_GUARD_AUTHORIZATION_LOG_INVALID');
    expect(await readFile(logPath, 'utf8')).toBe(bytes);
  });

  it('round-trips an exact current authorization through the sole owner', async () => {
    const root = await projectRoot();
    const written = appendWriteGuardAuthorization(root, {
      source_hard_stop_id: 'HS-1',
      work_item_id: 'WI-0001',
      authorization_type: 'user_authorized_retry',
      scope: 'work_item',
      tool: 'sf_safe_bash',
      command_family: 'docker_run',
      expires_when: 'work_item_closed',
      user_response_quote: '用户明确授权当前工作项内的同类操作',
      reason: 'Explicit bounded authorization from the current user.',
      created_by: 'sf-orchestrator',
    });

    expect(written.schema_version).toBe('1.2.8');
    expect(written.authorization_id).toMatch(/^AUTH-/);
    expect(readWriteGuardAuthorizations(root)).toEqual([written]);
  });
});
