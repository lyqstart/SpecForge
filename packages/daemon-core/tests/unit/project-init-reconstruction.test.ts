import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { reconstructInitialization } from '../../src/tools/lib/project-init-reconstruction';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { EventBus } from '../../src/event-bus/EventBus';

const exec = promisify(execFile);
const roots: string[] = [];
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'sf-init-reconstruction-')); roots.push(root);
  const put = async (file: string, bytes: string) => { await fs.mkdir(join(root, file, '..'), { recursive: true }); await fs.writeFile(join(root, file), bytes); };
  const tracked = '.specforge/project/spec_manifest.json';
  const created = '.specforge/project/modules/CORE/requirements.md';
  const baseline = Buffer.from('{"schema_version":"1.0","modules":[]}\n');
  await put('.specforge/manifest.json', '{}\n');
  await put(tracked, baseline.toString());
  const git = (args: string[]) => exec('git', args, { cwd: root, windowsHide: true });
  await git(['init']); await git(['add', '.specforge']);
  await git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'baseline']);
  const head = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  const changed = Buffer.from('{"schema_version":"1.0","modules":["CORE"]}\n');
  const placeholder = Buffer.from('> TODO: 由首次 intake 阶段填充\n');
  await put(tracked, changed.toString()); await put(created, placeholder.toString());
  const snapshot = Buffer.from(JSON.stringify({ head, entries: [
    { file: tracked, sha256: hash(changed), bytes_base64: changed.toString('base64'), baseline_sha256: hash(baseline), baseline_bytes_base64: baseline.toString('base64') },
    { file: created, sha256: hash(placeholder), bytes_base64: placeholder.toString('base64'), baseline_sha256: null, baseline_bytes_base64: null },
  ] }));
  await put('evidence/snapshot.json', snapshot.toString());
  return { root, tracked, created, baseline, changed, placeholder,
    input: { snapshot_path: 'evidence/snapshot.json', snapshot_sha256: hash(snapshot), baseline_commit: head, confirmation_quote: '同意使用 Git 内容基线重建' } };
}

describe('Project Init owner Git reconstruction', () => {
  it('reconstructs tracked Git content, quarantines created placeholders, and safely resumes', async () => {
    const f = await fixture();
    const result = await reconstructInitialization(f.root, f.input);
    expect(await fs.readFile(join(f.root, f.tracked))).toEqual(f.baseline);
    await expect(fs.access(join(f.root, f.created))).rejects.toThrow();
    expect(await fs.readFile(join(f.root, result.archive, 'quarantine-1'))).toEqual(f.placeholder);
    const plan = JSON.parse(await fs.readFile(join(f.root, result.archive, 'plan.json'), 'utf8'));
    expect(plan.operations[0].before_base64).toBe(f.changed.toString('base64'));
    expect(await reconstructInitialization(f.root, f.input)).toMatchObject({ success: true });
  });
  it('rejects drift across the whole scope before changing any live file', async () => {
    const f = await fixture(); await fs.writeFile(join(f.root, f.created), 'someone edited this');
    await expect(reconstructInitialization(f.root, f.input)).rejects.toThrow('RECOVERY_LIVE_HASH_DRIFT');
    expect(await fs.readFile(join(f.root, f.tracked))).toEqual(f.changed);
  });
  it('rejects later edits when resuming a completed reconstruction', async () => {
    const f = await fixture(); await reconstructInitialization(f.root, f.input);
    await fs.writeFile(join(f.root, f.tracked), 'later edit');
    await expect(reconstructInitialization(f.root, f.input)).rejects.toThrow('RECOVERY_LIVE_HASH_DRIFT');
    expect(await fs.readFile(join(f.root, f.tracked), 'utf8')).toBe('later edit');
  });
  it('resumes a plan containing both original and reconstructed file states', async () => {
    const f = await fixture(); await reconstructInitialization(f.root, f.input);
    await fs.writeFile(join(f.root, f.tracked), f.changed);
    expect(await reconstructInitialization(f.root, f.input)).toMatchObject({ success: true });
    expect(await fs.readFile(join(f.root, f.tracked))).toEqual(f.baseline);
    await expect(fs.access(join(f.root, f.created))).rejects.toThrow();
  });
  it('rejects a forged baseline even when its snapshot hash is explicitly provided', async () => {
    const f = await fixture();
    const file = join(f.root, f.input.snapshot_path);
    const snapshot = JSON.parse(await fs.readFile(file, 'utf8'));
    const forged = Buffer.from('forged baseline');
    snapshot.entries[0].baseline_sha256 = hash(forged);
    snapshot.entries[0].baseline_bytes_base64 = forged.toString('base64');
    const bytes = Buffer.from(JSON.stringify(snapshot)); await fs.writeFile(file, bytes);
    await expect(reconstructInitialization(f.root, { ...f.input, snapshot_sha256: hash(bytes) })).rejects.toThrow('RECOVERY_GIT_CONTENT_MISMATCH');
    expect(await fs.readFile(join(f.root, f.tracked))).toEqual(f.changed);
  });
  it('rejects a changed snapshot without modifying the live target', async () => {
    const f = await fixture();
    await expect(reconstructInitialization(f.root, { ...f.input, snapshot_sha256: '0'.repeat(64) })).rejects.toThrow('RECOVERY_SNAPSHOT_HASH_MISMATCH');
    expect(await fs.readFile(join(f.root, f.tracked))).toEqual(f.changed);
  });
  it('rejects hard-linked live targets', async () => {
    const f = await fixture(); await fs.link(join(f.root, f.tracked), join(f.root, 'alias'));
    await expect(reconstructInitialization(f.root, f.input)).rejects.toThrow('RECOVERY_LINK_REJECTED');
    expect(await fs.readFile(join(f.root, 'alias'))).toEqual(f.changed);
  });
  it('exposes reconstruction through the authenticated Project Init HTTP owner', async () => {
    const f = await fixture();
    const server = new HTTPServer(new DaemonConfig(), new EventBus());
    server.setToken('reconstruction-test');
    try {
      const { port } = await server.start();
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/project/ensure`, { method: 'POST',
        headers: { authorization: 'Bearer reconstruction-test', 'content-type': 'application/json' },
        body: JSON.stringify({ projectPath: f.root, action: 'reconstruct_git_baseline', reconstruction: f.input }) });
      expect(response.status).toBe(200);
      expect(await fs.readFile(join(f.root, f.tracked))).toEqual(f.baseline);
    } finally { await server.stop(); }
  });
});
