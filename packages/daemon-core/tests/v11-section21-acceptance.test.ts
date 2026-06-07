/**
 * v11-section21-acceptance.test.ts — §21 Acceptance Scenarios
 *
 * Validates all 5 acceptance scenarios from the v1.1 standard:
 *   21.1 requirement_change_path — full lifecycle
 *   21.2 design_change_path — with/without requirements
 *   21.3 code_only_fast_path — trivial changes still complete all phases
 *   21.4 Out-of-bounds Write — Write Guard blocks violations
 *   21.5 User Decision Invalidation — stale decisions are caught
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { selectWorkflowPath, generateTriggerResult } from '../src/tools/lib/workflow-path-selector-v11';
import type { ChangeClassification, WorkflowPath, TriggerResult } from '../src/tools/lib/workflow-path-selector-v11';
import { checkWrite, performChangedFilesAudit } from '../src/tools/lib/write-guard-v11';
import type { WriteGuardContext, AuditResult } from '../src/tools/lib/write-guard-v11';
import { recordUserDecision, invalidateUserDecision } from '../src/tools/lib/user-decision-recorder-v11';
import type { UserDecisionV11 } from '../src/tools/lib/user-decision-recorder-v11';
import { runGate, runRequiredGates } from '../src/tools/lib/gate-runner-v11';
import type { GateContext, GateReportV11 } from '../src/tools/lib/gate-runner-v11';
import { executeMerge } from '../src/tools/lib/merge-runner-v11';
import { validateTraceDelta, validateVerificationReport, validateEvidenceManifest, checkTraceChain, writeTraceDeltaTemplate, writeEvidenceManifestTemplate } from '../src/tools/lib/verification-evidence-v11';
import { releaseCodePermission, revokeCodePermission, checkCodePermission } from '../src/tools/lib/code-permission-service-v11';
import { createWorkItem, updateWorkItemStatus, initializeClosureFiles } from '../src/tools/lib/work-item-lifecycle-v11';
import { isValidV11Transition, isForbiddenTransition, performResumeCheck } from '../src/tools/lib/state-machine-v11';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;
let projectRoot: string;
let workItemsRoot: string;
let projectDir: string;

beforeEach(async () => {
  tempDir = path.join(os.tmpdir(), `sf-s21-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  projectRoot = tempDir;
  workItemsRoot = path.join(tempDir, '.specforge', 'work-items');
  projectDir = path.join(tempDir, '.specforge', 'project');
  await fs.mkdir(workItemsRoot, { recursive: true });
  await fs.mkdir(projectDir, { recursive: true });
});

afterEach(async () => {
  try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ok */ }
});

/**
 * Full lifecycle helper: builds a WI dir that satisfies close_gate.
 * Returns the WI directory path.
 */
