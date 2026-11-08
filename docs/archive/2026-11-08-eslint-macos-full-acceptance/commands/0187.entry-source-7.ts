import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { restoreProjectArchive } from '../../src/recovery/ProjectArchiveRestore';
import { RecoverySubsystem } from '../../src/recovery/RecoverySubsystem';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { StateManager } from '../../src/state/StateManager';
import { ProjectManager } from '../../src/project/ProjectManager';
import { EventBus } from '../../src/event-bus/EventBus';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';

const exec = promisify(execFile), roots: string[] = [];
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'sf-archive-test-')); roots.push(root);
  const target = path.join(root, 'project'); await fs.mkdir(target);
  class Resolver extends PersonalPathResolver { resolveDaemonRuntimeDir() { return path.join(root, 'daemon-runtime'); } }
  const resolver = new Resolver();
  const git = (args: string[]) => exec('git', args, { cwd: target, windowsHide: true });
  await fs.writeFile(path.join(target, 'README.md'), 'original fixture\n');
  await git(['init', '--quiet']); await git(['-c', 'core.autocrlf=false', 'add', 'README.md']);
  await git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  const head = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  const sm = new StateManager(resolver, target); await sm.initialize();
  await sm.transition('WI-0007', '', 'intake_ready', 'sf-orchestrator');
  await sm.transition('WI-0007', 'intake_ready', 'impact_analyzing', 'sf-orchestrator');
  const archive = { project: target, entries: [] as { path: string; size: number; sha256: string; bytes_base64: string }[] };
  for (const file of ['README.md', '.specforge/runtime/events.jsonl', '.specforge/runtime/state.json']) {
    const bytes = await fs.readFile(path.join(target, file));
    archive.entries.push({ path: file, size: bytes.length, sha256: hash(bytes), bytes_base64: bytes.toString('base64') });
  }
  const archivePath = path.join(root, 'sealed.json');
  const save = async () => { const raw = JSON.stringify(archive); await fs.writeFile(archivePath, raw); return hash(raw); };
  const input = { project_path: target, archive_path: archivePath, archive_sha256: await save(), original_commit: head, confirmation_quote: 'Accept archive and detached original commit reconstruction' };
  await fs.rm(path.join(target, '.specforge'), { recursive: true }); await fs.unlink(path.join(target, 'README.md'));
  for (const entry of await fs.readdir(path.join(target, '.git'))) if (entry !== 'objects') await fs.rm(path.join(target, '.git', entry), { recursive: true, force: true });
  for (const entry of await fs.readdir(path.join(target, '.git/objects'))) if (['info', 'pack'].includes(entry)) await fs.rm(path.join(target, '.git/objects', entry), { recursive: true });
  const run = () => restoreProjectArchive(resolver, input);
  return { root, target, resolver, archive, input, git, run, save: async () => { input.archive_sha256 = await save(); } };
}

