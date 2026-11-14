import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { registerGate, runRequiredGates } from '../../src/tools/lib/gate-chain';
import { makeReport, type GateContext } from '../../src/tools/lib/gate-report';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const projectRoot = await mkdtemp(join(tmpdir(), 'sf-req-gate-binding-'));
  roots.push(projectRoot);
  const workItemDir = join(projectRoot, '.specforge/work-items/WI-0001');
  const put = async (name: string, value: unknown) => {
    const file = join(projectRoot, name);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
    return file;
  };
  await put('.specforge/project/spec_manifest.json', { modules: [{ module_code: 'AA' }] });
  const formal = await put(
    '.specforge/project/modules/AA/requirements.md',
    '## REQ-AA-001\nRead approved data.\n### Acceptance Criteria\nApproved data is returned.\n'
  );
  await put('.specforge/work-items/WI-0001/work_item.json', { work_item_id: 'WI-0001' });
  await put('.specforge/work-items/WI-0001/candidate_manifest.json', { entries: [] });
  const ctx: GateContext = {
    projectRoot,
    workItemDir,
    workItemId: 'WI-0001',
    workflowPath: 'requirement_change_path',
    candidatePhase: 'requirements',
  };
  return { ctx, formal };
}

describe('Requirements generation binding in the production Gate chain', () => {
  it('snapshots unchanged registered requirements even when a Gate omits its input declaration', async () => {
    const { ctx, formal } = await fixture();
    const bytes = await readFile(formal);
    registerGate('workflow_specific_gate', 'hard_gate', true, async () =>
      makeReport(ctx.workItemId, 'workflow_specific_gate', 'hard_gate', true, [])
    );
    const result = await runRequiredGates(['workflow_specific_gate'], ctx);
    const snapshot = JSON.parse(
      await readFile(join(result.attemptPath, 'input-snapshot.json'), 'utf8')
    ) as { inputs: Array<{ path: string; sha256: string }> };
    expect(result.summaryStatus).toBe('passed');
    expect(snapshot.inputs).toContainEqual(
      expect.objectContaining({ sha256: createHash('sha256').update(bytes).digest('hex') })
    );
    expect(
      snapshot.inputs.some(input =>
        input.path.replace(/\\/g, '/').endsWith('/modules/AA/requirements.md')
      )
    ).toBe(true);
  });

  it('refuses mid-Gate drift and preserves the immutable failed attempt', async () => {
    const { ctx, formal } = await fixture();
    registerGate('workflow_specific_gate', 'hard_gate', true, async () => {
      await writeFile(
        formal,
        '## REQ-AA-001\nChanged data.\n### Acceptance Criteria\nChanged data is returned.\n'
      );
      return makeReport(ctx.workItemId, 'workflow_specific_gate', 'hard_gate', true, []);
    });
    await expect(runRequiredGates(['workflow_specific_gate'], ctx)).rejects.toThrow(
      'REQUIREMENTS_GENERATION_INPUT_DRIFT'
    );
    const attempt = JSON.parse(
      await readFile(
        join(ctx.workItemDir, 'gate_attempts/attempt-0001/attempt-result.json'),
        'utf8'
      )
    ) as { execution_status: string; error: string };
    expect(attempt.execution_status).toBe('error');
    expect(attempt.error).toContain('REQUIREMENTS_GENERATION_INPUT_DRIFT');
    await expect(
      readFile(join(ctx.workItemDir, 'gate_attempts/attempt-0001/input-snapshot.json'))
    ).rejects.toThrow();
  });
});
