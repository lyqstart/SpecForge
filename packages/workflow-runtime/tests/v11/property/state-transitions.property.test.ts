/**
 * Feature: specforge-v1-1-compliance-remediation
 * Property 5: Illegal State Transition Rejection
 * Property 4: State Transition Authorization
 *
 * Validates: Requirements 2.25-2.43
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { StateMachine, WORK_ITEM_STATES, isForbiddenTransition } from '@/v11/runtime/StateMachine';
import type { AuthorizedCaller } from '@/v11/runtime/StateMachine';

describe('Property 5: Illegal State Transition Rejection', () => {
  /**
   * For any illegal (from_state, to_state) pair, the State Machine SHALL
   * reject the transition attempt.
   */
  it('should reject all forbidden transitions', () => {
    const forbiddenPairs: [string, string][] = [
      ['created', 'implementation_running'],
      ['intake_ready', 'implementation_running'],
      ['impact_analyzing', 'implementation_running'],
      ['impact_analyzed', 'implementation_running'],
      ['workflow_selected', 'implementation_running'],
      ['candidate_prepared', 'merging'],
      ['approval_required', 'merging'],
      ['approval_required', 'closed'],
      ['merged', 'closed'],
      ['blocked', 'closed'],
      ['rejected', 'closed'],
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...forbiddenPairs),
        ([from, to]) => {
          const sm = new StateMachine('WI-0001', from as any);
          const result = sm.transition(to as any, 'state_machine');
          return !result.success;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject closed → any transition', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...WORK_ITEM_STATES),
        (targetState) => {
          if (targetState === 'closed') return true;
          const sm = new StateMachine('WI-0001', 'closed');
          const result = sm.transition(targetState, 'state_machine');
          return !result.success;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 4: State Transition Authorization', () => {
  /**
   * All agent-initiated transitions SHALL be rejected.
   */
  it('should reject all agent-initiated transitions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...WORK_ITEM_STATES),
        fc.constantFrom(...WORK_ITEM_STATES),
        (fromState, toState) => {
          const sm = new StateMachine('WI-0001', fromState);
          const result = sm.transition(toState, 'agent');
          return !result.success;
        },
      ),
      { numRuns: 100 },
    );
  });
});
