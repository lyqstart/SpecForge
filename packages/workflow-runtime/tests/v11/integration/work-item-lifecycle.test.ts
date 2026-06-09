/**
 * Feature: specforge-v1-1-compliance-remediation
 * Integration test: Complete work item lifecycle
 *
 * Tests the full lifecycle from creation to close using all runtime components.
 */

import { describe, it, expect } from 'vitest';
import { Runtime } from '@/v11/runtime/Runtime';

describe('Work Item Lifecycle Integration', () => {
  it('should support complete work item lifecycle', () => {
    const runtime = new Runtime({
      projectRoot: '/tmp/test-project',
      projectName: 'test-project',
    });

    // Verify all components are accessible
    expect(runtime.getPathService()).toBeDefined();
    expect(runtime.getPathPolicy()).toBeDefined();
    expect(runtime.getGateRunner()).toBeDefined();
    expect(runtime.getUserDecisionRecorder()).toBeDefined();
    expect(runtime.getMergeRunner()).toBeDefined();
    expect(runtime.getWriteGuard()).toBeDefined();
    expect(runtime.getCodePermissionService()).toBeDefined();
    expect(runtime.getChangedFilesAudit()).toBeDefined();
    expect(runtime.getExtensionRegistry()).toBeDefined();
    expect(runtime.getCloseGate()).toBeDefined();
  });

  it('should enforce component boundaries', () => {
    const runtime = new Runtime({
      projectRoot: '/tmp/test-project',
      projectName: 'test-project',
    });

    const boundaries = runtime.enforceComponentBoundaries();
    expect(boundaries.pathService).toHaveLength(1);
    expect(boundaries.pathPolicy).toHaveLength(1);
    expect(boundaries.stateMachine).toHaveLength(1);
    expect(boundaries.gateRunner).toHaveLength(1);
    expect(boundaries.mergeRunner).toHaveLength(1);
    expect(boundaries.writeGuard).toHaveLength(1);
    expect(boundaries.closeGate).toHaveLength(1);
  });

  it('should enforce agent boundaries', () => {
    const runtime = new Runtime({
      projectRoot: '/tmp/test-project',
      projectName: 'test-project',
    });

    const boundaries = runtime.enforceAgentBoundaries();
    expect(boundaries.allowed).toHaveLength(1);
    expect(boundaries.forbidden).toHaveLength(3);
  });

  it('should complete full state machine lifecycle', () => {
    const runtime = new Runtime({
      projectRoot: '/tmp/test-project',
      projectName: 'test-project',
    });

    const sm = runtime.createWorkItemStateMachine('WI-0001');

    // Full happy path
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

    // Verify history
    expect(sm.getStateHistory()).toHaveLength(19);
    expect(sm.getCurrentState()).toBe('closed');
  });

  it('should support close gate validation', () => {
    const runtime = new Runtime({
      projectRoot: '/tmp/test-project',
      projectName: 'test-project',
    });

    const closeGate = runtime.getCloseGate();
    const result = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      evidenceManifestExists: true,
      verificationReportExists: true,
      traceMatrixUpdated: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
    });

    expect(result.canClose).toBe(true);
  });

  it('should support extension registry lifecycle', () => {
    const runtime = new Runtime({
      projectRoot: '/tmp/test-project',
      projectName: 'test-project',
    });

    const registry = runtime.getExtensionRegistry();

    // Detect unknown type
    const unknowns = registry.detectUnknownTypes('requirements', ['custom_type']);
    expect(unknowns).toContain('custom_type');

    // Generate extension request
    const request = registry.generateExtensionRequest({
      workItemId: 'WI-0001',
      artifactType: 'requirements',
      unknownTypes: unknowns,
    });
    expect(request.blocking_current_flow).toBe(true);

    // Register the type
    const result = registry.registerType({
      namespace: 'requirement_types',
      typeId: 'custom_type',
      workItemId: 'WI-0001',
    });
    expect(result.success).toBe(true);

    // Verify no longer unknown
    const unknownsAfter = registry.detectUnknownTypes('requirements', ['custom_type']);
    expect(unknownsAfter).toHaveLength(0);
  });

  it('should support merge pipeline with precondition validation', () => {
    const runtime = new Runtime({
      projectRoot: '/tmp/test-project',
      projectName: 'test-project',
    });

    const recorder = runtime.getUserDecisionRecorder();
    const mergeRunner = runtime.getMergeRunner();

    const manifestContent = '{"manifest": "data"}';
    const gateSummary = '# All passed';

    const decision = recorder.recordApproval({
      workItemId: 'WI-0001',
      approved: true,
      baseSpecVersion: 'PSV-0001',
      candidateManifestContent: manifestContent,
      gateSummaryContent: gateSummary,
    });

    const preconditions = mergeRunner.validateMergePreconditions({
      userDecision: decision,
      currentManifestContent: manifestContent,
      currentGateSummaryContent: gateSummary,
      currentSpecVersion: 'PSV-0001',
      calculateHash: (s) => recorder.calculateHash(s),
    });

    expect(preconditions.valid).toBe(true);
  });
});
