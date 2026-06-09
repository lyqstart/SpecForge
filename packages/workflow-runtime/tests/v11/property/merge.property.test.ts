/**
 * Feature: specforge-v1-1-compliance-remediation
 * Property 8: Merge Precondition Hash Validation
 *
 * Validates: Requirements 3.15, 3.16, 3.17, 3.18, 3.19
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MergeRunner } from '@/v11/runtime/MergeRunner';
import { UserDecisionRecorder } from '@/v11/runtime/UserDecisionRecorder';

describe('Property 8: Merge Precondition Hash Validation', () => {
  const recorder = new UserDecisionRecorder();
  const runner = new MergeRunner();

  it('should detect manifest hash mismatch and reject merge', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (originalContent, modifiedContent) => {
          // Only test when contents actually differ
          if (originalContent === modifiedContent) return true;

          const decision = recorder.recordApproval({
            workItemId: 'WI-0001',
            approved: true,
            baseSpecVersion: 'PSV-0001',
            candidateManifestContent: originalContent,
            gateSummaryContent: 'gate-summary',
          });

          const preconditions = runner.validateMergePreconditions({
            userDecision: decision,
            currentManifestContent: modifiedContent, // Different from original
            currentGateSummaryContent: 'gate-summary',
            currentSpecVersion: 'PSV-0001',
            calculateHash: (s) => recorder.calculateHash(s),
          });

          return !preconditions.valid;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should detect gate summary hash mismatch and reject merge', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (originalSummary, modifiedSummary) => {
          if (originalSummary === modifiedSummary) return true;

          const manifest = 'manifest-content';
          const decision = recorder.recordApproval({
            workItemId: 'WI-0001',
            approved: true,
            baseSpecVersion: 'PSV-0001',
            candidateManifestContent: manifest,
            gateSummaryContent: originalSummary,
          });

          const preconditions = runner.validateMergePreconditions({
            userDecision: decision,
            currentManifestContent: manifest,
            currentGateSummaryContent: modifiedSummary, // Different
            currentSpecVersion: 'PSV-0001',
            calculateHash: (s) => recorder.calculateHash(s),
          });

          return !preconditions.valid;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should detect spec version mismatch and reject merge', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (originalVersion, currentVersion) => {
          if (originalVersion === currentVersion) return true;

          const manifest = 'manifest-content';
          const summary = 'gate-summary';
          const decision = recorder.recordApproval({
            workItemId: 'WI-0001',
            approved: true,
            baseSpecVersion: originalVersion,
            candidateManifestContent: manifest,
            gateSummaryContent: summary,
          });

          const preconditions = runner.validateMergePreconditions({
            userDecision: decision,
            currentManifestContent: manifest,
            currentGateSummaryContent: summary,
            currentSpecVersion: currentVersion, // Different
            calculateHash: (s) => recorder.calculateHash(s),
          });

          return !preconditions.valid;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should accept merge when all preconditions match', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (manifest, summary, version) => {
          const decision = recorder.recordApproval({
            workItemId: 'WI-0001',
            approved: true,
            baseSpecVersion: version,
            candidateManifestContent: manifest,
            gateSummaryContent: summary,
          });

          const preconditions = runner.validateMergePreconditions({
            userDecision: decision,
            currentManifestContent: manifest, // Same
            currentGateSummaryContent: summary, // Same
            currentSpecVersion: version, // Same
            calculateHash: (s) => recorder.calculateHash(s),
          });

          return preconditions.valid;
        },
      ),
      { numRuns: 100 },
    );
  });
});
