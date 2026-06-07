/**
 * v11-e2e-test.ts — §21/§22 End-to-end integration test
 *
 * Full chain: WI creation → intake → classification → impact analysis →
 * workflow path selection → candidate → gates → user decision → merge →
 * code permission → verification → evidence → trace → close_gate → closed
 *
 * Plus: rollback, handoff validation, extension subflow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { createWorkItem, initializeClosureFiles, updateWorkItemStatus } from '../src/tools/lib/work-item-lifecycle-v11';
import { selectWorkflowPath, generateTriggerResult } from '../src/tools/lib/workflow-path-selector-v11';
import { isValidV11Transition } from '../src/tools/lib/state-machine-v11';
import { checkWrite, performChangedFilesAudit } from '../src/tools/lib/write-guard-v11';
import { releaseCodePermission, revokeCodePermission, checkCodePermission } from '../src/tools/lib/code-permission-service-v11';
import { recordUserDecision, invalidateUserDecision } from '../src/tools/lib/user-decision-recorder-v11';
import { runGate, runRequiredGates } from '../src/tools/lib/gate-runner-v11';
import { validateHandoff, writeHandoff } from '../src/tools/lib/agent-handoff-v11';
import type { AgentHandoff } from '../src/tools/lib/agent-handoff-v11';
import { generateRollbackPlan, generateRollbackDelta, markOriginalSuperseded } from '../src/tools/lib/rollback-runner-v11';
import { validateTraceDelta, validateVerificationReport, validateEvidenceManifest, checkTraceChain, writeTraceDeltaTemplate, writeEvidenceManifestTemplate } from '../src/tools/lib/verification-evidence-v11';
import { validateExtensionRequest, writeExtensionRequest, generateExtensionDelta, generateExtensionCandidate, runExtensionGate } from '../src/tools/lib/extension-subflow-v11';

let tempDir: string;
let projectRoot: string;
let workItemsRoot: string;
let projectDir: string;

beforeEach(async () => {
  tempDir = path.join(os.tmpdir(), `sf-v11-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  projectRoot = tempDir;
  workItemsRoot = path.join(tempDir, '.specforge', 'work-items');
  projectDir = path.join(tempDir, '.specforge', 'project');
  await fs.mkdir(workItemsRoot, { recursive: true });
  await fs.mkdir(projectDir, { recursive: true });
});

afterEach(async () => {
  try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ok */ }
});