async function buildCompleteWI(
  wiId: string,
  workflowPath: WorkflowPath,
  classification: ChangeClassification,
  extra?: { allowedWriteFiles?: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }> },
): Promise<string> {
  const wiDir = await createWorkItem({ projectRoot, workItemId: wiId, userRequest: `Request for ${wiId}` });
  await initializeClosureFiles(wiDir, wiId, workflowPath);

  // Write trigger_result.json with correct workflow_path
  const trigger = generateTriggerResult(wiId, classification, []);
  await fs.writeFile(path.join(wiDir, 'trigger_result.json'), JSON.stringify(trigger, null, 2), 'utf-8');

  // Update work_item.json with workflow_path
  await updateWorkItemStatus(wiDir, 'intake_ready', { workflow_path: workflowPath });

  // Update classification and impact analysis
  await fs.writeFile(
    path.join(wiDir, 'change_classification.md'),
    '# Change Classification\n\nClassified.\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(wiDir, 'impact_analysis.md'),
    '# Impact Analysis\n\n## Existing Spec Match\n\nNo existing spec.\n',
    'utf-8',
  );

  // Write tasks
  await fs.writeFile(path.join(wiDir, 'tasks.md'), '# Tasks\n\n- TASK-1: Implement\n', 'utf-8');

  // Write trace_delta with content
  await writeTraceDeltaTemplate(wiDir, wiId, 'new', `New requirement for ${wiId}`);

  // Candidate manifest — with at least one entry for non-code-only paths
  const manifestEntries = workflowPath === 'code_only_fast_path'
    ? []
    : [
        {
          candidate_path: 'candidates/requirements_delta.md',
          target_path: '.specforge/project/requirements.md',
          operation: 'replace' as const,
        },
      ];
  await fs.writeFile(
    path.join(wiDir, 'candidate_manifest.json'),
    JSON.stringify(
      {
        schema_version: '1.0',
        work_item_id: wiId,
        workflow_path: workflowPath,
        base_spec_version: 'PSV-0001',
        merge_required: workflowPath !== 'code_only_fast_path',
        entries: manifestEntries,
      },
      null,
      2,
    ),
    'utf-8',
  );

  // Create candidate files
  if (manifestEntries.length > 0) {
    await fs.mkdir(path.join(wiDir, 'candidates'), { recursive: true });
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'requirements_delta.md'),
      '# Requirements Delta\n\n## Changes\n\nAdd archived status.\n',
      'utf-8',
    );
  }

  // Write evidence manifest with entries
  const evidenceDir = path.join(wiDir, 'evidence');
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(
    path.join(evidenceDir, 'evidence_manifest.json'),
    JSON.stringify(
      {
        schema_version: '1.0',
        work_item_id: wiId,
        entries: [
          {
            evidence_id: 'EV-001',
            type: 'test_output',
            path: 'evidence/test-output.txt',
            description: 'Test output evidence',
            hash: 'sha256:abc123',
            created_at: new Date().toISOString(),
          },
        ],
      },
      null,
      2,
    ),
    'utf-8',
  );

  // Write verification report with evidence reference
  await fs.writeFile(
    path.join(wiDir, 'verification_report.md'),
    `# Verification Report\n\nWork Item: ${wiId}\n\n## Commands\n- test run: exit_code=0 passed=true\n\n## Evidence\n- EV-001 test_output\n\n## Conclusion\nAll checks passed with evidence.\n`,
    'utf-8',
  );

  // Run gates and generate gate_summary
  const ctx: GateContext = { workItemId: wiId, workItemDir: wiDir, projectRoot };
  const gateResult = await runRequiredGates(
    ['entry_gate', 'workflow_selection_gate', 'gate_summary_gate'],
    ctx,
  );

  // Gate summary should exist now
  // Write a proper merge_report
  if (workflowPath === 'code_only_fast_path') {
    await fs.writeFile(
      path.join(wiDir, 'merge_report.md'),
      '# Merge Report\n\nWork Item: ' + wiId + '\nStatus: not_applicable\nReason: code_only_fast_path does not change project specs.\n',
      'utf-8',
    );
  } else {
    await fs.writeFile(
      path.join(wiDir, 'merge_report.md'),
      '# Merge Report\n\nWork Item: ' + wiId + '\nStatus: success\nTimestamp: ' + new Date().toISOString() + '\n\n## Summary\n- Total entries: 1\n- Successful: 1\n\n## Evidence\n- merge_runner_execution_log\n',
      'utf-8',
    );
  }

  // Record user decision
  const decision = await recordUserDecision({
    workItemDir: wiDir,
    workItemId: wiId,
    workflowPath,
    baseSpecVersion: 'PSV-0001',
    candidateManifestPath: 'candidate_manifest.json',
    gateSummaryPath: 'gate_summary.md',
    decisionStatus: 'approved',
    decisionType: 'user_approved',
    decidedBy: 'test-user',
    decisionScope: 'full',
  });
  expect(decision.decision_status).toBe('approved');

  // Release code permission if specified
  if (extra?.allowedWriteFiles) {
    await releaseCodePermission({
      workItemDir: wiDir,
      workItemId: wiId,
      allowedWriteFiles: extra.allowedWriteFiles,
    });
  }

  // Revoke code permission (close_gate requires this)
  await revokeCodePermission(wiDir);

  return wiDir;
}

// ===========================================================================
// §21.1 requirement_change_path
// ===========================================================================

