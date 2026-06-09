/**
 * Feature: specforge-v1-1-compliance-remediation
 * Integration tests: Post-Merge Gate, Extension Subflow, Flow Resumption
 *
 * Tasks: 15.2, 26.3, 27.4, 28.2
 * Requirements: 3.25-3.28, 5.12-5.14, 5.19-5.25
 */

import { describe, it, expect } from 'vitest';
import {
  ExtensionSubflowScheduler,
  ExtensionAgent,
  FlowResumption,
} from '@/v11/runtime/ExtensionSubflow';
import { ExtensionRegistry, ExtensionGate } from '@/v11/runtime/ExtensionRegistry';
import { MergeRunner } from '@/v11/runtime/MergeRunner';
import { UserDecisionRecorder } from '@/v11/runtime/UserDecisionRecorder';
import type { ExtensionRequestData } from '@/v11/runtime/ExtensionRegistry';

describe('Post-Merge Gate Integration (Task 15.2)', () => {
  const runner = new MergeRunner();

  it('should pass post-merge validation on successful merge', () => {
    const result = runner.validatePostMerge({
      mergedFiles: [
        {
          candidatePath: '.specforge/work-items/WI-0001/candidates/req.md',
          targetPath: '.specforge/project/requirements.md',
          operation: 'create',
          preHash: '',
          postHash: 'abc123',
          success: true,
        },
      ],
      specVersionBefore: 'PSV-0001',
      specVersionAfter: 'PSV-0002',
      manifestExists: true,
    });

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail if merge had failed operations', () => {
    const result = runner.validatePostMerge({
      mergedFiles: [
        {
          candidatePath: '.specforge/work-items/WI-0001/candidates/req.md',
          targetPath: '.specforge/project/requirements.md',
          operation: 'create',
          preHash: '',
          postHash: '',
          success: false,
          error: 'Write failed',
        },
      ],
      specVersionBefore: 'PSV-0001',
      specVersionAfter: 'PSV-0002',
      manifestExists: true,
    });

    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('Failed merge operations');
  });

  it('should fail if spec version not incremented', () => {
    const result = runner.validatePostMerge({
      mergedFiles: [
        {
          candidatePath: '.specforge/work-items/WI-0001/candidates/req.md',
          targetPath: '.specforge/project/requirements.md',
          operation: 'create',
          preHash: '',
          postHash: 'abc123',
          success: true,
        },
      ],
      specVersionBefore: 'PSV-0001',
      specVersionAfter: 'PSV-0001',
      manifestExists: true,
    });

    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('not incremented');
  });

  it('should fail if manifest missing after merge', () => {
    const result = runner.validatePostMerge({
      mergedFiles: [
        {
          candidatePath: '.specforge/work-items/WI-0001/candidates/req.md',
          targetPath: '.specforge/project/requirements.md',
          operation: 'create',
          preHash: '',
          postHash: 'abc123',
          success: true,
        },
      ],
      specVersionBefore: 'PSV-0001',
      specVersionAfter: 'PSV-0002',
      manifestExists: false,
    });

    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('spec_manifest.json not found');
  });
});

describe('Extension Subflow Integration (Task 26.3)', () => {
  it('should complete full extension subflow lifecycle', () => {
    const registry = new ExtensionRegistry();
    const scheduler = new ExtensionSubflowScheduler('WI-0001');

    // Step 1: Detect unknown type
    const unknowns = registry.detectUnknownTypes('requirements', ['custom_type']);
    expect(unknowns).toContain('custom_type');

    // Step 2: Generate extension request
    const request = registry.generateExtensionRequest({
      workItemId: 'WI-0001',
      artifactType: 'requirements',
      unknownTypes: unknowns,
      blocking: true,
    });
    expect(request.blocking_current_flow).toBe(true);

    // Step 3: Start subflow
    const startResult = scheduler.startSubflow(request);
    expect(startResult.started).toBe(true);
    expect(scheduler.getState()).toBe('requested');

    // Step 4: Spawn agent
    const agentContext = scheduler.spawnAgent(registry.getData());
    expect(scheduler.getState()).toBe('agent_spawned');
    expect(agentContext.work_item_id).toBe('WI-0001');

    // Step 5: Agent generates candidate
    const agent = new ExtensionAgent();
    const candidate = agent.generateCandidate(agentContext);
    expect(candidate.extension_delta_md).toContain('custom_type');
    expect(candidate.extension_registry_update.namespaces).toBeDefined();

    // Step 6: Receive candidate
    const receiveResult = scheduler.receiveCandidate(candidate);
    expect(receiveResult.accepted).toBe(true);
    expect(scheduler.getState()).toBe('candidate_generated');
  });

  it('should reject invalid candidate', () => {
    const registry = new ExtensionRegistry();
    const scheduler = new ExtensionSubflowScheduler('WI-0001');

    const request = registry.generateExtensionRequest({
      workItemId: 'WI-0001',
      artifactType: 'requirements',
      unknownTypes: ['custom_type'],
    });

    scheduler.startSubflow(request);
    scheduler.spawnAgent(registry.getData());

    const result = scheduler.receiveCandidate({
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      extension_delta_md: '',
      extension_registry_update: {},
      generated_at: new Date().toISOString(),
    });

    expect(result.accepted).toBe(false);
  });
});

