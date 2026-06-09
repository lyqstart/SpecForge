/**
 * SpecForge v1.1 Compliance E2E Test Suite
 *
 * Exercises 6 end-to-end scenarios using actual v11 runtime components
 * (StateMachine, PathPolicy, WriteGuard, GateRunner, UserDecisionRecorder,
 *  MergeRunner, CloseGate, ExtensionRegistry).
 *
 * These are integration-level tests exercising the full flow through real components.
 */

import { describe, it, expect } from 'vitest';
import {
  StateMachine,
  PathPolicy,
  WriteGuard,
  CodePermissionService,
  ChangedFilesAudit,
  GateRunner,
  UserDecisionRecorder,
  MergeRunner,
  CloseGate,
  ExtensionRegistry,
  ExtensionGate,
  RuntimeInit,
  PathService,
  JsonParser,
} from '@/v11/index';

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 1: requirement_change_path — full lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 1: requirement_change_path full lifecycle', () => {
  it('transitions through all states from created to closed', () => {
    const sm = new StateMachine('WI-E2E-001');

    // Verify initial state
    expect(sm.getCurrentState()).toBe('created');

    // Happy path: created → intake_ready → ... → verification_done → closed
    expect(sm.transition('intake_ready', 'state_machine').success).toBe(true);
    expect(sm.transition('impact_analyzing', 'state_machine').success).toBe(true);
    expect(sm.transition('impact_analyzed', 'state_machine').success).toBe(true);
    expect(sm.transition('workflow_selected', 'state_machine').success).toBe(true);
    expect(sm.transition('candidate_preparing', 'state_machine').success).toBe(true);
    expect(sm.transition('candidate_prepared', 'state_machine').success).toBe(true);
    expect(sm.transition('gates_running', 'state_machine').success).toBe(true);
    expect(sm.transition('approval_required', 'gate_runner').success).toBe(true);
    expect(sm.transition('approved', 'user_decision_recorder').success).toBe(true);
    expect(sm.transition('merge_ready', 'state_machine').success).toBe(true);
    expect(sm.transition('merging', 'state_machine').success).toBe(true);
    expect(sm.transition('merged', 'merge_runner').success).toBe(true);
    expect(sm.transition('post_merge_verified', 'state_machine').success).toBe(true);
    expect(sm.transition('implementation_ready', 'state_machine').success).toBe(true);
    expect(sm.transition('implementation_running', 'code_permission_service').success).toBe(true);
    expect(sm.transition('implementation_done', 'state_machine').success).toBe(true);
    expect(sm.transition('verification_running', 'state_machine').success).toBe(true);
    expect(sm.transition('verification_done', 'state_machine').success).toBe(true);
    expect(sm.transition('closed', 'close_gate').success).toBe(true);

    // Terminal: cannot transition from closed
    expect(sm.transition('intake_ready', 'state_machine').success).toBe(false);

    // Verify full history
    expect(sm.getStateHistory().length).toBe(19);
    expect(sm.getCurrentState()).toBe('closed');
  });

  it('rejects agent-initiated transitions', () => {
    const sm = new StateMachine('WI-E2E-002');

    // Agent cannot make ANY transitions
    const result = sm.transition('intake_ready', 'agent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Agent is not authorized');
  });

  it('rejects illegal state skipping (created → implementation_running)', () => {
    const sm = new StateMachine('WI-E2E-003');

    // Cannot skip from created directly to implementation_running
    const result = sm.transition('implementation_running', 'state_machine');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Illegal transition');
  });

  it('rejects unauthorized callers for restricted transitions', () => {
    const sm = new StateMachine('WI-E2E-004');

    // Move to verification_done
    sm.transition('intake_ready', 'state_machine');
    sm.transition('impact_analyzing', 'state_machine');
    sm.transition('impact_analyzed', 'state_machine');
    sm.transition('workflow_selected', 'state_machine');
    sm.transition('candidate_preparing', 'state_machine');
    sm.transition('candidate_prepared', 'state_machine');
    sm.transition('gates_running', 'state_machine');
    sm.transition('approval_required', 'gate_runner');
    sm.transition('approved', 'user_decision_recorder');
    sm.transition('merge_ready', 'state_machine');
    sm.transition('merging', 'state_machine');
    sm.transition('merged', 'merge_runner');
    sm.transition('post_merge_verified', 'state_machine');
    sm.transition('implementation_ready', 'state_machine');
    sm.transition('implementation_running', 'code_permission_service');
    sm.transition('implementation_done', 'state_machine');
    sm.transition('verification_running', 'state_machine');
    sm.transition('verification_done', 'state_machine');

    expect(sm.getCurrentState()).toBe('verification_done');

    // Only close_gate (or state_machine) can transition to closed
    // gate_runner is not authorized for verification_done→closed
    const result = sm.transition('closed', 'gate_runner');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not authorized');
  });

  it('closed is terminal — no further transitions allowed', () => {
    const sm = new StateMachine('WI-E2E-005', 'closed');

    expect(sm.isTerminalState('closed')).toBe(true);

    // Try all possible targets
    expect(sm.transition('intake_ready', 'state_machine').success).toBe(false);
    expect(sm.transition('created', 'state_machine').success).toBe(false);
    expect(sm.transition('blocked', 'state_machine').success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 2: code_only_fast_path — skip spec changes
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 2: code_only_fast_path — skip spec changes', () => {
  it('supports empty candidate manifest (code-only path)', () => {
    const mergeRunner = new MergeRunner();

    // Empty candidates = code-only fast path
    const manifestJson = JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-FAST-001',
      base_spec_version: 'PSV-0001',
      target_spec_version: 'PSV-0001',
      candidates: [],
      generated_at: new Date().toISOString(),
    });

    const parsed = mergeRunner.parseCandidateManifest(manifestJson);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.candidates).toHaveLength(0);
  });

  it('merge with empty candidates results in success with no operations', () => {
    const mergeRunner = new MergeRunner();

    const result = mergeRunner.executeMerge({
      manifest: {
        schema_version: '1.0',
        work_item_id: 'WI-FAST-001',
        base_spec_version: 'PSV-0001',
        target_spec_version: 'PSV-0001',
        candidates: [],
        generated_at: new Date().toISOString(),
      },
      readCandidate: () => null,
      writeTarget: () => true,
      calculateHash: (content: string) => `sha256:${content.length}`,
    });

    expect(result.success).toBe(true);
    expect(result.mergedFiles).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('WriteGuard still enforces in code-only path', () => {
    const writeGuard = new WriteGuard();
    const codePermService = new CodePermissionService();

    // Enable code changes for the work item
    codePermService.enableCodeChanges('WI-FAST-001', ['src/main.ts']);

    // Agent can write to allowed files
    const allowed = writeGuard.checkWrite({
      filePath: 'src/main.ts',
      caller: 'agent',
      context: {
        workItemId: 'WI-FAST-001',
        codeChangeAllowed: true,
        allowedWriteFiles: ['src/main.ts'],
        frozenFiles: [],
        isWorkItemClosed: false,
      },
    });
    expect(allowed.allowed).toBe(true);

    // Agent cannot write to files not in allowed_write_files
    const blocked = writeGuard.checkWrite({
      filePath: 'src/secret.ts',
      caller: 'agent',
      context: {
        workItemId: 'WI-FAST-001',
        codeChangeAllowed: true,
        allowedWriteFiles: ['src/main.ts'],
        frozenFiles: [],
        isWorkItemClosed: false,
      },
    });
    expect(blocked.allowed).toBe(false);
  });

  it('CloseGate validates even in code-only path', () => {
    const closeGate = new CloseGate();

    // Code-only path: merge_report exists with status not_applicable (counts as success).
    // Evidence, verification report, and trace delta MUST exist even in fast path —
    // no notApplicableFlags allowed for these checks.
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
      traceMatrixUpdated: true,
    });

    expect(result.canClose).toBe(true);
    expect(result.failedChecks).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 3: 越界写入 (escaped write detection)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 3: Write Guard blocks unauthorized writes', () => {
  it('Agent cannot write project specs', () => {
    const policy = new PathPolicy();
    expect(policy.canWritePath('agent', '.specforge/project/requirements.md').valid).toBe(false);
  });

  it('Agent cannot write user_decision.json', () => {
    const policy = new PathPolicy();
    expect(policy.canWritePath('agent', '.specforge/work-items/WI-001/user_decision.json').valid).toBe(false);
  });

  it('Agent cannot write gates', () => {
    const policy = new PathPolicy();
    expect(policy.canWritePath('agent', '.specforge/work-items/WI-001/gates/entry.json').valid).toBe(false);
  });

  it('Agent cannot write legacy specs', () => {
    const policy = new PathPolicy();
    expect(policy.canWritePath('agent', '.specforge/specs/old.md').valid).toBe(false);
  });

  it('Agent cannot write forbidden dirs', () => {
    const policy = new PathPolicy();
    expect(policy.canWritePath('agent', '.specforge/archive/data.json').valid).toBe(false);
  });

  it('merge_runner CAN write project specs', () => {
    const policy = new PathPolicy();
    expect(policy.canWritePath('merge_runner', '.specforge/project/requirements.md').valid).toBe(true);
  });

  it('gate_runner CAN write gates', () => {
    const policy = new PathPolicy();
    expect(policy.canWritePath('gate_runner', '.specforge/work-items/WI-001/gates/entry.json').valid).toBe(true);
  });

  it('user_decision_recorder CAN write user_decision', () => {
    const policy = new PathPolicy();
    expect(policy.canWritePath('user_decision_recorder', '.specforge/work-items/WI-001/user_decision.json').valid).toBe(true);
  });

  it('WriteGuard blocks agent writing to files not in allowed_write_files', () => {
    const writeGuard = new WriteGuard();

    const result = writeGuard.checkWrite({
      filePath: 'src/unauthorized.ts',
      caller: 'agent',
      context: {
        workItemId: 'WI-001',
        codeChangeAllowed: true,
        allowedWriteFiles: ['src/allowed.ts'],
        frozenFiles: [],
        isWorkItemClosed: false,
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in allowed_write_files');
  });

  it('ChangedFilesAudit detects escaped writes', () => {
    const audit = new ChangedFilesAudit();

    const incident = audit.auditFileChanges({
      expectedFiles: ['src/main.ts'],
      actualChangedFiles: ['src/main.ts', 'src/secret.ts', '.env'],
      command: 'bash -c "echo hack > src/secret.ts"',
      workItemId: 'WI-001',
    });

    expect(incident).not.toBeNull();
    expect(incident!.escapedWrites).toContain('src/secret.ts');
    expect(incident!.escapedWrites).toContain('.env');
    expect(incident!.escapedWrites).toHaveLength(2);
  });

  it('CloseGate FAILS when escaped write incident exists', () => {
    const closeGate = new CloseGate();

    const result = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: true, // incident recorded!
      notApplicableFlags: new Set(['evidence_check', 'verification_check', 'trace_matrix_check']),
    });

    expect(result.canClose).toBe(false);
    expect(result.failedChecks).toContain('write_audit_check');
  });

  it('WriteGuard records and tracks escaped write incidents', () => {
    const writeGuard = new WriteGuard();
    const audit = new ChangedFilesAudit();

    // Simulate: agent ran bash command that modified files outside allowed list
    const incident = audit.auditFileChanges({
      expectedFiles: ['src/index.ts'],
      actualChangedFiles: ['src/index.ts', '.specforge/project/requirements.md'],
      command: 'node build.js',
      workItemId: 'WI-ESC-001',
    });

    expect(incident).not.toBeNull();
    writeGuard.recordEscapedWriteIncident(incident!);

    // WriteGuard tracks the incident
    expect(writeGuard.hasEscapedWriteIncidents('WI-ESC-001')).toBe(true);
    expect(writeGuard.getEscapedWriteIncidents('WI-ESC-001')).toHaveLength(1);

    // Different work item has no incidents
    expect(writeGuard.hasEscapedWriteIncidents('WI-OTHER')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 4: User Decision 失效 (hash mismatch)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 4: User Decision hash mismatch blocks merge', () => {
  it('MergeRunner rejects merge when candidate manifest is modified after approval', () => {
    const recorder = new UserDecisionRecorder();
    const mergeRunner = new MergeRunner();

    // Original candidate manifest content at time of approval
    const originalManifestContent = JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-HASH-001',
      candidates: [
        { candidate_path: '.specforge/work-items/WI-HASH-001/candidates/req.md', target_path: '.specforge/project/requirements.md', operation: 'update' },
      ],
    });

    const gateSummaryContent = '# Gate Summary\nAll passed';

    // Record user approval with hashes of original content
    const decision = recorder.recordApproval({
      workItemId: 'WI-HASH-001',
      approved: true,
      baseSpecVersion: 'PSV-0001',
      candidateManifestContent: originalManifestContent,
      gateSummaryContent,
      userId: 'user-1',
    });

    // Verify decision was recorded with correct hashes
    expect(decision.approved).toBe(true);
    expect(decision.candidate_manifest_hash).toBeTruthy();
    expect(decision.gate_summary_hash).toBeTruthy();

    // Now simulate: candidate manifest was modified AFTER approval
    const modifiedManifestContent = JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-HASH-001',
      candidates: [
        { candidate_path: '.specforge/work-items/WI-HASH-001/candidates/req.md', target_path: '.specforge/project/requirements.md', operation: 'update' },
        { candidate_path: '.specforge/work-items/WI-HASH-001/candidates/sneaky.md', target_path: '.specforge/project/design.md', operation: 'create' },
      ],
    });

    // Attempt merge with modified content → REJECTED
    const preconditions = mergeRunner.validateMergePreconditions({
      userDecision: decision,
      currentManifestContent: modifiedManifestContent,
      currentGateSummaryContent: gateSummaryContent,
      currentSpecVersion: 'PSV-0001',
      calculateHash: (content: string) => recorder.calculateHash(content),
    });

    expect(preconditions.valid).toBe(false);
    expect(preconditions.errors.length).toBeGreaterThan(0);
    expect(preconditions.errors[0]).toContain('manifest hash mismatch');
  });

  it('MergeRunner rejects merge when gate summary is modified after approval', () => {
    const recorder = new UserDecisionRecorder();
    const mergeRunner = new MergeRunner();

    const manifestContent = JSON.stringify({ candidates: [] });
    const originalGateSummary = '# Gate Summary\nAll 5 gates passed';

    const decision = recorder.recordApproval({
      workItemId: 'WI-HASH-002',
      approved: true,
      baseSpecVersion: 'PSV-0002',
      candidateManifestContent: manifestContent,
      gateSummaryContent: originalGateSummary,
    });

    // Gate summary was tampered with
    const modifiedGateSummary = '# Gate Summary\nAll 5 gates passed (waived 2)';

    const preconditions = mergeRunner.validateMergePreconditions({
      userDecision: decision,
      currentManifestContent: manifestContent,
      currentGateSummaryContent: modifiedGateSummary,
      currentSpecVersion: 'PSV-0002',
      calculateHash: (content: string) => recorder.calculateHash(content),
    });

    expect(preconditions.valid).toBe(false);
    expect(preconditions.errors.some((e) => e.includes('Gate summary hash mismatch'))).toBe(true);
  });

  it('MergeRunner accepts merge when hashes match', () => {
    const recorder = new UserDecisionRecorder();
    const mergeRunner = new MergeRunner();

    const manifestContent = JSON.stringify({ candidates: [] });
    const gateSummaryContent = '# Gate Summary\nAll passed';

    const decision = recorder.recordApproval({
      workItemId: 'WI-HASH-003',
      approved: true,
      baseSpecVersion: 'PSV-0001',
      candidateManifestContent: manifestContent,
      gateSummaryContent,
    });

    // Same content → hashes match
    const preconditions = mergeRunner.validateMergePreconditions({
      userDecision: decision,
      currentManifestContent: manifestContent,
      currentGateSummaryContent: gateSummaryContent,
      currentSpecVersion: 'PSV-0001',
      calculateHash: (content: string) => recorder.calculateHash(content),
    });

    expect(preconditions.valid).toBe(true);
    expect(preconditions.errors).toHaveLength(0);
  });

  it('MergeRunner rejects merge when spec version differs', () => {
    const recorder = new UserDecisionRecorder();
    const mergeRunner = new MergeRunner();

    const manifestContent = JSON.stringify({ candidates: [] });
    const gateSummaryContent = '# Gate Summary';

    const decision = recorder.recordApproval({
      workItemId: 'WI-HASH-004',
      approved: true,
      baseSpecVersion: 'PSV-0001',
      candidateManifestContent: manifestContent,
      gateSummaryContent,
    });

    // Spec version drifted
    const preconditions = mergeRunner.validateMergePreconditions({
      userDecision: decision,
      currentManifestContent: manifestContent,
      currentGateSummaryContent: gateSummaryContent,
      currentSpecVersion: 'PSV-0002', // different!
      calculateHash: (content: string) => recorder.calculateHash(content),
    });

    expect(preconditions.valid).toBe(false);
    expect(preconditions.errors.some((e) => e.includes('Spec version mismatch'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 5: Extension Subflow
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 5: Extension Subflow', () => {
  it('detects unknown types in artifact and generates extension request', () => {
    const registry = new ExtensionRegistry();

    // Registry has some known types
    registry.registerType({
      namespace: 'requirement_types',
      typeId: 'user_story',
      workItemId: 'WI-INIT',
    });

    // Agent uses types not in registry
    const usedTypes = ['user_story', 'performance_requirement', 'compliance_requirement'];
    const unknownTypes = registry.detectUnknownTypes('requirements', usedTypes);

    expect(unknownTypes).toContain('performance_requirement');
    expect(unknownTypes).toContain('compliance_requirement');
    expect(unknownTypes).not.toContain('user_story');
    expect(unknownTypes).toHaveLength(2);

    // Generate extension request
    const request = registry.generateExtensionRequest({
      workItemId: 'WI-EXT-001',
      artifactType: 'requirements',
      unknownTypes,
      usageContext: 'Need performance and compliance types for NFR tracking',
      blocking: true,
    });

    expect(request.work_item_id).toBe('WI-EXT-001');
    expect(request.requested_types).toHaveLength(2);
    expect(request.blocking_current_flow).toBe(true);
    expect(request.requested_types[0].namespace).toBe('requirement_types');
  });

  it('ExtensionGate validates completeness of extension request', () => {
    const gate = new ExtensionGate();

    // Valid request
    const validRequest = {
      schema_version: '1.0' as const,
      work_item_id: 'WI-EXT-001',
      requested_types: [
        { namespace: 'requirement_types', type_id: 'perf_req', usage_context: 'Performance tracking' },
      ],
      blocking_current_flow: true,
      requested_at: new Date().toISOString(),
    };

    const validResult = gate.validateCompleteness(validRequest);
    expect(validResult.valid).toBe(true);

    // Invalid request: empty types
    const invalidRequest = {
      ...validRequest,
      requested_types: [],
    };

    const invalidResult = gate.validateCompleteness(invalidRequest);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toContain('Extension request must contain at least one type');
  });

  it('ExtensionGate detects conflicts with existing registry', () => {
    const gate = new ExtensionGate();
    const registry = new ExtensionRegistry();

    // Register a type
    registry.registerType({
      namespace: 'design_types',
      typeId: 'component_diagram',
      workItemId: 'WI-INIT',
    });

    // Try to register same type again via extension request
    const conflictRequest = {
      schema_version: '1.0' as const,
      work_item_id: 'WI-EXT-002',
      requested_types: [
        { namespace: 'design_types', type_id: 'component_diagram', usage_context: 'Already exists' },
        { namespace: 'design_types', type_id: 'sequence_diagram', usage_context: 'New type' },
      ],
      blocking_current_flow: true,
      requested_at: new Date().toISOString(),
    };

    const conflictResult = gate.validateNoConflicts(conflictRequest, registry.getData());
    expect(conflictResult.valid).toBe(false);
    expect(conflictResult.conflicts).toHaveLength(1);
    expect(conflictResult.conflicts[0]).toContain('component_diagram');
  });

  it('ExtensionGate is a hard_gate', () => {
    const gate = new ExtensionGate();
    expect(gate.gateType).toBe('hard_gate');
  });

  it('after merge, registry is updated with new types', () => {
    const registry = new ExtensionRegistry();

    // Simulate: after extension subflow completes and merge happens,
    // the new types are registered
    const result1 = registry.registerType({
      namespace: 'requirement_types',
      typeId: 'performance_requirement',
      workItemId: 'WI-EXT-001',
    });
    expect(result1.success).toBe(true);

    const result2 = registry.registerType({
      namespace: 'requirement_types',
      typeId: 'compliance_requirement',
      workItemId: 'WI-EXT-001',
    });
    expect(result2.success).toBe(true);

    // Verify types are now registered
    expect(registry.isTypeRegistered('requirement_types', 'performance_requirement')).toBe(true);
    expect(registry.isTypeRegistered('requirement_types', 'compliance_requirement')).toBe(true);

    // No longer detected as unknown
    const unknown = registry.detectUnknownTypes('requirements', ['performance_requirement', 'compliance_requirement']);
    expect(unknown).toHaveLength(0);

    // Duplicate registration fails
    const dup = registry.registerType({
      namespace: 'requirement_types',
      typeId: 'performance_requirement',
      workItemId: 'WI-EXT-002',
    });
    expect(dup.success).toBe(false);
    expect(dup.error).toContain('already registered');
  });

  it('CloseGate fails if unprocessed extension request exists', () => {
    const closeGate = new CloseGate();

    const result = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: true, // blocking!
      hasUnresolvedEscapedWriteIncident: false,
      notApplicableFlags: new Set(['evidence_check', 'verification_check', 'trace_matrix_check']),
    });

    expect(result.canClose).toBe(false);
    expect(result.failedChecks).toContain('extension_check');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 6: legacy specs read-only
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 6: legacy specs read-only', () => {
  const policy = new PathPolicy();
  const legacyPaths = [
    '.specforge/specs/architecture.md',
    '.specforge/specs/requirements.md',
    '.specforge/specs/deep/nested/file.json',
  ];

  const allActors: Array<'agent' | 'merge_runner' | 'gate_runner' | 'user_decision_recorder' | 'state_machine' | 'runtime' | 'code_permission_service' | 'close_gate'> = [
    'agent',
    'merge_runner',
    'gate_runner',
    'user_decision_recorder',
    'state_machine',
    'runtime',
    'code_permission_service',
    'close_gate',
  ];

  it('all actors CANNOT write to .specforge/specs/**', () => {
    for (const actor of allActors) {
      for (const path of legacyPaths) {
        const result = policy.canWritePath(actor, path);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('legacy_specs_read_only');
      }
    }
  });

  it('all actors CAN read .specforge/specs/**', () => {
    for (const actor of allActors) {
      for (const path of legacyPaths) {
        const result = policy.canReadPath(actor, path);
        expect(result.valid).toBe(true);
      }
    }
  });

  it('PathPolicy.assertPathAllowed("write", ANY_ACTOR, legacyPath) throws', () => {
    for (const actor of allActors) {
      expect(() => {
        policy.assertPathAllowed('write', actor, '.specforge/specs/old-spec.md');
      }).toThrow('PathPolicy violation');
    }
  });

  it('PathPolicy.assertPathAllowed("read", ANY_ACTOR, legacyPath) does NOT throw', () => {
    for (const actor of allActors) {
      expect(() => {
        policy.assertPathAllowed('read', actor, '.specforge/specs/old-spec.md');
      }).not.toThrow();
    }
  });

  it('isLegacySpecPath correctly identifies legacy paths', () => {
    expect(policy.isLegacySpecPath('.specforge/specs/something.md')).toBe(true);
    expect(policy.isLegacySpecPath('.specforge/specs')).toBe(true);
    expect(policy.isLegacySpecPath('.specforge/project/something.md')).toBe(false);
    expect(policy.isLegacySpecPath('.specforge/work-items/WI-001/specs.md')).toBe(false);
  });
});
