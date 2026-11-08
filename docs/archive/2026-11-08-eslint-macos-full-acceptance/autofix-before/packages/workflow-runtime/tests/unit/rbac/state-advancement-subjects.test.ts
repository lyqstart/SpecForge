import { describe, expect, it } from 'vitest';
import { STATE_ADVANCEMENT_SUBJECTS } from '../../../src/types/state-machine.js';

describe('STATE_ADVANCEMENT_SUBJECTS contract', () => {
  it('contains the complete current state advancement authority list', () => {
    expect(STATE_ADVANCEMENT_SUBJECTS).toEqual([
      'sf-orchestrator',
      'Runtime State Machine',
      'gate_runner',
      'user_decision_recorder',
      'merge_runner',
      'code_permission_service',
      'close_gate',
    ]);
  });

  it('contains no duplicate subjects', () => {
    expect(new Set(STATE_ADVANCEMENT_SUBJECTS).size).toBe(
      STATE_ADVANCEMENT_SUBJECTS.length,
    );
  });
});
