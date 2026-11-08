/**
 * seal-transitions.test.ts — Seal transition 定义和查询函数 tests
 */
import { describe, it, expect } from 'vitest';
import {
  SEAL_TRANSITIONS,
  isSealTransition,
  getSealTransition,
  REQUESTABLE_TRANSITIONS,
  type SealTransitionEntry,
} from '@specforge/types/seal-transitions';

describe('SEAL_TRANSITIONS', () => {
  it('should have exactly 7 seal transitions', () => {
    expect(SEAL_TRANSITIONS).toHaveLength(7);
  });

  it('should contain gates_running → approval_required', () => {
    const entry = SEAL_TRANSITIONS.find(
      (e) => e.from === 'gates_running' && e.to === 'approval_required',
    );
    expect(entry).toBeDefined();
    expect(entry!.authorizedSubject).toBe('gate_runner');
    expect(entry!.evidenceRequired).toBe('gate_summary.md');
  });

  it('should contain gates_running → gates_failed', () => {
    const entry = SEAL_TRANSITIONS.find(
      (e) => e.from === 'gates_running' && e.to === 'gates_failed',
    );
    expect(entry).toBeDefined();
    expect(entry!.authorizedSubject).toBe('gate_runner');
    expect(entry!.evidenceRequired).toBe('gate_summary.md');
  });

  it('should contain approval_required → approved', () => {
    const entry = SEAL_TRANSITIONS.find(
      (e) => e.from === 'approval_required' && e.to === 'approved',
    );
    expect(entry).toBeDefined();
    expect(entry!.authorizedSubject).toBe('user_decision_recorder');
    expect(entry!.evidenceRequired).toBe('user_decision.json');
  });

  it('should contain approval_required → rejected', () => {
    const entry = SEAL_TRANSITIONS.find(
      (e) => e.from === 'approval_required' && e.to === 'rejected',
    );
    expect(entry).toBeDefined();
    expect(entry!.authorizedSubject).toBe('user_decision_recorder');
    expect(entry!.evidenceRequired).toBe('user_decision.json');
  });

  it('should contain merge_ready → merging', () => {
    const entry = SEAL_TRANSITIONS.find(
      (e) => e.from === 'merge_ready' && e.to === 'merging',
    );
    expect(entry).toBeDefined();
    expect(entry!.authorizedSubject).toBe('merge_runner');
    expect(entry!.evidenceRequired).toBe('gate_summary.md');
  });

  it('should contain merging → merged', () => {
    const entry = SEAL_TRANSITIONS.find(
      (e) => e.from === 'merging' && e.to === 'merged',
    );
    expect(entry).toBeDefined();
    expect(entry!.authorizedSubject).toBe('merge_runner');
    expect(entry!.evidenceRequired).toBe('merge_report.md');
  });

  it('should contain verification_done → closed', () => {
    const entry = SEAL_TRANSITIONS.find(
      (e) => e.from === 'verification_done' && e.to === 'closed',
    );
    expect(entry).toBeDefined();
    expect(entry!.authorizedSubject).toBe('close_gate');
    expect(entry!.evidenceRequired).toBe('verification_report.md');
  });

  it('should not have sf-orchestrator as any authorizedSubject', () => {
    const orchestratorSeals = SEAL_TRANSITIONS.filter(
      (e) => e.authorizedSubject === 'sf-orchestrator',
    );
    expect(orchestratorSeals).toHaveLength(0);
  });
});

describe('isSealTransition', () => {
  it('should return true for all 7 seal transitions', () => {
    expect(isSealTransition('gates_running', 'approval_required')).toBe(true);
    expect(isSealTransition('gates_running', 'gates_failed')).toBe(true);
    expect(isSealTransition('approval_required', 'approved')).toBe(true);
    expect(isSealTransition('approval_required', 'rejected')).toBe(true);
    expect(isSealTransition('merge_ready', 'merging')).toBe(true);
    expect(isSealTransition('merging', 'merged')).toBe(true);
    expect(isSealTransition('verification_done', 'closed')).toBe(true);
  });

  it('should return false for non-seal transitions', () => {
    expect(isSealTransition('created', 'intake_ready')).toBe(false);
    expect(isSealTransition('intake_ready', 'impact_analyzing')).toBe(false);
    expect(isSealTransition('implementation_ready', 'implementation_running')).toBe(false);
    expect(isSealTransition('implementation_done', 'verification_running')).toBe(false);
    expect(isSealTransition('gates_failed', 'candidate_preparing')).toBe(false);
    expect(isSealTransition('approved', 'merge_ready')).toBe(false);
  });

  it('should return false for non-existent transitions', () => {
    expect(isSealTransition('closed', 'created')).toBe(false);
    expect(isSealTransition('nonexistent', 'anywhere')).toBe(false);
    expect(isSealTransition('', '')).toBe(false);
  });
});

describe('getSealTransition', () => {
  it('should return correct entry for seal transitions', () => {
    const entry = getSealTransition('verification_done', 'closed');
    expect(entry).toBeDefined();
    expect(entry!.from).toBe('verification_done');
    expect(entry!.to).toBe('closed');
    expect(entry!.authorizedSubject).toBe('close_gate');
    expect(entry!.evidenceRequired).toBe('verification_report.md');
  });

  it('should return undefined for non-seal transitions', () => {
    expect(getSealTransition('created', 'intake_ready')).toBeUndefined();
    expect(getSealTransition('approved', 'merge_ready')).toBeUndefined();
  });

  it('should return undefined for non-existent transitions', () => {
    expect(getSealTransition('closed', 'created')).toBeUndefined();
    expect(getSealTransition('any', 'thing')).toBeUndefined();
  });
});

describe('REQUESTABLE_TRANSITIONS', () => {
  it('should not be empty', () => {
    expect(REQUESTABLE_TRANSITIONS.length).toBeGreaterThan(0);
  });

  it('should not contain any seal transition', () => {
    for (const seal of SEAL_TRANSITIONS) {
      const found = REQUESTABLE_TRANSITIONS.some(
        (r) => r.from === seal.from && r.to === seal.to,
      );
      expect(found).toBe(false);
    }
  });

  it('should contain orchestrator-executable transitions', () => {
    // These are transitions the orchestrator can perform directly
    const hasCreatedToIntake = REQUESTABLE_TRANSITIONS.some(
      (r) => r.from === 'created' && r.to === 'intake_ready',
    );
    expect(hasCreatedToIntake).toBe(true);

    const hasImplReadyToRunning = REQUESTABLE_TRANSITIONS.some(
      (r) => r.from === 'implementation_ready' && r.to === 'implementation_running',
    );
    expect(hasImplReadyToRunning).toBe(true);
  });

  it('should not contain transitions that are seal-only', () => {
    // gates_running → approval_required is seal-only
    const hasGatesToApproval = REQUESTABLE_TRANSITIONS.some(
      (r) => r.from === 'gates_running' && r.to === 'approval_required',
    );
    expect(hasGatesToApproval).toBe(false);

    // verification_done → closed is seal-only
    const hasVerDoneToClosed = REQUESTABLE_TRANSITIONS.some(
      (r) => r.from === 'verification_done' && r.to === 'closed',
    );
    expect(hasVerDoneToClosed).toBe(false);
  });
});
