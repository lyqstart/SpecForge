import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HARD_STOP_RESOLUTION_SCHEMA_VERSION,
  HARD_STOP_SCHEMA_VERSION,
  validateCurrentHardStopRecordValue,
  validateCurrentHardStopResolutionRecordValue,
} from '@specforge/types';
import {
  createHardStopLatchSchemaDescriptor,
  createHardStopResolutionLogSchemaDescriptor,
  precheckSchemaDescriptors,
} from '../src';

const workItemId = 'WI-0001';

function latch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: HARD_STOP_SCHEMA_VERSION,
    hard_stop_id: 'HS-1',
    scope: 'work_item',
    work_item_id: workItemId,
    blocked: true,
    reason: 'controlled write was blocked',
    source_tool: 'sf_safe_bash',
    created_at: '2026-09-10T00:00:00.000Z',
    resolved: false,
    recovery_status: 'pending',
    ...overrides,
  };
}

function resolution(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: HARD_STOP_RESOLUTION_SCHEMA_VERSION,
    resolved_at: '2026-09-10T00:01:00.000Z',
    work_item_id: workItemId,
    hard_stop_id: 'HS-1',
    resolution_type: 'repaired',
    user_decision_required: false,
    reason: 'repaired without scope expansion',
    scope: 'work_item',
    blocked_action_disposition: 'retry_after_repair',
    allowed_next_action: 'retry controlled action',
    last_successful_step: null,
    resume_from_step: 'retry controlled action',
    retry_original_action: false,
    safe_alternative_tool: null,
    authoritative_state_at_resolution: 'candidate_preparing',
    evidence: ['repair receipt'],
    resolved_by: 'sf-orchestrator',
    decision_source: 'sf-orchestrator_system_safe_recovery',
    original_hard_stop: latch(),
    ...overrides,
  };
}

describe('current HardStop schema descriptors', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });

  it('accepts exact current latch and resolution records', () => {
    expect(validateCurrentHardStopRecordValue(latch()).valid).toBe(true);
    expect(validateCurrentHardStopResolutionRecordValue(resolution()).valid).toBe(true);
    expect(createHardStopLatchSchemaDescriptor(workItemId).transitions).toEqual([]);
    expect(createHardStopResolutionLogSchemaDescriptor(workItemId).transitions).toEqual([]);
  });

  it('rejects extra fields and cross-record identity drift', () => {
    expect(validateCurrentHardStopRecordValue(latch({ legacy_status: 'blocked' })).valid).toBe(false);
    expect(
      createHardStopResolutionLogSchemaDescriptor(workItemId).validateCurrent(
        resolution({ hard_stop_id: 'HS-other' }),
      ),
    ).toBe(false);
  });

  it('reports unknown latch schema as CHAIN_GAP without rewriting bytes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'sf-hard-stop-descriptor-'));
    roots.push(root);
    const filePath = path.join(root, 'hard_stop.json');
    const bytes = JSON.stringify(latch({ schema_version: '9.9' })) + '\n';
    await writeFile(filePath, bytes, 'utf8');

    const result = await precheckSchemaDescriptors(root, [
      createHardStopLatchSchemaDescriptor(workItemId),
    ]);

    expect(result.ok).toBe(false);
    expect(result.checks[0]?.errorCode).toBe('CHAIN_GAP');
    expect(await import('node:fs/promises').then(fs => fs.readFile(filePath, 'utf8'))).toBe(bytes);
  });

  it('validates every JSONL record before accepting the resolution history', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'sf-hard-stop-resolution-descriptor-'));
    roots.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(
      path.join(root, 'hard_stop_resolution.jsonl'),
      `${JSON.stringify(resolution())}\n${JSON.stringify(resolution({ hard_stop_id: 'HS-other' }))}\n`,
      'utf8',
    );

    const result = await precheckSchemaDescriptors(root, [
      createHardStopResolutionLogSchemaDescriptor(workItemId),
    ]);

    expect(result.ok).toBe(false);
    expect(result.checks[0]?.errorCode).toBe('VALIDATION_FAILED');
  });
});
