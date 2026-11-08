/**
 * Feature: specforge-v1-1-compliance-remediation
 * Unit tests for Path Policy
 *
 * Requirements: 1.4-1.10
 */

import { describe, it, expect } from 'vitest';
import { PathPolicy } from '@/v11/runtime/PathPolicy';

describe('PathPolicy', () => {
  const policy = new PathPolicy();

  describe('validatePath - absolute path rejection', () => {
    it('should reject Unix absolute paths', () => {
      const result = policy.validatePath('/absolute/path/to/file');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('absolute_path_not_allowed');
    });

    it('should reject Windows absolute paths', () => {
      const result = policy.validatePath('C:\\Users\\test\\file.txt');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('absolute_path_not_allowed');
    });

    it('should reject Windows absolute paths with lowercase drive', () => {
      const result = policy.validatePath('c:/path/to/file');
      expect(result.valid).toBe(false);
    });
  });

  describe('validatePath - Windows backslash rejection', () => {
    it('should reject paths with backslashes', () => {
      const result = policy.validatePath('src\\windows\\style\\path');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('backslash_not_allowed');
    });
  });

  describe('validatePath - path traversal rejection', () => {
    it('should reject paths with ..', () => {
      const result = policy.validatePath('.specforge/../escape/path');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('parent_traversal_not_allowed');
    });

    it('should reject paths with .. in middle', () => {
      const result = policy.validatePath('some/../other/path');
      expect(result.valid).toBe(false);
    });
  });

  describe('validatePath - home expansion rejection', () => {
    it('should reject paths with ~', () => {
      const result = policy.validatePath('~/home/expansion');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('home_expansion_not_allowed');
    });
  });

  describe('validatePath - valid paths', () => {
    it('should accept valid relative paths', () => {
      expect(policy.validatePath('.specforge/project/requirements.md').valid).toBe(true);
      expect(policy.validatePath('src/index.ts').valid).toBe(true);
      expect(policy.validatePath('.specforge/work-items/WI-0001/work_item.json').valid).toBe(true);
    });
  });

  describe('validateSpecPath - .specforge/ prefix requirement', () => {
    it('should reject spec paths without .specforge/ prefix', () => {
      const result = policy.validateSpecPath('requirements.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing_specforge_prefix');
    });

    it('should accept spec paths with .specforge/ prefix', () => {
      const result = policy.validateSpecPath('.specforge/project/requirements.md');
      expect(result.valid).toBe(true);
    });
  });

  describe('isLegacySpecPath', () => {
    it('should detect legacy spec paths', () => {
      expect(policy.isLegacySpecPath('.specforge/specs/some/file.md')).toBe(true);
      expect(policy.isLegacySpecPath('.specforge/specs/')).toBe(true);
      expect(policy.isLegacySpecPath('.specforge/project/req.md')).toBe(false);
      expect(policy.isLegacySpecPath('src/index.ts')).toBe(false);
    });
  });

  describe('isProjectSpecPath', () => {
    it('should detect project spec paths', () => {
      expect(policy.isProjectSpecPath('.specforge/project/requirements.md')).toBe(true);
      expect(policy.isProjectSpecPath('.specforge/project/')).toBe(true);
      expect(policy.isProjectSpecPath('.specforge/specs/req.md')).toBe(false);
    });
  });

  describe('isWorkItemPath', () => {
    it('should detect work item paths', () => {
      expect(policy.isWorkItemPath('.specforge/work-items/WI-0001')).toBe(true);
      expect(policy.isWorkItemPath('.specforge/work-items/')).toBe(true);
      expect(policy.isWorkItemPath('.specforge/project/req.md')).toBe(false);
    });
  });

  describe('canWriteToPath - agent write protection', () => {
    it('should block agent writes to .specforge/project/**', () => {
      const result = policy.canWriteToPath('.specforge/project/requirements.md', 'agent');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('agent_cannot_write_project_specs');
    });

    it('should block agent writes to user_decision.json', () => {
      const result = policy.canWriteToPath('.specforge/work-items/WI-0001/user_decision.json', 'agent');
      expect(result.valid).toBe(false);
    });

    it('should block agent writes to gates/**', () => {
      const result = policy.canWriteToPath('.specforge/work-items/WI-0001/gates/entry_gate.json', 'agent');
      expect(result.valid).toBe(false);
    });

    it('should block agent writes to gate_summary.md', () => {
      const result = policy.canWriteToPath('.specforge/work-items/WI-0001/gate_summary.md', 'agent');
      expect(result.valid).toBe(false);
    });

    it('should block agent writes to merge_report.md', () => {
      const result = policy.canWriteToPath('.specforge/work-items/WI-0001/merge_report.md', 'agent');
      expect(result.valid).toBe(false);
    });

    it('should block agent writes to extension_registry.json', () => {
      const result = policy.canWriteToPath('.specforge/project/extension_registry.json', 'agent');
      expect(result.valid).toBe(false);
    });

    it('should allow agent writes to candidates/', () => {
      const result = policy.canWriteToPath('.specforge/work-items/WI-0001/candidates/requirements.md', 'agent');
      expect(result.valid).toBe(true);
    });
  });

  describe('canWriteToPath - legacy spec protection', () => {
    it('should block all writes to legacy specs', () => {
      expect(policy.canWriteToPath('.specforge/specs/req.md', 'agent').valid).toBe(false);
      expect(policy.canWriteToPath('.specforge/specs/req.md', 'merge_runner').valid).toBe(false);
      expect(policy.canWriteToPath('.specforge/specs/req.md', 'gate_runner').valid).toBe(false);
    });
  });

  describe('canWriteToPath - privileged component authorization', () => {
    it('should allow merge_runner to write to .specforge/project/**', () => {
      const result = policy.canWriteToPath('.specforge/project/requirements.md', 'merge_runner');
      expect(result.valid).toBe(true);
    });

    it('should allow user_decision_recorder to write to user_decision.json', () => {
      const result = policy.canWriteToPath('.specforge/work-items/WI-0001/user_decision.json', 'user_decision_recorder');
      expect(result.valid).toBe(true);
    });

    it('should allow gate_runner to write to gates/**', () => {
      const result = policy.canWriteToPath('.specforge/work-items/WI-0001/gates/entry_gate.json', 'gate_runner');
      expect(result.valid).toBe(true);
    });

    it('should allow gate_runner to write to gate_summary.md', () => {
      const result = policy.canWriteToPath('.specforge/work-items/WI-0001/gate_summary.md', 'gate_runner');
      expect(result.valid).toBe(true);
    });
  });

  describe('canCreateDirectory - forbidden directories', () => {
    it('should block creation of .specforge/archive/', () => {
      const result = policy.canCreateDirectory('.specforge/archive');
      expect(result.valid).toBe(false);
    });

    it('should block creation of .specforge/state/', () => {
      const result = policy.canCreateDirectory('.specforge/state');
      expect(result.valid).toBe(false);
    });

    it('should block creation of .specforge/gates/', () => {
      const result = policy.canCreateDirectory('.specforge/gates');
      expect(result.valid).toBe(false);
    });

    it('should allow creation of .specforge/project/', () => {
      const result = policy.canCreateDirectory('.specforge/project');
      expect(result.valid).toBe(true);
    });

    it('should allow creation of .specforge/work-items/', () => {
      const result = policy.canCreateDirectory('.specforge/work-items');
      expect(result.valid).toBe(true);
    });
  });
});