describe('Recovery owner sealed project import', () => {
  it('restores exact bytes, detached Git identity and real WAL authority; repeats without changes', async () => {
    const f = await fixture(), result = await f.run();
    expect(result.state.workItems).toMatchObject([{ work_item_id: 'WI-0007', current_state: 'impact_analyzing' }]);
    for (const entry of f.archive.entries) expect(hash(await fs.readFile(path.join(f.target, entry.path)))).toBe(entry.sha256);
    expect((await f.git(['rev-parse', 'HEAD'])).stdout.trim()).toBe(f.input.original_commit);
    await expect(f.git(['symbolic-ref', '-q', 'HEAD'])).rejects.toThrow();
    expect((await f.git(['ls-files'])).stdout.trim()).toBe('README.md');
    expect(await fs.readdir(result.residue_path)).toEqual(['.git']);
    expect(await f.run()).toEqual(result);
    expect(await new StateManager(f.resolver, f.target).rebuildState()).toMatchObject({ lastEventId: result.state.lastEventId, workItems: result.state.workItems });
  });

  it.each(['hash', 'traversal', 'case', 'directory-case', 'prefix', 'git-path', 'reserved', 'ads', 'identity'])('rejects %s before publication', async kind => {
    const f = await fixture();
    if (kind === 'hash') f.archive.entries[0]!.sha256 = '0'.repeat(64);
    if (kind === 'traversal') f.archive.entries[0]!.path = '../outside';
    if (kind === 'case') f.archive.entries.push({ ...f.archive.entries[0]!, path: 'readme.md' });
    if (kind === 'directory-case') f.archive.entries.push({ ...f.archive.entries[0]!, path: '.Specforge/extra' });
    if (kind === 'prefix') f.archive.entries.push({ ...f.archive.entries[0]!, path: 'README.md/child' });
    if (kind === 'git-path') f.archive.entries[0]!.path = '.git/config';
    if (kind === 'reserved') f.archive.entries[0]!.path = 'NUL.txt';
    if (kind === 'ads') f.archive.entries[0]!.path = 'README.md:stream';
    if (kind === 'identity') f.archive.project += '-other';
    await f.save();
    await expect(f.run()).rejects.toThrow(/ARCHIVE_RECOVERY_/);
    expect(await fs.readdir(f.target)).toEqual(['.git']);
  });

  it('rejects archive raw-byte drift, conflicting live content and an invalid Git binding', async () => {
    const f = await fixture();
    f.input.archive_sha256 = '0'.repeat(64); await expect(f.run()).rejects.toThrow('ARCHIVE_HASH_MISMATCH'); await f.save();
    await fs.writeFile(path.join(f.target, 'README.md'), 'newer content');
    await expect(f.run()).rejects.toThrow('TARGET_CONFLICT');
    expect(await fs.readFile(path.join(f.target, 'README.md'), 'utf8')).toBe('newer content');
    await fs.unlink(path.join(f.target, 'README.md'));
    f.input.original_commit = '0'.repeat(40); await expect(f.run()).rejects.toThrow('ORIGINAL_COMMIT_MISSING');
  });

  it.each(['invalid-sequence', 'missing-history', 'projection-pointer', 'projection-state'])('rejects %s through StateManager before publication', async kind => {
    const f = await fixture();
    const entry = f.archive.entries.find(entry => entry.path.endsWith(kind.startsWith('projection') ? 'state.json' : 'events.jsonl'))!;
    let raw = Buffer.from(entry.bytes_base64, 'base64').toString();
    if (kind === 'missing-history') raw = '';
    if (kind === 'invalid-sequence') raw = raw.split('\n').reverse().join('\n');
    if (kind === 'projection-pointer') raw = raw.replace(/"lastEventId": "[^"]+"/, '"lastEventId": "missing"');
    if (kind === 'projection-state') raw = raw.replace('impact_analyzing', 'closed');
    entry.bytes_base64 = Buffer.from(raw).toString('base64'); entry.size = Buffer.byteLength(raw); entry.sha256 = hash(raw); await f.save();
    await expect(f.run()).rejects.toThrow();
    expect(await fs.readdir(f.target)).toEqual(['.git']);
  });

  it('rejects hard links without altering their external alias', async () => {
    const f = await fixture(); const external = path.join(f.root, 'external'); await fs.writeFile(external, 'external');
    await fs.link(external, path.join(f.target, 'README.md'));
    await expect(f.run()).rejects.toThrow('LINK_OR_SPECIAL_FILE');
    expect(await fs.readFile(external, 'utf8')).toBe('external');
  });

  it('resumes a crash between residue and publication renames using the same immutable plan', async () => {
    const f = await fixture(), result = await f.run();
    const plan = JSON.parse(await fs.readFile(path.join(result.audit_path, 'plan.json'), 'utf8'));
    await fs.unlink(path.join(result.audit_path, 'completed.json'));
    await fs.rename(f.target, plan.stage); // Reproduce on-disk boundary after original was quarantined.
    expect((await f.run()).success).toBe(true);
    expect(await fs.readFile(path.join(f.target, 'README.md'), 'utf8')).toBe('original fixture\n');
    await fs.writeFile(path.join(f.target, 'README.md'), 'later work');
    await expect(f.run()).rejects.toThrow('PUBLISHED_DRIFT');
    expect(await fs.readFile(path.join(f.target, 'README.md'), 'utf8')).toBe('later work');
  });

  it('rejects a changed prepared stage, preserving original residue', async () => {
    const f = await fixture(), result = await f.run();
    const plan = JSON.parse(await fs.readFile(path.join(result.audit_path, 'plan.json'), 'utf8'));
    await fs.unlink(path.join(result.audit_path, 'completed.json')); await fs.rename(f.target, plan.stage);
    await fs.writeFile(path.join(plan.stage, 'README.md'), 'tampered');
    await expect(f.run()).rejects.toThrow('STAGE_DRIFT');
    expect(await fs.readdir(result.residue_path)).toEqual(['.git']);
    await expect(fs.access(f.target)).rejects.toThrow();
  });

  it('excludes loaded and pending projects, and rejects consumption during recovery', async () => {
    const f = await fixture(), pm = new ProjectManager(new EventBus(), f.resolver, undefined as any);
    let release!: () => void;
    const lease = pm.withProjectArchiveRecovery(f.target, () => new Promise<void>(resolve => { release = resolve; }));
    await expect(pm.getProjectStateManager(f.target)).rejects.toThrow('RECOVERY_IN_PROGRESS');
    await expect(pm.registerProject(f.target)).rejects.toThrow('RECOVERY_IN_PROGRESS');
    expect(() => pm.getProjectContext(f.target)).toThrow('RECOVERY_IN_PROGRESS');
    await expect(pm.withProjectArchiveRecovery(f.target, f.run)).rejects.toThrow('PROJECT_IN_USE');
    release(); await lease;
    pm.getProjectContext(f.target);
    await expect(pm.withProjectArchiveRecovery(f.target, f.run)).rejects.toThrow('PROJECT_IN_USE');
  });

  it('uses real authenticated HTTP → ProjectManager → Recovery owner and rejects unavailable dependencies', async () => {
    const f = await fixture(), eventBus = new EventBus();
    const pm = new ProjectManager(eventBus, f.resolver, undefined as any), recovery = new RecoverySubsystem(f.resolver);
    const server = new HTTPServer({ config: new DaemonConfig(), eventBus, stateManager: undefined as any, wal: undefined as any, projectManager: pm, recoverySubsystem: recovery });
    server.setToken('archive-test'); const { port } = await server.start();
    const post = (token: string) => fetch(`http://127.0.0.1:${port}/api/v1/recovery/project-archive/restore`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(f.input) });
    try {
      expect((await post('wrong')).status).toBe(401);
      expect(await fs.readdir(f.target)).toEqual(['.git']);
      const response = await post('archive-test'); expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, data: { success: true, detached_head: true } });
    } finally { await server.stop(); }
    const missing = new HTTPServer(new DaemonConfig()); missing.setToken('archive-test');
    const addr = await missing.start();
    try {
      const response = await fetch(`http://127.0.0.1:${addr.port}/api/v1/recovery/project-archive/restore`, { method: 'POST', headers: { authorization: 'Bearer archive-test' }, body: JSON.stringify(f.input) });
      expect(response.status).toBe(503);
    } finally { await missing.stop(); }
  });

  it('preserves exact existing matches while rejecting loose-object corruption and old metadata', async () => {
    const f = await fixture();
    await fs.writeFile(path.join(f.target, 'README.md'), Buffer.from(f.archive.entries[0]!.bytes_base64, 'base64'));
    const config = path.join(f.target, '.git/config'); await fs.writeFile(config, '[core]\n');
    await expect(f.run()).rejects.toThrow('GIT_RESIDUE_UNSUPPORTED'); await fs.unlink(config);
    const prefix = (await fs.readdir(path.join(f.target, '.git/objects')))[0]!;
    const object = path.join(f.target, '.git/objects', prefix, (await fs.readdir(path.join(f.target, '.git/objects', prefix)))[0]!);
    const raw = await fs.readFile(object); await fs.chmod(object, 0o600); await fs.writeFile(object, Buffer.from('corrupt'));
    await expect(f.run()).rejects.toThrow(); await fs.writeFile(object, raw);
    expect((await f.run()).restored_files).toBe(3);
  });

  it('rejects a junction in target ancestry and does not modify its destination', async () => {
    const f = await fixture(), alias = path.join(f.root, 'alias');
    await fs.symlink(f.target, alias, process.platform === 'win32' ? 'junction' : 'dir');
    f.input.project_path = alias; f.archive.project = alias; await f.save();
    await expect(f.run()).rejects.toThrow('LINK_OR_SPECIAL_FILE');
    expect(await fs.readdir(f.target)).toEqual(['.git']);
  });

  it('retains empty Git and project directories in residue without interpreting them as metadata', async () => {
    const f = await fixture();
    for (const dir of ['.git/hooks', '.git/info', '.git/logs/refs/heads', '.git/refs/heads', '.git/objects/info', '.git/objects/pack', '.specforge/logs/old-empty', 'empty-residue']) {
      await fs.mkdir(path.join(f.target, dir), { recursive: true });
    }
    const result = await f.run();
    expect(await fs.readdir(path.join(result.residue_path, '.git/hooks'))).toEqual([]);
    expect(await fs.readdir(path.join(result.residue_path, 'empty-residue'))).toEqual([]);
    await expect(fs.access(path.join(f.target, 'empty-residue'))).rejects.toThrow();
    expect(result.detached_head).toBe(true);
  });

  it('excludes pending writers before a context is created', async () => {
    const f = await fixture(), pm = new ProjectManager(new EventBus(), f.resolver, undefined as any);
    let release!: () => void;
    const operation = pm.withProjectOperation(f.target, () => new Promise<void>(resolve => { release = resolve; }));
    await expect(pm.withProjectArchiveRecovery(f.target, f.run)).rejects.toThrow('PROJECT_IN_USE');
    release(); await operation;
    expect((await pm.withProjectArchiveRecovery(f.target, f.run)).success).toBe(true);
  });

  it('rejects a live recovery lock and retains a dead process lock while resuming the same plan', async () => {
    const f = await fixture(), result = await f.run(), lock = path.join(result.audit_path, 'lock.json');
    await fs.writeFile(lock, JSON.stringify({ pid: process.pid, archive_sha256: f.input.archive_sha256 }));
    await expect(f.run()).rejects.toThrow('LOCKED'); await fs.unlink(lock);
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.kill(); await exited;
    await fs.writeFile(lock, JSON.stringify({ pid: child.pid, archive_sha256: f.input.archive_sha256 }));
    expect((await f.run()).success).toBe(true);
    expect((await fs.readdir(result.audit_path)).some(name => name.startsWith('dead-lock-'))).toBe(true);
  });

  it('recovers from a prepared stage before the original rename and rebuilds uncommitted staging safely', async () => {
    const f = await fixture(), result = await f.run();
    const plan = JSON.parse(await fs.readFile(path.join(result.audit_path, 'plan.json'), 'utf8'));
    await fs.unlink(path.join(result.audit_path, 'completed.json'));
    await fs.rename(f.target, plan.stage); await fs.rename(plan.residue, f.target);
    await fs.unlink(path.join(result.audit_path, 'stage-ready.json'));
    await fs.writeFile(path.join(plan.stage, 'README.md'), 'partial interrupted bytes');
    expect((await f.run()).success).toBe(true);
    const leftovers = await fs.readdir(f.root);
    expect(leftovers.some(name => name.startsWith(path.basename(plan.stage) + '.incomplete-'))).toBe(true);
    expect(await fs.readFile(path.join(f.target, 'README.md'), 'utf8')).toBe('original fixture\n');
  });
});
