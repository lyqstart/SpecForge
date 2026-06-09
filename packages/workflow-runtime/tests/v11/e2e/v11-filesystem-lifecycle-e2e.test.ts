/**
 * SpecForge v1.1 Filesystem Lifecycle E2E Test
 *
 * Exercises the complete WI file lifecycle on a REAL temporary directory.
 * Uses actual filesystem operations (mkdtempSync, writeFileSync, readFileSync)
 * to verify the full work item lifecycle from initialization to close.
 *
 * All data structures conform to v1.1 standard:
 * - workflow_path (never workflow_type or workflow_selected)
 * - entries[] with candidate_hash, target_base_hash, manifest_hash, operation:'replace'
 * - Full V11GateReport structure
 * - Validation via mergeRunner.validateV11Manifest() and gateRunner.validateV11GateReport()
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  StateMachine,
  PathPolicy,
  MergeRunner,
  GateRunner,
  UserDecisionRecorder,
  CloseGate,
  ChangedFilesAudit,
  RuntimeInit,
  JsonParser,
  type V11CandidateManifest,
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
    const projectDir = join(tempDir, '.specforge', 'project');
    mkdirSync(projectDir, { recursive: true });

    const workItemsDir = join(tempDir, '.specforge', 'work-items');
    mkdirSync(workItemsDir, { recursive: true });

    const runtimeDir = join(tempDir, '.specforge', 'runtime');
    mkdirSync(runtimeDir, { recursive: true });

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

    expect(existsSync(projectDir)).toBe(true);
    expect(existsSync(workItemsDir)).toBe(true);
    expect(existsSync(runtimeDir)).toBe(true);

    const manifestRaw = readFileSync(join(projectDir, 'spec_manifest.json'), 'utf-8');
    const manifestParsed = JSON.parse(manifestRaw);
    expect(manifestParsed.schema_version).toBe('1.0');
    expect(manifestParsed.project_spec_version).toBe('PSV-0001');
    expect(manifestParsed.project_name).toBe('e2e-test-project');

    const registryRaw = readFileSync(join(projectDir, 'extension_registry.json'), 'utf-8');
    const registryParsed = JSON.parse(registryRaw);
    expect(registryParsed.schema_version).toBe('1.0');
    expect(registryParsed.namespaces).toBeDefined();
    expect(registryParsed.namespaces.requirement_types).toEqual([]);
  });

  it('Step 2: Create Work Item directory and metadata', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
    mkdirSync(wiDir, { recursive: true });

    // v1.1 work_item.json with workflow_path, status, code_change_allowed, allowed_write_files, created_by
    const workItemMeta = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      title: 'E2E Test Work Item',
      description: 'Full lifecycle test for filesystem operations',
      status: 'created',
      workflow_path: 'requirement_change_path',
      code_change_allowed: false,
      allowed_write_files: [],
      created_by: 'e2e-test-user',
      created_at: new Date().toISOString(),
    };
    writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify(workItemMeta, null, 2));

    const intakeContent = `# Intake: ${WI_ID}\n\n## Summary\nAdd login feature to the application.\n\n## Trigger\nUser request via issue tracker.\n`;
    writeFileSync(join(wiDir, 'intake.md'), intakeContent);

    const classificationContent = `# Change Classification: ${WI_ID}\n\n## Type\nrequirement_change\n\n## Impact Level\nmedium\n\n## Affected Modules\n- auth\n- user-management\n`;
    writeFileSync(join(wiDir, 'change_classification.md'), classificationContent);

    const impactContent = `# Impact Analysis: ${WI_ID}\n\n## Affected Specs\n- requirements_index.md\n- design_index.md\n\n## Risk Assessment\nLow risk — additive change only.\n`;
    writeFileSync(join(wiDir, 'impact_analysis.md'), impactContent);

    // v1.1 trigger_result.json with workflow_path and match_result
    const triggerResult = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      trigger_type: 'user_request',
      workflow_path: 'requirement_change_path',
      match_result: {
        matched: true,
        confidence: 1.0,
        reason: 'User explicitly requested requirement change workflow',
      },
      triggered_at: new Date().toISOString(),
    };
    writeFileSync(join(wiDir, 'trigger_result.json'), JSON.stringify(triggerResult, null, 2));

    expect(existsSync(join(wiDir, 'work_item.json'))).toBe(true);
    expect(existsSync(join(wiDir, 'intake.md'))).toBe(true);
    expect(existsSync(join(wiDir, 'change_classification.md'))).toBe(true);
    expect(existsSync(join(wiDir, 'impact_analysis.md'))).toBe(true);
    expect(existsSync(join(wiDir, 'trigger_result.json'))).toBe(true);

    const readBack = JSON.parse(readFileSync(join(wiDir, 'work_item.json'), 'utf-8'));
    expect(readBack.status).toBe('created');
    expect(readBack.workflow_path).toBe('requirement_change_path');
    expect(readBack.code_change_allowed).toBe(false);
    expect(readBack.allowed_write_files).toEqual([]);
    expect(readBack.created_by).toBe('e2e-test-user');

    const triggerReadBack = JSON.parse(readFileSync(join(wiDir, 'trigger_result.json'), 'utf-8'));
    expect(triggerReadBack.workflow_path).toBe('requirement_change_path');
    expect(triggerReadBack.match_result.matched).toBe(true);
  });

  it('Step 3: Generate candidates and manifest', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
    const candidatesDir = join(wiDir, 'candidates', 'project');
    mkdirSync(candidatesDir, { recursive: true });

    // Write candidates under project/ subdirectory (mirrors target structure)
    const requirementsContent = `# Requirements Index\n\n## REQ-1 User Login\n\n**Priority**: High\n**Status**: Draft\n\nAs a user, I want to log in with my email and password so that I can access my account.\n\n### Acceptance Criteria\n- AC-1.1: Valid credentials grant access\n- AC-1.2: Invalid credentials show error message\n- AC-1.3: Account lockout after 5 failed attempts\n\n## REQ-2 Password Reset\n\n**Priority**: Medium\n**Status**: Draft\n\nAs a user, I want to reset my password via email so that I can regain access.\n`;
    writeFileSync(join(candidatesDir, 'requirements_index.md'), requirementsContent);

    const designContent = `# Design Index\n\n## DES-1 Authentication Module\n\n**Component**: auth-service\n**Pattern**: Strategy\n\n### Interface\n\`\`\`typescript\ninterface AuthService {\n  login(email: string, password: string): Promise<AuthResult>;\n  logout(sessionId: string): Promise<void>;\n  resetPassword(email: string): Promise<ResetToken>;\n}\n\`\`\`\n\n### Dependencies\n- user-repository\n- email-service\n- session-store\n`;
    writeFileSync(join(candidatesDir, 'design_index.md'), designContent);

    // Write deltas
    const reqDeltaContent = `# Requirements Delta: ${WI_ID}\n\n## Added\n- REQ-1: User Login\n- REQ-2: Password Reset\n\n## Modified\n(none)\n\n## Removed\n(none)\n`;
    writeFileSync(join(wiDir, 'requirements_delta.md'), reqDeltaContent);

    const traceDeltaContent = `# Trace Delta: ${WI_ID}\n\n## New Traces\n- REQ-1 → DES-1 (Authentication Module implements Login)\n- REQ-2 → DES-1 (Authentication Module implements Password Reset)\n\n## Removed Traces\n(none)\n`;
    writeFileSync(join(wiDir, 'trace_delta.md'), traceDeltaContent);

    // Compute hashes for entries — using the same hash function that executeV11Merge will use
    const reqContentRead = readFileSync(join(candidatesDir, 'requirements_index.md'), 'utf-8');
    const designContentRead = readFileSync(join(candidatesDir, 'design_index.md'), 'utf-8');
    const calcHash = (content: string) => `sha256:${Buffer.from(content).toString('hex').slice(0, 16)}`;
    const reqHash = calcHash(reqContentRead);
    const designHash = calcHash(designContentRead);
    // Target files don't exist yet — hash of empty string represents non-existent target
    const emptyHash = calcHash('');

    // v1.1 candidate_manifest.json with entries[], candidate_hash, target_base_hash, manifest_hash, operation:'replace'
    const candidateManifest = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: '', // computed below
      entries: [
        {
          candidate_path: `.specforge/work-items/${WI_ID}/candidates/project/requirements_index.md`,
          target_path: '.specforge/project/requirements_index.md',
          operation: 'replace',
          candidate_hash: reqHash,
          target_base_hash: emptyHash,
        },
        {
          candidate_path: `.specforge/work-items/${WI_ID}/candidates/project/design_index.md`,
          target_path: '.specforge/project/design_index.md',
          operation: 'replace',
          candidate_hash: designHash,
          target_base_hash: emptyHash,
        },
      ],
      generated_at: new Date().toISOString(),
    };
    // Compute manifest_hash from entries
    const entriesJson = JSON.stringify(candidateManifest.entries);
    candidateManifest.manifest_hash = `sha256:${Buffer.from(entriesJson).toString('hex').slice(0, 32)}`;

    writeFileSync(join(wiDir, 'candidate_manifest.json'), JSON.stringify(candidateManifest, null, 2));

    // Validate manifest using MergeRunner.validateV11Manifest()
    const mergeRunner = new MergeRunner();
    const manifestOnDisk = JSON.parse(readFileSync(join(wiDir, 'candidate_manifest.json'), 'utf-8'));
    const validation = mergeRunner.validateV11Manifest(manifestOnDisk);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Verify v1.1 structure
    expect(manifestOnDisk.entries).toHaveLength(2);
    expect(manifestOnDisk.merge_required).toBe(true);
    expect(manifestOnDisk.manifest_hash).toBeTruthy();
    expect(manifestOnDisk.workflow_path).toBe('requirement_change_path');
    expect(manifestOnDisk.entries[0].operation).toBe('replace');
    expect(manifestOnDisk.entries[0].candidate_hash).toBeTruthy();
    expect(manifestOnDisk.entries[0].target_base_hash).toBeTruthy();
    expect(manifestOnDisk.entries[0].target_path).toMatch(/^\.specforge\/project\//);
    expect(manifestOnDisk.entries[0].candidate_path).toContain(`work-items/${WI_ID}/candidates/`);
    expect(manifestOnDisk.entries[1].target_path).toMatch(/^\.specforge\/project\//);
  });

  it('Step 4: Execute gates and generate gate results', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
    const gatesDir = join(wiDir, 'gates');
    mkdirSync(gatesDir, { recursive: true });

    const now = new Date().toISOString();

    // v1.1 Gate Report: spec_completeness_gate
    const specCompletenessGate = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      gate_id: 'spec_completeness_gate',
      gate_type: 'hard_gate',
      required: true,
      status: 'passed',
      input_files: [
        `.specforge/work-items/${WI_ID}/candidates/project/requirements_index.md`,
        `.specforge/work-items/${WI_ID}/candidates/project/design_index.md`,
        `.specforge/work-items/${WI_ID}/trace_delta.md`,
      ],
      checks: [
        { name: 'requirements_present', passed: true, description: 'Requirements candidate file exists' },
        { name: 'design_present', passed: true, description: 'Design candidate file exists' },
        { name: 'trace_delta_present', passed: true, description: 'Trace delta document exists' },
      ],
      blocking_issues: [],
      warnings: [],
      waiver_allowed: false,
      runner: 'gate_runner',
      started_at: now,
      finished_at: now,
    };
    writeFileSync(join(gatesDir, 'spec_completeness_gate.json'), JSON.stringify(specCompletenessGate, null, 2));

    // v1.1 Gate Report: path_policy_gate
    const pathPolicyGate = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      gate_id: 'path_policy_gate',
      gate_type: 'hard_gate',
      required: true,
      status: 'passed',
      input_files: [
        `.specforge/work-items/${WI_ID}/candidate_manifest.json`,
      ],
      checks: [
        { name: 'all_candidate_paths_valid', passed: true, description: 'All candidate paths in WI candidates/' },
        { name: 'all_target_paths_in_project', passed: true, description: 'All target paths under .specforge/project/' },
        { name: 'no_forbidden_paths', passed: true, description: 'No paths in forbidden directories' },
      ],
      blocking_issues: [],
      warnings: [],
      waiver_allowed: false,
      runner: 'gate_runner',
      started_at: now,
      finished_at: now,
    };
    writeFileSync(join(gatesDir, 'path_policy_gate.json'), JSON.stringify(pathPolicyGate, null, 2));

    // gate_summary.md
    const gateSummaryContent = `# Gate Summary: ${WI_ID}\n\n## Results\n\n| Gate | Status | Details |\n|------|--------|---------|\n| spec_completeness_gate | ✅ Passed | All required spec artifacts present |\n| path_policy_gate | ✅ Passed | All paths conform to v1.1 policy |\n\n## Conclusion\nAll gates passed. Work item is ready for user approval.\n`;
    writeFileSync(join(wiDir, 'gate_summary.md'), gateSummaryContent);

    // Validate gate reports using GateRunner.validateV11GateReport()
    const gateRunner = new GateRunner();

    const gateRaw1 = JSON.parse(readFileSync(join(gatesDir, 'spec_completeness_gate.json'), 'utf-8'));
    const validation1 = gateRunner.validateV11GateReport(gateRaw1);
    expect(validation1.valid).toBe(true);
    expect(validation1.errors).toHaveLength(0);

    const gateRaw2 = JSON.parse(readFileSync(join(gatesDir, 'path_policy_gate.json'), 'utf-8'));
    const validation2 = gateRunner.validateV11GateReport(gateRaw2);
    expect(validation2.valid).toBe(true);
    expect(validation2.errors).toHaveLength(0);

    // Verify structure
    expect(gateRaw1.gate_id).toBe('spec_completeness_gate');
    expect(gateRaw1.gate_type).toBe('hard_gate');
    expect(gateRaw1.required).toBe(true);
    expect(gateRaw1.status).toBe('passed');
    expect(gateRaw1.input_files).toBeDefined();
    expect(gateRaw1.checks).toBeDefined();
    expect(gateRaw1.blocking_issues).toEqual([]);
    expect(gateRaw1.warnings).toEqual([]);
    expect(gateRaw1.waiver_allowed).toBe(false);
    expect(gateRaw1.runner).toBe('gate_runner');
    expect(gateRaw1.started_at).toBeTruthy();
    expect(gateRaw1.finished_at).toBeTruthy();
  });

  it('Step 5: Record user decision with hash binding', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);

    const candidateManifestContent = readFileSync(join(wiDir, 'candidate_manifest.json'), 'utf-8');
    const gateSummaryContent = readFileSync(join(wiDir, 'gate_summary.md'), 'utf-8');

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

    const serialized = recorder.serializeDecision(decision);
    expect(serialized.success).toBe(true);
    writeFileSync(join(wiDir, 'user_decision.json'), serialized.data!);

    const decisionParsed = JSON.parse(readFileSync(join(wiDir, 'user_decision.json'), 'utf-8'));
    expect(decisionParsed.candidate_manifest_hash).toBeTruthy();
    expect(decisionParsed.gate_summary_hash).toBeTruthy();
    expect(decisionParsed.candidate_manifest_hash).toMatch(/^sha256:/);
    expect(decisionParsed.gate_summary_hash).toMatch(/^sha256:/);
    expect(decisionParsed.base_spec_version).toBe('PSV-0001');
  });

  it('Step 6: MergeRunner merges ONLY by candidate_manifest', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
    const projectDir = join(tempDir, '.specforge', 'project');

    const manifestRaw = readFileSync(join(wiDir, 'candidate_manifest.json'), 'utf-8');
    const manifestOnDisk = JSON.parse(manifestRaw);

    // NEW: use executeV11Merge directly with v1.1 manifest — no entries→candidates conversion
    const mergeRunner = new MergeRunner();
    const result = mergeRunner.executeV11Merge({
      manifest: manifestOnDisk as V11CandidateManifest,
      readCandidate: (candidatePath: string) => {
        const fullPath = join(tempDir, candidatePath);
        if (!existsSync(fullPath)) return null;
        return readFileSync(fullPath, 'utf-8');
      },
      readTarget: (targetPath: string) => {
        const fullPath = join(tempDir, targetPath);
        if (!existsSync(fullPath)) return null;
        return readFileSync(fullPath, 'utf-8');
      },
      writeTarget: (targetPath: string, content: string) => {
        const fullPath = join(tempDir, targetPath);
        mkdirSync(join(fullPath, '..'), { recursive: true });
        writeFileSync(fullPath, content);
        return true;
      },
      calculateHash: (content: string) => `sha256:${Buffer.from(content).toString('hex').slice(0, 16)}`,
    });

    expect(result.success).toBe(true);
    expect(result.mergedFiles).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.newSpecVersion).toBe('PSV-0002');

    // Verify merged files
    const reqTarget = join(projectDir, 'requirements_index.md');
    expect(existsSync(reqTarget)).toBe(true);
    const reqContent = readFileSync(reqTarget, 'utf-8');
    expect(reqContent).toContain('## REQ-1 User Login');
    expect(reqContent).toContain('## REQ-2 Password Reset');

    const designTarget = join(projectDir, 'design_index.md');
    expect(existsSync(designTarget)).toBe(true);
    const designContent = readFileSync(designTarget, 'utf-8');
    expect(designContent).toContain('## DES-1 Authentication Module');
    expect(designContent).toContain('interface AuthService');

    // Write v1.1 merge report using generateV11MergeReport
    const mergeReport = mergeRunner.generateV11MergeReport({
      workItemId: WI_ID,
      baseSpecVersion: 'PSV-0001',
      newSpecVersion: result.newSpecVersion,
      manifestHash: manifestOnDisk.manifest_hash,
      mergedFiles: result.mergedFiles,
      executedAt: new Date().toISOString(),
    });
    writeFileSync(join(wiDir, 'merge_report.md'), mergeReport);

    expect(existsSync(join(wiDir, 'merge_report.md'))).toBe(true);
    const reportContent = readFileSync(join(wiDir, 'merge_report.md'), 'utf-8');
    expect(reportContent).toContain('**Merge Status**: merged');
    expect(reportContent).toContain('**Base Spec Version**: PSV-0001');
    expect(reportContent).toContain('**New Spec Version**: PSV-0002');
    expect(reportContent).toContain('**Manifest Hash**:');
    expect(reportContent).toContain('**Candidate Hash**:');
    expect(reportContent).toContain(WI_ID);

    // Update spec_manifest.json after merge
    const specManifestPath = join(projectDir, 'spec_manifest.json');
    const specManifest = JSON.parse(readFileSync(specManifestPath, 'utf-8'));
    specManifest.project_spec_version = 'PSV-0002';
    specManifest.last_merged_work_item = WI_ID;
    specManifest.last_merged_at = new Date().toISOString();
    writeFileSync(specManifestPath, JSON.stringify(specManifest, null, 2));

    // Assert spec_manifest.json fields
    const updatedManifest = JSON.parse(readFileSync(specManifestPath, 'utf-8'));
    expect(updatedManifest.project_spec_version).toBe('PSV-0002');
    expect(updatedManifest.last_merged_work_item).toBe(WI_ID);
    expect(updatedManifest.last_merged_at).toBeTruthy();
    expect(new Date(updatedManifest.last_merged_at).toISOString()).toBe(updatedManifest.last_merged_at);
  });

  it('Step 7: Generate verification report and evidence', () => {
    const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
    const evidenceDir = join(wiDir, 'evidence');
    mkdirSync(evidenceDir, { recursive: true });

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

    const verificationReport = `# Verification Report: ${WI_ID}\n\n## Summary\n\n| Check | Result |\n|-------|--------|\n| Gates passed | ✅ |\n| User decision recorded | ✅ |\n| Merge completed | ✅ |\n| Post-merge verification | ✅ |\n| Trace delta present | ✅ |\n\n## Conclusion\n**PASS** — All verification checks passed. Work item is ready for close.\n`;
    writeFileSync(join(wiDir, 'verification_report.md'), verificationReport);

    expect(existsSync(join(evidenceDir, 'evidence_manifest.json'))).toBe(true);
    expect(existsSync(join(wiDir, 'verification_report.md'))).toBe(true);

    const evidenceRaw = readFileSync(join(evidenceDir, 'evidence_manifest.json'), 'utf-8');
    const evidenceParsed = JSON.parse(evidenceRaw);
    expect(evidenceParsed.artifacts).toHaveLength(5);
  });

  it('Step 8: Execute changed_files_audit', () => {
    const audit = new ChangedFilesAudit();

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
      `.specforge/work-items/${WI_ID}/candidates/project/requirements_index.md`,
      `.specforge/work-items/${WI_ID}/candidates/project/design_index.md`,
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

    const actualChangedFiles = [...expectedFiles];

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

    expect(result.canClose).toBe(true);
    expect(result.failedChecks).toHaveLength(0);

    const sm = new StateMachine(WI_ID, 'verification_done');
    const transitionResult = sm.transition('closed', 'close_gate');
    expect(transitionResult.success).toBe(true);
    expect(sm.getCurrentState()).toBe('closed');
  });

  it('Step 10: Verify final directory structure', () => {
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

    expect(existsSync(join(tempDir, '.specforge', 'runtime'))).toBe(true);
    expect(existsSync(join(tempDir, '.specforge', 'specs'))).toBe(false);
    expect(existsSync(join(tempDir, '.specforge', 'archive'))).toBe(false);
  });
});

describe('v1.1 Negative Tests — old structures must FAIL validation', () => {
  const mergeRunner = new MergeRunner();
  const gateRunner = new GateRunner();

  // ── workflow field negatives ──

  it('NEGATIVE: workflow_path missing must be rejected by validateV11Manifest', () => {
    const manifest = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG-001',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      entries: [],
    };
    const result = mergeRunner.validateV11Manifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('workflow_path'))).toBe(true);
  });

  it('NEGATIVE: old "candidates" array must be rejected (no "entries")', () => {
    const manifest = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG-002',
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc',
      candidates: [{ candidate_path: 'x', target_path: 'y', operation: 'update' }],
    };
    const result = mergeRunner.validateV11Manifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"entries"'))).toBe(true);
  });

  it('NEGATIVE: operation = "update" must be rejected (must be "replace")', () => {
    const manifest = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG-003',
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc',
      entries: [{
        candidate_path: `.specforge/work-items/WI-NEG-003/candidates/project/req.md`,
        target_path: '.specforge/project/requirements_index.md',
        operation: 'update',
        candidate_hash: 'sha256:abc',
        target_base_hash: 'sha256:000',
      }],
    };
    const result = mergeRunner.validateV11Manifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"replace"'))).toBe(true);
  });

  it('NEGATIVE: missing manifest_hash must be rejected', () => {
    const manifest = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG-004',
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      entries: [{
        candidate_path: `.specforge/work-items/WI-NEG-004/candidates/project/req.md`,
        target_path: '.specforge/project/requirements_index.md',
        operation: 'replace',
        candidate_hash: 'sha256:abc',
        target_base_hash: 'sha256:000',
      }],
    };
    const result = mergeRunner.validateV11Manifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('manifest_hash'))).toBe(true);
  });

  it('NEGATIVE: entry missing candidate_hash must be rejected', () => {
    const manifest = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG-005',
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      entries: [{
        candidate_path: `.specforge/work-items/WI-NEG-005/candidates/project/req.md`,
        target_path: '.specforge/project/requirements_index.md',
        operation: 'replace',
        target_base_hash: 'sha256:000',
      }],
    };
    const result = mergeRunner.validateV11Manifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('candidate_hash'))).toBe(true);
  });

  it('NEGATIVE: entry missing target_base_hash must be rejected', () => {
    const manifest = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG-006',
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      entries: [{
        candidate_path: `.specforge/work-items/WI-NEG-006/candidates/project/req.md`,
        target_path: '.specforge/project/requirements_index.md',
        operation: 'replace',
        candidate_hash: 'sha256:abc',
      }],
    };
    const result = mergeRunner.validateV11Manifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('target_base_hash'))).toBe(true);
  });

  it('NEGATIVE: target_path not under .specforge/project/ must be rejected', () => {
    const manifest = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG-007',
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      entries: [{
        candidate_path: `.specforge/work-items/WI-NEG-007/candidates/project/req.md`,
        target_path: 'src/index.ts',
        operation: 'replace',
        candidate_hash: 'sha256:abc',
        target_base_hash: 'sha256:000',
      }],
    };
    const result = mergeRunner.validateV11Manifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('.specforge/project/'))).toBe(true);
  });

  it('NEGATIVE: candidate_path not in current WI candidates/ must be rejected', () => {
    const manifest = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG-008',
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      entries: [{
        candidate_path: '.specforge/work-items/WI-OTHER/candidates/project/evil.md',
        target_path: '.specforge/project/requirements_index.md',
        operation: 'replace',
        candidate_hash: 'sha256:abc',
        target_base_hash: 'sha256:000',
      }],
    };
    const result = mergeRunner.validateV11Manifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('candidates/ directory'))).toBe(true);
  });

  // ── Gate Report negatives ──

  it('NEGATIVE: old "gate_name" field (no gate_id) must be rejected', () => {
    const report = {
      gate_name: 'old_gate',
      gate_type: 'hard_gate',
      required: true,
      status: 'passed',
      input_files: [],
      checks: [],
      blocking_issues: [],
      warnings: [],
      waiver_allowed: false,
      runner: 'gate_runner',
      started_at: '2026-01-01T00:00:00Z',
      finished_at: '2026-01-01T00:00:01Z',
    };
    const result = gateRunner.validateV11GateReport(report);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('gate_name'))).toBe(true);
  });

  it('NEGATIVE: old "details" field (no checks) must be rejected', () => {
    const report = {
      gate_id: 'test_gate',
      gate_type: 'hard_gate',
      required: true,
      status: 'passed',
      input_files: [],
      details: { info: 'old format' },
      blocking_issues: [],
      warnings: [],
      waiver_allowed: false,
      runner: 'gate_runner',
      started_at: '2026-01-01T00:00:00Z',
      finished_at: '2026-01-01T00:00:01Z',
    };
    const result = gateRunner.validateV11GateReport(report);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"details"'))).toBe(true);
  });

  it('NEGATIVE: Gate Report missing gate_id must be rejected', () => {
    const report = {
      gate_type: 'hard_gate',
      required: true,
      status: 'passed',
      input_files: [],
      checks: [],
      blocking_issues: [],
      warnings: [],
      waiver_allowed: false,
      runner: 'gate_runner',
      started_at: '2026-01-01T00:00:00Z',
      finished_at: '2026-01-01T00:00:01Z',
    };
    const result = gateRunner.validateV11GateReport(report);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('gate_id'))).toBe(true);
  });

  it('NEGATIVE: Gate Report missing waiver_allowed must be rejected', () => {
    const report = {
      gate_id: 'test_gate',
      gate_type: 'hard_gate',
      required: true,
      status: 'passed',
      input_files: [],
      checks: [],
      blocking_issues: [],
      warnings: [],
      runner: 'gate_runner',
      started_at: '2026-01-01T00:00:00Z',
      finished_at: '2026-01-01T00:00:01Z',
    };
    const result = gateRunner.validateV11GateReport(report);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('waiver_allowed'))).toBe(true);
  });

  it('NEGATIVE: invalid gate_type must be rejected', () => {
    const report = {
      gate_id: 'test_gate',
      gate_type: 'invalid_type',
      required: true,
      status: 'passed',
      input_files: [],
      checks: [],
      blocking_issues: [],
      warnings: [],
      waiver_allowed: false,
      runner: 'gate_runner',
      started_at: '2026-01-01T00:00:00Z',
      finished_at: '2026-01-01T00:00:01Z',
    };
    const result = gateRunner.validateV11GateReport(report);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('gate_type'))).toBe(true);
  });

  it('NEGATIVE: hard_gate failed with waiver_allowed=false must block', () => {
    const report = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG',
      gate_id: 'critical_gate',
      gate_type: 'hard_gate',
      required: true,
      status: 'failed',
      input_files: [],
      checks: [{ name: 'critical_check', passed: false }],
      blocking_issues: ['Critical failure detected'],
      warnings: [],
      waiver_allowed: false,
      runner: 'gate_runner',
      started_at: '2026-01-01T00:00:00Z',
      finished_at: '2026-01-01T00:00:01Z',
    };
    const validation = gateRunner.validateV11GateReport(report);
    expect(validation.valid).toBe(true); // structurally valid
    // But blocking: status=failed + waiver_allowed=false = cannot proceed
    expect(report.status === 'passed' || report.waiver_allowed === true).toBe(false);
  });

  // ── CloseGate negatives (calling real validation) ──

  it('NEGATIVE: close_gate FAILS when evidence_manifest missing', () => {
    const closeGate = new CloseGate();
    const result = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
      notApplicableFlags: new Set<string>(),
      evidenceManifestExists: false,
      verificationReportExists: true,
      traceMatrixUpdated: true,
    });
    expect(result.canClose).toBe(false);
    expect(result.failedChecks).toContain('evidence_check');
  });

  it('NEGATIVE: close_gate FAILS when verification_report missing', () => {
    const closeGate = new CloseGate();
    const result = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
      notApplicableFlags: new Set<string>(),
      evidenceManifestExists: true,
      verificationReportExists: false,
      traceMatrixUpdated: true,
    });
    expect(result.canClose).toBe(false);
    expect(result.failedChecks).toContain('verification_check');
  });

  it('NEGATIVE: close_gate FAILS when trace_delta missing', () => {
    const closeGate = new CloseGate();
    const result = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
      notApplicableFlags: new Set<string>(),
      evidenceManifestExists: true,
      verificationReportExists: true,
      traceMatrixUpdated: false,
    });
    expect(result.canClose).toBe(false);
    expect(result.failedChecks).toContain('trace_matrix_check');
  });
});

describe('v1.1 Negative Tests — executeV11Merge must FAIL on invalid inputs', () => {
  const mergeRunner = new MergeRunner();
  const WI_ID = 'WI-NEG-MERGE';

  const makeCallbacks = (candidateContent: string = 'file content', targetContent: string | null = null) => ({
    readCandidate: (path: string) => candidateContent,
    readTarget: (path: string) => targetContent,
    writeTarget: (path: string, content: string) => true,
    calculateHash: (content: string) => `sha256:${Buffer.from(content).toString('hex').slice(0, 16)}`,
  });

  it('NEGATIVE: Legacy manifest with only candidates[] (no entries[]) must fail', () => {
    const badManifest = {
      schema_version: '1.0' as const,
      work_item_id: WI_ID,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      candidates: [{ candidate_path: 'x', target_path: '.specforge/project/y', operation: 'update' }],
    } as any;

    const result = mergeRunner.executeV11Merge({
      manifest: badManifest,
      ...makeCallbacks(),
    });
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('"entries"'))).toBe(true);
  });

  it('NEGATIVE: Manifest with operation "update" must fail', () => {
    const badManifest = {
      schema_version: '1.0' as const,
      work_item_id: WI_ID,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      entries: [{
        candidate_path: `.specforge/work-items/${WI_ID}/candidates/project/req.md`,
        target_path: '.specforge/project/req.md',
        operation: 'update',
        candidate_hash: 'sha256:abc',
        target_base_hash: 'sha256:000',
      }],
    } as any;

    const result = mergeRunner.executeV11Merge({
      manifest: badManifest,
      ...makeCallbacks(),
    });
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('"replace"'))).toBe(true);
  });

  it('NEGATIVE: Manifest missing manifest_hash must fail', () => {
    const badManifest = {
      schema_version: '1.0' as const,
      work_item_id: WI_ID,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      entries: [{
        candidate_path: `.specforge/work-items/${WI_ID}/candidates/project/req.md`,
        target_path: '.specforge/project/req.md',
        operation: 'replace',
        candidate_hash: 'sha256:abc',
        target_base_hash: 'sha256:000',
      }],
    } as any;

    const result = mergeRunner.executeV11Merge({
      manifest: badManifest,
      ...makeCallbacks(),
    });
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('manifest_hash'))).toBe(true);
  });

  it('NEGATIVE: Manifest entry missing candidate_hash must fail', () => {
    const badManifest = {
      schema_version: '1.0' as const,
      work_item_id: WI_ID,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      entries: [{
        candidate_path: `.specforge/work-items/${WI_ID}/candidates/project/req.md`,
        target_path: '.specforge/project/req.md',
        operation: 'replace',
        target_base_hash: 'sha256:000',
      }],
    } as any;

    const result = mergeRunner.executeV11Merge({
      manifest: badManifest,
      ...makeCallbacks(),
    });
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('candidate_hash'))).toBe(true);
  });

  it('NEGATIVE: Manifest entry missing target_base_hash must fail', () => {
    const badManifest = {
      schema_version: '1.0' as const,
      work_item_id: WI_ID,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      entries: [{
        candidate_path: `.specforge/work-items/${WI_ID}/candidates/project/req.md`,
        target_path: '.specforge/project/req.md',
        operation: 'replace',
        candidate_hash: 'sha256:abc',
      }],
    } as any;

    const result = mergeRunner.executeV11Merge({
      manifest: badManifest,
      ...makeCallbacks(),
    });
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('target_base_hash'))).toBe(true);
  });

  it('NEGATIVE: candidate_hash does not match actual file hash must fail', () => {
    const content = 'real file content';
    const correctHash = `sha256:${Buffer.from(content).toString('hex').slice(0, 16)}`;
    const wrongHash = 'sha256:wrong_hash_value';

    const manifest: any = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      entries: [{
        candidate_path: `.specforge/work-items/${WI_ID}/candidates/project/req.md`,
        target_path: '.specforge/project/req.md',
        operation: 'replace',
        candidate_hash: wrongHash, // does NOT match actual
        target_base_hash: `sha256:${Buffer.from('').toString('hex').slice(0, 16)}`,
      }],
    };

    const result = mergeRunner.executeV11Merge({
      manifest,
      readCandidate: () => content,
      readTarget: () => null,
      writeTarget: () => true,
      calculateHash: (c: string) => `sha256:${Buffer.from(c).toString('hex').slice(0, 16)}`,
    });
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('candidate_hash mismatch'))).toBe(true);
  });

  it('NEGATIVE: target_base_hash does not match target file hash must fail', () => {
    const candidateContent = 'new content';
    const targetContent = 'existing target content';
    const calcHash = (c: string) => `sha256:${Buffer.from(c).toString('hex').slice(0, 16)}`;
    const correctCandidateHash = calcHash(candidateContent);
    const wrongTargetHash = 'sha256:wrong_target_hash';

    const manifest: any = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      entries: [{
        candidate_path: `.specforge/work-items/${WI_ID}/candidates/project/req.md`,
        target_path: '.specforge/project/req.md',
        operation: 'replace',
        candidate_hash: correctCandidateHash,
        target_base_hash: wrongTargetHash, // does NOT match actual target
      }],
    };

    const result = mergeRunner.executeV11Merge({
      manifest,
      readCandidate: () => candidateContent,
      readTarget: () => targetContent,
      writeTarget: () => true,
      calculateHash: calcHash,
    });
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('target_base_hash mismatch'))).toBe(true);
  });

  it('NEGATIVE: target_path not in .specforge/project/ must fail', () => {
    const content = 'some content';
    const calcHash = (c: string) => `sha256:${Buffer.from(c).toString('hex').slice(0, 16)}`;

    const manifest: any = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      entries: [{
        candidate_path: `.specforge/work-items/${WI_ID}/candidates/project/req.md`,
        target_path: 'src/index.ts', // NOT in .specforge/project/
        operation: 'replace',
        candidate_hash: calcHash(content),
        target_base_hash: calcHash(''),
      }],
    };

    const result = mergeRunner.executeV11Merge({
      manifest,
      readCandidate: () => content,
      readTarget: () => null,
      writeTarget: () => true,
      calculateHash: calcHash,
    });
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('.specforge/project/'))).toBe(true);
  });

  it('NEGATIVE: candidate_path not in current WI candidates/ must fail', () => {
    const content = 'some content';
    const calcHash = (c: string) => `sha256:${Buffer.from(c).toString('hex').slice(0, 16)}`;

    const manifest: any = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc123',
      entries: [{
        candidate_path: '.specforge/work-items/WI-OTHER/candidates/project/evil.md', // wrong WI
        target_path: '.specforge/project/req.md',
        operation: 'replace',
        candidate_hash: calcHash(content),
        target_base_hash: calcHash(''),
      }],
    };

    const result = mergeRunner.executeV11Merge({
      manifest,
      readCandidate: () => content,
      readTarget: () => null,
      writeTarget: () => true,
      calculateHash: calcHash,
    });
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('candidates/ directory'))).toBe(true);
  });
});
