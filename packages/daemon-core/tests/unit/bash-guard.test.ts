/**
 * bash-guard.test.ts — bash-guard callerRole propagation tests
 */
import { describe, it, expect } from 'vitest';
import { guardBashCommand } from '../../src/tools/lib/bash-guard.js';
import type { WritePolicyRule } from '../../src/tools/lib/write-guard-v11.js';

// A permissive policy for testing
const allowAllPolicy: WritePolicyRule = {
  id: 'test-allow-all',
  description: 'allow all writes',
  check: () => null,
};

// A policy that checks callerRole
const roleCheckPolicy: WritePolicyRule = {
  id: 'test-role-check',
  description: 'checks callerRole is not agent',
  check: (ctx, _targetPath) => {
    if (ctx.callerRole === 'agent') {
      return 'agent not allowed to write here';
    }
    return null;
  },
};

describe('guardBashCommand callerRole', () => {
  describe('default behavior (no options)', () => {
    it('should use agent as default callerRole', () => {
      // With roleCheckPolicy, default 'agent' should be denied
      const result = guardBashCommand('echo hello > file.txt', roleCheckPolicy);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('agent not allowed');
    });
  });

  describe('explicit callerRole', () => {
    it('should use provided callerRole instead of hardcoded agent', () => {
      // With roleCheckPolicy and sf-orchestrator, should be allowed
      const result = guardBashCommand(
        'echo hello > file.txt',
        roleCheckPolicy,
        { callerRole: 'sf-orchestrator' },
      );
      expect(result.allowed).toBe(true);
    });

    it('should use gate_runner callerRole when provided', () => {
      const result = guardBashCommand(
        'echo hello > file.txt',
        roleCheckPolicy,
        { callerRole: 'gate_runner' },
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('dangerous patterns (unaffected by callerRole)', () => {
    it('should still block dangerous commands regardless of callerRole', () => {
      const result = guardBashCommand('sudo rm -rf /', allowAllPolicy, {
        callerRole: 'sf-orchestrator',
      });
      expect(result.allowed).toBe(false);
    });
  });

  describe('safe commands (unaffected by callerRole)', () => {
    it('should allow safe commands regardless of callerRole', () => {
      const result = guardBashCommand('ls -la', allowAllPolicy, {
        callerRole: 'agent',
      });
      expect(result.allowed).toBe(true);
    });
  });
});
