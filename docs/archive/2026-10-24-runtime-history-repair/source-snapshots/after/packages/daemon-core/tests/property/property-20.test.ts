/**
 * Property 20: Recovery Consistency Repair Test
 * 
 * Feature: daemon-core, Property 20: Recovery Consistency Repair
 * Derived-From: v6-architecture-overview Property 20
 * 
 * Property Statement:
 * For all inconsistent (events.jsonl, state.json) combinations detected at startup,
 * the Recovery subsystem must roll back to a consistent snapshot s' according to
 * predefined repair rules, and write a recovery.repaired event recording the repair
 * path; after repair, rebuild(events) == s' must hold.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { RecoverySubsystem } from '../../src/recovery/RecoverySubsystem';
import { StateManager } from '../../src/state/StateManager';
import { Event, ProjectState } from '../../src/types';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { IPathResolver } from '../../src/daemon/path-resolver';

let currentEventSequence = 0;
function currentEvent(event: Event): Event {
  return {
    ...event,
    schema_version: '1.0',
    monotonicSeq: event.monotonicSeq ?? ++currentEventSequence,
    projectId: event.projectId ?? 'test-project',
    actor: event.actor ?? 'test',
    category: event.category ?? 'system',
  };
}

/**
 * Compute the hash used by RecoverySubsystem/StateManager for a project path
 */
function computeHash(projectPath: string): string {
  let hash = 0;
  for (let i = 0; i < projectPath.length; i++) {
    const char = projectPath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

class PropertyPathResolver implements IPathResolver {
  constructor(private readonly root: string) {}
  private runtime(projectPath: string): string {
    return path.join(this.root, computeHash(projectPath));
  }
  resolveProjectRuntimeDir(projectPath: string): string { return this.runtime(projectPath); }
  resolveStatePath(projectPath: string): string { return path.join(this.runtime(projectPath), 'state.json'); }
  resolveEventsPath(projectPath: string): string { return path.join(this.runtime(projectPath), 'events.jsonl'); }
  resolveSessionsDir(projectPath: string): string { return path.join(this.runtime(projectPath), 'sessions'); }
  resolveDaemonRuntimeDir(): string { return path.join(this.root, 'daemon'); }
  resolveHandshakePath(): string { return path.join(this.root, 'daemon', 'handshake.json'); }
  resolveDaemonJsonPath(): string { return path.join(this.root, 'daemon.json'); }
  resolveDaemonStatePath(): string { return path.join(this.root, 'daemon', 'state.json'); }
  resolveDaemonEventsPath(): string { return path.join(this.root, 'daemon', 'events.jsonl'); }
}

describe('Property 20: recovery preserves complete history and rejects loss', () => {
  let root: string;
  let resolver: PropertyPathResolver;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-recovery-history-')); resolver = new PropertyPathResolver(root); });
  afterEach(async () => { await fs.rm(root, {recursive:true, force:true}); });
  async function fixture(id: string) {
    const sm = new StateManager(resolver,id); await sm.initialize();
    await sm.transition('WI-1','','created');
    const checkpoint = JSON.parse(await fs.readFile(resolver.resolveStatePath(id),'utf8'));
    await sm.transition('WI-1','created','intake_ready');
    return {sm, checkpoint, recovery:new RecoverySubsystem(resolver,id), events:resolver.resolveEventsPath(id), state:resolver.resolveStatePath(id)};
  }
  it('repairs a stale checkpoint and records a durable repair without losing the work item', async () => {
    const f=await fixture('stale');
    await fs.writeFile(f.state,JSON.stringify(f.checkpoint));
    const check=await f.recovery.checkConsistency(); expect(check.isValid).toBe(false);
    const result=await f.recovery.repairInconsistency(check); expect(result.success).toBe(true);
    expect(result.repairEvents.length).toBeGreaterThan(0);
    const fresh=new StateManager(resolver,'stale');await fresh.initialize();
    expect(fresh.getState('WI-1')?.current_state).toBe('intake_ready');
    expect(result.repairedState.workItems).toEqual(fresh.listWorkItems());
    expect(result.repairedState.lastEventId).toBe(result.repairEvents.at(-1)!.eventId);
  });
  for(const fault of ['missing','invalid-schema','missing-reference','invalid-transition']) it('rejects '+fault+' with zero authority writes',async()=>{
    const f=await fixture(fault);
    if(fault==='missing') await fs.unlink(f.events);
    if(fault==='invalid-schema') await fs.appendFile(f.events,'{}\n');
    if(fault==='invalid-transition') {
      const wal=f.sm.getWal();await wal.appendEvent(wal.createEvent('WI-1','state','state.transition',{from_state:'intake_ready'}));
    }
    if(fault==='missing-reference') { f.checkpoint.lastEventId='absent';await fs.writeFile(f.state,JSON.stringify(f.checkpoint)); }
    const state=await fs.readFile(f.state); const events=await fs.readFile(f.events).catch(()=>null);
    await expect(f.recovery.checkConsistency()).rejects.toThrow(/WAL_/);
    await expect(f.recovery.repairInconsistency({isValid:false,issues:[{type:'missing_event',description:'fixture'}]})).rejects.toThrow(/WAL_/);
    expect(await fs.readFile(f.state)).toEqual(state);expect(await fs.readFile(f.events).catch(()=>null)).toEqual(events);
  });
  it('replays every generated complete history; no tolerated failures',async()=>{
    await fc.assert(fc.asyncProperty(fc.integer({min:1,max:12}),fc.boolean(),async(count,dropCheckpoint)=>{
      const id='property-'+Math.random(); const sm=new StateManager(resolver,id);await sm.initialize();
      for(let i=0;i<count;i++) await sm.transition('WI-'+i,'','created');
      if(dropCheckpoint) await fs.unlink(resolver.resolveStatePath(id));
      const fresh=new StateManager(resolver,id);await fresh.initialize();
      expect(fresh.listWorkItems()).toEqual(sm.listWorkItems());
      expect((await new RecoverySubsystem(resolver,id).checkConsistency()).isValid).toBe(true);
    }),{numRuns:120,seed:20261024});
  },60000);
});
