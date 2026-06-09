/**
 * SpecForge v1.1 Runtime Orchestration E2E Test
 *
 * Exercises the full v1.1 lifecycle through the Runtime class — the central
 * orchestrator that coordinates StateMachine, PathPolicy, WriteGuard, GateRunner,
 * UserDecisionRecorder, MergeRunner, CloseGate, ChangedFilesAudit, and ExtensionRegistry.
 *
 * Simulates what a real daemon does: using Runtime to drive a complete WI lifecycle.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  Runtime,
  type RuntimeConfig,
  type GateDefinition,
  type GateCheckResult,
  type CandidateManifest,
  type UserDecisionRecord,
} from '@/v11/index';

describe('v1.1 Runtime Orchestration E2E', () => {
  let tempDir: string;
  let runtime: Runtime;
  const PROJECT_NAME = 'orchestration-e2e-project';
  const WI_ID = 'WI-ORCH-001';

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-runtime-orch-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    const config: RuntimeConfig = {
      projectRoot: tempDir,
      projectName: PROJECT_NAME,
    };
    runtime = new Runtime(config);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Runtime initializes project structure correctly
  // ─────────────────────────────────────────────────────────────────────────

  it('Runtime initializes project structure correctly', () => {
    expect(runtime.isInitialized()).toBe(false);

    const result = runtime.initialize();

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(runtime.isInitialized()).toBe(true);

    // Verify all components are accessible
    const components = runtime.getComponents();
    expect(components.pathService).toBeDefined();
    expect(components.pathPolicy).toBeDefined();
    expect(components.gateRunner).toBeDefined();
    expect(components.userDecisionRecorder).toBeDefined();
    expect(components.mergeRunner).toBeDefined();
    expect(components.writeGuard).toBeDefined();
    expect(components.codePermissionService).toBeDefined();
    expect(components.changedFilesAudit).toBeDefined();
    expect(components.extensionRegistry).toBeDefined();
    expect(components.extensionGate).toBeDefined();
    expect(components.closeGate).toBeDefined();
    expect(components.runtimeInit).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Runtime enforces state transitions through StateMachine
  // ─────────────────────────────────────────────────────────────────────────

  it('Runtime enforces state transitions through StateMachine', () => {
    runtime.initialize();

    const sm = runtime.createWorkItemStateMachine(WI_ID);
    expect(sm.getCurrentState()).toBe('created');

    // Legal transition
    const result1 = sm.transition('intake_ready', 'state_machine');
    expect(result1.success).toBe(true);
    expect(result1.newState).toBe('intake_ready');

    // Illegal transition: cannot skip from intake_ready to implementation_running
    const result2 = sm.transition('implementation_running', 'state_machine');
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('Illegal transition');

    // Verify state didn't change on failed transition
    expect(sm.getCurrentState()).toBe('intake_ready');

    // State machine stored in components
    expect(runtime.getComponents().stateMachine).toBe(sm);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Runtime enforces write permissions through WriteGuard + PathPolicy
  // ─────────────────────────────────────────────────────────────────────────

  it('Runtime enforces write permissions through WriteGuard + PathPolicy', () => {
    runtime.initialize();

    const writeGuard = runtime.getWriteGuard();
    const codePermService = runtime.getCodePermissionService();

    // Enable code changes for a work item
    codePermService.enableCodeChanges(WI_ID, ['src/main.ts', 'src/utils.ts']);

    // Agent write allowed to listed file with active WI
    const allowedWrite = writeGuard.checkWrite({
      filePath: 'src/main.ts',
      caller: 'agent',
      context: {
        workItemId: WI_ID,
        codeChangeAllowed: true,
        allowedWriteFiles: ['src/main.ts', 'src/utils.ts'],
        frozenFiles: [],
        isWorkItemClosed: false,
      },
    });
    expect(allowedWrite.allowed).toBe(true);

    // Agent write blocked to file NOT in allowed list
    const blockedWrite = writeGuard.checkWrite({
      filePath: 'src/secret.ts',
      caller: 'agent',
      context: {
        workItemId: WI_ID,
        codeChangeAllowed: true,
        allowedWriteFiles: ['src/main.ts', 'src/utils.ts'],
        frozenFiles: [],
        isWorkItemClosed: false,
      },
    });
    expect(blockedWrite.allowed).toBe(false);
    expect(blockedWrite.reason).toContain('not in allowed_write_files');

    // Agent cannot write to protected project spec paths
    const protectedWrite = writeGuard.checkWrite({
      filePath: '.specforge/project/architecture.md',
      caller: 'agent',
      context: {
        workItemId: WI_ID,
        codeChangeAllowed: true,
        allowedWriteFiles: ['.specforge/project/architecture.md'],
        frozenFiles: [],
        isWorkItemClosed: false,
      },
    });
    expect(protectedWrite.allowed).toBe(false);
    expect(protectedWrite.reason).toContain('agent_cannot_write_project_specs');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: Runtime coordinates gate execution and state progression
  // ─────────────────────────────────────────────────────────────────────────

  it('Runtime coordinates gate execution and state progression', async () => {
    runtime.initialize();

    const sm = runtime.createWorkItemStateMachine(WI_ID);
    const gateRunner = runtime.getGateRunner();

    // Advance to gates_running state
    sm.transition('intake_ready', 'state_machine');
    sm.transition('impact_analyzing', 'state_machine');
    sm.transition('impact_analyzed', 'state_machine');
    sm.transition('workflow_selected', 'state_machine');
    sm.transition('candidate_preparing', 'state_machine');
    sm.transition('candidate_prepared', 'state_machine');
    sm.transition('gates_running', 'state_machine');
    expect(sm.getCurrentState()).toBe('gates_running');

    // Register gates
    const passingGate: GateDefinition = {
      gate_id: 'schema_validation',
      gate_type: 'hard_gate',
      required: true,
      checkFn: (): GateCheckResult => ({
        gate_id: 'schema_validation',
        passed: true,
        status: 'passed',
        reason: 'All schemas valid',
        executed_at: new Date().toISOString(),
      }),
    };

    const softGate: GateDefinition = {
      gate_id: 'coverage_check',
      gate_type: 'soft_gate',
      required: false,
      checkFn: (): GateCheckResult => ({
        gate_id: 'coverage_check',
        passed: true,
        status: 'passed',
        reason: 'Coverage above threshold',
        executed_at: new Date().toISOString(),
      }),
    };

    gateRunner.registerGate(passingGate);
    gateRunner.registerGate(softGate);

    // Execute gates
    const gateResult = await gateRunner.runGates();
    expect(gateResult.all_passed).toBe(true);
    expect(gateResult.summary.total_gates).toBe(2);
    expect(gateResult.summary.passed).toBe(2);
    expect(gateResult.summary.failed).toBe(0);

    // Determine next state from gate results
    const nextState = gateRunner.determineNextState(gateResult);
    expect(nextState).toBe('approval_required');

    // Gate runner transitions to approval_required
    const transResult = sm.transition('approval_required', 'gate_runner');
    expect(transResult.success).toBe(true);
    expect(sm.getCurrentState()).toBe('approval_required');

    // Verify gate summary can be generated
    const summary = gateRunner.generateGateSummaryMarkdown(gateResult);
    expect(summary).toContain('# Gate Summary');
    expect(summary).toContain('✅ PASSED');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: Runtime coordinates user decision recording
  // ─────────────────────────────────────────────────────────────────────────

  it('Runtime coordinates user decision recording', () => {
    runtime.initialize();

    const sm = runtime.createWorkItemStateMachine(WI_ID, 'approval_required');
    const recorder = runtime.getUserDecisionRecorder();

    expect(sm.getCurrentState()).toBe('approval_required');

    // Record user approval
    const decision = recorder.recordApproval({
      workItemId: WI_ID,
      approved: true,
      baseSpecVersion: 'PSV-0001',
      candidateManifestContent: '{"candidates": []}',
      gateSummaryContent: '# Gate Summary\nAll passed',
      userId: 'user-1',
      comments: 'Looks good',
    });

    expect(decision.approved).toBe(true);
    expect(decision.work_item_id).toBe(WI_ID);
    expect(decision.candidate_manifest_hash).toMatch(/^sha256:/);
    expect(decision.gate_summary_hash).toMatch(/^sha256:/);

    // User decision recorder transitions to approved
    const transResult = sm.transition('approved', 'user_decision_recorder');
    expect(transResult.success).toBe(true);
    expect(sm.getCurrentState()).toBe('approved');

    // Verify decision can be serialized
    const serialized = recorder.serializeDecision(decision);
    expect(serialized.success).toBe(true);
    expect(serialized.data).toContain(WI_ID);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6: Runtime coordinates merge execution with precondition validation
  // ─────────────────────────────────────────────────────────────────────────

  it('Runtime coordinates merge execution with precondition validation', () => {
    runtime.initialize();

    const sm = runtime.createWorkItemStateMachine(WI_ID, 'merge_ready');
    const mergeRunner = runtime.getMergeRunner();
    const recorder = runtime.getUserDecisionRecorder();

    const candidateManifestContent = JSON.stringify({
      schema_version: '1.0',
      work_item_id: WI_ID,
      base_spec_version: 'PSV-0001',
      target_spec_version: 'PSV-0002',
      candidates: [
        {
          candidate_path: '.specforge/work-items/WI-ORCH-001/candidates/requirements_index.md',
          target_path: '.specforge/project/requirements_index.md',
          operation: 'update',
        },
      ],
      generated_at: new Date().toISOString(),
    });

    const gateSummaryContent = '# Gate Summary\n**Overall**: ✅ PASSED';

    // Create user decision that hashes match
    const decision = recorder.recordApproval({
      workItemId: WI_ID,
      approved: true,
      baseSpecVersion: 'PSV-0001',
      candidateManifestContent,
      gateSummaryContent,
    });

    // Validate merge preconditions
    const preconditions = mergeRunner.validateMergePreconditions({
      userDecision: decision,
      currentManifestContent: candidateManifestContent,
      currentGateSummaryContent: gateSummaryContent,
      currentSpecVersion: 'PSV-0001',
      calculateHash: (content: string) => recorder.calculateHash(content),
    });
    expect(preconditions.valid).toBe(true);
    expect(preconditions.errors).toHaveLength(0);

    // Transition to merging
    sm.transition('merging', 'state_machine');
    expect(sm.getCurrentState()).toBe('merging');

    // Execute merge with in-memory candidates
    const manifest: CandidateManifest = JSON.parse(candidateManifestContent);
    const mergedTargets = new Map<string, string>();

    const mergeResult = mergeRunner.executeMerge({
      manifest,
      readCandidate: (path: string) => {
        if (path.includes('requirements_index.md')) {
          return '# Requirements Index\n\n## Updated Requirements';
        }
        return null;
      },
      writeTarget: (path: string, content: string) => {
        mergedTargets.set(path, content);
        return true;
      },
      calculateHash: (content: string) => recorder.calculateHash(content),
    });

    expect(mergeResult.success).toBe(true);
    expect(mergeResult.mergedFiles).toHaveLength(1);
    expect(mergeResult.mergedFiles[0]!.success).toBe(true);
    expect(mergedTargets.has('.specforge/project/requirements_index.md')).toBe(true);

    // Merge runner transitions to merged
    const transResult = sm.transition('merged', 'merge_runner');
    expect(transResult.success).toBe(true);
    expect(sm.getCurrentState()).toBe('merged');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 7: Runtime coordinates close_gate and prevents premature closure
  // ─────────────────────────────────────────────────────────────────────────

  it('Runtime coordinates close_gate and prevents premature closure', () => {
    runtime.initialize();

    const closeGate = runtime.getCloseGate();

    // Attempt close from wrong state — should fail
    const prematureResult = closeGate.validateClose({
      currentState: 'implementation_running',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
    });
    expect(prematureResult.canClose).toBe(false);
    expect(prematureResult.failedChecks).toContain('state_check');

    // Attempt close with missing conditions
    const incompleteResult = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: false,
      userDecisionExists: false,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
    });
    expect(incompleteResult.canClose).toBe(false);
    expect(incompleteResult.failedChecks).toContain('gates_check');
    expect(incompleteResult.failedChecks).toContain('user_decision_check');

    // Valid close with all conditions met + not_applicable for optional checks
    const validResult = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
      notApplicableFlags: new Set(['evidence_check', 'verification_check', 'trace_matrix_check']),
    });
    expect(validResult.canClose).toBe(true);
    expect(validResult.failedChecks).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 8: Runtime detects extension requests and blocks main flow
  // ─────────────────────────────────────────────────────────────────────────

  it('Runtime detects extension requests and blocks main flow', () => {
    runtime.initialize();

    const extensionRegistry = runtime.getExtensionRegistry();
    const extensionGate = runtime.getComponents().extensionGate;

    // Registry starts empty
    expect(extensionRegistry.isTypeRegistered('requirement_types', 'api_contract')).toBe(false);

    // Detect unknown types when agent uses an unregistered type
    const unknownTypes = extensionRegistry.detectUnknownTypes('requirements', ['api_contract', 'data_model']);
    expect(unknownTypes).toEqual(['api_contract', 'data_model']);

    // Generate blocking extension request
    const request = extensionRegistry.generateExtensionRequest({
      workItemId: WI_ID,
      artifactType: 'requirements',
      unknownTypes: ['api_contract', 'data_model'],
      blocking: true,
    });
    expect(request.blocking_current_flow).toBe(true);
    expect(request.requested_types).toHaveLength(2);

    // Extension gate validates the request
    const validation = extensionGate.validateCompleteness(request);
    expect(validation.valid).toBe(true);

    // Close gate should block when unprocessed extension request exists
    const closeGate = runtime.getCloseGate();
    const closeResult = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: true,  // Blocking!
      hasUnresolvedEscapedWriteIncident: false,
      notApplicableFlags: new Set(['evidence_check', 'verification_check', 'trace_matrix_check']),
    });
    expect(closeResult.canClose).toBe(false);
    expect(closeResult.failedChecks).toContain('extension_check');

    // After extension types are registered, the flow can continue
    extensionRegistry.registerType({
      namespace: 'requirement_types',
      typeId: 'api_contract',
      workItemId: WI_ID,
    });
    extensionRegistry.registerType({
      namespace: 'requirement_types',
      typeId: 'data_model',
      workItemId: WI_ID,
    });

    // Now the types are known
    const unknownAfter = extensionRegistry.detectUnknownTypes('requirements', ['api_contract', 'data_model']);
    expect(unknownAfter).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 9: Runtime prevents agent from directly transitioning states
  // ─────────────────────────────────────────────────────────────────────────

  it('Runtime prevents agent from directly transitioning states', () => {
    runtime.initialize();

    const sm = runtime.createWorkItemStateMachine(WI_ID);
    expect(sm.getCurrentState()).toBe('created');

    // Agent tries to transition — must be rejected (Requirement 8.23)
    const result = sm.transition('intake_ready', 'agent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Agent is not authorized');

    // State unchanged
    expect(sm.getCurrentState()).toBe('created');

    // Verify canTransition also blocks agent
    const canResult = sm.canTransition('intake_ready', 'agent');
    expect(canResult.legal).toBe(false);
    expect(canResult.reason).toContain('Agent is not authorized');

    // Agent boundary enforcement
    const boundaries = runtime.enforceAgentBoundaries();
    expect(boundaries.forbidden).toContain('State progression operations (Requirement 8.23)');
    expect(boundaries.forbidden).toContain('Permission management operations (Requirement 8.24)');
    expect(boundaries.forbidden).toContain('Merge operations (Requirement 8.25)');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 10: Runtime prevents writes when no active work item
  // ─────────────────────────────────────────────────────────────────────────

  it('Runtime prevents writes when no active work item', () => {
    runtime.initialize();

    const writeGuard = runtime.getWriteGuard();

    // Agent write with no work item — blocked
    const result = writeGuard.checkWrite({
      filePath: 'src/feature.ts',
      caller: 'agent',
      context: {
        workItemId: undefined,
        codeChangeAllowed: false,
        allowedWriteFiles: [],
        frozenFiles: [],
        isWorkItemClosed: false,
      },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No active work item');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 11: Runtime prevents writes after work item is closed
  // ─────────────────────────────────────────────────────────────────────────

  it('Runtime prevents writes after work item is closed', () => {
    runtime.initialize();

    const writeGuard = runtime.getWriteGuard();

    // Agent write after close — blocked unconditionally
    const result = writeGuard.checkWrite({
      filePath: 'src/anything.ts',
      caller: 'agent',
      context: {
        workItemId: WI_ID,
        codeChangeAllowed: true,
        allowedWriteFiles: ['src/anything.ts'],
        frozenFiles: [],
        isWorkItemClosed: true,
      },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Work item is closed');

    // Even merge_runner is blocked after close
    const mergeResult = writeGuard.checkWrite({
      filePath: '.specforge/project/spec.md',
      caller: 'merge_runner',
      context: {
        workItemId: WI_ID,
        codeChangeAllowed: true,
        allowedWriteFiles: [],
        frozenFiles: [],
        isWorkItemClosed: true,
      },
    });
    expect(mergeResult.allowed).toBe(false);
    expect(mergeResult.reason).toContain('Work item is closed');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 12: Full lifecycle through Runtime: created → closed
  // ─────────────────────────────────────────────────────────────────────────

  it('Full lifecycle through Runtime: created → closed', async () => {
    runtime.initialize();

    // ── Phase 1: Create work item and advance through intake ──
    const sm = runtime.createWorkItemStateMachine(WI_ID);
    expect(sm.getCurrentState()).toBe('created');

    sm.transition('intake_ready', 'state_machine');
    sm.transition('impact_analyzing', 'state_machine');
    sm.transition('impact_analyzed', 'state_machine');
    sm.transition('workflow_selected', 'state_machine');

    // ── Phase 2: Candidate preparation ──
    sm.transition('candidate_preparing', 'state_machine');

    // Enable code permissions for candidate generation
    const codePermService = runtime.getCodePermissionService();
    codePermService.enableCodeChanges(WI_ID, [
      '.specforge/work-items/WI-ORCH-001/candidates/requirements_index.md',
    ]);

    sm.transition('candidate_prepared', 'state_machine');

    // ── Phase 3: Gate execution ──
    sm.transition('gates_running', 'state_machine');
    expect(sm.getCurrentState()).toBe('gates_running');

    const gateRunner = runtime.getGateRunner();
    gateRunner.registerGate({
      gate_id: 'schema_check',
      gate_type: 'hard_gate',
      required: true,
      checkFn: (): GateCheckResult => ({
        gate_id: 'schema_check',
        passed: true,
        status: 'passed',
        reason: 'Schema is valid',
        executed_at: new Date().toISOString(),
      }),
    });

    const gateResult = await gateRunner.runGates();
    expect(gateResult.all_passed).toBe(true);

    // Gate runner determines next state
    const gateNextState = gateRunner.determineNextState(gateResult);
    expect(gateNextState).toBe('approval_required');
    sm.transition(gateNextState, 'gate_runner');
    expect(sm.getCurrentState()).toBe('approval_required');

    // ── Phase 4: User approval ──
    const candidateManifestContent = JSON.stringify({
      schema_version: '1.0',
      work_item_id: WI_ID,
      base_spec_version: 'PSV-0001',
      target_spec_version: 'PSV-0002',
      candidates: [
        {
          candidate_path: '.specforge/work-items/WI-ORCH-001/candidates/requirements_index.md',
          target_path: '.specforge/project/requirements_index.md',
          operation: 'update',
        },
      ],
      generated_at: new Date().toISOString(),
    });
    const gateSummaryContent = gateRunner.generateGateSummaryMarkdown(gateResult);

    const recorder = runtime.getUserDecisionRecorder();
    const decision = recorder.recordApproval({
      workItemId: WI_ID,
      approved: true,
      baseSpecVersion: 'PSV-0001',
      candidateManifestContent,
      gateSummaryContent,
      userId: 'architect-1',
    });
    expect(decision.approved).toBe(true);

    sm.transition('approved', 'user_decision_recorder');
    expect(sm.getCurrentState()).toBe('approved');

    // ── Phase 5: Merge execution ──
    sm.transition('merge_ready', 'state_machine');
    sm.transition('merging', 'state_machine');

    const mergeRunner = runtime.getMergeRunner();

    // Validate preconditions
    const preconditions = mergeRunner.validateMergePreconditions({
      userDecision: decision,
      currentManifestContent: candidateManifestContent,
      currentGateSummaryContent: gateSummaryContent,
      currentSpecVersion: 'PSV-0001',
      calculateHash: (c: string) => recorder.calculateHash(c),
    });
    expect(preconditions.valid).toBe(true);

    // Execute merge
    const manifest: CandidateManifest = JSON.parse(candidateManifestContent);
    const targetStore = new Map<string, string>();

    const mergeResult = mergeRunner.executeMerge({
      manifest,
      readCandidate: () => '# Requirements Index\n\n## New Content',
      writeTarget: (path: string, content: string) => {
        targetStore.set(path, content);
        return true;
      },
      calculateHash: (c: string) => recorder.calculateHash(c),
    });
    expect(mergeResult.success).toBe(true);

    sm.transition('merged', 'merge_runner');
    expect(sm.getCurrentState()).toBe('merged');

    // ── Phase 6: Post-merge → implementation → verification ──
    sm.transition('post_merge_verified', 'state_machine');
    sm.transition('implementation_ready', 'state_machine');
    sm.transition('implementation_running', 'code_permission_service');
    sm.transition('implementation_done', 'state_machine');
    sm.transition('verification_running', 'state_machine');
    sm.transition('verification_done', 'state_machine');
    expect(sm.getCurrentState()).toBe('verification_done');

    // ── Phase 7: Close Gate validation ──
    const closeGate = runtime.getCloseGate();
    const closeResult = closeGate.validateClose({
      currentState: sm.getCurrentState(),
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
      notApplicableFlags: new Set(['evidence_check', 'verification_check', 'trace_matrix_check']),
    });
    expect(closeResult.canClose).toBe(true);

    // Close gate transitions to closed
    sm.transition('closed', 'close_gate');
    expect(sm.getCurrentState()).toBe('closed');

    // ── Phase 8: Verify post-close invariants ──
    // No further transitions allowed from closed
    const postCloseTransition = sm.transition('intake_ready', 'state_machine');
    expect(postCloseTransition.success).toBe(false);
    expect(postCloseTransition.error).toContain('terminal state');

    // Writes blocked after close
    const writeGuard = runtime.getWriteGuard();
    const writeAfterClose = writeGuard.checkWrite({
      filePath: 'src/any.ts',
      caller: 'agent',
      context: {
        workItemId: WI_ID,
        codeChangeAllowed: true,
        allowedWriteFiles: ['src/any.ts'],
        frozenFiles: [],
        isWorkItemClosed: true,
      },
    });
    expect(writeAfterClose.allowed).toBe(false);

    // Verify state history recorded all transitions
    const history = sm.getStateHistory();
    expect(history.length).toBeGreaterThan(15);
    expect(history[0]!.from_state).toBe('created');
    expect(history[history.length - 1]!.to_state).toBe('closed');

    // Verify component boundaries are enforced
    const boundaries = runtime.enforceComponentBoundaries();
    expect(boundaries.stateMachine).toContain('manage state transitions only');
    expect(boundaries.writeGuard).toContain('intercept and block unauthorized writes only');
    expect(boundaries.mergeRunner).toContain('execute candidate merges per manifest only');

    // ── Phase 9: ChangedFilesAudit post-verification ──
    const audit = runtime.getChangedFilesAudit();
    const auditResult = audit.auditFileChanges({
      expectedFiles: ['src/main.ts'],
      actualChangedFiles: ['src/main.ts', 'src/unexpected.ts'],
      command: 'npm run build',
      workItemId: WI_ID,
    });
    // Should detect escaped write
    expect(auditResult).not.toBeNull();
    expect(auditResult!.escapedWrites).toContain('src/unexpected.ts');
  });
});
