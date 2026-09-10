import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WRITE_GUARD_AUTHORIZATION_SCHEMA_VERSION } from '@specforge/types';
import {
  createWriteGuardAuthorizationLogSchemaDescriptor,
  precheckSchemaDescriptors,
} from '../src';

function authorization(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: WRITE_GUARD_AUTHORIZATION_SCHEMA_VERSION,
    authorization_id: 'AUTH-1',
    created_at: '2026-09-10T00:00:00.000Z',
    created_by: 'sf-orchestrator',
    source_hard_stop_id: 'HS-1',
    work_item_id: 'WI-0001',
    authorization_type: 'user_authorized_retry',
    scope: 'work_item',
    tool: 'sf_safe_bash',
    command_family: 'docker_run',
    expires_when: 'work_item_closed',
    user_response_quote: '用户明确授权当前工作项内的同类操作',
    reason: 'Explicit bounded authorization from the current user.',
    ...overrides,
  };
}

describe('WriteGuard Authorization schema descriptor', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });

  it('accepts only the exact current record and declares no legacy transition', () => {
    const descriptor = createWriteGuardAuthorizationLogSchemaDescriptor();
    expect(descriptor.currentSchemaId).toBe('1.2.8');
    expect(descriptor.transitions).toEqual([]);
    expect(descriptor.validateCurrent(authorization())).toBe(true);
    expect(descriptor.validateCurrent(authorization({ legacy_scope: 'all' }))).toBe(false);
  });

  it('reports an unknown schema as CHAIN_GAP without changing bytes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'sf-authorization-descriptor-'));
    roots.push(root);
    const filePath = path.join(root, 'write_guard_authorizations.jsonl');
    const bytes = JSON.stringify(authorization({ schema_version: '9.9' })) + '\n';
    await writeFile(filePath, bytes, 'utf8');

    const result = await precheckSchemaDescriptors(root, [
      createWriteGuardAuthorizationLogSchemaDescriptor(),
    ]);

    expect(result.ok).toBe(false);
    expect(result.checks[0]?.errorCode).toBe('CHAIN_GAP');
    expect(await readFile(filePath, 'utf8')).toBe(bytes);
  });
});
