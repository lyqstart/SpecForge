/**
 * Feature: specforge-v1-1-compliance-remediation (Round 2)
 * Unit tests for Path Policy — Actor/Action/State Permission Model
 *
 * Tests the new permission methods added in second remediation pass:
 * - canReadPath
 * - canWritePath
 * - canCreatePath
 * - isForbiddenMvpPath
 * - validateSpecReferencePath
 * - assertPathAllowed
 */

import { describe, it, expect } from 'vitest';
import { PathPolicy } from '@/v11/runtime/PathPolicy';

describe('PathPolicy — Permission Model', () => {
  const policy = new PathPolicy();

  // ═══════════════════════════════════════════════════════════════════════════
  // canWritePath — Agent restrictions
  // ═══════════════════════════════════════════════════════════════════════════

  describe('canWritePath — agent blocked paths', () => {
    it('should block agent writing to .specforge/project/**', () => {
      const result = policy.canWritePath('agent', '.specforge/project/requirements.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('agent_cannot_write_project_specs');
    });

    it('should block agent writing to .specforge/project/ root', () => {
      const result = policy.canWritePath('agent', '.specforge/project');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('agent_cannot_write_project_specs');
    });

    it('should block agent writing to user_decision.json', () => {
      const result = policy.canWritePath('agent', '.specforge/work-items/WI-0001/user_decision.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('agent_cannot_write_user_decision');
    });

    it('should block agent writing to gates/**', () => {
      const result = policy.canWritePath('agent', '.specforge/work-items/WI-0001/gates/entry_gate.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('agent_cannot_write_gates');
    });

    it('should block agent writing to gate_summary.md', () => {
      const result = policy.canWritePath('agent', '.specforge/work-items/WI-0001/gate_summary.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('agent_cannot_write_gate_summary');
    });

    it('should block agent writing to merge_report.md', () => {
      const result = policy.canWritePath('agent', '.specforge/work-items/WI-0001/merge_report.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('agent_cannot_write_merge_report');
    });

    it('should allow agent writing to candidates/**', () => {
      const result = policy.canWritePath('agent', '.specforge/work-items/WI-0001/candidates/requirements.md');
      expect(result.valid).toBe(true);
    });

    it('should allow agent writing to regular source files', () => {
      const result = policy.canWritePath('agent', 'src/index.ts');
      expect(result.valid).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // canWritePath — Privileged actors
  // ═══════════════════════════════════════════════════════════════════════════

  describe('canWritePath — merge_runner permissions', () => {
    it('should allow merge_runner writing to .specforge/project/**', () => {
      const result = policy.canWritePath('merge_runner', '.specforge/project/requirements.md');
      expect(result.valid).toBe(true);
    });

    it('should allow merge_runner writing to .specforge/project/modules/**', () => {
      const result = policy.canWritePath('merge_runner', '.specforge/project/modules/auth/design.md');
      expect(result.valid).toBe(true);
    });
  });

  describe('canWritePath — gate_runner permissions', () => {
    it('should allow gate_runner writing to gates/**', () => {
      const result = policy.canWritePath('gate_runner', '.specforge/work-items/WI-0001/gates/entry_gate.json');
      expect(result.valid).toBe(true);
    });

    it('should allow gate_runner writing to gate_summary.md', () => {
      const result = policy.canWritePath('gate_runner', '.specforge/work-items/WI-0001/gate_summary.md');
      expect(result.valid).toBe(true);
    });
  });

  describe('canWritePath — user_decision_recorder permissions', () => {
    it('should allow user_decision_recorder writing to user_decision.json', () => {
      const result = policy.canWritePath('user_decision_recorder', '.specforge/work-items/WI-0001/user_decision.json');
      expect(result.valid).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // canWritePath — Legacy spec protection (all actors blocked)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('canWritePath — legacy specs read-only for all actors', () => {
    it('should block agent writes to .specforge/specs/**', () => {
      const result = policy.canWritePath('agent', '.specforge/specs/old-spec.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('legacy_specs_read_only');
    });

    it('should block merge_runner writes to .specforge/specs/**', () => {
      const result = policy.canWritePath('merge_runner', '.specforge/specs/old-spec.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('legacy_specs_read_only');
    });

    it('should block gate_runner writes to .specforge/specs/**', () => {
      const result = policy.canWritePath('gate_runner', '.specforge/specs/old-spec.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('legacy_specs_read_only');
    });

    it('should block runtime writes to .specforge/specs/**', () => {
      const result = policy.canWritePath('runtime', '.specforge/specs/old-spec.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('legacy_specs_read_only');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // canWritePath — Forbidden MVP directories
  // ═══════════════════════════════════════════════════════════════════════════

  describe('canWritePath — forbidden MVP directories', () => {
    it('should block creating .specforge/archive/**', () => {
      const result = policy.canWritePath('agent', '.specforge/archive/old-data.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('forbidden_mvp_directory');
    });

    it('should block creating .specforge/standards/**', () => {
      const result = policy.canWritePath('agent', '.specforge/standards/v1.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('forbidden_mvp_directory');
    });

    it('should block creating .specforge/state/**', () => {
      const result = policy.canWritePath('agent', '.specforge/state/current.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('forbidden_mvp_directory');
    });

    it('should block creating .specforge/reports/**', () => {
      const result = policy.canWritePath('agent', '.specforge/reports/audit.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('forbidden_mvp_directory');
    });

    it('should block creating .specforge/snapshots/**', () => {
      const result = policy.canWritePath('agent', '.specforge/snapshots/snap-001.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('forbidden_mvp_directory');
    });

    it('should block even merge_runner writing to forbidden MVP directories', () => {
      const result = policy.canWritePath('merge_runner', '.specforge/archive/data.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('forbidden_mvp_directory');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // canReadPath — All actors can read
  // ═══════════════════════════════════════════════════════════════════════════

  describe('canReadPath', () => {
    it('should allow agent to read .specforge/project/**', () => {
      const result = policy.canReadPath('agent', '.specforge/project/requirements.md');
      expect(result.valid).toBe(true);
    });

    it('should allow agent to read legacy specs (read-only)', () => {
      const result = policy.canReadPath('agent', '.specforge/specs/old-spec.md');
      expect(result.valid).toBe(true);
    });

    it('should allow all actors to read any valid path', () => {
      const actors = ['agent', 'merge_runner', 'gate_runner', 'user_decision_recorder', 'runtime'] as const;
      for (const actor of actors) {
        expect(policy.canReadPath(actor, 'src/index.ts').valid).toBe(true);
        expect(policy.canReadPath(actor, '.specforge/project/design.md').valid).toBe(true);
      }
    });

    it('should reject invalid paths even for read', () => {
      const result = policy.canReadPath('agent', '/absolute/path');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('absolute_path_not_allowed');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // canCreatePath
  // ═══════════════════════════════════════════════════════════════════════════

  describe('canCreatePath', () => {
    it('should block creating forbidden MVP directories', () => {
      const result = policy.canCreatePath('agent', '.specforge/archive');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('forbidden_mvp_directory');
    });

    it('should block creating subdirectories of forbidden MVP dirs', () => {
      const result = policy.canCreatePath('agent', '.specforge/snapshots/v1');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('forbidden_mvp_directory');
    });

    it('should allow creating .specforge/work-items/', () => {
      const result = policy.canCreatePath('agent', '.specforge/work-items/WI-0001');
      expect(result.valid).toBe(true);
    });

    it('should block agent creating .specforge/project/', () => {
      const result = policy.canCreatePath('agent', '.specforge/project');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('agent_cannot_write_project_specs');
    });

    it('should allow merge_runner creating .specforge/project/modules/new-mod', () => {
      const result = policy.canCreatePath('merge_runner', '.specforge/project/modules/new-mod');
      expect(result.valid).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // isForbiddenMvpPath
  // ═══════════════════════════════════════════════════════════════════════════

  describe('isForbiddenMvpPath', () => {
    it('should return true for .specforge/archive', () => {
      expect(policy.isForbiddenMvpPath('.specforge/archive')).toBe(true);
    });

    it('should return true for .specforge/standards', () => {
      expect(policy.isForbiddenMvpPath('.specforge/standards')).toBe(true);
    });

    it('should return true for .specforge/state', () => {
      expect(policy.isForbiddenMvpPath('.specforge/state')).toBe(true);
    });

    it('should return true for .specforge/reports', () => {
      expect(policy.isForbiddenMvpPath('.specforge/reports')).toBe(true);
    });

    it('should return true for .specforge/snapshots', () => {
      expect(policy.isForbiddenMvpPath('.specforge/snapshots')).toBe(true);
    });

    it('should return true for subdirectories of forbidden dirs', () => {
      expect(policy.isForbiddenMvpPath('.specforge/archive/deep/nested')).toBe(true);
      expect(policy.isForbiddenMvpPath('.specforge/standards/v2/rules.md')).toBe(true);
    });

    it('should return false for allowed directories', () => {
      expect(policy.isForbiddenMvpPath('.specforge/project')).toBe(false);
      expect(policy.isForbiddenMvpPath('.specforge/work-items')).toBe(false);
      expect(policy.isForbiddenMvpPath('.specforge/runtime')).toBe(false);
      expect(policy.isForbiddenMvpPath('src/index.ts')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validateSpecReferencePath
  // ═══════════════════════════════════════════════════════════════════════════

  describe('validateSpecReferencePath', () => {
    it('should reject project/foo.md (missing .specforge/ prefix)', () => {
      const result = policy.validateSpecReferencePath('project/foo.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing_specforge_prefix');
    });

    it('should accept .specforge/project/foo.md', () => {
      const result = policy.validateSpecReferencePath('.specforge/project/foo.md');
      expect(result.valid).toBe(true);
    });

    it('should accept .specforge/work-items/WI-0001/intake.md', () => {
      const result = policy.validateSpecReferencePath('.specforge/work-items/WI-0001/intake.md');
      expect(result.valid).toBe(true);
    });

    it('should reject absolute paths', () => {
      const result = policy.validateSpecReferencePath('/home/user/.specforge/project/foo.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('absolute_path_not_allowed');
    });

    it('should reject paths with traversal', () => {
      const result = policy.validateSpecReferencePath('.specforge/../escape.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('parent_traversal_not_allowed');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // assertPathAllowed
  // ═══════════════════════════════════════════════════════════════════════════

  describe('assertPathAllowed', () => {
    it('should not throw for allowed read operations', () => {
      expect(() => {
        policy.assertPathAllowed('read', 'agent', '.specforge/project/requirements.md');
      }).not.toThrow();
    });

    it('should throw for blocked write operations', () => {
      expect(() => {
        policy.assertPathAllowed('write', 'agent', '.specforge/project/requirements.md');
      }).toThrow(/PathPolicy violation/);
    });

    it('should throw with descriptive error message', () => {
      expect(() => {
        policy.assertPathAllowed('write', 'agent', '.specforge/project/requirements.md');
      }).toThrow(/agent_cannot_write_project_specs/);
    });

    it('should not throw for allowed write operations', () => {
      expect(() => {
        policy.assertPathAllowed('write', 'merge_runner', '.specforge/project/requirements.md');
      }).not.toThrow();
    });

    it('should throw for forbidden create operations', () => {
      expect(() => {
        policy.assertPathAllowed('create', 'agent', '.specforge/archive');
      }).toThrow(/PathPolicy violation/);
    });

    it('should not throw for allowed create operations', () => {
      expect(() => {
        policy.assertPathAllowed('create', 'agent', '.specforge/work-items/WI-0002');
      }).not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // canWritePath — syntax validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('canWritePath — rejects invalid syntax', () => {
    it('should reject absolute paths', () => {
      const result = policy.canWritePath('agent', '/etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('absolute_path_not_allowed');
    });

    it('should reject paths with backslashes', () => {
      const result = policy.canWritePath('agent', 'src\\file.ts');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('backslash_not_allowed');
    });

    it('should reject paths with traversal', () => {
      const result = policy.canWritePath('agent', '../escape.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('parent_traversal_not_allowed');
    });

    it('should reject paths with home expansion', () => {
      const result = policy.canWritePath('agent', '~/file.md');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('home_expansion_not_allowed');
    });
  });
});
