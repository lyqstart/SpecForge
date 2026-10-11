import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
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
      'merge_report.md': '# Merge Report\n\nContract: merge-report/v1\nWork Item: WI-TEST\nStatus: success\nTimestamp: 2026-01-01T00:00:00Z\n\n## Summary\n\n- Total entries: 1\n- Successful: 1\n- Failed: 0\n',
      'changed_files_audit.md': '# Changed Files Audit\n\nContract: changed-files-audit/v1\nWork Item: WI-TEST\n## Result: PASS\n- Total files: 0\n- In scope: 0\n- Out of scope: 0\n- Violations: 0\n- Blocked write attempts: 0\n',
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

  function filesystemFingerprint(relativePath: string, content: string): string {
    const contentHash = createHash('sha256').update(content).digest('hex');
    return createHash('sha256')
      .update(`${relativePath}\0file\0${contentHash}`)
      .digest('hex');
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

  it('accepts a complete current merge_report contract', async () => {
    await writeBaseFiles();
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

  it('rejects a successful merge_report bound to another Work Item', async () => {
    await writeBaseFiles({
      'merge_report.md': [
        '# Merge Report',
        '',
        'Contract: merge-report/v1',
        'Work Item: WI-OTHER',
        'Status: success',
        '',
        '## Summary',
        '- Total entries: 1',
        '- Successful: 1',
        '- Failed: 0',
      ].join('\n'),
    });
    await writeUserDecision();

    const ctx = { workItemId: 'WI-TEST', workItemDir, projectRoot };
    const result = await runCloseGate(ctx as any);

    const mergeCheck = result.report.checks.find(c => c.check_id === 'close_merge_report_valid');
    expect(mergeCheck).toBeDefined();
    expect(mergeCheck!.passed).toBe(false);
    expect(mergeCheck!.details).toContain('Work Item mismatch');
  });

  it('rejects a passing Changed Files Audit bound to another Work Item', async () => {
    await writeBaseFiles({
      'changed_files_audit.md': [
        '# Changed Files Audit',
        '',
        'Contract: changed-files-audit/v1',
        'Work Item: WI-OTHER',
        '## Result: PASS',
        '- Total files: 0',
        '- In scope: 0',
        '- Out of scope: 0',
        '- Violations: 0',
        '- Blocked write attempts: 0',
        '- Historical/resolved blocked write attempts: 0',
        '- Unresolved blocked write attempts: 0',
      ].join('\n'),
    });
    await writeUserDecision();

    const result = await runCloseGate({ workItemId: 'WI-TEST', workItemDir, projectRoot } as any);
    const auditCheck = result.report.checks.find(
      c => c.check_id === 'close_changed_files_audit_passed',
    );

    expect(auditCheck).toBeDefined();
    expect(auditCheck!.passed).toBe(false);
    expect(auditCheck!.details).toContain('Work Item');
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

  it('revalidates filesystem implementation bytes instead of trusting a stale Formal Version pass', async () => {
    await writeBaseFiles();
    await writeUserDecision();
    const implementation = 'export const ready = true;\n';
    await mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await writeFile(path.join(projectRoot, 'src', 'main.js'), implementation, 'utf8');
    await mkdir(path.join(projectRoot, '.specforge', 'project'), { recursive: true });
    await writeFile(
      path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json'),
      JSON.stringify({
        schema_version: '1.0',
        project_spec_version: 'PSV-0002',
        project: { extension_registry: '.specforge/project/extension_registry.json' },
        modules: [],
      }),
      'utf8',
    );
    await writeFile(
      path.join(projectRoot, '.specforge', 'project', 'extension_registry.json'),
      JSON.stringify({ schema_version: '1.0', project_spec_version: 'PSV-0002' }),
      'utf8',
    );
    await writeFile(
      path.join(workItemDir, 'filesystem_baseline.json'),
      JSON.stringify({
        schema_version: '2.0',
        content_hash_algorithm: 'sha256',
        timestamp: '2026-01-01T00:00:00.000Z',
        root: projectRoot,
        files: [],
      }),
      'utf8',
    );
    await writeFile(
      path.join(workItemDir, 'governance_scope.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-TEST',
        active: false,
        allowed_write_files: ['src/main.js'],
        affected_modules: [],
        version_control_mode: 'filesystem',
      }),
      'utf8',
    );
    await writeFile(
      path.join(workItemDir, 'gates', 'formal_version_gate.json'),
      JSON.stringify({ gate_id: 'formal_version_gate', status: 'passed' }),
      'utf8',
    );
    await writeFile(
      path.join(workItemDir, 'formal_version_snapshot.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-TEST',
        version_control_mode: 'filesystem',
        implementation_files: ['src/main.js'],
        implementation_tree_fingerprint: filesystemFingerprint('src/main.js', implementation),
      }),
      'utf8',
    );

    const current = await runCloseGate({ workItemId: 'WI-TEST', workItemDir, projectRoot } as any);
    expect(
      current.report.checks.find(check => check.check_id === 'close_filesystem_formal_version_current'),
    ).toMatchObject({ passed: true });

    await writeFile(
      path.join(projectRoot, '.specforge', 'project', 'extension_registry.json'),
      JSON.stringify({ schema_version: '1.0', project_spec_version: 'PSV-0001' }),
      'utf8',
    );
    const versionDrifted = await runCloseGate({
      workItemId: 'WI-TEST',
      workItemDir,
      projectRoot,
    } as any);
    expect(
      versionDrifted.report.checks.find(
        check => check.check_id === 'close_project_spec_core_version_coherent',
      ),
    ).toMatchObject({ passed: false });
    await writeFile(
      path.join(projectRoot, '.specforge', 'project', 'extension_registry.json'),
      JSON.stringify({ schema_version: '1.0', project_spec_version: 'PSV-0002' }),
      'utf8',
    );

    await writeFile(path.join(projectRoot, 'src', 'main.js'), 'export const ready = false;\n', 'utf8');
    const drifted = await runCloseGate({ workItemId: 'WI-TEST', workItemDir, projectRoot } as any);
    expect(
      drifted.report.checks.find(check => check.check_id === 'close_filesystem_formal_version_current'),
    ).toMatchObject({
      passed: false,
      details: 'FORMAL_VERSION_FILESYSTEM_IMPLEMENTATION_CHANGED_AFTER_GATE',
    });
  });
});
