import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { registerGate, runRequiredGates } from '../../src/tools/lib/gate-chain';
import { makeReport } from '../../src/tools/lib/gate-report';
import {
  guardHardStop,
  guardVerificationEvidenceHardStop,
} from '../../src/tools/lib/hard-stop-latch';
import { withGateExecutionScope } from '../../src/tools/lib/gate-execution-scope';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
  const projectRoot = await fs.mkdtemp(path.join(tmpdir(), 'sf-live-gate-'));
  roots.push(projectRoot);
  const workItemId = 'WI-0001',
    workItemDir = path.join(projectRoot, '.specforge/work-items', workItemId);
  await fs.mkdir(workItemDir, { recursive: true });
  await fs.writeFile(
    path.join(workItemDir, 'work_item.json'),
    JSON.stringify({ work_item_id: workItemId })
  );
  return {
    projectRoot,
    workItemId,
    workItemDir,
    workflowPath: 'requirement_change_path',
    workflowType: 'feature_spec',
    candidatePhase: 'full' as const,
  };
}
describe('live Gate internal evidence consumption', () => {
  it('permits its own read consumer while ordinary run and writes still reject the incomplete tail', async () => {
    const ctx = await fixture();
    let observed = false;
    registerGate('entry_gate', 'hard_gate', true, async c => {
      observed = true;
      expect(guardVerificationEvidenceHardStop(c.projectRoot, c.workItemId).allowed).toBe(true);
      for (const tool of ['sf_verification_run', 'sf_artifact_write', 'sf_state_transition'])
        expect(guardHardStop(c.projectRoot, c.workItemId, tool).allowed).toBe(false);
      return makeReport(c.workItemId, 'entry_gate', 'hard_gate', true, []);
    });
    await runRequiredGates(['entry_gate'], ctx);
    expect(observed).toBe(true);
    expect(guardVerificationEvidenceHardStop(ctx.projectRoot, ctx.workItemId).allowed).toBe(true);
  });
  it('does not share the live context with an unrelated asynchronous caller', async () => {
    const ctx = await fixture();
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>(r => {
        entered = r;
      }),
      wait = new Promise<void>(r => {
        release = r;
      });
    registerGate('entry_gate', 'hard_gate', true, async c => {
      entered();
      await wait;
      expect(guardVerificationEvidenceHardStop(c.projectRoot, c.workItemId).allowed).toBe(true);
      return makeReport(c.workItemId, 'entry_gate', 'hard_gate', true, []);
    });
    const running = runRequiredGates(['entry_gate'], ctx);
    await ready;
    try {
      expect(guardVerificationEvidenceHardStop(ctx.projectRoot, ctx.workItemId).allowed).toBe(
        false
      );
    } finally {
      release();
      await running;
    }
  });
  it('rejects completed history damage even within an active successor', async () => {
    const ctx = await fixture();
    registerGate('entry_gate', 'hard_gate', true, async c =>
      makeReport(c.workItemId, 'entry_gate', 'hard_gate', true, [])
    );
    await runRequiredGates(['entry_gate'], ctx);
    registerGate('entry_gate', 'hard_gate', true, async c => {
      await fs.unlink(path.join(c.workItemDir, 'gate_attempts/attempt-0001/attempt-result.json'));
      expect(guardVerificationEvidenceHardStop(c.projectRoot, c.workItemId).allowed).toBe(false);
      return makeReport(c.workItemId, 'entry_gate', 'hard_gate', true, []);
    });
    await runRequiredGates(['entry_gate'], ctx);
    expect(guardVerificationEvidenceHardStop(ctx.projectRoot, ctx.workItemId).allowed).toBe(false);
  });
  it('rejects binding drift and another Work Item while active', async () => {
    const ctx = await fixture(),
      other = await fixture();
    const dir = path.join(other.workItemDir, 'gate_attempts/attempt-0001');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'attempt-start.json'), '{}');
    registerGate('entry_gate', 'hard_gate', true, async c => {
      expect(guardVerificationEvidenceHardStop(other.projectRoot, other.workItemId).allowed).toBe(
        false
      );
      await fs.appendFile(
        path.join(c.workItemDir, 'gate_attempts/attempt-0001/attempt-start.json'),
        ' '
      );
      expect(guardVerificationEvidenceHardStop(c.projectRoot, c.workItemId).allowed).toBe(false);
      return makeReport(c.workItemId, 'entry_gate', 'hard_gate', true, []);
    });
    await runRequiredGates(['entry_gate'], ctx);
  });
  it('revokes inherited asynchronous scope after the owner ends, retaining unfinished history rejection', async () => {
    const ctx = await fixture(),
      dir = path.join(ctx.workItemDir, 'gate_attempts/attempt-0001');
    await fs.mkdir(dir, { recursive: true });
    for (const name of ['attempt-start.json', 'candidate-repair-context.json'])
      await fs.writeFile(path.join(dir, name), '{}');
    let release!: () => void;
    const wait = new Promise<void>(r => {
      release = r;
    });
    let later!: Promise<boolean>;
    await withGateExecutionScope(dir, async () => {
      later = (async () => {
        await wait;
        return guardVerificationEvidenceHardStop(ctx.projectRoot, ctx.workItemId).allowed;
      })();
    });
    release();
    expect(await later).toBe(false);
    expect(guardVerificationEvidenceHardStop(ctx.projectRoot, ctx.workItemId).allowed).toBe(false);
  });
});
