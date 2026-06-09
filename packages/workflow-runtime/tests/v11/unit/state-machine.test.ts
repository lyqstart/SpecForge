/**
 * Feature: specforge-v1-1-compliance-remediation
 * Unit tests for State Machine
 *
 * Requirements: 2.1-2.43
 */

import { describe, it, expect } from 'vitest';
import { StateMachine, WORK_ITEM_STATES, isForbiddenTransition } from '@/v11/runtime/StateMachine';
import type { AuthorizedCaller } from '@/v11/runtime/StateMachine';

describe('StateMachine', () => {
  describe('24 states support', () => {
    it('should define exactly 24 states', () => {
      expect(WORK_ITEM_STATES).toHaveLength(24);
    });

    it('should include all required states', () => {
      const expectedStates = [
        'created', 'intake_ready', 'impact_analyzing', 'impact_analyzed',
        'workflow_selected', 'candidate_preparing', 'candidate_prepared',
        'gates_running', 'gates_failed', 'approval_required', 'approved',
        'merge_ready', 'merging', 'merged', 'post_merge_verified',
        'implementation_ready', 'implementation_running', 'implementation_done',
        'verification_running', 'verification_done', 'closed', 'blocked',
        'rejected', 'superseded',
      ];
      for (const state of expectedStates) {
        expect(WORK_ITEM_STATES).toContain(state);
      }
    });

    it('should initialize to created state', () => {
      const sm = new StateMachine('WI-0001');
      expect(sm.getCurrentState()).toBe('created');
    });
  });

  describe('Happy path lifecycle', () => {
    it('should support full lifecycle from created to closed', () => {
      const sm = new StateMachine('WI-0001');

      expect(sm.transition('intake_ready', 'state_machine').success).toBe(true);
      expect(sm.transition('impact_analyzing', 'state_machine').success).toBe(true);
      expect(sm.transition('impact_analyzed', 'state_machine').success).toBe(true);
      expect(sm.transition('workflow_selected', 'state_machine').success).toBe(true);
      expect(sm.transition('candidate_preparing', 'state_machine').success).toBe(true);
      expect(sm.transition('candidate_prepared', 'state_machine').success).toBe(true);
      expect(sm.transition('gates_running', 'state_machine').success).toBe(true);
      expect(sm.transition('approval_required', 'gate_runner').success).toBe(true);
      expect(sm.transition('approved', 'user_decision_recorder').success).toBe(true);
      expect(sm.transition('merge_ready', 'state_machine').success).toBe(true);
      expect(sm.transition('merging', 'state_machine').success).toBe(true);
      expect(sm.transition('merged', 'merge_runner').success).toBe(true);
      expect(sm.transition('post_merge_verified', 'state_machine').success).toBe(true);
      expect(sm.transition('implementation_ready', 'state_machine').success).toBe(true);
      expect(sm.transition('implementation_running', 'code_permission_service').success).toBe(true);
      expect(sm.transition('implementation_done', 'state_machine').success).toBe(true);
      expect(sm.transition('verification_running', 'state_machine').success).toBe(true);
      expect(sm.transition('verification_done', 'state_machine').success).toBe(true);
      expect(sm.transition('closed', 'close_gate').success).toBe(true);
    });
  });

  describe('Illegal transitions rejection', () => {
    it('should reject created → implementation_running', () => {
      const sm = new StateMachine('WI-0001');
      const result = sm.transition('implementation_running', 'state_machine');
      expect(result.success).toBe(false);
    });

    it('should reject candidate_prepared → merging', () => {
      const sm = new StateMachine('WI-0001');
      sm.transition('intake_ready', 'state_machine');
      sm.transition('impact_analyzing', 'state_machine');
      sm.transition('impact_analyzed', 'state_machine');
      sm.transition('workflow_selected', 'state_machine');
      sm.transition('candidate_preparing', 'state_machine');
      sm.transition('candidate_prepared', 'state_machine');
      const result = sm.transition('merging', 'state_machine');
      expect(result.success).toBe(false);
    });

    it('should reject approval_required → merging', () => {
      const sm = new StateMachine('WI-0001');
      // Navigate to approval_required
      sm.transition('intake_ready', 'state_machine');
      sm.transition('impact_analyzing', 'state_machine');
      sm.transition('impact_analyzed', 'state_machine');
      sm.transition('workflow_selected', 'state_machine');
      sm.transition('candidate_preparing', 'state_machine');
      sm.transition('candidate_prepared', 'state_machine');
      sm.transition('gates_running', 'state_machine');
      sm.transition('approval_required', 'gate_runner');
      // Try illegal transition
      const result = sm.transition('merging', 'state_machine');
      expect(result.success).toBe(false);
    });

    it('should reject approval_required → closed', () => {
      const sm = new StateMachine('WI-0001');
      sm.transition('intake_ready', 'state_machine');
      sm.transition('impact_analyzing', 'state_machine');
      sm.transition('impact_analyzed', 'state_machine');
      sm.transition('workflow_selected', 'state_machine');
      sm.transition('candidate_preparing', 'state_machine');
      sm.transition('candidate_prepared', 'state_machine');
      sm.transition('gates_running', 'state_machine');
      sm.transition('approval_required', 'gate_runner');
      const result = sm.transition('closed', 'state_machine');
      expect(result.success).toBe(false);
    });

    it('should reject merged → closed', () => {
      const sm = new StateMachine('WI-0001');
      // Navigate to merged state
      sm.transition('intake_ready', 'state_machine');
      sm.transition('impact_analyzing', 'state_machine');
      sm.transition('impact_analyzed', 'state_machine');
      sm.transition('workflow_selected', 'state_machine');
      sm.transition('candidate_preparing', 'state_machine');
      sm.transition('candidate_prepared', 'state_machine');
      sm.transition('gates_running', 'state_machine');
      sm.transition('approval_required', 'gate_runner');
      sm.transition('approved', 'user_decision_recorder');
      sm.transition('merge_ready', 'state_machine');
      sm.transition('merging', 'state_machine');
      sm.transition('merged', 'merge_runner');
      // Try illegal
      const result = sm.transition('closed', 'state_machine');
      expect(result.success).toBe(false);
    });

    it('should reject closed → any state', () => {
      const sm = new StateMachine('WI-0001');
      sm.transition('intake_ready', 'state_machine');
      sm.transition('impact_analyzing', 'state_machine');
      sm.transition('impact_analyzed', 'state_machine');
      sm.transition('workflow_selected', 'state_machine');
      sm.transition('candidate_preparing', 'state_machine');
      sm.transition('candidate_prepared', 'state_machine');
      sm.transition('gates_running', 'state_machine');
      sm.transition('approval_required', 'gate_runner');
      sm.transition('approved', 'user_decision_recorder');
      sm.transition('merge_ready', 'state_machine');
      sm.transition('merging', 'state_machine');
      sm.transition('merged', 'merge_runner');
      sm.transition('post_merge_verified', 'state_machine');
      sm.transition('implementation_ready', 'state_machine');
      sm.transition('implementation_running', 'code_permission_service');
      sm.transition('implementation_done', 'state_machine');
      sm.transition('verification_running', 'state_machine');
      sm.transition('verification_done', 'state_machine');
      sm.transition('closed', 'close_gate');
      // Try any transition from closed
      for (const state of WORK_ITEM_STATES) {
        if (state === 'closed') continue;
        const result = sm.transition(state, 'state_machine');
        expect(result.success).toBe(false);
      }
    });

    it('should reject blocked → closed', () => {
      const sm = new StateMachine('WI-0001');
      sm.transition('blocked', 'state_machine');
      const result = sm.transition('closed', 'state_machine');
      expect(result.success).toBe(false);
    });

    it('should reject rejected → closed', () => {
      const sm = new StateMachine('WI-0001', 'rejected');
      const result = sm.transition('closed', 'state_machine');
      expect(result.success).toBe(false);
    });
  });

  describe('Agent authorization blocking', () => {
    it('should reject all agent-initiated transitions', () => {
      const sm = new StateMachine('WI-0001');
      const result = sm.transition('intake_ready', 'agent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent is not authorized');
    });
  });

  describe('State history tracking', () => {
    it('should record state transitions in history', () => {
      const sm = new StateMachine('WI-0001');
      sm.transition('intake_ready', 'state_machine', 'Initial intake');
      sm.transition('impact_analyzing', 'state_machine');

      const history = sm.getStateHistory();
      expect(history).toHaveLength(2);
      expect(history[0].from_state).toBe('created');
      expect(history[0].to_state).toBe('intake_ready');
      expect(history[0].reason).toBe('Initial intake');
      expect(history[1].from_state).toBe('intake_ready');
      expect(history[1].to_state).toBe('impact_analyzing');
    });
  });

  describe('Terminal states', () => {
    it('should identify closed as terminal', () => {
      const sm = new StateMachine('WI-0001');
      expect(sm.isTerminalState('closed')).toBe(true);
      expect(sm.isTerminalState('rejected')).toBe(true);
      expect(sm.isTerminalState('superseded')).toBe(true);
      expect(sm.isTerminalState('created')).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('should serialize and parse metadata', () => {
      const metadata = {
        schema_version: '1.0' as const,
        work_item_id: 'WI-0001',
        title: 'Test WI',
        description: 'Test description',
        current_state: 'created' as const,
        workflow_type: 'requirements-first' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: 'sf-orchestrator',
        state_history: [],
      };

      const serialized = StateMachine.serializeMetadata(metadata);
      expect(serialized.success).toBe(true);

      const parsed = StateMachine.parseMetadata(serialized.data!);
      expect(parsed.success).toBe(true);
      expect(parsed.data!.work_item_id).toBe('WI-0001');
    });
  });
});

describe('isForbiddenTransition', () => {
  it('should detect forbidden transitions', () => {
    expect(isForbiddenTransition('created', 'implementation_running')).toBe(true);
    expect(isForbiddenTransition('candidate_prepared', 'merging')).toBe(true);
    expect(isForbiddenTransition('approval_required', 'merging')).toBe(true);
    expect(isForbiddenTransition('closed', 'any')).toBe(true);
    expect(isForbiddenTransition('blocked', 'closed')).toBe(true);
    expect(isForbiddenTransition('rejected', 'closed')).toBe(true);
  });

  it('should not flag legal transitions as forbidden', () => {
    expect(isForbiddenTransition('created', 'intake_ready')).toBe(false);
    expect(isForbiddenTransition('gates_running', 'approval_required')).toBe(false);
  });
});
