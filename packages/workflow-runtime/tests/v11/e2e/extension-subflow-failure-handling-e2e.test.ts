/**
 * WI-5: Extension Subflow Failure Handling E2E
 *
 * Tests failure paths in the extension subflow:
 * - Gate failure → subflow rejected, no merge
 * - User Decision rejected → cannot merge
 * - Unresolved extension_request blocks close_gate
 * - Stale candidate invalidation on flow resumption
 */

import { describe, it, expect } from 'vitest';
import {
  ExtensionSubflowScheduler,
  ExtensionGate,
  ExtensionRegistry,
  FlowResumption,
  CloseGate,
  type ExtensionRegistryData,
} from '@/v11/index';

describe('WI-5: Extension Subflow Failure Handling E2E', () => {
  describe('Gate failed → subflow rejected, no merge', () => {
    it('extension_gate failure rejects subflow', () => {
      const scheduler = new ExtensionSubflowScheduler('WI-FAIL-001');
      const request = {
        schema_version: '1.0' as const,
        work_item_id: 'WI-FAIL-001',
        requested_types: [{ namespace: 'design_types', type_id: 'retry_policy', usage_context: 'test' }],
        blocking_current_flow: true,
        requested_at: new Date().toISOString(),
      };
      scheduler.startSubflow(request);
      
      const registry: ExtensionRegistryData = { schema_version: '1.0', project_spec_version: 'PSV-0001', namespaces: { requirement_types: [], design_types: [], task_types: [], verification_types: [], gate_types: [] }, updated_by_work_item: null, updated_at: null };
      scheduler.spawnAgent(registry);
      
      const candidate = { schema_version: '1.0' as const, work_item_id: 'WI-FAIL-001', extension_delta_md: '# delta', extension_registry_update: { namespaces: { ...registry.namespaces, design_types: ['retry_policy'] } }, generated_at: new Date().toISOString() };
      scheduler.receiveCandidate(candidate);
      scheduler.startGateValidation();
      
      // Gate FAILS
      scheduler.recordGateResult(false);
      expect(scheduler.getState()).toBe('rejected');
      
      // Cannot approve or merge after rejection
      expect(() => scheduler.recordApproval()).toThrow();
      expect(() => scheduler.recordMerge()).toThrow();
    });
  });

  describe('User Decision rejected → no merge', () => {
    it('gate passes but approval not given → cannot merge', () => {
      const scheduler = new ExtensionSubflowScheduler('WI-FAIL-002');
      const request = {
        schema_version: '1.0' as const,
        work_item_id: 'WI-FAIL-002',
        requested_types: [{ namespace: 'design_types', type_id: 'circuit_breaker', usage_context: 'test' }],
        blocking_current_flow: true,
        requested_at: new Date().toISOString(),
      };
      scheduler.startSubflow(request);
      const registry: ExtensionRegistryData = { schema_version: '1.0', project_spec_version: 'PSV-0001', namespaces: { requirement_types: [], design_types: [], task_types: [], verification_types: [], gate_types: [] }, updated_by_work_item: null, updated_at: null };
      scheduler.spawnAgent(registry);
      const candidate = { schema_version: '1.0' as const, work_item_id: 'WI-FAIL-002', extension_delta_md: '# delta', extension_registry_update: { namespaces: { ...registry.namespaces, design_types: ['circuit_breaker'] } }, generated_at: new Date().toISOString() };
      scheduler.receiveCandidate(candidate);
      scheduler.startGateValidation();
      scheduler.recordGateResult(true);
      expect(scheduler.getState()).toBe('gate_passed');
      
      // Without recordApproval(), cannot merge
      expect(() => scheduler.recordMerge()).toThrow();
    });
  });

  describe('Unresolved extension_request blocks close_gate', () => {
    it('close_gate fails when hasUnprocessedExtensionRequest=true', () => {
      const closeGate = new CloseGate();
      const result = closeGate.validateClose({
        currentState: 'verification_done',
        gatesAllPassed: true,
        userDecisionExists: true,
        mergeReportExists: true,
        mergeReportAllSuccess: true,
        specVersionIncremented: true,
        hasUnprocessedExtensionRequest: true,
        hasUnresolvedEscapedWriteIncident: false,
        notApplicableFlags: new Set<string>(),
        evidenceManifestExists: true,
        verificationReportExists: true,
        traceMatrixUpdated: true,
      });
      expect(result.canClose).toBe(false);
      expect(result.failedChecks).toContain('extension_check');
    });
  });

  describe('Stale candidate invalidation on flow resumption', () => {
    it('flow resumption fails if types not actually registered', () => {
      const flow = new FlowResumption();
      const emptyRegistry: ExtensionRegistryData = { schema_version: '1.0', project_spec_version: 'PSV-0001', namespaces: { requirement_types: [], design_types: [], task_types: [], verification_types: [], gate_types: [] }, updated_by_work_item: null, updated_at: null };
      const result = flow.canResumeMainFlow({
        extensionSubflowState: 'completed',
        registry: emptyRegistry,
        previouslyUnknownTypes: [{ namespace: 'design_types', typeId: 'retry_policy' }],
      });
      expect(result.canResume).toBe(false);
      expect(result.errors[0]).toContain('not registered');
    });

    it('flow resumption fails if subflow not completed', () => {
      const flow = new FlowResumption();
      const registry: ExtensionRegistryData = { schema_version: '1.0', project_spec_version: 'PSV-0002', namespaces: { requirement_types: [], design_types: ['retry_policy'], task_types: [], verification_types: [], gate_types: [] }, updated_by_work_item: 'WI-001', updated_at: new Date().toISOString() };
      const result = flow.canResumeMainFlow({
        extensionSubflowState: 'gate_running',
        registry,
        previouslyUnknownTypes: [{ namespace: 'design_types', typeId: 'retry_policy' }],
      });
      expect(result.canResume).toBe(false);
      expect(result.errors[0]).toContain('not completed');
    });
  });
});