describe('§21.1 Acceptance: requirement_change_path', () => {
  it('should classify requirement-level change as requirement_change_path', () => {
    const path = selectWorkflowPath({
      requirement_changed: true,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    });
    expect(path).toBe('requirement_change_path');
  });

  it('should classify acceptance_criteria change as requirement_change_path', () => {
    const path = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: true,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    });
    expect(path).toBe('requirement_change_path');
  });

  it('should classify business_rule change as requirement_change_path', () => {
    const path = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: true,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    });
    expect(path).toBe('requirement_change_path');
  });

  it('should produce a valid trigger_result with requirement_change_path', async () => {
    const classification: ChangeClassification = {
      requirement_changed: true,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    };
    const result = generateTriggerResult('WI-0001', classification, [
      { spec_type: 'requirements', spec_path: '.specforge/project/requirements.md', match_type: 'no_match' },
    ]);

    expect(result.schema_version).toBe('1.0');
    expect(result.work_item_id).toBe('WI-0001');
    expect(result.workflow_path).toBe('requirement_change_path');
    expect(result.classification).toEqual(classification);
    expect(result.match_results).toHaveLength(1);
    expect(result.selected_at).toBeTruthy();
  });

  it('should complete full lifecycle: Gate → User Decision → Merge → Trace → Verification → Evidence → close_gate', async () => {
    const wiId = 'WI-0101';
    const classification: ChangeClassification = {
      requirement_changed: true,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    };

    const wiDir = await buildCompleteWI(wiId, 'requirement_change_path', classification, {
      allowedWriteFiles: [{ path: 'src/orders.ts', operation: 'modify' }],
    });

    const ctx: GateContext = { workItemId: wiId, workItemDir: wiDir, projectRoot };

    // Step: Run merge (copy candidate to project)
    // Create spec_manifest.json in project dir
    await fs.writeFile(
      path.join(projectDir, 'spec_manifest.json'),
      JSON.stringify({ project_spec_version: 'PSV-0001' }),
      'utf-8',
    );
    // Create target file in project
    await fs.writeFile(
      path.join(projectDir, 'requirements.md'),
      '# Requirements\n\nOld content.\n',
      'utf-8',
    );

    const mergeResult = await executeMerge({
      projectRoot,
      workItemId: wiId,
      workItemDir: wiDir,
      candidateManifestPath: path.join(wiDir, 'candidate_manifest.json'),
      userDecisionPath: path.join(wiDir, 'user_decision.json'),
    });
    expect(mergeResult.success).toBe(true);
    expect(mergeResult.merged_files.length).toBeGreaterThan(0);

    // Verify the merged file exists
    const mergedContent = await fs.readFile(path.join(projectDir, 'requirements.md'), 'utf-8');
    expect(mergedContent).toContain('Requirements Delta');

    // Verify trace_delta is valid
    const traceDelta = await fs.readFile(path.join(wiDir, 'trace_delta.md'), 'utf-8');
    const traceValidation = validateTraceDelta(traceDelta);
    expect(traceValidation.valid).toBe(true);

    // Verify verification_report references evidence
    const vr = await fs.readFile(path.join(wiDir, 'verification_report.md'), 'utf-8');
    const vrValidation = validateVerificationReport(vr);
    expect(vrValidation.valid).toBe(true);

    // Verify evidence_manifest is valid
    const emRaw = await fs.readFile(path.join(wiDir, 'evidence', 'evidence_manifest.json'), 'utf-8');
    const em = JSON.parse(emRaw);
    const emValidation = validateEvidenceManifest(em);
    expect(emValidation.valid).toBe(true);
    expect(em.entries.length).toBeGreaterThan(0);

    // Verify user_decision is approved
    const udRaw = await fs.readFile(path.join(wiDir, 'user_decision.json'), 'utf-8');
    const ud = JSON.parse(udRaw);
    expect(ud.decision_status).toBe('approved');

    // Verify code permission is revoked
    const permState = await checkCodePermission(wiDir);
    expect(permState.code_change_allowed).toBe(false);
    expect(permState.allowed_write_files).toEqual([]);

    // Run close_gate
    const closeGateReport = await runGate('close_gate', ctx);
    expect(closeGateReport.status).toBe('passed');

    // Verify state transitions are valid
    expect(isValidV11Transition('verification_done', 'closed')).toBe(true);
  });
});

// ===========================================================================
// §21.2 design_change_path
// ===========================================================================

describe('§21.2 Acceptance: design_change_path', () => {
  it('should classify design_changed as design_change_path', () => {
    const path = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: true,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    });
    expect(path).toBe('design_change_path');
  });

  it('should classify api_contract_changed as design_change_path', () => {
    const path = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: true,
      architecture_changed: false,
      unknowns: [],
    });
    expect(path).toBe('design_change_path');
  });

  it('should classify data_semantics_changed as design_change_path', () => {
    const path = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: true,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    });
    expect(path).toBe('design_change_path');
  });

  it('should upgrade to requirement_change_path when unknowns mention requirement', () => {
    const path = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: true,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: ['unclear if requirement change needed'],
    });
    // unknown with 'requirement' keyword → requirement_change_path (§6.6)
    expect(path).toBe('requirement_change_path');
  });

  it('should upgrade to requirement_change_path when unknowns exist without specific keywords', () => {
    const path = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: ['some unknown impact'],
    });
    // unknown exists but no keyword match → highest safety = requirement_change_path
    expect(path).toBe('requirement_change_path');
  });

  it('should complete full design_change_path lifecycle', async () => {
    const wiId = 'WI-0201';
    const classification: ChangeClassification = {
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: true,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    };

    const wiDir = await buildCompleteWI(wiId, 'design_change_path', classification);

    const ctx: GateContext = { workItemId: wiId, workItemDir: wiDir, projectRoot };

    // Verify entry_gate passes
    const entryReport = await runGate('entry_gate', ctx);
    expect(entryReport.status).toBe('passed');

    // Verify workflow_selection_gate passes
    const wsReport = await runGate('workflow_selection_gate', ctx);
    expect(wsReport.status).toBe('passed');

    // Verify close_gate passes
    const closeReport = await runGate('close_gate', ctx);
    expect(closeReport.status).toBe('passed');
  });
});

// ===========================================================================
// §21.3 code_only_fast_path
// ===========================================================================

