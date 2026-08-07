import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runRequiredGates,
  type GateContext,
  type GateReportV11,
} from '../../src/tools/lib/gate-runner-v11';

const roots: string[] = [];

async function makeContext(workItemId = 'WI-0001'): Promise<GateContext> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'specforge-gate-attempt-'));
  roots.push(projectRoot);
  const workItemDir = join(projectRoot, '.specforge', 'work-items', workItemId);
  await mkdir(workItemDir, { recursive: true });
  await writeFile(
    join(workItemDir, 'work_item.json'),
    JSON.stringify({ work_item_id: workItemId }, null, 2),
    'utf-8',
  );
  return {
    workItemId,
    workItemDir,
    projectRoot,
    workflowPath: 'architecture_change_path',
    workflowType: 'architecture_change',
    candidatePhase: 'full',
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Gate Attempt immutable evidence', () => {
  it('preserves each completed attempt while canonical latest files advance', async () => {
    const ctx = await makeContext();

    const first = await runRequiredGates(['entry_gate'], ctx);
    expect(first.attemptId).toBe('attempt-0001');
    expect(first.summaryStatus).toBe('passed');

    const firstReportPath = join(
      ctx.workItemDir,
      'gate_attempts',
      first.attemptId,
      'gates',
      'entry_gate.json',
    );
    const firstSummaryPath = join(
      ctx.workItemDir,
      'gate_attempts',
      first.attemptId,
      'gate_summary.md',
    );
    const firstReportBefore = await readFile(firstReportPath, 'utf-8');
    const firstSummaryBefore = await readFile(firstSummaryPath, 'utf-8');
    const firstHash = sha256(firstReportBefore + '\n' + firstSummaryBefore);

    await writeFile(
      join(ctx.workItemDir, 'work_item.json'),
      JSON.stringify({ work_item_id: 'BROKEN' }, null, 2),
      'utf-8',
    );
    const second = await runRequiredGates(['entry_gate'], ctx);
    expect(second.attemptId).toBe('attempt-0002');
    expect(second.summaryStatus).toBe('failed');

    const firstReportAfter = await readFile(firstReportPath, 'utf-8');
    const firstSummaryAfter = await readFile(firstSummaryPath, 'utf-8');
    expect(sha256(firstReportAfter + '\n' + firstSummaryAfter)).toBe(firstHash);

    const canonical = JSON.parse(
      await readFile(join(ctx.workItemDir, 'gates', 'entry_gate.json'), 'utf-8'),
    ) as GateReportV11;
    const attempt1 = JSON.parse(firstReportAfter) as GateReportV11;
    const attempt2 = JSON.parse(
      await readFile(
        join(ctx.workItemDir, 'gate_attempts', second.attemptId, 'gates', 'entry_gate.json'),
        'utf-8',
      ),
    ) as GateReportV11;

    expect(attempt1.status).toBe('passed');
    expect(attempt2.status).toBe('failed');
    expect(canonical.status).toBe('failed');
    expect(
      JSON.parse(
        await readFile(
          join(ctx.workItemDir, 'gate_attempts', first.attemptId, 'attempt-result.json'),
          'utf-8',
        ),
      ).summary_status,
    ).toBe('passed');
    expect(
      JSON.parse(
        await readFile(
          join(ctx.workItemDir, 'gate_attempts', second.attemptId, 'attempt-result.json'),
          'utf-8',
        ),
      ).summary_status,
    ).toBe('failed');
  });

  it('snapshots legacy canonical latest evidence before the first upgraded run', async () => {
    const ctx = await makeContext();
    const gatesDir = join(ctx.workItemDir, 'gates');
    await mkdir(gatesDir, { recursive: true });

    const legacyReport = {
      schema_version: '1.0',
      work_item_id: ctx.workItemId,
      gate_id: 'entry_gate',
      gate_type: 'hard_gate',
      required: true,
      status: 'failed',
      input_files: [],
      checks: [],
      blocking_issues: ['legacy failure'],
      warnings: [],
      waiver_allowed: false,
      waiver_required: false,
      waiver_ids: [],
      started_at: '2026-08-06T00:00:00.000Z',
      finished_at: '2026-08-06T00:00:01.000Z',
      runner: 'gate_runner',
    };
    const legacyJson = JSON.stringify(legacyReport, null, 2);
    const legacySummary = [
      '# Gate Summary',
      '',
      `Work Item: ${ctx.workItemId}`,
      'Overall Status: failed',
      'Generated: 2026-08-06T00:00:01.000Z',
      '',
    ].join('\n');
    await writeFile(join(gatesDir, 'entry_gate.json'), legacyJson, 'utf-8');
    await writeFile(join(ctx.workItemDir, 'gate_summary.md'), legacySummary, 'utf-8');

    const current = await runRequiredGates(['entry_gate'], ctx);
    expect(current.attemptId).toBe('attempt-0002');

    const legacyDir = join(ctx.workItemDir, 'gate_attempts', 'attempt-0001');
    expect(await readFile(join(legacyDir, 'gates', 'entry_gate.json'), 'utf-8')).toBe(
      legacyJson,
    );
    expect(await readFile(join(legacyDir, 'gate_summary.md'), 'utf-8')).toBe(
      legacySummary,
    );
    const legacyResult = JSON.parse(
      await readFile(join(legacyDir, 'attempt-result.json'), 'utf-8'),
    );
    expect(legacyResult.source).toBe('legacy_latest_snapshot');
    expect(legacyResult.summary_status).toBe('failed');
  });

  it('returns a stable attempt path and never rewrites a completed attempt', async () => {
    const ctx = await makeContext();
    const first = await runRequiredGates(['entry_gate'], ctx);
    const firstDir = join(ctx.workItemDir, 'gate_attempts', first.attemptId);
    const namesBefore = (await readdir(firstDir)).sort();
    const resultBefore = await readFile(join(firstDir, 'attempt-result.json'), 'utf-8');

    await runRequiredGates(['entry_gate'], ctx);

    expect(first.attemptPath).toBe(firstDir);
    expect((await readdir(firstDir)).sort()).toEqual(namesBefore);
    expect(await readFile(join(firstDir, 'attempt-result.json'), 'utf-8')).toBe(
      resultBefore,
    );
  });

  it('keeps the authority and implementation records synchronized', async () => {
    const repoRoot = join(import.meta.dirname, '../../../..');
    const authority = await readFile(
      join(repoRoot, 'docs/design/SpecForge架构一致性治理最终实施方案.md'),
      'utf-8',
    );
    const handoff = await readFile(
      join(repoRoot, 'docs/implementation/architecture-consistency/current-handoff.md'),
      'utf-8',
    );
    const closure = await readFile(
      join(
        repoRoot,
        'docs/implementation/architecture-consistency/P0-contract-consumer-closure.md',
      ),
      'utf-8',
    );
    const ledger = await readFile(
      join(repoRoot, 'docs/rule/specforge-development-error-ledger-and-experience.md'),
      'utf-8',
    );

    expect(authority).toContain('GATE-ATTEMPT-001');
    expect(authority).toContain('GATE-LATEST-001');
    expect(authority).toContain('GATE-MIGRATION-001');
    expect(handoff).toContain('ERR-174');
    expect(closure).toContain('ERR-174');
    expect(ledger).toContain('### ERR-173');
    expect(ledger).toContain('### ERR-174');
    expect(ledger).toContain('## EXP-146');
    expect(ledger).toContain('### ERR-175');
    expect(ledger).toContain('## EXP-147');
    expect(handoff).toContain('ERR-175');
    expect(closure).toContain('ERR-175');
  });
});
