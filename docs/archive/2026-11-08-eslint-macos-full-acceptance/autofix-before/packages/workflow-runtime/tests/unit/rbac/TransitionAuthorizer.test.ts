/**
 * TransitionAuthorizer.test.ts — Phase 2 Transition Authorization tests
 */
import { describe, it, expect } from 'vitest';
import {
  TransitionAuthorizer,
  createTransitionAuthorizer,
  type TransitionAuthorizationInput,
} from '../../../src/rbac/TransitionAuthorizer.js';
import type { Principal } from '@specforge/types/principal';

// Test principals
const ORCHESTRATOR: Principal = { actorRole: 'sf-orchestrator', agentRole: 'orchestrator', source: 'tool_call' };
const GATE_RUNNER: Principal = { actorRole: 'gate_runner', agentRole: null, source: 'tool_call' };
const USER_DECISION_RECORDER: Principal = { actorRole: 'user_decision_recorder', agentRole: null, source: 'tool_call' };
const MERGE_RUNNER: Principal = { actorRole: 'merge_runner', agentRole: null, source: 'tool_call' };
const CLOSE_GATE: Principal = { actorRole: 'close_gate', agentRole: null, source: 'tool_call' };
const AGENT: Principal = { actorRole: 'agent', agentRole: null, source: 'internal' };

