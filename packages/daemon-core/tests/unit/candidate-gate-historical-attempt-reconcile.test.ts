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

describe('Gate Attempt input snapshot', () => {
  it('freezes both materialized files and missing probe paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'specforge-input-snapshot-'));
    roots.push(root);
    const existing = join(root, 'candidate.json');
    const missing = join(root, 'project', 'modules', 'CORE', 'contracts.json');
    await mkdir(join(root, 'project', 'modules', 'CORE'), { recursive: true });
    await writeFile(existing, '{"ok":true}\n', 'utf-8');

    const snapshot = await buildGateAttemptInputSnapshot([
      report([existing, missing]),
      report([missing, existing]),
    ]);

    expect(snapshot).toHaveLength(2);
    const existingEntry = snapshot.find(item => item.path === existing);
    const missingEntry = snapshot.find(item => item.path === missing);

    expect(existingEntry).toEqual(
      expect.objectContaining({
        exists: true,
        kind: 'file',
        size: 12,
      }),
    );
    expect(existingEntry?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(missingEntry).toEqual({
      path: missing,
      exists: false,
      kind: 'missing',
    });
  });

  it('pins Attempt finalization to input-snapshot.json', async () => {
    const repoRoot = join(import.meta.dirname, '../../../..');
    const chain = await readFile(
      join(repoRoot, 'packages/daemon-core/src/tools/lib/gate-chain.ts'),
      'utf-8',
    );
    expect(chain).toContain("path.join(input.attempt.attemptPath, 'input-snapshot.json')");
    expect(chain).toContain('buildGateAttemptInputSnapshot(input.summaryReports)');
    expect(chain).toContain("input_snapshot: 'input-snapshot.json'");
  });

  it('pins reconciliation to snapshot evidence and rejects legacy Attempts', async () => {
    const repoRoot = join(import.meta.dirname, '../../../..');
    const handler = await readFile(
      join(repoRoot, 'packages/daemon-core/src/tools/handlers/sf-v11-gate-run.ts'),
      'utf-8',
    );
    expect(handler).toContain('RECONCILE_INPUT_SNAPSHOT_REQUIRED');
    expect(handler).toContain("freshness_mode: freshnessMode");
    expect(handler).toContain("freshnessMode = 'attempt_input_snapshot'");
    expect(handler).toContain('RECONCILE_INPUT_HASH_CHANGED');
    expect(handler).not.toContain('RECONCILE_GATE_INPUT_CHANGED_AFTER_ATTEMPT');
  });

  it('pins authority and ledger synchronization', async () => {
    const repoRoot = join(import.meta.dirname, '../../../..');
    const authority = await readFile(
      join(repoRoot, 'docs/design/SpecForge架构一致性治理最终实施方案.md'),
      'utf-8',
    );
    const ledger = await readFile(
      join(repoRoot, 'docs/rule/specforge-development-error-ledger-and-experience.md'),
      'utf-8',
    );
    expect(authority).toContain('GATE-ATTEMPT-INPUT-SNAPSHOT-001');
    for (const token of ['ERR-185', 'ERR-186', 'EXP-157', 'EXP-158']) {
      expect(ledger).toContain(token);
    }
  });
});
