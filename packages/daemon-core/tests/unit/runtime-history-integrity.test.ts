import { buildProcessFixture } from '../fixtures/build-process-fixture';
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ProjectManager } from '../../src/project/ProjectManager';
import { EventBus } from '../../src/event-bus/EventBus';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { checkNativeTool } from '../../src/tools/lib/native-write-boundary';

const roots:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
async function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sf-history-integrity-'));roots.push(root);
  vi.stubEnv('OPENCODE_CONFIG_DIR',path.join(root,'user'));vi.stubEnv('SPECFORGE_CONFIG_OVERRIDES','');
  const config=path.join(root,'.specforge/config/project.json');fs.mkdirSync(path.dirname(config),{recursive:true});
  const write=(timeoutMs:number)=>fs.writeFileSync(config,JSON.stringify({schema_version:'1.0',timeoutMs}));write(2000);
  const resolver=new PersonalPathResolver();
  const create=()=>new ProjectManager(new EventBus(),resolver,undefined as any);
  const manager=create();await manager.getProjectConfiguration(root);
  const state=await manager.getProjectStateManager(root);await state.transition('WI-0001','','created');
  return {root,config,write,create,manager,state,events:resolver.resolveEventsPath(root),checkpoint:resolver.resolveStatePath(root),activation:path.join(resolver.resolveProjectRuntimeDir(root),'configuration-activation.json')};
}
describe('authoritative history integrity at configuration consumer',()=>{
  for(const fault of ['missing','invalid-schema','rotation']) {
    it(`validates ${fault} in a real fresh child process and preserves original evidence`,async()=>{
      const f=await fixture();const wal=f.state.getWal();
      if(fault==='missing')fs.unlinkSync(f.events);
      else if(fault==='invalid-schema')fs.writeFileSync(f.events,'{}\n');
      else {
        await wal.appendEvent(wal.createEvent(f.root,'system','padding',{data:'x'.repeat(5*1024*1024)}));
        await wal.appendEvent(wal.createEvent(f.root,'system','after_rotation',{}));
      }
      const originalState=fs.readFileSync(f.checkpoint),originalActivation=fs.readFileSync(f.activation);
      f.write(10000);
      const script = buildProcessFixture(fileURLToPath(new URL('../fixtures/runtime-history-process.ts',import.meta.url)), f.root);
      const child=spawnSync(process.env.npm_execpath!,[script,f.root],{encoding:'utf8',windowsHide:true});
      expect(child.error).toBeUndefined();expect(child.status,child.stderr).toBe(0);
      const line=child.stdout.split(/\r?\n/).find(row=>row.startsWith('HISTORY_RESULT='));
      expect(line).toBeDefined();console.log(line);
      const result=JSON.parse(line!.slice('HISTORY_RESULT='.length));expect(result.pid).not.toBe(process.pid);
      expect(result.error).toMatch(fault==='rotation'?/CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK/:/WAL_|SCHEMA_/);
      expect(fs.readFileSync(f.activation)).toEqual(originalActivation);
      // Successful replay on restart may refresh a checkpoint; rejected history must not.
      if(fault!=='rotation') expect(fs.readFileSync(f.checkpoint)).toEqual(originalState);
    });
  }
  it('preserves a closed task and native denial after rotation and restart',async()=>{
    const f=await fixture();await f.state.transition('WI-0001','created','closed');
    const wal=f.state.getWal();
    await wal.appendEvent(wal.createEvent(f.root,'system','padding',{data:'x'.repeat(5*1024*1024)}));
    await wal.appendEvent(wal.createEvent(f.root,'system','after_rotation',{}));
    const fresh=f.create();const state=await fresh.getProjectStateManager(f.root);
    expect(state.getState('WI-0001')?.current_state).toBe('closed');
    expect((await checkNativeTool({projectManager:fresh},f.root,'write',{filePath:path.join(f.root,'denied.txt')})).allowed).toBe(false);
    expect(fs.existsSync(path.join(f.root,'denied.txt'))).toBe(false);
    f.write(10000);expect((await fresh.getProjectConfiguration(f.root)).merged.timeoutMs).toBe(10000);
  });
  for(const fault of ['missing-first','corrupt-archive','duplicate-current']) {
    it(`rejects ${fault} rather than replaying a partial history`,async()=>{
      const f=await fixture();const wal=f.state.getWal();
      await wal.appendEvent(wal.createEvent(f.root,'system','padding',{data:'x'.repeat(5*1024*1024)}));
      await wal.appendEvent(wal.createEvent(f.root,'system','after_rotation',{}));
      const dir=path.dirname(f.events),archive=path.join(dir,fs.readdirSync(dir).find(n=>n.endsWith('.jsonl.bak'))!);
      if(fault==='missing-first') fs.unlinkSync(archive);
      else if(fault==='corrupt-archive') fs.writeFileSync(archive,'{}\n');
      else fs.appendFileSync(f.events,fs.readFileSync(f.events));
      const originalState=fs.readFileSync(f.checkpoint);f.write(10000);
      await expect(f.create().getProjectConfiguration(f.root)).rejects.toThrow(/WAL_/);
      expect(fs.readFileSync(f.checkpoint)).toEqual(originalState);
    });
  }
  it('does not silently ignore a schema-valid but invalid state transition',async()=>{
    const f=await fixture();const wal=f.state.getWal();
    await wal.appendEvent(wal.createEvent('WI-0001','state','state.transition',{from_state:'created'}));
    const originalState=fs.readFileSync(f.checkpoint);f.write(10000);
    await expect(f.manager.getProjectConfiguration(f.root)).rejects.toThrow('WAL_STATE_TRANSITION_INVALID');
    expect(f.state.getState('WI-0001')?.current_state).toBe('created');
    expect(fs.readFileSync(f.checkpoint)).toEqual(originalState);
  });
  for(const restart of [false,true]) {
    for(const fault of ['missing','invalid-schema','whitespace','truncated'] as const) {
      it(`rejects ${fault}, recreated=${restart}, without replacing state or activation`,async()=>{
        const f=await fixture();
        const originalEvents=fs.readFileSync(f.events);
        if(fault==='truncated') await f.state.transition('WI-0001','created','intake_ready');
        const originalState=fs.readFileSync(f.checkpoint), activation=fs.readFileSync(f.activation);
        if(fault==='missing') fs.unlinkSync(f.events);
        else fs.writeFileSync(f.events,fault==='invalid-schema'?'{}\n':fault==='whitespace'?' \n':originalEvents);
        f.write(10000);
        await expect((restart?f.create():f.manager).getProjectConfiguration(f.root)).rejects.toThrow(/WAL_|HISTORY_|SCHEMA_/);
        expect(fs.readFileSync(f.checkpoint)).toEqual(originalState);
        expect(fs.readFileSync(f.activation)).toEqual(activation);
        expect(f.state.listWorkItems()).toHaveLength(1);
      });
    }
    it(`preserves active task across real rotation, recreated=${restart}`,async()=>{
      const f=await fixture(); const wal=f.state.getWal();
      await wal.appendEvent(wal.createEvent(f.root,'system','padding',{data:'x'.repeat(5*1024*1024)}));
      await wal.appendEvent(wal.createEvent(f.root,'system','after_rotation',{}));
      const activation=fs.readFileSync(f.activation);f.write(10000);
      const consumer=restart?f.create():f.manager;
      await expect(consumer.getProjectConfiguration(f.root)).rejects.toThrow('CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK');
      expect((await consumer.getProjectStateManager(f.root)).getState('WI-0001')?.current_state).toBe('created');
      expect(fs.readFileSync(f.activation)).toEqual(activation);
      f.write(2000);expect((await consumer.getProjectConfiguration(f.root)).merged.timeoutMs).toBe(2000);
    });
  }
  it('retains all segments after more than three rotations',async()=>{
    const f=await fixture();const wal=f.state.getWal();
    for(let i=0;i<5;i++) {
      await wal.appendEvent(wal.createEvent(f.root,'system','padding',{data:'x'.repeat(5*1024*1024)}));
      await wal.appendEvent(wal.createEvent(f.root,'system','after_rotation',{i}));
    }
    expect(fs.readdirSync(path.dirname(f.events)).filter(n=>n.endsWith('.jsonl.bak'))).toHaveLength(5);
    const fresh=f.create();expect((await fresh.getProjectConfiguration(f.root)).merged.timeoutMs).toBe(2000);
    expect((await fresh.getProjectStateManager(f.root)).getState('WI-0001')?.current_state).toBe('created');
  });
  it('allows unchanged configuration and valid replay before and after recreation',async()=>{
    const f=await fixture();
    for(const consumer of [f.manager,f.create()]) {
      expect((await consumer.getProjectConfiguration(f.root)).merged.timeoutMs).toBe(2000);
      const state=await consumer.getProjectStateManager(f.root);await state.rebuildState();
      expect(state.getState('WI-0001')?.current_state).toBe('created');
    }
  });
});
