/**
 * Feature: specforge-v1-1-compliance-remediation
 * Unit tests for User Decision Recorder
 *
 * Requirements: 3.10-3.14
 */

import { describe, it, expect } from 'vitest';
import { UserDecisionRecorder } from '@/v11/runtime/UserDecisionRecorder';

describe('UserDecisionRecorder', () => {
  const recorder = new UserDecisionRecorder();

  describe('Record user decision', () => {
    it('should record approval with all required fields', () => {
      const decision = recorder.recordApproval({
        workItemId: 'WI-0001',
        approved: true,
        baseSpecVersion: 'PSV-0001',
        candidateManifestContent: '{"manifest": "data"}',
        gateSummaryContent: '# Gate Summary\nAll passed',
        userId: 'user@example.com',
        comments: 'Looks good',
      });

      expect(decision.schema_version).toBe('1.0');
      expect(decision.work_item_id).toBe('WI-0001');
      expect(decision.approved).toBe(true);
      expect(decision.base_spec_version).toBe('PSV-0001');
      expect(decision.candidate_manifest_hash).toBeTruthy();
      expect(decision.gate_summary_hash).toBeTruthy();
      expect(decision.decided_at).toBeTruthy();
      expect(decision.user_id).toBe('user@example.com');
    });

    it('should calculate consistent hashes', () => {
      const hash1 = recorder.calculateHash('test content');
      const hash2 = recorder.calculateHash('test content');
      expect(hash1).toBe(hash2);
    });

    it('should calculate different hashes for different content', () => {
      const hash1 = recorder.calculateHash('content A');
      const hash2 = recorder.calculateHash('content B');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Serialization', () => {
    it('should serialize and parse decisions', () => {
      const decision = recorder.recordApproval({
        workItemId: 'WI-0001',
        approved: true,
        baseSpecVersion: 'PSV-0001',
        candidateManifestContent: 'manifest',
        gateSummaryContent: 'summary',
      });

      const serialized = recorder.serializeDecision(decision);
      expect(serialized.success).toBe(true);

      const parsed = recorder.parseDecision(serialized.data!);
      expect(parsed.success).toBe(true);
      expect(parsed.data!.work_item_id).toBe('WI-0001');
      expect(parsed.data!.approved).toBe(true);
    });
  });
});
