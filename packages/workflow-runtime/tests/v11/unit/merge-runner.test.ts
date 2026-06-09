/**
 * Feature: specforge-v1-1-compliance-remediation
 * Unit tests for Merge Runner
 *
 * Requirements: 3.1-3.24
 */

import { describe, it, expect } from 'vitest';
import { MergeRunner } from '@/v11/runtime/MergeRunner';

describe('MergeRunner', () => {
  const runner = new MergeRunner();

  describe('Candidate format validation', () => {
    it('should accept complete file contents', () => {
      expect(runner.validateCandidateFormat('# Requirements\n\nSome content').valid).toBe(true);
      expect(runner.validateCandidateFormat('{ "key": "value" }').valid).toBe(true);
    });

    it('should reject patch format', () => {
      const result = runner.validateCandidateFormat('--- a/file.md\n+++ b/file.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Patch/diff');
    });

    it('should reject diff --git format', () => {
      const result = runner.validateCandidateFormat('diff --git a/file.md b/file.md');
      expect(result.valid).toBe(false);
    });

    it('should reject unified diff hunks', () => {
      const result = runner.validateCandidateFormat('@@ -1,3 +1,3 @@\n-old\n+new');
      expect(result.valid).toBe(false);
    });
  });

  describe('Candidate manifest parsing', () => {
    it('should parse valid manifest', () => {
      const json = JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        base_spec_version: 'PSV-0001',
        target_spec_version: 'PSV-0002',
        candidates: [{
          candidate_path: '.specforge/work-items/WI-0001/candidates/requirements.md',
          target_path: '.specforge/project/requirements_index.md',
          operation: 'update',
        }],
        generated_at: new Date().toISOString(),
      });

      const result = runner.parseCandidateManifest(json);
      expect(result.success).toBe(true);
      expect(result.data!.work_item_id).toBe('WI-0001');
    });

    it('should reject manifest with invalid candidate_path', () => {
      const json = JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        base_spec_version: 'PSV-0001',
        target_spec_version: 'PSV-0002',
        candidates: [{
          candidate_path: '/invalid/path/file.md',
          target_path: '.specforge/project/requirements_index.md',
          operation: 'update',
        }],
        generated_at: new Date().toISOString(),
      });

      const result = runner.parseCandidateManifest(json);
      expect(result.success).toBe(false);
      expect(result.error).toContain('candidates/');
    });

    it('should reject manifest with invalid target_path', () => {
      const json = JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        base_spec_version: 'PSV-0001',
        target_spec_version: 'PSV-0002',
        candidates: [{
          candidate_path: '.specforge/work-items/WI-0001/candidates/req.md',
          target_path: '/invalid/target.md',
          operation: 'update',
        }],
        generated_at: new Date().toISOString(),
      });

      const result = runner.parseCandidateManifest(json);
      expect(result.success).toBe(false);
      expect(result.error).toContain('.specforge/project/');
    });
  });

  describe('Merge precondition validation', () => {
    it('should pass when all preconditions match', () => {
      const hashFn = (s: string) => `hash:${s.length}`;
      const manifestContent = '{"manifest": "data"}';
      const gateSummary = '# Summary';

      const decision = {
        schema_version: '1.0' as const,
        work_item_id: 'WI-0001',
        approved: true,
        decided_at: new Date().toISOString(),
        base_spec_version: 'PSV-0001',
        candidate_manifest_hash: hashFn(manifestContent),
        gate_summary_hash: hashFn(gateSummary),
      };

      const result = runner.validateMergePreconditions({
        userDecision: decision,
        currentManifestContent: manifestContent,
        currentGateSummaryContent: gateSummary,
        currentSpecVersion: 'PSV-0001',
        calculateHash: hashFn,
      });

      expect(result.valid).toBe(true);
    });

    it('should fail on hash mismatch', () => {
      const hashFn = (s: string) => `hash:${s}`;
      const decision = {
        schema_version: '1.0' as const,
        work_item_id: 'WI-0001',
        approved: true,
        decided_at: new Date().toISOString(),
        base_spec_version: 'PSV-0001',
        candidate_manifest_hash: 'old-hash',
        gate_summary_hash: 'old-gate-hash',
      };

      const result = runner.validateMergePreconditions({
        userDecision: decision,
        currentManifestContent: 'new content',
        currentGateSummaryContent: 'new summary',
        currentSpecVersion: 'PSV-0001',
        calculateHash: hashFn,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail on version mismatch', () => {
      const hashFn = (s: string) => `hash:${s.length}`;
      const content = 'manifest';

      const decision = {
        schema_version: '1.0' as const,
        work_item_id: 'WI-0001',
        approved: true,
        decided_at: new Date().toISOString(),
        base_spec_version: 'PSV-0001',
        candidate_manifest_hash: hashFn(content),
        gate_summary_hash: hashFn('summary'),
      };

      const result = runner.validateMergePreconditions({
        userDecision: decision,
        currentManifestContent: content,
        currentGateSummaryContent: 'summary',
        currentSpecVersion: 'PSV-0099', // Different!
        calculateHash: hashFn,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('version mismatch'))).toBe(true);
    });
  });

  describe('Merge execution', () => {
    it('should execute merge and generate results', () => {
      const store = new Map<string, string>();
      const hashFn = (s: string) => `hash:${s.length}`;

      const manifest = {
        schema_version: '1.0' as const,
        work_item_id: 'WI-0001',
        base_spec_version: 'PSV-0001',
        target_spec_version: 'PSV-0002',
        candidates: [{
          candidate_path: '.specforge/work-items/WI-0001/candidates/requirements.md',
          target_path: '.specforge/project/requirements_index.md',
          operation: 'update' as const,
        }],
        generated_at: new Date().toISOString(),
      };

      const result = runner.executeMerge({
        manifest,
        readCandidate: (path) => `# Requirements content from ${path}`,
        writeTarget: (path, content) => { store.set(path, content); return true; },
        calculateHash: hashFn,
      });

      expect(result.success).toBe(true);
      expect(result.mergedFiles).toHaveLength(1);
      expect(result.mergedFiles[0].success).toBe(true);
      expect(store.has('.specforge/project/requirements_index.md')).toBe(true);
    });

    it('should report failure for missing candidates', () => {
      const hashFn = (s: string) => `hash:${s.length}`;
      const manifest = {
        schema_version: '1.0' as const,
        work_item_id: 'WI-0001',
        base_spec_version: 'PSV-0001',
        target_spec_version: 'PSV-0002',
        candidates: [{
          candidate_path: '.specforge/work-items/WI-0001/candidates/missing.md',
          target_path: '.specforge/project/missing.md',
          operation: 'create' as const,
        }],
        generated_at: new Date().toISOString(),
      };

      const result = runner.executeMerge({
        manifest,
        readCandidate: () => null, // File not found
        writeTarget: () => true,
        calculateHash: hashFn,
      });

      expect(result.success).toBe(false);
      expect(result.mergedFiles[0].success).toBe(false);
    });
  });

  describe('Merge report generation', () => {
    it('should generate readable merge report', () => {
      const report = runner.generateMergeReport({
        workItemId: 'WI-0001',
        mergedFiles: [{
          candidatePath: '.specforge/work-items/WI-0001/candidates/req.md',
          targetPath: '.specforge/project/requirements_index.md',
          operation: 'update',
          preHash: 'abc',
          postHash: 'def',
          success: true,
        }],
        executedAt: new Date().toISOString(),
      });

      expect(report).toContain('# Merge Report');
      expect(report).toContain('WI-0001');
      expect(report).toContain('requirements_index.md');
      expect(report).toContain('Successful: 1');
    });
  });
});