describe('Extension Approval and Merge Integration (Task 27.4)', () => {
  it('should complete extension approval flow', () => {
    const registry = new ExtensionRegistry();
    const scheduler = new ExtensionSubflowScheduler('WI-0001');
    const gate = new ExtensionGate();
    const recorder = new UserDecisionRecorder();

    // Generate and start subflow
    const request = registry.generateExtensionRequest({
      workItemId: 'WI-0001',
      artifactType: 'requirements',
      unknownTypes: ['performance_req'],
    });

    scheduler.startSubflow(request);
    scheduler.spawnAgent(registry.getData());

    // Agent generates candidate
    const agent = new ExtensionAgent();
    const candidate = agent.generateCandidate({
      work_item_id: 'WI-0001',
      requested_types: request.requested_types,
      current_registry: registry.getData(),
      usage_context: 'test',
    });
    scheduler.receiveCandidate(candidate);

    // Run extension_gate
    scheduler.startGateValidation();
    const completeness = gate.validateCompleteness(request);
    expect(completeness.valid).toBe(true);

    const noConflicts = gate.validateNoConflicts(request, registry.getData());
    expect(noConflicts.valid).toBe(true);

    scheduler.recordGateResult(true);
    expect(scheduler.getState()).toBe('gate_passed');

    // User approval
    const decision = recorder.recordApproval({
      workItemId: 'WI-0001',
      approved: true,
      baseSpecVersion: 'PSV-0001',
      candidateManifestContent: JSON.stringify(candidate),
      gateSummaryContent: 'All gates passed',
    });
    expect(decision.approved).toBe(true);

    scheduler.recordApproval();
    expect(scheduler.getState()).toBe('approved');

    // Merge: register the types
    const registerResult = registry.registerType({
      namespace: 'requirement_types',
      typeId: 'performance_req',
      workItemId: 'WI-0001',
    });
    expect(registerResult.success).toBe(true);

    scheduler.recordMerge();
    expect(scheduler.getState()).toBe('merged');

    // Verify type now registered
    const unknownsAfter = registry.detectUnknownTypes('requirements', ['performance_req']);
    expect(unknownsAfter).toHaveLength(0);
  });
});

describe('Flow Resumption Integration (Task 28.2)', () => {
  it('should resume main flow after extension registration', () => {
    const registry = new ExtensionRegistry();
    const scheduler = new ExtensionSubflowScheduler('WI-0001');
    const resumption = new FlowResumption();

    // Complete extension subflow
    const request = registry.generateExtensionRequest({
      workItemId: 'WI-0001',
      artifactType: 'design',
      unknownTypes: ['security_design'],
    });

    scheduler.startSubflow(request);
    scheduler.spawnAgent(registry.getData());
    const agent = new ExtensionAgent();
    const candidate = agent.generateCandidate({
      work_item_id: 'WI-0001',
      requested_types: request.requested_types,
      current_registry: registry.getData(),
      usage_context: 'security analysis',
    });
    scheduler.receiveCandidate(candidate);
    scheduler.startGateValidation();
    scheduler.recordGateResult(true);
    scheduler.recordApproval();

    // Register the type
    registry.registerType({
      namespace: 'design_types',
      typeId: 'security_design',
      workItemId: 'WI-0001',
    });

    scheduler.recordMerge();
    scheduler.complete();

    // Check flow resumption
    const result = resumption.canResumeMainFlow({
      extensionSubflowState: scheduler.getState(),
      registry: registry.getData(),
      previouslyUnknownTypes: [{ namespace: 'design_types', typeId: 'security_design' }],
    });

    expect(result.canResume).toBe(true);
    expect(result.newTypesRegistered).toContain('security_design');

    // Create regeneration request
    const regenRequest = resumption.createRegenerationRequest({
      workItemId: 'WI-0001',
      newTypes: result.newTypesRegistered,
      artifactTypes: ['design'],
    });

    expect(regenRequest.work_item_id).toBe('WI-0001');
    expect(regenRequest.types_to_use).toContain('security_design');
  });

  it('should block resumption when types not registered', () => {
    const registry = new ExtensionRegistry();
    const resumption = new FlowResumption();

    const result = resumption.canResumeMainFlow({
      extensionSubflowState: 'completed',
      registry: registry.getData(),
      previouslyUnknownTypes: [{ namespace: 'requirement_types', typeId: 'missing_type' }],
    });

    expect(result.canResume).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('should block resumption when subflow not completed', () => {
    const registry = new ExtensionRegistry();
    const resumption = new FlowResumption();

    const result = resumption.canResumeMainFlow({
      extensionSubflowState: 'agent_spawned',
      registry: registry.getData(),
      previouslyUnknownTypes: [],
    });

    expect(result.canResume).toBe(false);
  });
});
