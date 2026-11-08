import { describe, expect, it } from 'vitest';
import { validateVerificationReport } from '../src/tools/lib/verification-report.js';

describe('verification-report.ts contract delegation', () => {
  it('delegates to canonical contract when structured JSON is present', () => {
    const structuredReport = JSON.stringify({
      conclusion: 'pass',
      test_matrix: {
        L1_unit: 'pass', L2_integration: 'pass', L3_pbt: 'skip',
        L4_e2e: 'pass', L5_smoke: 'pass', L6_regression: 'pass',
        L7_performance: 'skip', L8_security: 'skip', L9_compatibility: 'skip', L10_uat: 'skip',
      },
      verification_commands: [{ command: 'npm test', status: 'pass', output_summary: 'all passed' }],
      acceptance_criteria: [{ req_id: 'REQ-001', name: 'AC1', status: 'pass', evidence: 'EV-001' }],
      e2e_tests: [{ name: 'e2e', status: 'pass', evidence: 'EV-002' }],
      side_effects: 'none',
      summary: 'All tests passed',
      semantic_closure: { schema_version: '1.0' },
    });

    const result = validateVerificationReport('```json\n' + structuredReport + '\n```');
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('canonical contract'))).toBe(true);
  });

  it('reports contract validation errors when structured JSON is invalid', () => {
    const badReport = JSON.stringify({
      conclusion: 'invalid_conclusion',
      test_matrix: {},
      verification_commands: [],
      acceptance_criteria: [],
      e2e_tests: [],
      side_effects: '',
      summary: '',
      semantic_closure: {},
    });

    const result = validateVerificationReport('```json\n' + badReport + '\n```');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('falls back to legacy validation for Markdown-only reports', () => {
    const legacyReport = '# Verification Report\n\nAll tests passed.\nEvidence: EV-001';
    const result = validateVerificationReport(legacyReport);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('legacy fallback'))).toBe(true);
  });

  it('rejects empty content', () => {
    const result = validateVerificationReport('');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('accepts structured manual Contract review evidence', () => {
    const report = JSON.stringify({
      conclusion: 'pass',
      test_matrix: {
        L1_unit: 'pass', L2_integration: 'pass', L3_pbt: 'skip',
        L4_e2e: 'pass', L5_smoke: 'pass', L6_regression: 'pass',
        L7_performance: 'skip', L8_security: 'skip', L9_compatibility: 'skip', L10_uat: 'skip',
      },
      verification_commands: [{ command: 'review', status: 'pass', output_summary: 'reviewed' }],
      acceptance_criteria: [{ req_id: 'REQ-001', name: 'AC1', status: 'pass', evidence: 'EV-001' }],
      e2e_tests: [{ name: 'e2e', status: 'pass', evidence: 'EV-002' }],
      contract_reviews: [{
        contract_id: 'PhotoStatus',
        files: ['src/photo.py'],
        modules: ['PHOTO'],
        review_method: 'manual',
        reviewer: 'sf-verifier',
        conclusion: 'pass',
        summary: 'No invalid Contract values found.',
        evidence: 'EV-CONTRACT-001',
      }],
      side_effects: 'none',
      summary: 'verified',
      semantic_closure: { schema_version: '1.0' },
    });
    expect(validateVerificationReport('```json\n' + report + '\n```').valid).toBe(true);
  });

  it('rejects incomplete manual Contract review evidence', () => {
    const report = JSON.stringify({
      conclusion: 'pass',
      test_matrix: {
        L1_unit: 'pass', L2_integration: 'pass', L3_pbt: 'skip',
        L4_e2e: 'pass', L5_smoke: 'pass', L6_regression: 'pass',
        L7_performance: 'skip', L8_security: 'skip', L9_compatibility: 'skip', L10_uat: 'skip',
      },
      verification_commands: [{ command: 'review', status: 'pass', output_summary: 'reviewed' }],
      acceptance_criteria: [{ req_id: 'REQ-001', name: 'AC1', status: 'pass', evidence: 'EV-001' }],
      e2e_tests: [{ name: 'e2e', status: 'pass', evidence: 'EV-002' }],
      contract_reviews: [{
        contract_id: 'PhotoStatus',
        files: [],
        modules: [],
        review_method: 'manual',
        reviewer: '',
        conclusion: 'pass',
        summary: '',
      }],
      side_effects: 'none',
      summary: 'verified',
      semantic_closure: { schema_version: '1.0' },
    });
    const result = validateVerificationReport('```json\n' + report + '\n```');
    expect(result.valid).toBe(false);
    expect(result.errors.join('; ')).toContain('contract_reviews');
  });

});
