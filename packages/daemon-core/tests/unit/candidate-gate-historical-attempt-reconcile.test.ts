import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { GateReportV11 } from '../../src/tools/lib/gate-runner-v11';
import { buildGateAttemptInputSnapshot } from '../../src/tools/lib/gate-chain';

const roots: string[] = [];

function report(inputFiles: string[]): GateReportV11 {
  return {
    schema_version: '1.0',
    work_item_id: 'WI-0002',
    gate_id: 'contract_integrity_gate',
    gate_type: 'hard_gate',
    required: true,
    status: 'passed',
    input_files: inputFiles,
    checks: [{ check_id: 'ok', description: 'ok', passed: true }],
    blocking_issues: [],
    warnings: [],
    waiver_allowed: false,
    waiver_required: false,
    waiver_ids: [],
    started_at: '2026-08-07T02:29:43.000Z',
    finished_at: '2026-08-07T02:29:43.500Z',
    runner: 'gate_runner',
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Gate Attempt project-root input snapshot semantics', () => {
  it('resolves relative Gate input paths against projectRoot and preserves the audit path', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'specforge-project-root-'));
    roots.push(projectRoot);
    const relative = '.specforge/project/architecture.md';
    const absolute = join(projectRoot, '.specforge', 'project', 'architecture.md');
    await mkdir(join(projectRoot, '.specforge', 'project'), { recursive: true });
    await writeFile(absolute, '# architecture\n', 'utf-8');

    const snapshot = await buildGateAttemptInputSnapshot(projectRoot, [report([relative])]);

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toEqual(
      expect.objectContaining({
        path: relative,
        exists: true,
        kind: 'file',
      }),
    );
    expect(snapshot[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records a missing relative probe path relative to projectRoot', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'specforge-project-root-missing-'));
    roots.push(projectRoot);
    const relative = '.specforge/project/modules/CORE/contracts.json';

    const snapshot = await buildGateAttemptInputSnapshot(projectRoot, [report([relative])]);

    expect(snapshot).toEqual([
      {
        path: relative,
        exists: false,
        kind: 'missing',
      },
    ]);
  });

  it('wires attempt finalization to projectRoot-aware snapshot capture', async () => {
    const repoRoot = join(import.meta.dirname, '../../../..');
    const chain = await readFile(
      join(repoRoot, 'packages/daemon-core/src/tools/lib/gate-chain.ts'),
      'utf-8',
    );
    expect(chain).toContain(
      'buildGateAttemptInputSnapshot(input.ctx.projectRoot, input.summaryReports)',
    );
    expect(chain).toContain(
      'const resolvedInputPath = resolveGateAttemptInputPath(projectRoot, inputPath);',
    );
    expect(chain).toContain('await fs.stat(resolvedInputPath)');
    expect(chain).toContain('await fs.readFile(resolvedInputPath)');
  });

  it('uses the same projectRoot rule during historical reconciliation', async () => {
    const repoRoot = join(import.meta.dirname, '../../../..');
    const handler = await readFile(
      join(repoRoot, 'packages/daemon-core/src/tools/handlers/sf-v11-gate-run.ts'),
      'utf-8',
    );
    expect(handler).toContain(
      'const resolvedInputPath = resolveGateInputPath(input.projectRoot, inputPath);',
    );
    expect(handler).toContain('await fs.access(resolvedInputPath)');
    expect(handler).toContain('await fs.stat(resolvedInputPath)');
    expect(handler).toContain('await fs.readFile(resolvedInputPath)');
  });

  it('pins authority and failure-ledger synchronization', async () => {
    const repoRoot = join(import.meta.dirname, '../../../..');
    const authority = await readFile(
      join(repoRoot, 'docs/design/SpecForge架构一致性治理最终实施方案.md'),
      'utf-8',
    );
    const ledger = await readFile(
      join(repoRoot, 'docs/rule/specforge-development-error-ledger-and-experience.md'),
      'utf-8',
    );
    expect(authority).toContain('process.cwd()');
    for (const token of ['ERR-187', 'ERR-188', 'EXP-159', 'EXP-160']) {
      expect(ledger).toContain(token);
    }
  });
});
