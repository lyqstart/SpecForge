/**
 * Feature: specforge-v1-1-compliance-remediation
 * Unit tests for Close Gate
 *
 * Requirements: 7.1-7.14
 */

import { describe, it, expect } from 'vitest';
import { CloseGate } from '@/v11/runtime/CloseGate';

describe('CloseGate', () => {
  const closeGate = new CloseGate();

  describe('Successful close', () => {
    it('should pass when all checks pass', () => {
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
      expect(result.failedChecks).toHaveLength(0);
      expect(result.checks).toHaveLength(10);
    });
  });

  describe('State check (Requirement 7.1)', () => {
    it('should fail when state is not verification_done', () => {
      const result = closeGate.validateClose({
        currentState: 'implementation_done',
        gatesAllPassed: true,
        userDecisionExists: true,
        mergeReportExists: true,
        mergeReportAllSuccess: true,
        specVersionIncremented: true,
        hasUnprocessedExtensionRequest: false,
        hasUnresolvedEscapedWriteIncident: false,
      });

      expect(result.canClose).toBe(false);
      expect(result.failedChecks).toContain('state_check');
    });
  });

  describe('Gates check (Requirement 7.2)', () => {
    it('should fail when gates not all passed', () => {
      const result = closeGate.validateClose({
        currentState: 'verification_done',
        gatesAllPassed: false,
        userDecisionExists: true,
        mergeReportExists: true,
        mergeReportAllSuccess: true,
        specVersionIncremented: true,
        hasUnprocessedExtensionRequest: false,
        hasUnresolvedEscapedWriteIncident: false,
      });

      expect(result.canClose).toBe(false);
      expect(result.failedChecks).toContain('gates_check');
    });
  });

  describe('User decision check (Requirement 7.3)', () => {
    it('should fail when user decision missing', () => {
      const result = closeGate.validateClose({
        currentState: 'verification_done',
        gatesAllPassed: true,
        userDecisionExists: false,
        mergeReportExists: true,
        mergeReportAllSuccess: true,
        specVersionIncremented: true,
        hasUnprocessedExtensionRequest: false,
        hasUnresolvedEscapedWriteIncident: false,
      });

      expect(result.canClose).toBe(false);
      expect(result.failedChecks).toContain('user_decision_check');
    });
  });

  describe('Merge report check (Requirement 7.4)', () => {
    it('should fail when merge report missing', () => {
      const result = closeGate.validateClose({
        currentState: 'verification_done',
        gatesAllPassed: true,
        userDecisionExists: true,
        mergeReportExists: false,
        mergeReportAllSuccess: false,
        specVersionIncremented: true,
        hasUnprocessedExtensionRequest: false,
        hasUnresolvedEscapedWriteIncident: false,
      });

      expect(result.canClose).toBe(false);
      expect(result.failedChecks).toContain('merge_report_check');
    });
  });

  describe('Extension check (Requirement 7.9)', () => {
    it('should fail when unprocessed extension request exists', () => {
      const result = closeGate.validateClose({
        currentState: 'verification_done',
        gatesAllPassed: true,
        userDecisionExists: true,
        mergeReportExists: true,
        mergeReportAllSuccess: true,
        specVersionIncremented: true,
        hasUnprocessedExtensionRequest: true,
        hasUnresolvedEscapedWriteIncident: false,
      });

      expect(result.canClose).toBe(false);
      expect(result.failedChecks).toContain('extension_check');
    });
  });

  describe('Write audit check (Requirement 7.10)', () => {
    it('should fail when unresolved escaped write incident exists', () => {
      const result = closeGate.validateClose({
        currentState: 'verification_done',
        gatesAllPassed: true,
        userDecisionExists: true,
        mergeReportExists: true,
        mergeReportAllSuccess: true,
        specVersionIncremented: true,
        hasUnprocessedExtensionRequest: false,
        hasUnresolvedEscapedWriteIncident: true,
      });

      expect(result.canClose).toBe(false);
      expect(result.failedChecks).toContain('write_audit_check');
    });
  });

  describe('not_applicable flag support (Requirement 7.14)', () => {
    it('should skip evidence check when not_applicable', () => {
      const result = closeGate.validateClose({
        currentState: 'verification_done',
        gatesAllPassed: true,
        userDecisionExists: true,
        mergeReportExists: true,
        mergeReportAllSuccess: true,
        specVersionIncremented: true,
        evidenceManifestExists: false, // Missing but NA
        verificationReportExists: true,
        traceMatrixUpdated: true,
        hasUnprocessedExtensionRequest: false,
        hasUnresolvedEscapedWriteIncident: false,
        notApplicableFlags: new Set(['evidence_check']),
      });

      expect(result.canClose).toBe(true);
      const evidenceCheck = result.checks.find((c) => c.name === 'evidence_check');
      expect(evidenceCheck!.notApplicable).toBe(true);
    });

    it('should skip verification check when not_applicable', () => {
      const result = closeGate.validateClose({
        currentState: 'verification_done',
        gatesAllPassed: true,
        userDecisionExists: true,
        mergeReportExists: true,
        mergeReportAllSuccess: true,
        specVersionIncremented: true,
        evidenceManifestExists: true,
        verificationReportExists: false, // Missing but NA
        traceMatrixUpdated: true,
        hasUnprocessedExtensionRequest: false,
        hasUnresolvedEscapedWriteIncident: false,
        notApplicableFlags: new Set(['verification_check']),
      });

      expect(result.canClose).toBe(true);
    });

    it('should skip trace matrix check when not_applicable', () => {
      const result = closeGate.validateClose({
        currentState: 'verification_done',
        gatesAllPassed: true,
        userDecisionExists: true,
        mergeReportExists: true,
        mergeReportAllSuccess: true,
        specVersionIncremented: true,
        evidenceManifestExists: true,
        verificationReportExists: true,
        traceMatrixUpdated: false, // Missing but NA
        hasUnprocessedExtensionRequest: false,
        hasUnresolvedEscapedWriteIncident: false,
        notApplicableFlags: new Set(['trace_matrix_check']),
      });

      expect(result.canClose).toBe(true);
    });
  });

  describe('Multiple failures', () => {
    it('should report all failures', () => {
      const result = closeGate.validateClose({
        currentState: 'created', // Wrong state
        gatesAllPassed: false,
        userDecisionExists: false,
        mergeReportExists: false,
        mergeReportAllSuccess: false,
        specVersionIncremented: false,
        hasUnprocessedExtensionRequest: true,
        hasUnresolvedEscapedWriteIncident: true,
      });

      expect(result.canClose).toBe(false);
      expect(result.failedChecks.length).toBeGreaterThan(3);
    });
  });
});
