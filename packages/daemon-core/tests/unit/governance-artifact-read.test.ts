import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, link, rename, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  readGovernanceArtifact,
  GOVERNANCE_READ_FILE_LIMIT,
} from '../../src/tools/lib/governance-artifact-read';
import { getHandler } from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-governance-read';
import { authoritativeStateFixture } from '../helpers/authoritative-state-fixture';
import { requiredVerificationDepsForFixture } from '../helpers/required-verification-fixture';
import { checkHardStop } from '../../src/tools/lib/hard-stop-latch';
import { checkNativeTool } from '../../src/tools/lib/native-write-boundary';

const roots: string[] = [];
const artifact = 'candidates/project/modules/DEMO/contracts.candidate.json';
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(bytes: string | Buffer) {
  const root = await mkdtemp(path.join(tmpdir(), 'sf-governance-read-'));
  roots.push(root);
  const wi = path.join(root, '.specforge/work-items/WI-0001');
  const file = path.join(wi, artifact);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  const manifest = {
    schema_version: '1.0',
    work_item_id: 'WI-0001',
    workflow_path: 'requirement_change_path',
    base_spec_version: 'PSV-0001',
    merge_required: true,
    entries: [
      {
        candidate_path: artifact,
        target_path: 'project/modules/DEMO/contracts.json',
        operation: 'create',
        type: 'module_contract',
      },
    ],
  };
  await writeFile(path.join(wi, 'candidate_manifest.json'), JSON.stringify(manifest));
  return { root, wi, file, manifest };
}
describe('bounded complete governance original reads', () => {
  it('reconstructs an original long single line including UTF-8 boundaries, BOM and escaped controls', async () => {
    const original = '\ufeff' + JSON.stringify({ text: '中文🙂"\\'.repeat(3000) }) + '\r\n\t\u0000';
    const { root } = await fixture(original);
    let offset = 0,
      version: string | undefined,
      full = '';
    const before = Buffer.from(original);
    for (;;) {
      const chunk = await readGovernanceArtifact(root, {
        work_item_id: 'WI-0001',
        artifact,
        offset,
        version,
      });
      expect(Buffer.byteLength(JSON.stringify(chunk))).toBeLessThan(16000);
      expect(chunk.sha256).toBe(createHash('sha256').update(before).digest('hex'));
      expect(chunk.chunk_sha256).toBe(createHash('sha256').update(chunk.content).digest('hex'));
      expect(chunk.offset).toBe(offset);
      expect(chunk.truncated).toBe(false);
      full += chunk.content;
      version = chunk.version;
      offset = chunk.next_offset;
      if (chunk.eof) break;
    }
    expect(Buffer.from(full)).toEqual(before);
  });
  it('refuses source and manifest drift between chunks, even for the same file path', async () => {
    const f = await fixture('a'.repeat(5000));
    const first = await readGovernanceArtifact(f.root, { work_item_id: 'WI-0001', artifact });
    await writeFile(f.file, 'b'.repeat(5000));
    await expect(
      readGovernanceArtifact(f.root, {
        work_item_id: 'WI-0001',
        artifact,
        offset: first.next_offset,
        version: first.version,
      })
    ).rejects.toThrow('SOURCE_CHANGED');
    const second = await readGovernanceArtifact(f.root, { work_item_id: 'WI-0001', artifact });
    await writeFile(
      path.join(f.wi, 'candidate_manifest.json'),
      JSON.stringify({ ...f.manifest, base_spec_version: 'PSV-0002' })
    );
    await expect(
      readGovernanceArtifact(f.root, {
        work_item_id: 'WI-0001',
        artifact,
        offset: second.next_offset,
        version: second.version,
      })
    ).rejects.toThrow('SOURCE_CHANGED');
  });
  it.each([
    '../work_item.json',
    'candidates/../work_item.json',
    'candidates\\x',
    'runtime/events.jsonl',
    'candidates/unregistered.json',
    '/etc/passwd',
    'C:/private',
  ])('rejects unregistered or noncanonical target %s', async target => {
    const { root } = await fixture('{}');
    await expect(
      readGovernanceArtifact(root, { work_item_id: 'WI-0001', artifact: target })
    ).rejects.toThrow();
  });
  it('rejects invalid UTF-8, mid-codepoint offsets and unbound continuation', async () => {
    const f = await fixture(Buffer.from([0xc0, 0xaf]));
    await expect(
      readGovernanceArtifact(f.root, { work_item_id: 'WI-0001', artifact })
    ).rejects.toThrow();
    await writeFile(f.file, '中文');
    const first = await readGovernanceArtifact(f.root, { work_item_id: 'WI-0001', artifact });
    await expect(
      readGovernanceArtifact(f.root, {
        work_item_id: 'WI-0001',
        artifact,
        offset: 1,
        version: first.version,
      })
    ).rejects.toThrow('OFFSET_INVALID');
    await expect(
      readGovernanceArtifact(f.root, { work_item_id: 'WI-0001', artifact, offset: 3 })
    ).rejects.toThrow('VERSION_REQUIRED');
  });
  it('rejects oversized and hard-linked files without changing either original', async () => {
    const f = await fixture(Buffer.alloc(GOVERNANCE_READ_FILE_LIMIT + 1, 65));
    await expect(
      readGovernanceArtifact(f.root, { work_item_id: 'WI-0001', artifact })
    ).rejects.toThrow();
    await writeFile(f.file, '{}');
    await link(f.file, path.join(f.root, 'alias'));
    await expect(
      readGovernanceArtifact(f.root, { work_item_id: 'WI-0001', artifact })
    ).rejects.toThrow('HARDLINK');
    expect(await readFile(f.file, 'utf8')).toBe('{}');
  });
  it('rejects a linked ancestor rather than following it to an ordinary file', async () => {
    const f = await fixture('{}');
    const originalDirectory = path.dirname(f.file),
      moved = path.join(f.root, 'moved');
    await rename(originalDirectory, moved);
    await symlink(moved, originalDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(
      readGovernanceArtifact(f.root, { work_item_id: 'WI-0001', artifact })
    ).rejects.toThrow('LINK_FORBIDDEN');
  });
  it('requires real invocation proof, current WI and matching professional identity in the handler', async () => {
    const f = await fixture('{}');
    const args = { work_item_id: 'WI-0001', artifact };
    const context = {
      directory: f.root,
      agent: 'sf-orchestrator',
      sessionID: 'ses_fixture',
      callID: 'call_fixture',
    };
    const deps = requiredVerificationDepsForFixture(
      authoritativeStateFixture({ 'WI-0001': 'candidate_preparing' })
    );
    const handler = getHandler('sf_governance_read')!;
    expect(await handler(args, context, deps)).toMatchObject({
      success: true,
      content: '{}',
      eof: true,
    });
    expect(await handler(args, { ...context, agent: 'sf-design' }, deps)).toMatchObject({
      success: false,
    });
    expect(await handler(args, { ...context, callID: undefined }, deps)).toMatchObject({
      success: false,
    });
    expect(
      await handler(args, context, { ...deps, toolInvocationVerifier: undefined })
    ).toMatchObject({ success: false });
    expect(
      await handler(args, context, { ...deps, ...authoritativeStateFixture({}) })
    ).toMatchObject({ success: false });
    expect(await readFile(f.file, 'utf8')).toBe('{}');
  });
  it('persists a stop when a verified owner cannot obtain an intact original', async () => {
    const f = await fixture(Buffer.from([0xff]));
    const deps = requiredVerificationDepsForFixture(
      authoritativeStateFixture({ 'WI-0001': 'candidate_preparing' })
    );
    const context = {
      directory: f.root,
      agent: 'sf-orchestrator',
      sessionID: 'ses_reader',
      callID: 'call_read',
    };
    const result = await getHandler('sf_governance_read')!(
      { work_item_id: 'WI-0001', artifact },
      context,
      deps
    );
    expect(result).toMatchObject({
      success: false,
      hard_stop: true,
      cancellation: { acknowledged: false },
    });
    expect(checkHardStop(f.root, 'WI-0001').record?.policy_code).toBe(
      'GOVERNANCE_ORIGINAL_READ_UNAVAILABLE'
    );
    expect(
      await checkNativeTool(
        deps,
        f.root,
        'read',
        { filePath: f.file },
        { sessionID: 'ses_reader', callID: 'call_fallback' }
      )
    ).toMatchObject({ allowed: false });
  });
});