describe('§21.3 Acceptance: code_only_fast_path', () => {
  it('should classify trivial change as code_only_fast_path', () => {
    const path = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    });
    expect(path).toBe('code_only_fast_path');
  });

  it('should NOT classify as code_only if user_visible_behavior_changed', () => {
    const path = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: true,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    });
    expect(path).not.toBe('code_only_fast_path');
    expect(path).toBe('task_change_path');
  });

  it('should NOT classify as code_only if any unknown exists', () => {
    const path = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: ['might affect behavior'],
    });
    expect(path).not.toBe('code_only_fast_path');
  });

  it('should have empty candidate_manifest entries for code_only_fast_path', async () => {
    const wiId = 'WI-0301';
    const classification: ChangeClassification = {
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    };

    const wiDir = await buildCompleteWI(wiId, 'code_only_fast_path', classification, {
      allowedWriteFiles: [{ path: 'src/button.css', operation: 'modify' }],
    });

    // candidate_manifest.entries should be empty
    const manifestRaw = await fs.readFile(path.join(wiDir, 'candidate_manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.entries).toEqual([]);

    // merge_report should say not_applicable
    const mrRaw = await fs.readFile(path.join(wiDir, 'merge_report.md'), 'utf-8');
    expect(mrRaw.toLowerCase()).toContain('not_applicable');
  });

  it('should still complete all phases: tasks, Write Guard, verification, evidence, close_gate', async () => {
    const wiId = 'WI-0302';
    const classification: ChangeClassification = {
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    };

    const allowedFiles = [{ path: 'src/button.css', operation: 'modify' as const }];
    const wiDir = await buildCompleteWI(wiId, 'code_only_fast_path', classification, {
      allowedWriteFiles: allowedFiles,
    });

    const ctx: GateContext = { workItemId: wiId, workItemDir: wiDir, projectRoot };

    // Verify tasks.md exists and is not empty
    const tasksContent = await fs.readFile(path.join(wiDir, 'tasks.md'), 'utf-8');
    expect(tasksContent.trim().length).toBeGreaterThan(0);

    // Verify Write Guard enforces allowed_write_files
    // Allowed write
    const allowCtx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: wiId,
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: allowedFiles,
        workflow_path: 'code_only_fast_path',
      },
      callerRole: 'agent',
      isFrozen: false,
    };
    const allowedWrite = checkWrite(allowCtx, 'src/button.css', 'modify');
    expect(allowedWrite.allowed).toBe(true);

    // Out-of-bounds write should be blocked
    const blockedWrite = checkWrite(allowCtx, 'src/other-file.ts', 'modify');
    expect(blockedWrite.allowed).toBe(false);
    expect(blockedWrite.violations.length).toBeGreaterThan(0);

    // Verify verification_report exists and references evidence
    const vrRaw = await fs.readFile(path.join(wiDir, 'verification_report.md'), 'utf-8');
    const vrValidation = validateVerificationReport(vrRaw);
    expect(vrValidation.valid).toBe(true);

    // Verify evidence_manifest has entries
    const emRaw = await fs.readFile(path.join(wiDir, 'evidence', 'evidence_manifest.json'), 'utf-8');
    const em = JSON.parse(emRaw);
    expect(em.entries.length).toBeGreaterThan(0);

    // Verify changed_files_audit
    const auditResult = performChangedFilesAudit(
      [{ path: 'src/button.css', operation: 'modify' }],
      allowedFiles,
    );
    expect(auditResult.passed).toBe(true);
    expect(auditResult.in_scope).toBe(1);
    expect(auditResult.out_of_scope).toBe(0);

    // close_gate should pass
    const closeReport = await runGate('close_gate', ctx);
    expect(closeReport.status).toBe('passed');
  });
});

// ===========================================================================
// §21.4 Out-of-bounds Write
// ===========================================================================

