import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCloseGate } from '../src/tools/lib/close-gate.js';

describe('Close Gate governance fixes', () => {
  let workItemDir: string;
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'sf-close-gate-fix-'));
    workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-TEST');
    await mkdir(path.join(workItemDir, 'evidence'), { recursive: true });
    await mkdir(path.join(workItemDir, 'gates'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function writeBaseFiles(overrides: Record<string, string> = {}): Promise<void> {
    const defaults: Record<string, string> = {
      'work_item.json': JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-TEST',
        workflow_type: 'feature_spec',
        workflow_path: 'requirement_change_path',
        status: 'verification_done',
      }),
      'intake.md': '# Intake\nTest work item.',
      'trigger_result.json': JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-TEST',
        classification: { unknowns: [] },
        impact_scope: { affected_modules: ['CORE'] },
      }),
      'candidate_manifest.json': JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-TEST',
        candidate_phase: 'full',
        base_spec_version: '1',
        entries: [],
      }),
      'verification_report.md': '# Verification Report\n\nConclusion: pass. All tests passed.\nEvidence: EV-001 unit tests.',
      'merge_report.md': '# Merge Report\n\nWork Item: WI-TEST\nStatus: success\nTimestamp: 2026-01-01T00:00:00Z\n\n## Summary\n\n- Total entries: 1\n- Successful: 1\n',
      'changed_files_audit.md': '# Changed Files Audit\n\n**Verdict:** pass\nAll files within scope.\n',
      'evidence/evidence_manifest.json': JSON.stringify({
        schema_version: '1.1',
        work_item_id: 'WI-TEST',
        entries: [
          {
            id: 'EV-001',
            status: 'passed',
            level: 'L3',
            evidence_type: 'behavioral',
            supports: ['REQ-001'],
            artifact_type: 'test_output',
            description: 'Unit tests',
            collected_by: 'sf-verifier',
            timestamp: '2026-01-01T00:00:00Z',
            location: 'test-output.txt',
          },
        ],
      }),
      '.semantic_closure.json': JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-TEST',
        outcomes: [{ id: 'OUT-001', description: 'Feature works', requirement_refs: ['REQ-001'], required_evidence_refs: ['EV-001'] }],
        requirements: [{ id: 'REQ-001', description: 'Must work', type: 'MUST', outcome_refs: ['OUT-001'], required_evidence_refs: ['EV-001'] }],
        design_decisions: [{ id: 'DD-001', description: 'Design', requirement_refs: ['REQ-001'] }],
        tasks: [{ id: 'TASK-001', description: 'Task', requirement_refs: ['REQ-001'], design_refs: ['DD-001'], evidence_refs: ['EV-001'] }],
        evidence: [{ id: 'EV-001', status: 'passed', level: 'L3', evidence_type: 'behavioral', supports: ['OUT-001', 'REQ-001', 'TASK-001'] }],
        project_integration: { status: 'merged', required: true, refs: ['merge_report.md'] },
      }),
    };

    for (const [file, content] of Object.entries({ ...defaults, ...overrides })) {
      const fullPath = path.join(workItemDir, file);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
    }
  }

  async function writeUserDecision(): Promise<void> {
    await writeFile(
      path.join(workItemDir, 'user_decision.json'),
      JSON.stringify({
        decision_status: 'approved',
        decision_type: 'user_approved',
        user_response_quote: 'approved',
        decided_at: '2026-01-01T00:00:00Z',
      }),
      'utf-8'
    );
  }

  it('does NOT require gate_summary.md as a file', async () => {
    await writeBaseFiles();
    await writeUserDecision();

    const ctx = { workItemId: 'WI-TEST', workItemDir, projectRoot };
    const result = await runCloseGate(ctx as any);

    const gateSummaryCheck = result.report.checks.find(
      c => c.check_id === 'close_file_gate_summary_md'
    );
    expect(gateSummaryCheck).toBeUndefined();
  });

  it('validates merge_report by Status: line, not loose substring', async () => {
    await writeBaseFiles({ 'merge_report.md': '# Merge Report\n\nStatus: success\n' });
    await writeUserDecision();

    const ctx = { workItemId: 'WI-TEST', workItemDir, projectRoot };
    const result = await runCloseGate(ctx as any);

    const mergeCheck = result.report.checks.find(c => c.check_id === 'close_merge_report_valid');
    expect(mergeCheck).toBeDefined();
    expect(mergeCheck!.passed).toBe(true);
  });

  it('rejects merge_report without Status: line even if body contains success', async () => {
    await writeBaseFiles({
      'merge_report.md': '# Merge Report\n\n## Summary\n\n- Successful: 1\n- Failed: 0\n',
    });
    await writeUserDecision();

    const ctx = { workItemId: 'WI-TEST', workItemDir, projectRoot };
    const result = await runCloseGate(ctx as any);

    const mergeCheck = result.report.checks.find(c => c.check_id === 'close_merge_report_valid');
    expect(mergeCheck).toBeDefined();
    expect(mergeCheck!.passed).toBe(false);
  });

  it('aggregates blocking issues from gates JSON, not gate_summary.md', async () => {
    await writeBaseFiles();
    await writeUserDecision();

    await writeFile(
      path.join(workItemDir, 'gates', 'spec_consistency_gate.json'),
      JSON.stringify({
        schema_version: '1.0',
        gate_id: 'spec_consistency_gate',
        status: 'failed',
        blocking_issues: ['Module path not mapped', 'Contract ID missing'],
      }),
      'utf-8'
    );

    const ctx = { workItemId: 'WI-TEST', workItemDir, projectRoot };
    const result = await runCloseGate(ctx as any);

    const blockingCheck = result.report.checks.find(c => c.check_id === 'close_no_blocking_issues');
    expect(blockingCheck).toBeDefined();
    expect(blockingCheck!.passed).toBe(false);
    expect(blockingCheck!.details).toContain('Module path not mapped');
  });

  it('excludes close_gate self-report from blocking issue aggregation', async () => {
    await writeBaseFiles();
    await writeUserDecision();

    await writeFile(
      path.join(workItemDir, 'gates', 'close_gate.json'),
      JSON.stringify({
        schema_version: '1.0',
        gate_id: 'close_gate',
        status: 'failed',
        blocking_issues: ['close_gate self-issue'],
      }),
      'utf-8'
    );

    const ctx = { workItemId: 'WI-TEST', workItemDir, projectRoot };
    const result = await runCloseGate(ctx as any);

    const blockingCheck = result.report.checks.find(c => c.check_id === 'close_no_blocking_issues');
    expect(blockingCheck).toBeDefined();
    expect((blockingCheck!.details ?? '')).not.toContain('close_gate self-issue');
  });
});
