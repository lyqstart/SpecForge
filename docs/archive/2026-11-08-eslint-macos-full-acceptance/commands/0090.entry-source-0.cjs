const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const root=path.resolve('.lint-review-a01'),evidence=__dirname,ts=createRequire(path.join(root,'package.json'))('typescript'),plans=[],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function edit(file,fn){const before=fs.readFileSync(path.join(root,file)),after=Buffer.from(fn(before.toString().replace(/\r*\n/g,'\n')));assert(!before.equals(after),file);plans.push({file,before,after});}function replace(s,a,b){assert(s.includes(a),a);return s.replace(a,b);}
edit('packages/daemon-core/src/daemon/Daemon.ts',s=>s.replace('pathResolver, undefined as any','pathResolver, undefined').replace('      stateManager: undefined as any,\n      wal: undefined as any,\n','').replace('      this.eventBus.publish(event);','      return this.eventBus.publish(event);'));
edit('packages/daemon-core/src/project/ProjectManager.ts',s=>s.replace('private daemonStateManager: StateManager;','private daemonStateManager: StateManager | undefined;').replace('    daemonStateManager: StateManager,','    daemonStateManager: StateManager | undefined,').replace('getDaemonStateManager(): StateManager {','getDaemonStateManager(): StateManager | undefined {'));
edit('packages/daemon-core/src/extensions/ExtensionLoader.ts',s=>s.replace('private publishEvent(state: ExtensionLoadState): void','private publishEvent(state: ExtensionLoadState): Promise<void>').replace('    this.eventBus.publish(event);','    return this.eventBus.publish(event);').replaceAll('this.publishEvent(state);','await this.publishEvent(state);'));
edit('packages/daemon-core/src/http/HTTPServer.ts',s=>{s=replace(s,"  broadcastEvent(event: Event): void {\n    if (this.eventBus) {\n      this.eventBus.publish(event);\n    }\n  }","  broadcastEvent(event: Event): Promise<void> {\n    return this.eventBus ? this.eventBus.publish(event) : Promise.resolve();\n  }");s=replace(s,"    req.on('end', async () => {\n      const body = Buffer.concat(chunks);\n      try {\n        await this.handleRequestWithBody(req, res, body);\n      } catch (err) {\n        this.handleHandlerError(res, err);\n      }\n    });","    req.on('end', () => {\n      promiseFromSync(() => this.handleRequestWithBody(req, res, Buffer.concat(chunks)))\n        .catch((error: unknown) => this.handleHandlerError(res, error));\n    });");s=replace(s,'      this.eventBus.publish(event);',"      this.eventBus.publish(event).catch(() => {\n        console.error('[AUTH] Permission denied event persistence failed');\n      });");return s;});
edit('packages/daemon-core/src/index.ts',s=>{s="import { Daemon } from './daemon/Daemon';\n"+s;s=replace(s,"  const { Daemon } = require('./daemon/Daemon');\n\n",'');s=replace(s,'    const daemon = new Daemon();\n\n    try {','    try {\n      const daemon = new Daemon();');return replace(s,'  main();','  main().catch(() => { process.exitCode = 1; });');});
edit('packages/daemon-core/src/verification/source-snapshot.ts',s=>replace(s,'      (error, stdout) => {','      (error: Error | null, stdout: string) => {'));
edit('packages/daemon-core/src/http/HTTPServer.test.ts',s=>{s=replace(s,"    server.setToken('kernel-test-token');","    const spawnAgent = vi.spyOn(adapter, 'spawnAgent');\n    server.setToken('kernel-test-token');");return replace(s,'expect(adapter.spawnAgent).toHaveBeenCalledWith','expect(spawnAgent).toHaveBeenCalledWith');});
edit('packages/daemon-core/src/event-bus/EventBus.test.ts',s=>{const source=ts.createSourceFile('EventBus.test.ts',s,ts.ScriptTarget.Latest,true),edits=new Map(),callbacks=new Map();function walk(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(source)==='eventBus'&&n.expression.name.text==='publish'){assert(ts.isExpressionStatement(n.parent));edits.set(n.getStart(source),'await ');let owner=n.parent;while(owner&&!ts.isArrowFunction(owner))owner=owner.parent;assert(owner&&ts.isCallExpression(owner.parent)&&owner.parent.expression.getText(source)==='it');if(!owner.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword))callbacks.set(owner.getStart(source),'async ');}ts.forEachChild(n,walk);}walk(source);assert.equal(edits.size,12);for(const[pos,to]of [...edits,...callbacks].sort((a,b)=>b[0]-a[0]))s=s.slice(0,pos)+to+s.slice(pos);return s;});
edit('packages/daemon-core/src/daemon/HandshakeManager.ts',s=>{const marker='export class HandshakeManager {';s=replace(s,marker,`type OptionalLockFileSystem = typeof fsSync & {
  flockSync?: (fd: number, flags: number) => void;
  constants: typeof fsSync.constants & { LOCK_EX?: number; LOCK_NB?: number; LOCK_UN?: number };
};
const optionalLockFileSystem: OptionalLockFileSystem = fsSync;
function lockFlag(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new Error('FILE_LOCK_CAPABILITY_INCOMPLETE');
  return value;
}
function nativeFileLock(): { lock(fd: number): void; unlock(fd: number): void } | null {
  const flock = optionalLockFileSystem.flockSync;
  if (typeof flock !== 'function') return null;
  const exclusive = lockFlag(optionalLockFileSystem.constants.LOCK_EX);
  const nonblocking = lockFlag(optionalLockFileSystem.constants.LOCK_NB);
  const unlock = lockFlag(optionalLockFileSystem.constants.LOCK_UN);
  return {
    lock: (fd: number): void => flock.call(fsSync, fd, exclusive | nonblocking),
    unlock: (fd: number): void => flock.call(fsSync, fd, unlock),
  };
}

`+marker);s=replace(s,'  private lockFd: number | null = null;','  private lockFd: number | null = null;\n  private unlockNativeFile: ((fd: number) => void) | null = null;');s=replace(s,"        // @ts-ignore - flockSync may not be available on all platforms\n        if (typeof fsSync.flockSync === 'function') {\n          // @ts-ignore - LOCK_EX may not be available on all platforms\n          fsSync.flockSync(this.lockFd, fsSync.constants.LOCK_EX | fsSync.constants.LOCK_NB);","        const nativeLock = nativeFileLock();\n        if (nativeLock) {\n          nativeLock.lock(this.lockFd);\n          this.unlockNativeFile = nativeLock.unlock;");const a=s.indexOf('    // Cleanup handshake file\n    await this.removeHandshake();'),b=s.indexOf("    console.log('Cleanup completed');",a);assert(a>0&&b>a);s=s.slice(0,a)+`    try {
      await this.removeHandshake();
    } finally {
      if (this.lockFd !== null) {
        try {
          try { this.unlockNativeFile?.(this.lockFd); }
          finally { fsSync.closeSync(this.lockFd); }
        } catch (error) {
          console.warn('Error releasing file lock:', error);
        }
        this.lockFd = null;
      }
      this.unlockNativeFile = null;
    }

`+s.slice(b);assert(!s.includes('@ts-ignore'));return s;});
for(const p of plans){const parsed=ts.createSourceFile(p.file,p.after.toString(),ts.ScriptTarget.Latest,true);assert.equal(parsed.parseDiagnostics.length,0,p.file);assert.equal(sha(fs.readFileSync(path.join(root,p.file))),sha(p.before));const dest=path.join(evidence,'daemon-async-lock-before',p.file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,p.before,{flag:'wx'});}
fs.writeFileSync(path.join(evidence,'daemon-async-lock-owner-plan.json'),JSON.stringify({utc:new Date().toISOString(),members:plans.map(p=>({file:p.file,before:sha(p.before),after:sha(p.after)})),facts:'Current shared daemon passes no daemon-global business StateManager; property/getter types now state that fact, project managers unchanged. Event publications that advertise Promise now adopt WAL/fanout result; extension callers await publication. Auth rejection remains immediate rejection and observes publication failure with fixed safe diagnostic. HTTP event callback has an observed promise instead of async void. Native optional lock capability has typed presence/positive integer flags, preserved receiver, bound unlock, no @ts-ignore; no native capability means existing PID fallback. Descriptor closes even if handshake unlink or unlock fails.',required:'All12 build; EventBus and HTTP suites; handshake ownership/PID fallback and synthetic optional flock capability cases, including incomplete flags/unlock failure/unlink failure; whole Daemon suite and actual three-OS installer/lifecycle.'},null,2)+'\n',{flag:'wx'});for(const p of plans)fs.writeFileSync(path.join(root,p.file),p.after);console.log(JSON.stringify({files:plans.length,status:'APPLIED_REQUIRES_VERIFICATION'}));