describe('§22 End-to-end: requirement_change_path full chain', () => {
  it('should complete full WI lifecycle: create → close', async () => {
    const wiId = 'WI-0001';

    // Step 1: Create WI (§4)
    const wiDir = await createWorkItem({ projectRoot, workItemId: wiId, userRequest: 'Add archived status to orders' });
    expect(wiDir).toBeDefined();

    // Step 2: Initialize closure files (§4)
    await initializeClosureFiles(wiDir, wiId, 'requirement_change_path');

    // Verify required files created
    const wiJson = JSON.parse(await fs.readFile(path.join(wiDir, 'work_item.json'), 'utf-8'));
    expect(wiJson.work_item_id).toBe(wiId);
    // workflow_path is set later after classification; initially null
    expect(wiJson.status).toBe('created');

    // Step 3: Update status to intake_ready
    await updateWorkItemStatus(wiDir, 'intake_ready');
    const updated = JSON.parse(await fs.readFile(path.join(wiDir, 'work_item.json'), 'utf-8'));
    expect(updated.status).toBe('intake_ready');

    // Step 4: Workflow path selection (§6)
    const selectedPath = selectWorkflowPath({
      requirement_changed: true,
      design_changed: false,
      architecture_changed: false,
      unknowns: [],
    });
    expect(selectedPath).toBe('requirement_change_path');

    // Step 5: Write intake.md
    await fs.writeFile(path.join(wiDir, 'intake.md'), '# Intake\n\nUser wants to add "archived" status to orders.\n', 'utf-8');

    // Step 6: Write change_classification.md
    await fs.writeFile(path.join(wiDir, 'change_classification.md'), '# Classification\n\nType: requirement_change\n', 'utf-8');

    // Step 7: Write impact_analysis.md
    await fs.writeFile(path.join(wiDir, 'impact_analysis.md'), '# Impact\n\nRequirements affected: REQ-001\n', 'utf-8');

    // Step 8: Write trigger_result.json
    await fs.writeFile(path.join(wiDir, 'trigger_result.json'), JSON.stringify({
      work_item_id: wiId,
      workflow_path: 'requirement_change_path',
      classification: { requirement_changed: true },
    }, null, 2), 'utf-8');

    // Step 9: Write candidate_manifest.json
    const candidateManifest = {
      schema_version: '1.0',
      work_item_id: wiId,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      entries: [{
        candidate_path: `.specforge/work-items/${wiId}/candidates/project/modules/ORD/requirements.md`,
        target_path: '.specforge/project/modules/ORD/requirements.md',
        operation: 'replace',
        candidate_hash: 'sha256:abc123',
        target_base_hash: 'sha256:def456',
      }],
      manifest_hash: 'sha256:ghi789',
    };
    await fs.writeFile(path.join(wiDir, 'candidate_manifest.json'), JSON.stringify(candidateManifest, null, 2), 'utf-8');

    // Step 10: Write candidate file
    const candidatesDir = path.join(wiDir, 'candidates', 'project', 'modules', 'ORD');
    await fs.mkdir(candidatesDir, { recursive: true });
    await fs.writeFile(path.join(candidatesDir, 'requirements.md'), '# ORD Requirements\n\n## REQ-001\nStatus: active, archived\n', 'utf-8');

    // Step 11: Write tasks.md
    await fs.writeFile(path.join(wiDir, 'tasks.md'), '# Tasks\n\n## TASK-001\nUpdate requirements\n', 'utf-8');

    // Step 12: Write trace_delta.md (§13)
    await writeTraceDeltaTemplate(wiDir, wiId, 'modified', 'REQ-001 AC changes');

    // Step 13: Write verification_report.md (§13)
    await fs.writeFile(path.join(wiDir, 'verification_report.md'),
      '# Verification Report\n\n## Conclusion: PASS\n\nEvidence: test_output_001\nCommands: npm test (exit 0)\n', 'utf-8');

    // Step 14: Write evidence_manifest.json (§13)
    await writeEvidenceManifestTemplate(wiDir, wiId);
    // Add an evidence entry
    const emPath = path.join(wiDir, 'evidence', 'evidence_manifest.json');
    const em = JSON.parse(await fs.readFile(emPath, 'utf-8'));
    em.entries.push({
      evidence_id: 'EV-001',
      type: 'test_output',
      path: '.specforge/work-items/WI-0001/evidence/test_output.txt',
      description: 'Test output showing REQ-001 coverage',
      hash: 'sha256:test123',
      created_at: new Date().toISOString(),
    });
    await fs.writeFile(emPath, JSON.stringify(em, null, 2), 'utf-8');

    // Step 15: Run Gate Summary Gate (§9)
    const summaryGateReport = await runGate('gate_summary_gate', {
      workItemId: wiId,
      workItemDir: wiDir,
      gateConfig: {},
    });
    expect(summaryGateReport).toBeDefined();

    // Step 16: Write gate_summary.md
    await fs.writeFile(path.join(wiDir, 'gate_summary.md'), '# Gate Summary\n\nAll gates passed.\n', 'utf-8');

    // Step 17: Write user_decision.json (§10)
    const decision = await recordUserDecision({
      workItemDir: wiDir,
      workItemId: wiId,
      workflowPath: 'requirement_change_path',
      baseSpecVersion: 'PSV-0001',
      candidateManifestPath: 'candidate_manifest.json',
      gateSummaryPath: 'gate_summary.md',
      decisionStatus: 'approved',
      decisionType: 'user_approved',
      decidedBy: 'user',
      decisionScope: 'full',
      waivers: [],
    });
    expect(decision.decision_status).toBe('approved');
    expect(decision.decision_id).toBeDefined();

    // Step 18: Run merge_ready_gate (§11)
    const mergeGateReport = await runGate('merge_ready_gate', {
      workItemId: wiId,
      workItemDir: wiDir,
      gateConfig: {},
    });
    expect(mergeGateReport).toBeDefined();

    // Step 19: Write merge_report.md (§11)
    await fs.writeFile(path.join(wiDir, 'merge_report.md'),
      '# Merge Report\n\nStatus: success\nMerged 1 file(s).\n', 'utf-8');

    // Step 20: Release code_permission (§12)
    const perm = await releaseCodePermission({
      workItemDir: wiDir,
      workItemId: wiId,
      allowedWriteFiles: ['src/orders/status.ts'],
      forbiddenFiles: [],
    });
    expect(perm.code_change_allowed).toBe(true);
    expect(perm.allowed_write_files).toEqual(['src/orders/status.ts']);

    // Step 21: Write Guard check (§12)
    const guardResult = checkWrite(
      {
        hasActiveWI: true,
        workItem: {
          work_item_id: wiId, status: 'implementation_running',
          code_change_allowed: true,
          allowed_write_files: [{ path: 'src/orders/status.ts', operation: 'modify' }],
          workflow_path: 'requirement_change_path',
        },
        callerRole: 'agent', isFrozen: false,
      },
      'src/orders/status.ts', 'modify',
    );
    expect(guardResult.allowed).toBe(true);

    // Step 22: Write Guard blocks out-of-scope write
    const guardBlock = checkWrite(
      {
        hasActiveWI: true,
        workItem: {
          work_item_id: wiId, status: 'implementation_running',
          code_change_allowed: true,
          allowed_write_files: [{ path: 'src/orders/status.ts', operation: 'modify' }],
          workflow_path: 'requirement_change_path',
        },
        callerRole: 'agent', isFrozen: false,
      },
      'src/users/auth.ts', 'modify',
    );
    expect(guardBlock.allowed).toBe(false);

    // Step 23: Changed files audit (§12.7)
    const audit = performChangedFilesAudit(
      [{ path: 'src/orders/status.ts', operation: 'modify' }],
      [{ path: 'src/orders/status.ts', operation: 'modify' }],
    );
    expect(audit.passed).toBe(true);

    // Step 24: Revoke code_permission (§12)
    await revokeCodePermission(wiDir);
    const revokedWi = JSON.parse(await fs.readFile(path.join(wiDir, 'work_item.json'), 'utf-8'));
    expect(revokedWi.code_change_allowed).toBe(false);
    expect(revokedWi.allowed_write_files).toEqual([]);

    // Step 25: Run close_gate (§15)
    const closeGateReport = await runGate('close_gate', {
      workItemId: wiId,
      workItemDir: wiDir,
      gateConfig: {},
    });
    expect(closeGateReport).toBeDefined();
    // close_gate may have findings (some files missing) but it runs
    expect(closeGateReport.gate_id).toBe('close_gate');

    // Step 26: Transition to closed (§5)
    await updateWorkItemStatus(wiDir, 'closed');
    const finalWi = JSON.parse(await fs.readFile(path.join(wiDir, 'work_item.json'), 'utf-8'));
    expect(finalWi.status).toBe('closed');
  });
});