describe('§21.4 Acceptance: Out-of-bounds Write', () => {
  it('should block write to file outside allowed_write_files', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-0401',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/orders.ts', operation: 'modify' }],
        workflow_path: 'requirement_change_path',
      },
      callerRole: 'agent',
      isFrozen: false,
    };

    const result = checkWrite(ctx, 'src/secrets.ts', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('not in allowed_write_files')]),
    );
  });

  it('should block write when code_change_allowed is false', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-0402',
        status: 'implementation_running',
        code_change_allowed: false,
        allowed_write_files: [{ path: 'src/orders.ts', operation: 'modify' }],
        workflow_path: 'requirement_change_path',
      },
      callerRole: 'agent',
      isFrozen: false,
    };

    const result = checkWrite(ctx, 'src/orders.ts', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('code_change_allowed=false')]),
    );
  });

  it('should block write when no active WI exists', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: false,
      callerRole: 'agent',
      isFrozen: false,
    };

    const result = checkWrite(ctx, 'src/orders.ts', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('no active WI')]),
    );
  });

  it('should block agent from writing to .specforge/project/', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-0403',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [],
        workflow_path: 'requirement_change_path',
      },
      callerRole: 'agent',
      isFrozen: false,
    };

    const result = checkWrite(ctx, '.specforge/project/requirements.md', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('agent cannot write .specforge/project/')]),
    );
  });

  it('should block agent from writing user_decision.json', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-0404',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [],
        workflow_path: 'requirement_change_path',
      },
      callerRole: 'agent',
      isFrozen: false,
    };

    const result = checkWrite(ctx, '.specforge/work-items/WI-0404/user_decision.json', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('user_decision.json')]),
    );
  });

  it('should block agent from writing gates/', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-0405',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [],
        workflow_path: 'requirement_change_path',
      },
      callerRole: 'agent',
      isFrozen: false,
    };

    const result = checkWrite(ctx, '.specforge/work-items/WI-0405/gates/entry_gate.json', 'create');
    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('gates/')]),
    );
  });

  it('should block agent from writing gate_summary.md', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-0406',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [],
        workflow_path: 'requirement_change_path',
      },
      callerRole: 'agent',
      isFrozen: false,
    };

    const result = checkWrite(ctx, '.specforge/work-items/WI-0406/gate_summary.md', 'create');
    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('gate_summary.md')]),
    );
  });

  it('should block agent from writing merge_report.md', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-0407',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [],
        workflow_path: 'requirement_change_path',
      },
      callerRole: 'agent',
      isFrozen: false,
    };

    const result = checkWrite(ctx, '.specforge/work-items/WI-0407/merge_report.md', 'create');
    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('merge_report.md')]),
    );
  });

  it('should block frozen modifications to candidates/', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-0408',
        status: 'approval_required',
        code_change_allowed: false,
        allowed_write_files: [],
        workflow_path: 'requirement_change_path',
      },
      callerRole: 'agent',
      isFrozen: true,
    };

    const result = checkWrite(ctx, '.specforge/work-items/WI-0408/candidates/requirements.md', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('frozen')]),
    );
  });

  it('should block writes to closed WI', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-0409',
        status: 'closed',
        code_change_allowed: false,
        allowed_write_files: [],
        workflow_path: 'requirement_change_path',
      },
      callerRole: 'agent',
      isFrozen: false,
    };

    const result = checkWrite(ctx, 'src/orders.ts', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('closed WI')]),
    );
  });

  it('performChangedFilesAudit should detect out-of-scope writes', () => {
    const allowedFiles = [
      { path: 'src/orders.ts', operation: 'modify' },
    ];

    const changedFiles = [
      { path: 'src/orders.ts', operation: 'modify' },
      { path: 'src/unauthorized.ts', operation: 'create' },
      { path: 'src/secret.ts', operation: 'modify' },
    ];

    const result = performChangedFilesAudit(changedFiles, allowedFiles);

    expect(result.passed).toBe(false);
    expect(result.in_scope).toBe(1);
    expect(result.out_of_scope).toBe(2);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('out_of_scope: src/unauthorized.ts'),
        expect.stringContaining('out_of_scope: src/secret.ts'),
      ]),
    );
  });

  it('should detect spec writes as violations', () => {
    const allowedFiles: Array<{ path: string; operation: string }> = [];
    const changedFiles = [
      { path: '.specforge/project/requirements.md', operation: 'modify' },
    ];

    const result = performChangedFilesAudit(changedFiles, allowedFiles);

    expect(result.passed).toBe(false);
    expect(result.spec_writes).toBe(1);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('spec_write_by_agent'),
      ]),
    );
  });

  it('close_gate should fail when out-of-bounds writes are recorded', async () => {
    const wiId = 'WI-0410';
    const classification: ChangeClassification = {
      requirement_changed: true,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    };

    const wiDir = await buildCompleteWI(wiId, 'requirement_change_path', classification);

    // Simulate write guard violation recorded in work_item.json
    const wiPath = path.join(wiDir, 'work_item.json');
    const wiJson = JSON.parse(await fs.readFile(wiPath, 'utf-8'));
    wiJson.write_guard_violations = ['out_of_scope: src/hacked.ts'];
    await fs.writeFile(wiPath, JSON.stringify(wiJson, null, 2), 'utf-8');

    const ctx: GateContext = { workItemId: wiId, workItemDir: wiDir, projectRoot };
    const closeReport = await runGate('close_gate', ctx);

    // close_gate should fail because write_guard_violations is not empty
    const violationCheck = closeReport.checks.find(c => c.check_id === 'close_no_write_guard_violations');
    expect(violationCheck).toBeDefined();
    expect(violationCheck!.passed).toBe(false);
  });
});

// ===========================================================================
// §21.5 User Decision Invalidation
// ===========================================================================

