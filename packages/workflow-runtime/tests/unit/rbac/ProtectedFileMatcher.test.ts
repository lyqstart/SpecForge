/**
 * ProtectedFileMatcher.test.ts — 受保护文件路径匹配器测试
 */
import { describe, it, expect } from 'vitest';
import { ProtectedFileMatcher, matchProtectedFile } from '../../../src/rbac/ProtectedFileMatcher.js';

describe('ProtectedFileMatcher', () => {
  describe('spec_file', () => {
    it('should match requirements.md', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/requirements.md')).toBe('spec_file');
    });

    it('should match design.md', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/design.md')).toBe('spec_file');
    });

    it('should match tasks.md', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/tasks.md')).toBe('spec_file');
    });

    it('should match with Windows backslash paths', () => {
      expect(ProtectedFileMatcher.match('.specforge\\specs\\WI-001\\requirements.md')).toBe('spec_file');
    });

    it('should match with absolute path prefix', () => {
      expect(ProtectedFileMatcher.match('/home/user/project/.specforge/specs/WI-001/design.md')).toBe('spec_file');
    });
  });

  describe('gate_file', () => {
    it('should match gate_summary.md', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/gate_summary.md')).toBe('gate_file');
    });

    it('should match gate_result.md', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/gate_result.md')).toBe('gate_file');
    });

    it('should match files inside gates/ directory', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/gates/requirements_gate.md')).toBe('gate_file');
    });
  });

  describe('decision_file', () => {
    it('should match user_decision.json', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/user_decision.json')).toBe('decision_file');
    });
  });

  describe('merge_file', () => {
    it('should match merge_report.md', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/merge_report.md')).toBe('merge_file');
    });
  });

  describe('evidence_file', () => {
    it('should match verification_report.md', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/verification_report.md')).toBe('evidence_file');
    });

    it('should match changed_files_audit.md', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/changed_files_audit.md')).toBe('evidence_file');
    });

    it('should match close_gate.md', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/close_gate.md')).toBe('evidence_file');
    });

    it('should match close_gate.json', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/close_gate.json')).toBe('evidence_file');
    });

    it('should match files inside evidence/ directory', () => {
      expect(ProtectedFileMatcher.match('.specforge/specs/WI-001/evidence/some-report.md')).toBe('evidence_file');
    });
  });

  describe('non-protected files', () => {
    it('should not match ordinary source files', () => {
      expect(ProtectedFileMatcher.match('src/index.ts')).toBeUndefined();
    });

    it('should not match package.json', () => {
      expect(ProtectedFileMatcher.match('package.json')).toBeUndefined();
    });

    it('should not match README.md', () => {
      expect(ProtectedFileMatcher.match('README.md')).toBeUndefined();
    });

    it('should not match tsconfig.json', () => {
      expect(ProtectedFileMatcher.match('tsconfig.json')).toBeUndefined();
    });

    it('should not match empty string', () => {
      expect(ProtectedFileMatcher.match('')).toBeUndefined();
    });

    it('should not match random file in .specforge/', () => {
      expect(ProtectedFileMatcher.match('.specforge/something.txt')).toBeUndefined();
    });
  });

  describe('helper methods', () => {
    it('isSpecFile returns true for spec files', () => {
      expect(ProtectedFileMatcher.isSpecFile('.specforge/specs/WI-001/requirements.md')).toBe(true);
      expect(ProtectedFileMatcher.isSpecFile('src/index.ts')).toBe(false);
    });

    it('isEvidenceFile returns true for evidence files', () => {
      expect(ProtectedFileMatcher.isEvidenceFile('.specforge/specs/WI-001/evidence/report.md')).toBe(true);
      expect(ProtectedFileMatcher.isEvidenceFile('src/index.ts')).toBe(false);
    });

    it('isProtected returns true for any protected file', () => {
      expect(ProtectedFileMatcher.isProtected('.specforge/specs/WI-001/requirements.md')).toBe(true);
      expect(ProtectedFileMatcher.isProtected('.specforge/specs/WI-001/gate_summary.md')).toBe(true);
      expect(ProtectedFileMatcher.isProtected('.specforge/specs/WI-001/user_decision.json')).toBe(true);
      expect(ProtectedFileMatcher.isProtected('src/index.ts')).toBe(false);
    });
  });

  describe('standalone function', () => {
    it('matchProtectedFile should work the same as ProtectedFileMatcher.match', () => {
      expect(matchProtectedFile('.specforge/specs/WI-001/requirements.md')).toBe('spec_file');
      expect(matchProtectedFile('src/index.ts')).toBeUndefined();
    });
  });
});
