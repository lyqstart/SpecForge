/**
 * state-advancement-subjects.test.ts — 验证双源 STATE_ADVANCEMENT_SUBJECTS 值一致
 *
 * GAP-7: STATE_ADVANCEMENT_SUBJECTS 定义在两个包中。
 * 本测试保护两处值的一致性，直到去重完成。
 */
import { describe, it, expect } from 'vitest';
import { STATE_ADVANCEMENT_SUBJECTS as WR_SUBJECTS } from '../../../src/types/state-machine.js';
import { isAuthorizedAdvancementSubject } from '@specforge/daemon-core';

describe('STATE_ADVANCEMENT_SUBJECTS consistency', () => {
  it('should have exactly 7 subjects', () => {
    expect(WR_SUBJECTS).toHaveLength(7);
  });

  it('workflow-runtime and daemon-core should agree on sf-orchestrator', () => {
    expect(WR_SUBJECTS).toContain('sf-orchestrator');
    expect(isAuthorizedAdvancementSubject('sf-orchestrator')).toBe(true);
  });

  it('workflow-runtime and daemon-core should agree on Runtime State Machine', () => {
    expect(WR_SUBJECTS).toContain('Runtime State Machine');
    expect(isAuthorizedAdvancementSubject('Runtime State Machine')).toBe(true);
  });

  it('workflow-runtime and daemon-core should agree on gate_runner', () => {
    expect(WR_SUBJECTS).toContain('gate_runner');
    expect(isAuthorizedAdvancementSubject('gate_runner')).toBe(true);
  });

  it('workflow-runtime and daemon-core should agree on close_gate', () => {
    expect(WR_SUBJECTS).toContain('close_gate');
    expect(isAuthorizedAdvancementSubject('close_gate')).toBe(true);
  });

  it('workflow-runtime and daemon-core should agree on user_decision_recorder', () => {
    expect(WR_SUBJECTS).toContain('user_decision_recorder');
    expect(isAuthorizedAdvancementSubject('user_decision_recorder')).toBe(true);
  });

  it('workflow-runtime and daemon-core should agree on merge_runner', () => {
    expect(WR_SUBJECTS).toContain('merge_runner');
    expect(isAuthorizedAdvancementSubject('merge_runner')).toBe(true);
  });

  it('workflow-runtime and daemon-core should agree on code_permission_service', () => {
    expect(WR_SUBJECTS).toContain('code_permission_service');
    expect(isAuthorizedAdvancementSubject('code_permission_service')).toBe(true);
  });

  it('should reject unknown subjects', () => {
    expect(isAuthorizedAdvancementSubject('random_agent')).toBe(false);
  });
});