describe('§21.5 Acceptance: User Decision Invalidation', () => {
  it('should record and then invalidate a user decision', async () => {
    const wiId = 'WI-0501';
    const classification: ChangeClassification = {
      requirement_changed: true,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    };

    const wiDir = await createWorkItem({ projectRoot, workItemId: wiId, userRequest: 'Test invalidation' });
    await initializeClosureFiles(wiDir, wiId, 'requirement_change_path');

    // Write candidate_manifest and gate_summary
    const trigger = generateTriggerResult(wiId, classification, []);
    await fs.writeFile(path.join(wiDir, 'trigger_result.json'), JSON.stringify(trigger, null, 2), 'utf-8');

    await fs.writeFile(
      path.join(wiDir, 'candidate_manifest.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: wiId,
        workflow_path: 'requirement_change_path',
        base_spec_version: 'PSV-0001',
        merge_required: true,
        entries: [
          {
            candidate_path: 'candidates/requirements_delta.md',
            target_path: '.specforge/project/requirements.md',
            operation: 'replace',
          },
        ],
      }, null, 2),
      'utf-8',
    );

    // Create candidates dir
    await fs.mkdir(path.join(wiDir, 'candidates'), { recursive: true });
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'requirements_delta.md'),
      '# Requirements Delta\n\nOriginal content.\n',
      'utf-8',
    );

    // Run gates to generate gate_summary.md
    const ctx: GateContext = { workItemId: wiId, workItemDir: wiDir, projectRoot };
    await runRequiredGates(['entry_gate', 'workflow_selection_gate', 'gate_summary_gate'], ctx);

    // Record user decision
    const decision = await recordUserDecision({
      workItemDir: wiDir,
      workItemId: wiId,
      workflowPath: 'requirement_change_path',
      baseSpecVersion: 'PSV-0001',
      candidateManifestPath: 'candidate_manifest.json',
      gateSummaryPath: 'gate_summary.md',
      decisionStatus: 'approved',
      decisionType: 'user_approved',
      decidedBy: 'test-user',
      decisionScope: 'full',
    });

    expect(decision.decision_status).toBe('approved');
    expect(decision.manifest_hash).toBeTruthy();
    expect(decision.candidate_hash).toBeTruthy();
    expect(decision.gate_summary_hash).toBeTruthy();

    // Verify the decision file
    const udRaw = await fs.readFile(path.join(wiDir, 'user_decision.json'), 'utf-8');
    const udParsed = JSON.parse(udRaw) as UserDecisionV11;
    expect(udParsed.decision_status).toBe('approved');
    expect(udParsed.decision_id).toContain('UD-WI-0501');

    // Now invalidate the decision (simulating candidate change)
    await invalidateUserDecision(wiDir, 'Candidate changed after approval');

    // Verify it's invalidated
    const invalidatedRaw = await fs.readFile(path.join(wiDir, 'user_decision.json'), 'utf-8');
    const invalidatedDecision = JSON.parse(invalidatedRaw) as UserDecisionV11;
    expect(invalidatedDecision.decision_status).toBe('invalidated');
  });

  it('merge_ready_gate should fail when user_decision is invalidated', async () => {
    const wiId = 'WI-0502';
    const classification: ChangeClassification = {
      requirement_changed: true,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    };

    const wiDir = await createWorkItem({ projectRoot, workItemId: wiId, userRequest: 'Test merge_ready failure' });
    await initializeClosureFiles(wiDir, wiId, 'requirement_change_path');

    const trigger = generateTriggerResult(wiId, classification, []);
    await fs.writeFile(path.join(wiDir, 'trigger_result.json'), JSON.stringify(trigger, null, 2), 'utf-8');

    await fs.writeFile(
      path.join(wiDir, 'candidate_manifest.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: wiId,
        entries: [],
      }, null, 2),
      'utf-8',
    );

    // Run gates to generate gate_summary.md
    const ctx: GateContext = { workItemId: wiId, workItemDir: wiDir, projectRoot };
    await runRequiredGates(['entry_gate', 'workflow_selection_gate', 'gate_summary_gate'], ctx);

    // Record and then invalidate user decision
    const decision = await recordUserDecision({
      workItemDir: wiDir,
      workItemId: wiId,
      workflowPath: 'requirement_change_path',
      baseSpecVersion: 'PSV-0001',
      candidateManifestPath: 'candidate_manifest.json',
      gateSummaryPath: 'gate_summary.md',
      decisionStatus: 'approved',
      decisionType: 'user_approved',
      decidedBy: 'test-user',
      decisionScope: 'full',
    });
    expect(decision.decision_status).toBe('approved');

    // Invalidate
    await invalidateUserDecision(wiDir, 'Candidate changed');

    // merge_ready_gate should now fail
    const mergeReadyReport = await runGate('merge_ready_gate', ctx);
    expect(mergeReadyReport.status).toBe('failed');

    // The user_decision_status check should fail
    const statusCheck = mergeReadyReport.checks.find(c => c.check_id === 'user_decision_status');
    expect(statusCheck).toBeDefined();
    expect(statusCheck!.passed).toBe(false);
  });

  it('should require regeneration of Candidate / Gate Summary / User Decision after invalidation', async () => {
    const wiId = 'WI-0503';
    const classification: ChangeClassification = {
      requirement_changed: true,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    };

    const wiDir = await createWorkItem({ projectRoot, workItemId: wiId, userRequest: 'Test regeneration' });
    await initializeClosureFiles(wiDir, wiId, 'requirement_change_path');

    const trigger = generateTriggerResult(wiId, classification, []);
    await fs.writeFile(path.join(wiDir, 'trigger_result.json'), JSON.stringify(trigger, null, 2), 'utf-8');

    await fs.writeFile(
      path.join(wiDir, 'candidate_manifest.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: wiId,
        entries: [],
      }, null, 2),
      'utf-8',
    );

    // Run gates to generate gate_summary.md
    const ctx: GateContext = { workItemId: wiId, workItemDir: wiDir, projectRoot };
    await runRequiredGates(['entry_gate', 'workflow_selection_gate', 'gate_summary_gate'], ctx);

    // First decision
    await recordUserDecision({
      workItemDir: wiDir,
      workItemId: wiId,
      workflowPath: 'requirement_change_path',
      baseSpecVersion: 'PSV-0001',
      candidateManifestPath: 'candidate_manifest.json',
      gateSummaryPath: 'gate_summary.md',
      decisionStatus: 'approved',
      decisionType: 'user_approved',
      decidedBy: 'test-user',
      decisionScope: 'full',
    });

    // Invalidate
    await invalidateUserDecision(wiDir, 'Candidate hash changed');

    // merge_ready_gate fails
    let mergeReadyReport = await runGate('merge_ready_gate', ctx);
    expect(mergeReadyReport.status).toBe('failed');

    // Regenerate: re-run gates
    await runRequiredGates(['entry_gate', 'workflow_selection_gate', 'gate_summary_gate'], ctx);

    // Re-record user decision
    await recordUserDecision({
      workItemDir: wiDir,
      workItemId: wiId,
      workflowPath: 'requirement_change_path',
      baseSpecVersion: 'PSV-0001',
      candidateManifestPath: 'candidate_manifest.json',
      gateSummaryPath: 'gate_summary.md',
      decisionStatus: 'approved',
      decisionType: 'user_approved',
      decidedBy: 'test-user',
      decisionScope: 'full',
    });

    // Now merge_ready_gate should pass
    mergeReadyReport = await runGate('merge_ready_gate', ctx);
    expect(mergeReadyReport.status).toBe('passed');
  });

  it('should record decision with correct hashes for tamper detection', async () => {
    const wiId = 'WI-0504';
    const classification: ChangeClassification = {
      requirement_changed: true,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    };

    const wiDir = await createWorkItem({ projectRoot, workItemId: wiId, userRequest: 'Test hashes' });
    await initializeClosureFiles(wiDir, wiId, 'requirement_change_path');

    const trigger = generateTriggerResult(wiId, classification, []);
    await fs.writeFile(path.join(wiDir, 'trigger_result.json'), JSON.stringify(trigger, null, 2), 'utf-8');

    await fs.writeFile(
      path.join(wiDir, 'candidate_manifest.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: wiId,
        entries: [
          {
            candidate_path: 'candidates/req.md',
            target_path: '.specforge/project/req.md',
            operation: 'replace',
          },
        ],
      }, null, 2),
      'utf-8',
    );

    // Create candidates
    await fs.mkdir(path.join(wiDir, 'candidates'), { recursive: true });
    await fs.writeFile(path.join(wiDir, 'candidates', 'req.md'), 'Original', 'utf-8');

    const ctx: GateContext = { workItemId: wiId, workItemDir: wiDir, projectRoot };
    await runRequiredGates(['entry_gate', 'workflow_selection_gate', 'gate_summary_gate'], ctx);

    const decision = await recordUserDecision({
      workItemDir: wiDir,
      workItemId: wiId,
      workflowPath: 'requirement_change_path',
      baseSpecVersion: 'PSV-0001',
      candidateManifestPath: 'candidate_manifest.json',
      gateSummaryPath: 'gate_summary.md',
      decisionStatus: 'approved',
      decisionType: 'user_approved',
      decidedBy: 'test-user',
      decisionScope: 'full',
    });

    // Hashes should be non-empty sha256
    expect(decision.manifest_hash).toMatch(/^sha256:[a-f0-9]+$/);
    expect(decision.candidate_hash).toMatch(/^sha256:[a-f0-9]+$/);
    expect(decision.gate_summary_hash).toMatch(/^sha256:[a-f0-9]+$/);

    // Tamper with candidate
    await fs.writeFile(path.join(wiDir, 'candidates', 'req.md'), 'Tampered!', 'utf-8');

    // Invalidate because candidate changed
    await invalidateUserDecision(wiDir, 'Candidate tampered');

    const invalidatedRaw = await fs.readFile(path.join(wiDir, 'user_decision.json'), 'utf-8');
    const invalidated = JSON.parse(invalidatedRaw);
    expect(invalidated.decision_status).toBe('invalidated');
  });
});

