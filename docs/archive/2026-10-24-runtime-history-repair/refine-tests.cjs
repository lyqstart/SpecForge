const fs=require('fs'),p=require('path');const root=p.resolve(__dirname,'../runtime-history-worktree');
for(const name of ['runtime-history-integrity','configuration-activation-loss']){
 const f=p.join(root,'packages/daemon-core/tests/unit',name+'.test.ts');let s=fs.readFileSync(f,'utf8');
 s="import { buildProcessFixture } from '../fixtures/build-process-fixture';\n"+s;
 s=s.replace(/const script\s*=\s*fileURLToPath\((new URL\([^;]+?)\);/, 'const script = buildProcessFixture(fileURLToPath($1), f.root);');fs.writeFileSync(f,s);
}
const f=p.join(root,'packages/daemon-core/tests/property/property-20.test.ts');let s=fs.readFileSync(f,'utf8');
s=s.slice(0,s.indexOf("describe('Property 20:"));
s += `describe('Property 20: recovery preserves complete history and rejects loss', () => {
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
  for(const fault of ['missing','invalid-schema','missing-reference']) it('rejects '+fault+' with zero authority writes',async()=>{
    const f=await fixture(fault);
    if(fault==='missing') await fs.unlink(f.events);
    if(fault==='invalid-schema') await fs.appendFile(f.events,'{}\\n');
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
`;
fs.writeFileSync(f,s);
