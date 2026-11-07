import { describe, expect, it } from 'vitest';
import '../../src/tools/handlers/sf-artifact-write.js';
import { getHandler } from '../../src/tools/ToolDispatcher.js';
import { evaluateMergeReport } from '@specforge/types';
import { mkdtemp, rm, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWorkItem } from '../../src/tools/lib/work-item-lifecycle-v11.js';

describe('Merge Report owner boundary', () => {
  it('rejects direct merge_report writes from every agent before filesystem mutation', async () => {
    const result = await getHandler('sf_artifact_write')!(
      {
        work_item_id: 'WI-TEST',
        file_type: 'merge_report',
        content: '# forged report',
      },
      { directory: process.cwd(), agent: 'sf-orchestrator' },
      {},
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toBe('MERGE_REPORT_OWNED_BY_MERGE_RUNNER');
    expect((result as any).retry_allowed).toBe(false);
  });

  it('keeps work_log separate from the Merge Runner report even when its run_id says merge-report', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'sf-merge-owner-'));
    try {
      await createWorkItem({
        projectRoot,
        workItemId: 'WI-0001',
        userRequest: 'verify Merge Report owner boundary',
      });
      const result = await getHandler('sf_artifact_write')!(
        {
          work_item_id: 'WI-0001',
          file_type: 'work_log',
          run_id: 'merge-report',
          content: '# forged report',
        },
        { directory: projectRoot, agent: 'sf-orchestrator' },
        {},
      );

      expect((result as any).success).toBe(true);
      expect((result as any).path).toBe('.specforge/archive/agent_runs/merge-report/work_log.md');
      expect(await readFile(path.join(projectRoot, (result as any).path), 'utf8')).toBe('# forged report');
      await expect(access(path.join(projectRoot, '.specforge/work-items/WI-0001/merge_report.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

describe('Merge Report persistent contract', () => {
  const report = [
    '# Merge Report',
    '',
    'Contract: merge-report/v1',
    'Work Item: WI-TEST',
    'Status: success',
    '',
    '## Summary',
    '- Total entries: 1',
    '- Successful: 1',
    '- Failed: 0',
  ].join('\n');

  it('accepts a successful report bound to the expected Work Item', () => {
    expect(evaluateMergeReport(report, 'WI-TEST')).toMatchObject({
      valid: true,
      status: 'success',
      successful: 1,
    });
  });

  it('rejects missing contract, identity mismatch, and inconsistent counts', () => {
    expect(evaluateMergeReport(report.replace('Contract: merge-report/v1\n', ''), 'WI-TEST').valid).toBe(false);
    expect(evaluateMergeReport(report, 'WI-OTHER').reason).toContain('Work Item mismatch');
    expect(evaluateMergeReport(report.replace('- Failed: 0', '- Failed: 1'), 'WI-TEST').valid).toBe(false);
    expect(evaluateMergeReport(report.replace('- Total entries: 1', '- Total entries: 2'), 'WI-TEST').reason)
      .toContain('counts are inconsistent');
  });
});