// ===========================================================================
// Additional: State Machine validation across all paths
// ===========================================================================

describe('§21 Cross-cutting: State machine transitions', () => {
  it('should allow valid transitions for requirement_change_path', () => {
    const transitions = [
      ['created', 'intake_ready'],
      ['intake_ready', 'impact_analyzing'],
      ['impact_analyzing', 'impact_analyzed'],
      ['impact_analyzed', 'workflow_selected'],
      ['workflow_selected', 'candidate_preparing'],
      ['candidate_preparing', 'candidate_prepared'],
      ['candidate_prepared', 'gates_running'],
      ['gates_running', 'approval_required'],
      ['approval_required', 'approved'],
      ['approved', 'merge_ready'],
      ['merge_ready', 'merging'],
      ['merging', 'merged'],
      ['merged', 'post_merge_verified'],
      ['post_merge_verified', 'implementation_ready'],
      ['implementation_ready', 'implementation_running'],
      ['implementation_running', 'implementation_done'],
      ['implementation_done', 'verification_running'],
      ['verification_running', 'verification_done'],
      ['verification_done', 'closed'],
    ] as const;

    for (const [from, to] of transitions) {
      expect(isValidV11Transition(from, to)).toBe(true);
    }
  });

  it('should forbid dangerous transitions', () => {
    const forbidden = [
      ['created', 'implementation_running'],
      ['intake_ready', 'implementation_running'],
      ['candidate_prepared', 'merging'],
      ['approval_required', 'merging'],
      ['approval_required', 'closed'],
      ['merged', 'closed'],
      ['blocked', 'closed'],
      ['rejected', 'closed'],
      ['closed', 'created'],
      ['closed', 'intake_ready'],
      ['closed', 'implementation_running'],
    ] as const;

    for (const [from, to] of forbidden) {
      expect(isForbiddenTransition(from, to)).toBe(true);
      expect(isValidV11Transition(from, to)).toBe(false);
    }
  });

  it('should allow blocked to rollback to earlier states', () => {
    expect(isValidV11Transition('blocked', 'candidate_preparing')).toBe(true);
    expect(isValidV11Transition('blocked', 'gates_running')).toBe(true);
    expect(isValidV11Transition('blocked', 'implementation_ready')).toBe(true);
    expect(isValidV11Transition('blocked', 'workflow_selected')).toBe(true);
  });
});