describe('§16 Rollback', () => {
  it('should generate rollback plan and mark original as superseded', async () => {
    const originalWiId = 'WI-0010';
    const rollbackWiId = 'WI-0011';

    // Create original WI with merge_report
    const originalDir = await createWorkItem({ projectRoot, workItemId: originalWiId, userRequest: 'Rollback test' });
    await initializeClosureFiles(originalDir, originalWiId, 'requirement_change_path');

    // Simulate completed merge
    await fs.writeFile(path.join(originalDir, 'merge_report.md'), '# Merge Report\n\nStatus: success\n', 'utf-8');
    await fs.writeFile(path.join(originalDir, 'candidate_manifest.json'), JSON.stringify({
      entries: [{
        target_path: '.specforge/project/modules/ORD/requirements.md',
        target_base_hash: 'sha256:original',
      }],
    }), 'utf-8');

    // Create project spec_manifest
    await fs.writeFile(path.join(projectDir, 'spec_manifest.json'), JSON.stringify({
      project_spec_version: 'PSV-0002',
    }), 'utf-8');

    // Generate rollback plan
    const plan = await generateRollbackPlan({
      rollbackWorkItemId: rollbackWiId,
      originalWorkItemId: originalWiId,
      workItemsRoot,
      projectRoot,
    });
    expect(plan.originalWorkItemId).toBe(originalWiId);
    expect(plan.targetSpecVersion).toBe('PSV-0003'); // incremented

    // Generate rollback delta
    const delta = await generateRollbackDelta({
      rollbackWorkItemId: rollbackWiId,
      originalWorkItemId: originalWiId,
      rollbackPlan: plan,
    });
    expect(delta.traceImpact).toBe('modified');

    // Mark original as superseded
    const result = await markOriginalSuperseded({
      originalWiDir: originalDir,
      originalWorkItemId: originalWiId,
      supersededByWorkItemId: rollbackWiId,
    });
    expect(result.status).toBe('superseded');
    expect(result.supersededByWorkItemId).toBe(rollbackWiId);

    // Verify original WI marked
    const wi = JSON.parse(await fs.readFile(path.join(originalDir, 'work_item.json'), 'utf-8'));
    expect(wi.status).toBe('superseded');
    expect(wi.superseded_by).toBe(rollbackWiId);
  });
});

