import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WAL } from '../../src/wal/WAL';
import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('sf-required-wal-')) throw new Error('UNSAFE_TEST_CLEANUP');
  await fs.rm(resolved, { recursive: true, force: true });
} });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-required-wal-'));
  roots.push(root);
  const file = path.join(root, 'events.jsonl');
  const wal = new WAL(file);
  await wal.initialize();
  return { file, wal, root };
}
const event = (wal: WAL, workItemId = 'WI-0001') => wal.createEvent(workItemId, 'system',
  'required_verification.registered', { work_item_id: workItemId }, 'required_verification_owner');

describe('required verification durable compare-and-append', () => {
  it('requires the dedicated compare-and-append path, including generic append callers', async () => {
    const { wal } = await fixture();
    await expect(wal.appendEvent(event(wal))).rejects.toThrow('CAS_REQUIRED');
    expect((await wal.readAllEvents()).events).toHaveLength(0);
  });
  it('admits exactly one concurrent writer across owner instances and retains the winner', async () => {
    const { wal, file } = await fixture();
    const other = new WAL(file); await other.initialize();
    const results = await Promise.allSettled([wal, other].map(owner =>
      owner.appendEvent(event(owner), undefined, { workItemId: 'WI-0001', eventId: null })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await wal.readAllEvents()).events).toHaveLength(1);
  });
  it('does not reset obligation history on restart or an unrelated WI event', async () => {
    const { wal, file } = await fixture();
    const first = event(wal);
    await wal.appendEvent(first, undefined, { workItemId: 'WI-0001', eventId: null });
    await wal.appendEvent(event(wal, 'WI-0002'), undefined, { workItemId: 'WI-0002', eventId: null });
    const restarted = new WAL(file); await restarted.initialize();
    await expect(restarted.appendEvent(event(restarted), undefined, { workItemId: 'WI-0001', eventId: null })).rejects.toThrow('CONFLICT');
    await restarted.appendEvent(event(restarted), undefined, { workItemId: 'WI-0001', eventId: first.eventId });
    const history = (await restarted.readAllEvents()).events;
    expect(history).toHaveLength(3);
    expect(history[0]!.eventId).toBe(first.eventId);
  });
  it('rejects caller role and WI substitution before writing', async () => {
    const { wal } = await fixture();
    const forged = event(wal); forged.actor = 'sf-orchestrator';
    await expect(wal.appendEvent(forged, undefined, { workItemId: 'WI-0001', eventId: null })).rejects.toThrow('CONFLICT');
    await expect(wal.appendEvent(event(wal), undefined, { workItemId: 'WI-0002', eventId: null })).rejects.toThrow('CONFLICT');
    expect((await wal.readAllEvents()).events).toHaveLength(0);
  });
  it('replays through the actual StateManager without advancing workflow state', async () => {
    const { root } = await fixture();
    const resolver = new PersonalPathResolver();
    const manager = new StateManager(resolver, root); await manager.initialize();
    await manager.transition('WI-0001', '', 'created', 'test');
    const registered = await manager.appendRequiredVerificationEvent('WI-0001', 'registered', { test_binding: 'retained' }, null);
    const restarted = new StateManager(resolver, root); await restarted.initialize();
    expect((await restarted.readRequiredVerificationHistory('WI-0001')).map(entry => entry.eventId)).toEqual([registered.eventId]);
    expect(restarted.getState('WI-0001')?.current_state).toBe('created');
    await expect(restarted.appendRequiredVerificationEvent('WI-0001', 'proof', {}, null)).rejects.toThrow('CONFLICT');
    await restarted.appendRequiredVerificationEvent('WI-0001', 'proof', { test_result: 'failed' }, registered.eventId);
    expect(await restarted.readRequiredVerificationHistory('WI-0001')).toHaveLength(2);
    expect(restarted.getState('WI-0001')?.current_state).toBe('created');
  });
  it('fails closed when retained required evidence is deleted rather than declaring no requirements', async () => {
    const { root } = await fixture();
    const resolver = new PersonalPathResolver();
    const manager = new StateManager(resolver, root); await manager.initialize();
    await manager.transition('WI-0001', '', 'created', 'test');
    await manager.appendRequiredVerificationEvent('WI-0001', 'registered', {}, null);
    await fs.unlink(resolver.resolveEventsPath(root));
    const restarted = new StateManager(resolver, root);
    await expect(restarted.readRequiredVerificationHistory('WI-0001')).rejects.toThrow();
  });
  it('does not create missing work items or accept caller-controlled WI metadata', async () => {
    const { root } = await fixture();
    const manager = new StateManager(new PersonalPathResolver(), root); await manager.initialize();
    await expect(manager.appendRequiredVerificationEvent('WI-0001', 'registered', {}, null)).rejects.toThrow('WORK_ITEM_MISSING');
    await manager.transition('WI-0001', '', 'created', 'test');
    await expect(manager.appendRequiredVerificationEvent('WI-0001', 'registered', { work_item_id: 'WI-0002' }, null)).rejects.toThrow('RESERVED_FIELD');
    expect(await manager.readRequiredVerificationHistory('WI-0001')).toEqual([]);
  });
});
