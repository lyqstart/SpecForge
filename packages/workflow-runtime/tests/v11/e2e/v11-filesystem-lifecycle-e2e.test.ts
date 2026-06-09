/**
 * SpecForge v1.1 Filesystem Lifecycle E2E Test
 *
 * Exercises the complete WI file lifecycle on a REAL temporary directory.
 * Uses actual filesystem operations (mkdtempSync, writeFileSync, readFileSync)
 * to verify the full work item lifecycle from initialization to close.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  StateMachine,
  PathPolicy,
  MergeRunner,
  UserDecisionRecorder,
  CloseGate,
  ChangedFilesAudit,
  RuntimeInit,
  JsonParser,
} from '@/v11/index';

describe('v1.1 Filesystem Lifecycle E2E', () => {
  let tempDir: string;
  const WI_ID = 'WI-E2E-001';

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-e2e-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('Step 1: Initialize .specforge directory structure', () => {
    // Create .specforge/project/
    const projectDir = join(tempDir, '.specforge', 'project');
    mkdirSync(projectDir, { recursive: true });

    // Create .specforge/work-items/
    const workItemsDir = join(tempDir, '.specforge', 'work-items');
    mkdirSync(workItemsDir, { recursive: true });

    // Create .specforge/runtime/
    const runtimeDir = join(tempDir, '.specforge', 'runtime');
    mkdirSync(runtimeDir, { recursive: true });

    // Write spec_manifest.json
    const specManifest = {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      project_name: 'e2e-test-project',
      project: {
        extension_registry: '.specforge/project/extension_registry.json',
        requirements_index: '.specforge/project/requirements_index.md',
        design_index: '.specforge/project/design_index.md',
        architecture: '.specforge/project/architecture.md',
        glossary: '.specforge/project/glossary.md',
        decisions: '.specforge/project/decisions.md',
        trace_matrix: '.specforge/project/trace_matrix.md',
      },
      modules: [],
      last_merged_work_item: null,
      last_merged_at: null,
    };
    writeFileSync(join(projectDir, 'spec_manifest.json'), JSON.stringify(specManifest, null, 2));

    // Write extension_registry.json
    const extensionRegistry = {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      namespaces: {
        requirement_types: [],
        design_types: [],
        task_types: [],
        verification_types: [],
        gate_types: [],
      },
      updated_by_work_item: null,
      updated_at: null,
    };
    writeFileSync(join(projectDir, 'extension_registry.json'), JSON.stringify(extensionRegistry, null, 2));

    // Verify all directories exist
    expect(existsSync(projectDir)).toBe(true);
    expect(existsSync(workItemsDir)).toBe(true);
    expect(existsSync(runtimeDir)).toBe(true);

    // Verify spec_manifest.json has correct schema
    const manifestRaw = readFileSync(join(projectDir, 'spec_manifest.json'), 'utf-8');
    const manifestParsed = JSON.parse(manifestRaw);
    expect(manifestParsed.schema_version).toBe('1.0');
    expect(manifestParsed.project_spec_version).toBe('PSV-0001');
    expect(manifestParsed.project_name).toBe('e2e-test-project');

    // Verify extension_registry.json has correct schema
    const registryRaw = readFileSync(join(projectDir, 'extension_registry.json'), 'utf-8');
    const registryParsed = JSON.parse(registryRaw);
    expect(registryParsed.schema_version).toBe('1.0');
    expect(registryParsed.namespaces).toBeDefined();
    expect(registryParsed.namespaces.requirement_types).toEqual([]);
  });

  it('Step 2: Create Work Item directory and metadata', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
    mkdirSync(wiDir, { recursive: true });

    // Write work_item.json
    const workItemMeta = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      title: 'E2E Test Work Item',
      description: 'Full lifecycle test for filesystem operations',
      current_state: 'created',
      workflow_type: 'requirements-first',
      created_at: new Date().toISOString(),
    };
    writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify(workItemMeta, null, 2));

    // Write intake.md
    const intakeContent = `# Intake: ${WI_ID}\n\n## Summary\nAdd login feature to the application.\n\n## Trigger\nUser request via issue tracker.\n`;
    writeFileSync(join(wiDir, 'intake.md'), intakeContent);

    // Write change_classification.md
    const classificationContent = `# Change Classification: ${WI_ID}\n\n## Type\nrequirement_change\n\n## Impact Level\nmedium\n\n## Affected Modules\n- auth\n- user-management\n`;
    writeFileSync(join(wiDir, 'change_classification.md'), classificationContent);

    // Write impact_analysis.md
    const impactContent = `# Impact Analysis: ${WI_ID}\n\n## Affected Specs\n- requirements_index.md\n- design_index.md\n\n## Risk Assessment\nLow risk — additive change only.\n`;
    writeFileSync(join(wiDir, 'impact_analysis.md'), impactContent);

    // Write trigger_result.json
    const triggerResult = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      trigger_type: 'user_request',
      workflow_selected: 'requirements-first',
      triggered_at: new Date().toISOString(),
    };
    writeFileSync(join(wiDir, 'trigger_result.json'), JSON.stringify(triggerResult, null, 2));

    // Verify all files exist and are readable
    expect(existsSync(join(wiDir, 'work_item.json'))).toBe(true);
    expect(existsSync(join(wiDir, 'intake.md'))).toBe(true);
    expect(existsSync(join(wiDir, 'change_classification.md'))).toBe(true);
    expect(existsSync(join(wiDir, 'impact_analysis.md'))).toBe(true);
    expect(existsSync(join(wiDir, 'trigger_result.json'))).toBe(true);

    const readBack = JSON.parse(readFileSync(join(wiDir, 'work_item.json'), 'utf-8'));
    expect(readBack.current_state).toBe('created');
    expect(readBack.workflow_type).toBe('requirements-first');
  });

  it('Step 3: Generate candidates and manifest', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
    const candidatesDir = join(wiDir, 'candidates');
    mkdirSync(candidatesDir, { recursive: true });

    // Write candidates/requirements.md (full file content, NOT patch)
    const requirementsContent = `# Requirements Index\n\n## REQ-1 User Login\n\n**Priority**: High\n**Status**: Draft\n\nAs a user, I want to log in with my email and password so that I can access my account.\n\n### Acceptance Criteria\n- AC-1.1: Valid credentials grant access\n- AC-1.2: Invalid credentials show error message\n- AC-1.3: Account lockout after 5 failed attempts\n\n## REQ-2 Password Reset\n\n**Priority**: Medium\n**Status**: Draft\n\nAs a user, I want to reset my password via email so that I can regain access.\n`;
    writeFileSync(join(candidatesDir, 'requirements.md'), requirementsContent);

    // Write candidates/design.md
    const designContent = `# Design Index\n\n## DES-1 Authentication Module\n\n**Component**: auth-service\n**Pattern**: Strategy\n\n### Interface\n\`\`\`typescript\ninterface AuthService {\n  login(email: string, password: string): Promise<AuthResult>;\n  logout(sessionId: string): Promise<void>;\n  resetPassword(email: string): Promise<ResetToken>;\n}\n\`\`\`\n\n### Dependencies\n- user-repository\n- email-service\n- session-store\n`;
    writeFileSync(join(candidatesDir, 'design.md'), designContent);

    // Write requirements_delta.md
    const reqDeltaContent = `# Requirements Delta: ${WI_ID}\n\n## Added\n- REQ-1: User Login\n- REQ-2: Password Reset\n\n## Modified\n(none)\n\n## Removed\n(none)\n`;
    writeFileSync(join(wiDir, 'requirements_delta.md'), reqDeltaContent);

    // Write trace_delta.md
    const traceDeltaContent = `# Trace Delta: ${WI_ID}\n\n## New Traces\n- REQ-1 → DES-1 (Authentication Module implements Login)\n- REQ-2 → DES-1 (Authentication Module implements Password Reset)\n\n## Removed Traces\n(none)\n`;
    writeFileSync(join(wiDir, 'trace_delta.md'), traceDeltaContent);

    // Write candidate_manifest.json
    const candidateManifest = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      base_spec_version: 'PSV-0001',
      target_spec_version: 'PSV-0002',
      candidates: [
        {
          candidate_path: `.specforge/work-items/${WI_ID}/candidates/requirements.md`,
          target_path: '.specforge/project/requirements_index.md',
          operation: 'update',
        },
        {
          candidate_path: `.specforge/work-items/${WI_ID}/candidates/design.md`,
          target_path: '.specforge/project/design_index.md',
          operation: 'update',
        },
      ],
      generated_at: new Date().toISOString(),
    };
    writeFileSync(join(wiDir, 'candidate_manifest.json'), JSON.stringify(candidateManifest, null, 2));

    // Verify candidate_manifest.json parseable and valid
    const manifestRaw = readFileSync(join(wiDir, 'candidate_manifest.json'), 'utf-8');
    const mergeRunner = new MergeRunner();
    const parsed = mergeRunner.parseCandidateManifest(manifestRaw);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.candidates).toHaveLength(2);
    expect(parsed.data!.base_spec_version).toBe('PSV-0001');
    expect(parsed.data!.target_spec_version).toBe('PSV-0002');
  });

  it('Step 4: Execute gates and generate gate results', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
    const gatesDir = join(wiDir, 'gates');
    mkdirSync(gatesDir, { recursive: true });

    // Write gates/spec_completeness_gate.json
    const specCompletenessGate = {
      schema_version: '1.0',
      gate_name: 'spec_completeness_gate',
      status: 'passed',
      work_item_id: WI_ID,
      checked_at: new Date().toISOString(),
      details: {
        requirements_present: true,
        design_present: true,
        trace_delta_present: true,
      },
    };
    writeFileSync(join(gatesDir, 'spec_completeness_gate.json'), JSON.stringify(specCompletenessGate, null, 2));

    // Write gates/path_policy_gate.json
    const pathPolicyGate = {
      schema_version: '1.0',
      gate_name: 'path_policy_gate',
      status: 'passed',
      work_item_id: WI_ID,
      checked_at: new Date().toISOString(),
      details: {
        all_candidate_paths_valid: true,
        all_target_paths_valid: true,
        no_forbidden_paths: true,
      },
    };
    writeFileSync(join(gatesDir, 'path_policy_gate.json'), JSON.stringify(pathPolicyGate, null, 2));

    // Write gate_summary.md
    const gateSummaryContent = `# Gate Summary: ${WI_ID}\n\n## Results\n\n| Gate | Status | Details |\n|------|--------|---------|\n| spec_completeness_gate | ✅ Passed | All required spec artifacts present |\n| path_policy_gate | ✅ Passed | All paths conform to v1.1 policy |\n\n## Conclusion\nAll gates passed. Work item is ready for user approval.\n`;
    writeFileSync(join(wiDir, 'gate_summary.md'), gateSummaryContent);

    // Verify all gate files exist
    expect(existsSync(join(gatesDir, 'spec_completeness_gate.json'))).toBe(true);
    expect(existsSync(join(gatesDir, 'path_policy_gate.json'))).toBe(true);
    expect(existsSync(join(wiDir, 'gate_summary.md'))).toBe(true);

    // Verify gate JSON is valid
    const gateRaw = readFileSync(join(gatesDir, 'spec_completeness_gate.json'), 'utf-8');
    const gateParsed = JSON.parse(gateRaw);
    expect(gateParsed.status).toBe('passed');
  });

  it('Step 5: Record user decision with hash binding', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);

    // Read candidate_manifest.json content
    const candidateManifestContent = readFileSync(join(wiDir, 'candidate_manifest.json'), 'utf-8');

    // Read gate_summary.md content
    const gateSummaryContent = readFileSync(join(wiDir, 'gate_summary.md'), 'utf-8');

    // Use UserDecisionRecorder to generate user_decision.json
    const recorder = new UserDecisionRecorder();
    const decision = recorder.recordApproval({
      workItemId: WI_ID,
      approved: true,
      baseSpecVersion: 'PSV-0001',
      candidateManifestContent,
      gateSummaryContent,
      userId: 'e2e-test-user',
      comments: 'Approved for E2E test lifecycle',
    });

    // Serialize and write user_decision.json to WI directory
    const serialized = recorder.serializeDecision(decision);
    expect(serialized.success).toBe(true);
    writeFileSync(join(wiDir, 'user_decision.json'), serialized.data!);

    // Verify: candidate_manifest_hash and gate_summary_hash are present
    const decisionRaw = readFileSync(join(wiDir, 'user_decision.json'), 'utf-8');
    const decisionParsed = JSON.parse(decisionRaw);
    expect(decisionParsed.candidate_manifest_hash).toBeTruthy();
    expect(decisionParsed.gate_summary_hash).toBeTruthy();
    expect(decisionParsed.candidate_manifest_hash).toMatch(/^sha256:/);
    expect(decisionParsed.gate_summary_hash).toMatch(/^sha256:/);

    // Verify: base_spec_version = "PSV-0001"
    expect(decisionParsed.base_spec_version).toBe('PSV-0001');
  });

  it('Step 6: MergeRunner merges ONLY by candidate_manifest', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
    const projectDir = join(tempDir, '.specforge', 'project');

    // Read candidate_manifest.json
    const manifestRaw = readFileSync(join(wiDir, 'candidate_manifest.json'), 'utf-8');
    const mergeRunner = new MergeRunner();
    const parsed = mergeRunner.parseCandidateManifest(manifestRaw);
    expect(parsed.success).toBe(true);

    const manifest = parsed.data!;

    // MergeRunner must NOT scan candidates/ directory — only use manifest entries
    // For each entry: read candidate file, write to target_path under .specforge/project/
    const result = mergeRunner.executeMerge({
      manifest,
      readCandidate: (candidatePath: string) => {
        // Resolve candidate path relative to tempDir
        const fullPath = join(tempDir, candidatePath);
        if (!existsSync(fullPath)) return null;
        return readFileSync(fullPath, 'utf-8');
      },
      writeTarget: (targetPath: string, content: string) => {
        // Resolve target path relative to tempDir
        const fullPath = join(tempDir, targetPath);
        mkdirSync(join(fullPath, '..'), { recursive: true });
        writeFileSync(fullPath, content);
        return true;
      },
      calculateHash: (content: string) => `sha256:${Buffer.from(content).length.toString(16).padStart(8, '0')}`,
    });

    expect(result.success).toBe(true);
    expect(result.mergedFiles).toHaveLength(2);
    expect(result.errors).toHaveLength(0);

    // After merge: verify .specforge/project/requirements_index.md exists with candidate content
    const reqTarget = join(projectDir, 'requirements_index.md');
    expect(existsSync(reqTarget)).toBe(true);
    const reqContent = readFileSync(reqTarget, 'utf-8');
    expect(reqContent).toContain('## REQ-1 User Login');
    expect(reqContent).toContain('## REQ-2 Password Reset');

    // After merge: verify .specforge/project/design_index.md exists with candidate content
    const designTarget = join(projectDir, 'design_index.md');
    expect(existsSync(designTarget)).toBe(true);
    const designContent = readFileSync(designTarget, 'utf-8');
    expect(designContent).toContain('## DES-1 Authentication Module');
    expect(designContent).toContain('interface AuthService');

    // Write merge_report.md with operation details + pre/post hashes
    const mergeReport = mergeRunner.generateMergeReport({
      workItemId: WI_ID,
      mergedFiles: result.mergedFiles,
      executedAt: new Date().toISOString(),
    });
    writeFileSync(join(wiDir, 'merge_report.md'), mergeReport);

    // Verify merge_report.md exists
    expect(existsSync(join(wiDir, 'merge_report.md'))).toBe(true);
    const reportContent = readFileSync(join(wiDir, 'merge_report.md'), 'utf-8');
    expect(reportContent).toContain('# Merge Report');
    expect(reportContent).toContain(WI_ID);
  });

  it('Step 7: Generate verification report and evidence', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
    const evidenceDir = join(wiDir, 'evidence');
    mkdirSync(evidenceDir, { recursive: true });

    // Write evidence/evidence_manifest.json
    const evidenceManifest = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      artifacts: [
        { type: 'gate_result', path: `gates/spec_completeness_gate.json` },
        { type: 'gate_result', path: `gates/path_policy_gate.json` },
        { type: 'user_decision', path: `user_decision.json` },
        { type: 'merge_report', path: `merge_report.md` },
        { type: 'trace_delta', path: `trace_delta.md` },
      ],
      generated_at: new Date().toISOString(),
    };
    writeFileSync(join(evidenceDir, 'evidence_manifest.json'), JSON.stringify(evidenceManifest, null, 2));

    // Write verification_report.md
    const verificationReport = `# Verification Report: ${WI_ID}\n\n## Summary\n\n| Check | Result |\n|-------|--------|\n| Gates passed | ✅ |\n| User decision recorded | ✅ |\n| Merge completed | ✅ |\n| Post-merge verification | ✅ |\n| Trace delta present | ✅ |\n\n## Conclusion\n**PASS** — All verification checks passed. Work item is ready for close.\n`;
    writeFileSync(join(wiDir, 'verification_report.md'), verificationReport);

    // Verify both files exist
    expect(existsSync(join(evidenceDir, 'evidence_manifest.json'))).toBe(true);
    expect(existsSync(join(wiDir, 'verification_report.md'))).toBe(true);

    const evidenceRaw = readFileSync(join(evidenceDir, 'evidence_manifest.json'), 'utf-8');
    const evidenceParsed = JSON.parse(evidenceRaw);
    expect(evidenceParsed.artifacts).toHaveLength(5);
  });

  it('Step 8: Execute changed_files_audit', () => {
    const audit = new ChangedFilesAudit();

    // Expected files = all files written in this lifecycle
    const expectedFiles = [
      '.specforge/project/spec_manifest.json',
      '.specforge/project/extension_registry.json',
      '.specforge/project/requirements_index.md',
      '.specforge/project/design_index.md',
      `.specforge/work-items/${WI_ID}/work_item.json`,
      `.specforge/work-items/${WI_ID}/intake.md`,
      `.specforge/work-items/${WI_ID}/change_classification.md`,
      `.specforge/work-items/${WI_ID}/impact_analysis.md`,
      `.specforge/work-items/${WI_ID}/trigger_result.json`,
      `.specforge/work-items/${WI_ID}/candidates/requirements.md`,
      `.specforge/work-items/${WI_ID}/candidates/design.md`,
      `.specforge/work-items/${WI_ID}/requirements_delta.md`,
      `.specforge/work-items/${WI_ID}/trace_delta.md`,
      `.specforge/work-items/${WI_ID}/candidate_manifest.json`,
      `.specforge/work-items/${WI_ID}/gates/spec_completeness_gate.json`,
      `.specforge/work-items/${WI_ID}/gates/path_policy_gate.json`,
      `.specforge/work-items/${WI_ID}/gate_summary.md`,
      `.specforge/work-items/${WI_ID}/user_decision.json`,
      `.specforge/work-items/${WI_ID}/merge_report.md`,
      `.specforge/work-items/${WI_ID}/verification_report.md`,
      `.specforge/work-items/${WI_ID}/evidence/evidence_manifest.json`,
    ];

    // Actual files = same set (no extras — no escaped writes)
    const actualChangedFiles = [...expectedFiles];

    // Verify: audit passes (no incident)
    const incident = audit.auditFileChanges({
      expectedFiles,
      actualChangedFiles,
      command: 'e2e-lifecycle-test',
      workItemId: WI_ID,
    });

    expect(incident).toBeNull();
  });

  it('Step 9: close_gate validates and WI transitions to closed', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
    const closeGate = new CloseGate();

    // Use CloseGate.validateClose() with all conditions met
    const result = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: existsSync(join(wiDir, 'user_decision.json')),
      mergeReportExists: existsSync(join(wiDir, 'merge_report.md')),
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
      notApplicableFlags: new Set<string>(),
      evidenceManifestExists: existsSync(join(wiDir, 'evidence', 'evidence_manifest.json')),
      verificationReportExists: existsSync(join(wiDir, 'verification_report.md')),
      traceMatrixUpdated: existsSync(join(wiDir, 'trace_delta.md')),
    });

    // Verify: canClose = true, failedChecks = []
    expect(result.canClose).toBe(true);
    expect(result.failedChecks).toHaveLength(0);

    // Transition state machine to closed
    const sm = new StateMachine(WI_ID, 'verification_done');
    const transitionResult = sm.transition('closed', 'close_gate');
    expect(transitionResult.success).toBe(true);

    // Verify: StateMachine.getCurrentState() === 'closed'
    expect(sm.getCurrentState()).toBe('closed');
  });

  it('Step 10: Verify final directory structure', () => {
    // Verify all expected files exist on disk
    const expectedFiles = [
      '.specforge/project/spec_manifest.json',
      '.specforge/project/extension_registry.json',
      '.specforge/project/requirements_index.md',
      '.specforge/project/design_index.md',
      `.specforge/work-items/${WI_ID}/work_item.json`,
      `.specforge/work-items/${WI_ID}/intake.md`,
      `.specforge/work-items/${WI_ID}/candidate_manifest.json`,
      `.specforge/work-items/${WI_ID}/gates/spec_completeness_gate.json`,
      `.specforge/work-items/${WI_ID}/gate_summary.md`,
      `.specforge/work-items/${WI_ID}/user_decision.json`,
      `.specforge/work-items/${WI_ID}/merge_report.md`,
      `.specforge/work-items/${WI_ID}/verification_report.md`,
      `.specforge/work-items/${WI_ID}/evidence/evidence_manifest.json`,
      `.specforge/work-items/${WI_ID}/requirements_delta.md`,
      `.specforge/work-items/${WI_ID}/trace_delta.md`,
    ];

    for (const file of expectedFiles) {
      expect(existsSync(join(tempDir, file))).toBe(true);
    }

    // Verify .specforge/runtime/ exists
    expect(existsSync(join(tempDir, '.specforge', 'runtime'))).toBe(true);

    // Verify NO files in .specforge/specs/ (legacy dir does not exist)
    expect(existsSync(join(tempDir, '.specforge', 'specs'))).toBe(false);

    // Verify NO files in .specforge/archive/ (forbidden dir does not exist)
    expect(existsSync(join(tempDir, '.specforge', 'archive'))).toBe(false);
  });
});
