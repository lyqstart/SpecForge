/**
 * Feature: specforge-v1-1-compliance-remediation
 * Property 6: Candidate Format Validation
 * Property 7: Candidate Manifest Path Validation
 * Property 18: Candidate Manifest Parser/Serializer Round-Trip
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 6.7, 6.8, 6.9
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MergeRunner } from '@/v11/runtime/MergeRunner';
import { JsonParser } from '@/v11/runtime/JsonParser';
import type { CandidateManifest } from '@/v11/runtime/MergeRunner';

const runner = new MergeRunner();

describe('Property 6: Candidate Format Validation', () => {
  /**
   * For any content that looks like a patch or diff, the Merge Runner SHALL
   * reject it and require complete file contents only.
   */

  it('should reject content starting with --- (diff header)', () => {
    fc.assert(
      fc.property(
        // Use "---" prefix + space + suffix to form diff-like content
        fc.tuple(fc.constant('--- a/'), fc.string({ maxLength: 50 })),
        ([prefix, suffix]) => {
          const content = prefix + suffix;
          const result = runner.validateCandidateFormat(content);
          return !result.valid;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject content starting with diff --git', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.constant('diff --git '), fc.string({ maxLength: 50 })),
        ([prefix, suffix]) => {
          const result = runner.validateCandidateFormat(prefix + suffix);
          return !result.valid;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should accept normal file content', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }).filter(
          (s) => !s.trim().startsWith('--- ') && !s.trim().startsWith('diff --git') && !s.includes('@@ -'),
        ),
        (content) => {
          const result = runner.validateCandidateFormat(content);
          return result.valid;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 7: Candidate Manifest Path Validation', () => {
  /**
   * For any candidate manifest entry, the candidate_path SHALL point to
   * candidates/ directory and target_path SHALL point to .specforge/project/.
   */

  it('should reject manifests with invalid candidate_path', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }).filter((s) => !s.includes('candidates/')),
        (invalidPath) => {
          const manifest: CandidateManifest = {
            schema_version: '1.0',
            work_item_id: 'WI-0001',
            base_spec_version: 'PSV-0001',
            target_spec_version: 'PSV-0002',
            candidates: [{
              candidate_path: invalidPath,
              target_path: '.specforge/project/requirements.md',
              operation: 'create',
            }],
            generated_at: new Date().toISOString(),
          };
          const json = JSON.stringify(manifest);
          const result = runner.parseCandidateManifest(json);
          return !result.success;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject manifests with invalid target_path', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }).filter((s) => !s.startsWith('.specforge/project/')),
        (invalidPath) => {
          const manifest: CandidateManifest = {
            schema_version: '1.0',
            work_item_id: 'WI-0001',
            base_spec_version: 'PSV-0001',
            target_spec_version: 'PSV-0002',
            candidates: [{
              candidate_path: '.specforge/work-items/WI-0001/candidates/req.md',
              target_path: invalidPath,
              operation: 'create',
            }],
            generated_at: new Date().toISOString(),
          };
          const json = JSON.stringify(manifest);
          const result = runner.parseCandidateManifest(json);
          return !result.success;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should accept valid manifests', () => {
    const validManifest: CandidateManifest = {
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      base_spec_version: 'PSV-0001',
      target_spec_version: 'PSV-0002',
      candidates: [{
        candidate_path: '.specforge/work-items/WI-0001/candidates/req.md',
        target_path: '.specforge/project/requirements.md',
        operation: 'create',
      }],
      generated_at: new Date().toISOString(),
    };
    const json = JSON.stringify(validManifest);
    const result = runner.parseCandidateManifest(json);
    expect(result.success).toBe(true);
  });
});

describe('Property 18: Candidate Manifest Parser/Serializer Round-Trip', () => {
  it('should produce equivalent manifests after round-trip', () => {
    fc.assert(
      fc.property(
        fc.record({
          schema_version: fc.constant('1.0'),
          work_item_id: fc.string({ minLength: 1, maxLength: 20 }),
          base_spec_version: fc.string({ minLength: 1, maxLength: 20 }),
          target_spec_version: fc.string({ minLength: 1, maxLength: 20 }),
          candidates: fc.array(
            fc.record({
              candidate_path: fc.string({ minLength: 1, maxLength: 60 }),
              target_path: fc.string({ minLength: 1, maxLength: 60 }),
              operation: fc.constantFrom<'create' | 'update' | 'delete'>('create', 'update', 'delete'),
              description: fc.oneof(fc.constant(undefined), fc.string({ maxLength: 100 })),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          generated_at: fc.string({ maxLength: 30 }),
        }),
        (manifest) => {
          const serialized = JsonParser.serialize(manifest);
          if (!serialized.success || serialized.data === undefined) return false;

          const parsed = JsonParser.parse<CandidateManifest>(serialized.data);
          if (!parsed.success || parsed.data === undefined) return false;

          const reSerialized = JsonParser.serialize(parsed.data);
          if (!reSerialized.success || reSerialized.data === undefined) return false;

          return serialized.data === reSerialized.data;
        },
      ),
      { numRuns: 100 },
    );
  });
});