describe('TransitionAuthorizer', () => {
  describe('enableRBAC=false (default)', () => {
    const auth = new TransitionAuthorizer();

    it('should allow any transition when RBAC disabled', () => {
      const result = auth.authorize({
        principal: AGENT,
        from: 'verification_done',
        to: 'closed',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(true);
      expect(result.matchedRule).toBe('rbac_disabled');
    });

    it('should allow orchestrator perform seal when RBAC disabled', () => {
      const result = auth.authorize({
        principal: ORCHESTRATOR,
        from: 'gates_running',
        to: 'approval_required',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(true);
    });

    it('should allow any principal any mode when RBAC disabled', () => {
      const result = auth.authorize({
        principal: AGENT,
        from: 'any',
        to: 'where',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('enableRBAC=true + request_transition', () => {
    const auth = new TransitionAuthorizer({ enableRBAC: true });

    it('should allow orchestrator to request seal transition', () => {
      const result = auth.authorize({
        principal: ORCHESTRATOR,
        from: 'gates_running',
        to: 'approval_required',
        mode: 'request_transition',
      });
      expect(result.allowed).toBe(true);
      expect(result.matchedRule).toBe('request_only_allowed');
    });

    it('should allow any principal to request seal transition', () => {
      const result = auth.authorize({
        principal: AGENT,
        from: 'verification_done',
        to: 'closed',
        mode: 'request_transition',
      });
      expect(result.allowed).toBe(true);
    });

    it('should allow request for non-seal transition', () => {
      const result = auth.authorize({
        principal: ORCHESTRATOR,
        from: 'created',
        to: 'intake_ready',
        mode: 'request_transition',
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('enableRBAC=true + perform_transition + non-seal', () => {
    const auth = new TransitionAuthorizer({ enableRBAC: true });

    it('should allow non-seal transitions', () => {
      const result = auth.authorize({
        principal: ORCHESTRATOR,
        from: 'created',
        to: 'intake_ready',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(true);
      expect(result.matchedRule).toBe('non_seal_transition_allowed');
    });

    it('should allow implementation_ready → implementation_running', () => {
      const result = auth.authorize({
        principal: ORCHESTRATOR,
        from: 'implementation_ready',
        to: 'implementation_running',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(true);
    });

    it('should allow blocked rollback transitions', () => {
      const result = auth.authorize({
        principal: ORCHESTRATOR,
        from: 'blocked',
        to: 'implementation_ready',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('enableRBAC=true + perform_transition + seal + orchestrator', () => {
    const auth = new TransitionAuthorizer({ enableRBAC: true });

    it('should deny sf-orchestrator performing gates_running → approval_required', () => {
      const result = auth.authorize({
        principal: ORCHESTRATOR,
        from: 'gates_running',
        to: 'approval_required',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe('orchestrator_cannot_seal');
      expect(result.reason).toContain('sf-orchestrator cannot perform seal transitions');
    });

    it('should deny sf-orchestrator performing verification_done → closed', () => {
      const result = auth.authorize({
        principal: ORCHESTRATOR,
        from: 'verification_done',
        to: 'closed',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe('orchestrator_cannot_seal');
    });

    it('should deny sf-orchestrator performing approval_required → approved', () => {
      const result = auth.authorize({
        principal: ORCHESTRATOR,
        from: 'approval_required',
        to: 'approved',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe('orchestrator_cannot_seal');
    });

    it('should deny sf-orchestrator performing merge_ready → merging', () => {
      const result = auth.authorize({
        principal: ORCHESTRATOR,
        from: 'merge_ready',
        to: 'merging',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(false);
    });
  });

  describe('enableRBAC=true + perform_transition + seal + authorized subject', () => {
    const auth = new TransitionAuthorizer({ enableRBAC: true });

    it('should allow gate_runner performing gates_running → approval_required', () => {
      const result = auth.authorize({
        principal: GATE_RUNNER,
        from: 'gates_running',
        to: 'approval_required',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(true);
      expect(result.matchedRule).toBe('seal_transition_authorized');
    });

    it('should allow gate_runner performing gates_running → gates_failed', () => {
      const result = auth.authorize({
        principal: GATE_RUNNER,
        from: 'gates_running',
        to: 'gates_failed',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(true);
    });

    it('should allow user_decision_recorder performing approval_required → approved', () => {
      const result = auth.authorize({
        principal: USER_DECISION_RECORDER,
        from: 'approval_required',
        to: 'approved',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(true);
    });

    it('should allow merge_runner performing merge_ready → merging', () => {
      const result = auth.authorize({
        principal: MERGE_RUNNER,
        from: 'merge_ready',
        to: 'merging',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(true);
    });

    it('should allow merge_runner performing merging → merged', () => {
      const result = auth.authorize({
        principal: MERGE_RUNNER,
        from: 'merging',
        to: 'merged',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(true);
    });

    it('should allow close_gate performing verification_done → closed', () => {
      const result = auth.authorize({
        principal: CLOSE_GATE,
        from: 'verification_done',
        to: 'closed',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('enableRBAC=true + perform_transition + seal + wrong subject', () => {
    const auth = new TransitionAuthorizer({ enableRBAC: true });

    it('should deny agent performing verification_done → closed', () => {
      const result = auth.authorize({
        principal: AGENT,
        from: 'verification_done',
        to: 'closed',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe('seal_transition_subject_mismatch');
    });

    it('should deny gate_runner performing verification_done → closed', () => {
      const result = auth.authorize({
        principal: GATE_RUNNER,
        from: 'verification_done',
        to: 'closed',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('close_gate');
    });

    it('should deny merge_runner performing gates_running → approval_required', () => {
      const result = auth.authorize({
        principal: MERGE_RUNNER,
        from: 'gates_running',
        to: 'approval_required',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('gate_runner');
    });

    it('should include correct authorizedSubject in denial reason', () => {
      const result = auth.authorize({
        principal: AGENT,
        from: 'approval_required',
        to: 'approved',
        mode: 'perform_transition',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('user_decision_recorder');
    });
  });

  describe('request vs perform separation', () => {
    const auth = new TransitionAuthorizer({ enableRBAC: true });

    it('request_transition should be allowed but perform_transition denied for orchestrator on seal', () => {
      const reqResult = auth.authorize({
        principal: ORCHESTRATOR,
        from: 'gates_running',
        to: 'approval_required',
        mode: 'request_transition',
      });
      expect(reqResult.allowed).toBe(true);

      const perfResult = auth.authorize({
        principal: ORCHESTRATOR,
        from: 'gates_running',
        to: 'approval_required',
        mode: 'perform_transition',
      });
      expect(perfResult.allowed).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('should return false by default', () => {
      const auth = new TransitionAuthorizer();
      expect(auth.isEnabled()).toBe(false);
    });

    it('should return true when enabled', () => {
      const auth = new TransitionAuthorizer({ enableRBAC: true });
      expect(auth.isEnabled()).toBe(true);
    });
  });

  describe('createTransitionAuthorizer factory', () => {
    it('should create authorizer with default config', () => {
      const auth = createTransitionAuthorizer();
      expect(auth).toBeInstanceOf(TransitionAuthorizer);
      expect(auth.isEnabled()).toBe(false);
    });

    it('should create authorizer with custom config', () => {
      const auth = createTransitionAuthorizer({ enableRBAC: true });
      expect(auth.isEnabled()).toBe(true);
    });
  });
});