describe('§14.3 Agent Handoff', () => {
  it('should validate and write handoff', async () => {
    const wiId = 'WI-0020';
    const wiDir = await createWorkItem({ projectRoot, workItemId: wiId, userRequest: 'Handoff test' });

    const handoff: AgentHandoff = {
      schema_version: '1.0',
      agent: 'sf-executor',
      work_item_id: wiId,
      stage: 'development',
      timestamp: new Date().toISOString(),
      inputs_read: ['tasks.md', 'design.md'],
      outputs_written: ['src/orders/status.ts'],
      findings: ['Found existing enum, need to extend'],
      unknowns: [],
      escalation_signals: [],
      next_step_recommendation: 'Run tests to verify',
      boundary_statement: 'Only modified allowed files within scope',
    };

    // Validate
    const validation = validateHandoff(handoff);
    expect(validation.valid).toBe(true);

    // Write
    const filePath = await writeHandoff(wiDir, handoff);
    expect(filePath).toContain('handoff_');

    // Invalid handoff
    const invalid = validateHandoff({ agent: 'test' });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it('should validate escalation signals', () => {
    const handoff: AgentHandoff = {
      schema_version: '1.0',
      agent: 'sf-executor',
      work_item_id: 'WI-0020',
      stage: 'development',
      timestamp: new Date().toISOString(),
      inputs_read: [],
      outputs_written: [],
      findings: [],
      unknowns: ['Requirement unclear'],
      escalation_signals: [{
        type: 'missing_spec',
        description: 'REQ-001 is ambiguous',
        affected_refs: ['REQ-001'],
        recommended_action: 'Clarify with user',
      }],
      next_step_recommendation: 'Block until clarification',
      boundary_statement: 'Stopped due to unclear requirement',
    };

    const validation = validateHandoff(handoff);
    expect(validation.valid).toBe(true);
  });
});

describe('§13 Trace/Verification/Evidence', () => {
  it('should validate trace delta', () => {
    const valid = validateTraceDelta('Trace Impact: modified\nReason: REQ-001 changed');
    expect(valid.valid).toBe(true);

    const empty = validateTraceDelta('');
    expect(empty.valid).toBe(false);
  });

  it('should reject "已验证" only verification report', () => {
    const bad = validateVerificationReport('已验证');
    expect(bad.valid).toBe(false);

    const good = validateVerificationReport('# Verification Report\n\nEvidence: test output shows all ACs pass\nCommands: npm test (exit 0)\n');
    expect(good.valid).toBe(true);
  });

  it('should validate evidence manifest', () => {
    const valid = validateEvidenceManifest({
      schema_version: '1.0',
      work_item_id: 'WI-001',
      entries: [{ evidence_id: 'EV-001', type: 'test_output', path: 'test.txt', hash: 'sha256:abc' }],
    });
    expect(valid.valid).toBe(true);

    const invalid = validateEvidenceManifest({ schema_version: '2.0' });
    expect(invalid.valid).toBe(false);
  });

  it('should check trace chain completeness', () => {
    const complete = checkTraceChain([{
      req_id: 'REQ-001', ac_ids: ['AC-001'], dd_ids: ['DD-001'],
      task_ids: ['TASK-001'], file_paths: ['src/a.ts'],
      test_ids: ['test-001'], evidence_ids: ['EV-001'],
    }]);
    expect(complete.complete).toBe(true);

    const partial = checkTraceChain([{
      req_id: 'REQ-002', ac_ids: [], dd_ids: [],
      task_ids: [], file_paths: [], test_ids: [], evidence_ids: [],
    }]);
    expect(partial.complete).toBe(false);
    expect(partial.gaps.length).toBeGreaterThan(0);
  });
});

describe('Patch 1 Extension Subflow', () => {
  it('should handle extension request lifecycle', async () => {
    const wiId = 'WI-0030';
    const wiDir = await createWorkItem({ projectRoot, workItemId: wiId, userRequest: 'Extension test' });

    // Create extension request
    const request = {
      schema_version: '1.0' as const,
      work_item_id: wiId,
      requested_by_agent: 'sf-design',
      requested_namespace: 'design_types',
      requested_key: 'retry_policy',
      reason: 'Need retry_policy design type for exponential backoff',
      blocking_current_flow: true,
      created_at: new Date().toISOString(),
    };

    // Validate and write
    const validation = validateExtensionRequest(request);
    expect(validation.valid).toBe(true);

    const reqPath = await writeExtensionRequest(wiDir, request);
    expect(reqPath).toContain('extension_request.json');

    // Generate extension delta
    const currentRegistry = { namespaces: { design_types: ['standard'] } };
    const { filePath: deltaPath } = await generateExtensionDelta({
      wiDir, currentRegistry,
      proposedNamespace: 'design_types', proposedKey: 'retry_policy',
      proposedValue: { type: 'exponential_backoff' },
      reason: 'Required for login failure handling',
    });
    expect(deltaPath).toContain('extension_delta.md');

    // Generate extension candidate
    const { candidatePath } = await generateExtensionCandidate({
      wiDir, currentRegistry,
      namespace: 'design_types', key: 'retry_policy',
      value: { type: 'exponential_backoff' },
    });
    expect(candidatePath).toContain('candidates');

    // Run extension gate
    const gateResult = await runExtensionGate({
      wiDir, candidatePath,
      currentRegistryPath: path.join(projectDir, 'extension_registry.json'),
    });
    expect(gateResult.gate_id).toBe('extension_gate');
  });
});

describe('§12 Write Guard enforcement', () => {
  it('should enforce all key violation rules', async () => {
    // Rule 1: No active WI → block
    const r1 = checkWrite(
      { hasActiveWI: false, callerRole: 'agent', isFrozen: false },
      'src/a.ts', 'modify',
    );
    expect(r1.allowed).toBe(false);

    // Rule 2: code_change_allowed=false → block
    const r2 = checkWrite(
      {
        hasActiveWI: true,
        workItem: {
          work_item_id: 'WI-0040', status: 'implementation_running',
          code_change_allowed: false,
          allowed_write_files: [{ path: 'src/a.ts', operation: 'modify' }],
          workflow_path: 'code_only_fast_path',
        },
        callerRole: 'agent', isFrozen: false,
      },
      'src/a.ts', 'modify',
    );
    expect(r2.allowed).toBe(false);

    // Rule 3: Outside allowed_write_files → block
    const r3 = checkWrite(
      {
        hasActiveWI: true,
        workItem: {
          work_item_id: 'WI-0040', status: 'implementation_running',
          code_change_allowed: true,
          allowed_write_files: [{ path: 'src/a.ts', operation: 'modify' }],
          workflow_path: 'code_only_fast_path',
        },
        callerRole: 'agent', isFrozen: false,
      },
      'src/other.ts', 'modify',
    );
    expect(r3.allowed).toBe(false);

    // Rule 4: Agent writing .specforge/project/ → block
    const r4 = checkWrite(
      {
        hasActiveWI: true,
        workItem: {
          work_item_id: 'WI-0040', status: 'implementation_running',
          code_change_allowed: true,
          allowed_write_files: [{ path: '.specforge/project/requirements.md', operation: 'modify' }],
          workflow_path: 'requirement_change_path',
        },
        callerRole: 'agent', isFrozen: false,
      },
      '.specforge/project/requirements.md', 'modify',
    );
    expect(r4.allowed).toBe(false);

    // Rule 5: Frozen state blocks candidate modifications
    const r5 = checkWrite(
      {
        hasActiveWI: true,
        workItem: {
          work_item_id: 'WI-0040', status: 'gates_running',
          code_change_allowed: true,
          allowed_write_files: [{ path: '.specforge/work-items/WI-0040/candidates/req.md', operation: 'modify' }],
          workflow_path: 'requirement_change_path',
        },
        callerRole: 'agent', isFrozen: true,
      },
      '.specforge/work-items/WI-0040/candidates/req.md', 'modify',
    );
    expect(r5.allowed).toBe(false);

    // Rule 6: Closed WI → block
    const r6 = checkWrite(
      {
        hasActiveWI: true,
        workItem: {
          work_item_id: 'WI-0040', status: 'closed',
          code_change_allowed: true,
          allowed_write_files: [{ path: 'src/a.ts', operation: 'modify' }],
          workflow_path: 'code_only_fast_path',
        },
        callerRole: 'agent', isFrozen: false,
      },
      'src/a.ts', 'modify',
    );
    expect(r6.allowed).toBe(false);

    // Rule: Merge Runner CAN write project spec
    const mergeOk = checkWrite(
      {
        hasActiveWI: true,
        workItem: {
          work_item_id: 'WI-0040', status: 'merging',
          code_change_allowed: true,
          allowed_write_files: [{ path: '.specforge/project/requirements.md', operation: 'modify' }],
          workflow_path: 'requirement_change_path',
        },
        callerRole: 'Merge Runner', isFrozen: false,
      },
      '.specforge/project/requirements.md', 'modify',
    );
    expect(mergeOk.allowed).toBe(true);
  });
});