// ===========================================================================
// Cross-cutting: Code Permission lifecycle
// ===========================================================================

describe('§21 Cross-cutting: Code Permission lifecycle', () => {
  it('should enforce code permission release and revoke lifecycle', async () => {
    const wiId = 'WI-0601';
    const wiDir = await createWorkItem({ projectRoot, workItemId: wiId, userRequest: 'Permission lifecycle' });

    // Initially, code_change_allowed is false
    const initialState = await checkCodePermission(wiDir);
    expect(initialState.code_change_allowed).toBe(false);
    expect(initialState.allowed_write_files).toEqual([]);

    // Release permission
    const allowedFiles = [
      { path: 'src/orders.ts', operation: 'modify' as const },
      { path: 'tests/orders.test.ts', operation: 'create' as const },
    ];
    await releaseCodePermission({
      workItemDir: wiDir,
      workItemId: wiId,
      allowedWriteFiles: allowedFiles,
    });

    const releasedState = await checkCodePermission(wiDir);
    expect(releasedState.code_change_allowed).toBe(true);
    expect(releasedState.allowed_write_files).toHaveLength(2);

    // Write Guard should now allow writes to allowed files
    const guardCtx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: wiId,
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: allowedFiles,
        workflow_path: 'requirement_change_path',
      },
      callerRole: 'agent',
      isFrozen: false,
    };

    const allowedResult = checkWrite(guardCtx, 'src/orders.ts', 'modify');
    expect(allowedResult.allowed).toBe(true);

    const blockedResult = checkWrite(guardCtx, 'src/other.ts', 'modify');
    expect(blockedResult.allowed).toBe(false);

    // Revoke permission
    await revokeCodePermission(wiDir);
    const revokedState = await checkCodePermission(wiDir);
    expect(revokedState.code_change_allowed).toBe(false);
    expect(revokedState.allowed_write_files).toEqual([]);
  });
});
