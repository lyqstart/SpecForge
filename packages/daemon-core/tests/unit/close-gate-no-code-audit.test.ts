/**
 * close-gate-no-code-audit.test.ts
 *
 * Regression for v1.3.2: close_gate accepts no-code investigation audit when
 * code_permission was never enabled, but keeps normal implementation checks intact.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCloseGate } from '../../src/tools/lib/close-gate.js';
import type { SemanticClosureManifest } from '../../src/tools/lib/semantic-closure-core.js';
import { captureSemanticClosureProvenance } from '../../src/tools/lib/semantic-closure-provenance.js';

function investigationSemanticClosure(workItemId: string): SemanticClosureManifest {
  return {
    schema_version: '1.0',
    closure_profile: 'investigation',
    workflow_type: 'investigation',
    work_item_id: workItemId,
    investigation_questions: [
      {
        id: 'IQ-1',
        finding_refs: ['F-1'],
        required_evidence_refs: ['EV-1'],
      },
    ],
    findings: [
      {
        id: 'F-1',
        question_refs: ['IQ-1'],
        evidence_refs: ['EV-1'],
        root_cause_status: 'ROOT_CAUSE_CONFIRMED',
      },
    ],
    evidence: [
      {
        id: 'EV-1',
        status: 'passed',
        level: 'L5',
        evidence_type: 'runtime_falsification',
        supports: ['IQ-1', 'F-1'],
      },
    ],
    project_integration: { required: false, status: 'not_applicable' },
  };
}

async function createCloseReadyNoCodeWorkItem(
  projectRoot: string,
  workItemId = 'WI-0001'
): Promise<string> {
  const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'candidates', 'project', 'modules', 'core'), { recursive: true });
  await fs.writeFile(
    path.join(wiDir, 'work_item.json'),
    JSON.stringify(
      {
        schema_version: '1.1',
        work_item_id: workItemId,
        status: 'verification_done',
        workflow_type: 'investigation',
        workflow_path: 'requirement_change_path',
        code_change_allowed: false,
        allowed_write_files: [],
      },
      null,
      2
    ) + '\n'
  );
  await fs.writeFile(path.join(wiDir, 'intake.md'), '# Intake\nInvestigation request.');
  await fs.writeFile(
    path.join(wiDir, 'change_classification.md'),
    '# Change Classification\ninvestigation'
  );
  await fs.writeFile(path.join(wiDir, 'impact_analysis.md'), '# Impact Analysis\nNo code impact.');
  await fs.writeFile(
    path.join(wiDir, 'trigger_result.json'),
    JSON.stringify({
      work_item_id: workItemId,
      workflow_type: 'investigation',
      workflow_path: 'requirement_change_path',
    }) + '\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'investigation_plan.md'),
    [
      '# Investigation Plan',
      '',
      '## 调查问题与完成标准',
      '验证 Investigation no-code close 是否只依赖调查问题、发现和证据。',
      '',
      '## 候选假设',
      '- H1: Close Gate 仍错误依赖 implementation 产物。',
      '- H2: Close Gate 已使用 Investigation 专属产物。',
      '',
      '## 验证与反证方法',
      '删除 requirements/design/tasks，仅保留调查产物并执行 Close Gate。',
    ].join('\n')
  );
  await fs.writeFile(
    path.join(wiDir, 'findings_report.md'),
    [
      '# Findings Report',
      '',
      '## 调查结论',
      'ROOT_CAUSE_CONFIRMED',
      '',
      '## 事实与证据',
      'EV-1 证明专属 Investigation 关闭链通过。',
      '',
      '## 调用链与首次偏离点',
      'Close Gate 根据 workflow_type 选择调查产物清单。',
      '',
      '## 假设验证结果',
      'H1 rejected；H2 confirmed。',
      '',
      '## 根因判定',
      '旧测试模型伪造 implementation 链，现已由 Investigation profile 替代。',
      '',
      '## 因果链',
      'Investigation profile → 调查产物 → Evidence → Verification → Close。',
    ].join('\n')
  );
  await fs.writeFile(
    path.join(wiDir, 'candidate_manifest.json'),
    JSON.stringify(
      {
        schema_version: '1.1',
        work_item_id: workItemId,
        workflow_type: 'investigation',
        workflow_path: 'requirement_change_path',
        no_project_spec_change: true,
        project_integration_effect: 'evidence_only',
        merge_required: false,
        merge_applicable: false,
        entries: [],
      },
      null,
      2
    ) + '\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'gate_summary.md'),
    '# Gate Summary\n\n- Overall Status: passed\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'verification_report.md'),
    '# Verification Report\n\nEvidence EV-1 passed.'
  );
  await fs.writeFile(
    path.join(wiDir, 'merge_report.md'),
    '# Merge Report\n\nMerge Status: not_applicable'
  );
  await fs.writeFile(
    path.join(wiDir, 'changed_files_audit.md'),
    [
      '# Changed Files Audit',
      '',
      'Mode: no_code_change / not_applicable',
      '',
      '## Result: PASS',
      '',
      '- Status: not_applicable / no_code_change / PASS',
      '- Total files: 0',
      '- In scope: 0',
      '- Out of scope: 0',
      '- Violations: 0',
      '- Blocked write attempts: 0',
      '- Historical/resolved blocked write attempts: 0',
      '- Unresolved blocked write attempts: 0',
    ].join('\n')
  );
  await fs.writeFile(
    path.join(wiDir, 'evidence', 'evidence_manifest.json'),
    JSON.stringify({
      work_item_id: workItemId,
      entries: [{ id: 'EV-1', type: 'code_audit', status: 'passed' }],
    }) + '\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'user_decision.json'),
    JSON.stringify(
      {
        decision_status: 'approved',
        decision_type: 'user_approved',
        decided_by: 'user',
        workflow_path: 'requirement_change_path',
        user_response_quote: 'approved no-code investigation closeout',
        timestamp: new Date().toISOString(),
      },
      null,
      2
    ) + '\n'
  );
  const closure = investigationSemanticClosure(workItemId);
  closure.provenance = await captureSemanticClosureProvenance({
    workItemDir: wiDir,
    source: 'test_fixture',
    manifest: closure,
  });
  await fs.writeFile(
    path.join(wiDir, '.semantic_closure.json'),
    JSON.stringify(closure, null, 2) + '\n'
  );
  return wiDir;
}

describe('runCloseGate no-code investigation audit', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-close-no-code-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('passes no-code investigation close when code_permission was never enabled and audit is not_applicable', async () => {
    const wiDir = await createCloseReadyNoCodeWorkItem(tmpDir);
    const result = await runCloseGate({
      workItemId: 'WI-0001',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });

    expect(result.allChecksPassed).toBe(true);
    expect(
      result.report.checks.find(check => check.check_id === 'close_code_permission_revoked')?.passed
    ).toBe(true);
    expect(
      result.report.checks.find(check => check.check_id === 'close_changed_files_audit_passed')
        ?.passed
    ).toBe(true);
    expect(
      result.report.checks.find(
        check => check.check_id === 'close_investigation_candidate_evidence_only'
      )?.passed
    ).toBe(true);
    expect(
      result.report.checks.find(check => check.check_id === 'close_semantic_closure_valid')?.passed
    ).toBe(true);
  });

  it('does not accept no-code audit wording for feature_spec implementation WI', async () => {
    const wiDir = await createCloseReadyNoCodeWorkItem(tmpDir);
    const wiPath = path.join(wiDir, 'work_item.json');
    const wi = JSON.parse(await fs.readFile(wiPath, 'utf-8'));
    wi.workflow_type = 'feature_spec';
    await fs.writeFile(wiPath, JSON.stringify(wi, null, 2) + '\n');

    const result = await runCloseGate({
      workItemId: 'WI-0001',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });
    expect(result.allChecksPassed).toBe(false);
    expect(
      result.report.checks.find(check => check.check_id === 'close_code_permission_revoked')?.passed
    ).toBe(false);
  });
});
