/**
 * Unit Tests for HealingState Data Model
 * 
 * Tests serialization/deserialization, state transitions, and invariant validation.
 * Requirements: SH-3, SH-4
 * Property 25: Healing Iteration Bound
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  HealingState,
  createHealingState,
  serializeHealingState,
  deserializeHealingState,
  transitionHealingState,
  getCurrentPhase,
  isBlocked,
  hasReachedIterationLimit,
  getLastHistoryEntry,
  validateHealingStateInvariants,
} from '../src/healing-state'

describe('HealingState Data Model', () => {
  let state: HealingState

  beforeEach(() => {
    state = createHealingState('test-work-item-1')
  })

  describe('createHealingState', () => {
    it('should create a new HealingState in idle phase', () => {
      expect(state.schema_version).toBe('1.0')
      expect(state.workItemId).toBe('test-work-item-1')
      expect(state.currentPhase).toBe('idle')
      expect(state.iteration).toBe(1)
      expect(state.history).toHaveLength(1)
      expect(state.history[0].phase).toBe('idle')
    })

    it('should have schema_version field', () => {
      expect(state.schema_version).toBe('1.0')
    })

    it('should initialize history with idle entry', () => {
      expect(state.history).toHaveLength(1)
      expect(state.history[0].phase).toBe('idle')
      expect(state.history[0].enteredAt).toBeGreaterThan(0)
    })

    it('should not have blocked details in initial state', () => {
      expect(state.blocked).toBeUndefined()
    })
  })

  describe('Serialization and Deserialization', () => {
    it('should serialize HealingState to JSON string', () => {
      const json = serializeHealingState(state)
      expect(typeof json).toBe('string')
      expect(json).toContain('schema_version')
      expect(json).toContain('test-work-item-1')
    })

    it('should deserialize JSON string back to HealingState', () => {
      const json = serializeHealingState(state)
      const deserialized = deserializeHealingState(json)
      
      expect(deserialized.schema_version).toBe(state.schema_version)
      expect(deserialized.workItemId).toBe(state.workItemId)
      expect(deserialized.currentPhase).toBe(state.currentPhase)
      expect(deserialized.iteration).toBe(state.iteration)
    })

    it('should support round-trip serialization', () => {
      const json1 = serializeHealingState(state)
      const deserialized = deserializeHealingState(json1)
      const json2 = serializeHealingState(deserialized)
      
      expect(json1).toBe(json2)
    })

    it('should preserve history during serialization', () => {
      state = transitionHealingState(state, 'triggered', 'user_request')
      state = transitionHealingState(state, 'diagnosing', 'analysis_started')
      
      const json = serializeHealingState(state)
      const deserialized = deserializeHealingState(json)
      
      expect(deserialized.history).toHaveLength(3)
      expect(deserialized.history[1].phase).toBe('triggered')
      expect(deserialized.history[2].phase).toBe('diagnosing')
    })

    it('should throw on invalid JSON', () => {
      expect(() => deserializeHealingState('invalid json')).toThrow()
    })

    it('should throw on missing schema_version', () => {
      const invalid = JSON.stringify({
        workItemId: 'test',
        currentPhase: 'idle',
        iteration: 1,
        history: [],
      })
      expect(() => deserializeHealingState(invalid)).toThrow()
    })

    it('should throw on invalid iteration value', () => {
      const invalid = JSON.stringify({
        schema_version: '1.0',
        workItemId: 'test',
        currentPhase: 'idle',
        iteration: 5,  // Invalid: > 3
        history: [{ phase: 'idle', enteredAt: Date.now() }],
      })
      expect(() => deserializeHealingState(invalid)).toThrow()
    })

    it('should throw on invalid phase', () => {
      const invalid = JSON.stringify({
        schema_version: '1.0',
        workItemId: 'test',
        currentPhase: 'invalid_phase',
        iteration: 1,
        history: [{ phase: 'idle', enteredAt: Date.now() }],
      })
      expect(() => deserializeHealingState(invalid)).toThrow()
    })
  })

  describe('State Transitions', () => {
    it('should transition from idle to triggered', () => {
      const newState = transitionHealingState(state, 'triggered', 'user_request')
      
      expect(newState.currentPhase).toBe('triggered')
      expect(newState.iteration).toBe(2)
      expect(newState.history).toHaveLength(2)
      expect(newState.history[1].phase).toBe('triggered')
      expect(newState.history[1].reason).toBe('user_request')
    })

    it('should transition from triggered to diagnosing', () => {
      state = transitionHealingState(state, 'triggered', 'user_request')
      const newState = transitionHealingState(state, 'diagnosing', 'analysis_started')
      
      expect(newState.currentPhase).toBe('diagnosing')
      expect(newState.iteration).toBe(2)  // Iteration doesn't change on non-triggered transition
      expect(newState.history).toHaveLength(3)
    })

    it('should transition to blocked with reason', () => {
      state = transitionHealingState(state, 'triggered', 'user_request')
      const newState = transitionHealingState(state, 'blocked', 'error_type_not_allowed')
      
      expect(newState.currentPhase).toBe('blocked')
      expect(newState.blocked).toBeDefined()
      expect(newState.blocked?.reason).toBe('error_type_not_allowed')
      expect(newState.blocked?.blockedAt).toBeGreaterThan(0)
    })

    it('should preserve iteration count on non-triggered transitions', () => {
      state = transitionHealingState(state, 'triggered', 'user_request')
      expect(state.iteration).toBe(2)
      
      const newState = transitionHealingState(state, 'diagnosing')
      expect(newState.iteration).toBe(2)
    })

    it('should increment iteration on triggered transition', () => {
      expect(state.iteration).toBe(1)
      
      state = transitionHealingState(state, 'triggered', 'attempt_1')
      expect(state.iteration).toBe(2)
      
      state = transitionHealingState(state, 'idle')
      expect(state.iteration).toBe(2)
      
      state = transitionHealingState(state, 'triggered', 'attempt_2')
      expect(state.iteration).toBe(3)
    })

    it('should include diagnosis report reference in history', () => {
      const reportRef = {
        blobRef: 'blob://abc123',
        generatedAt: Date.now(),
      }
      
      state = transitionHealingState(state, 'triggered', 'user_request')
      const newState = transitionHealingState(
        state,
        'diagnosing',
        'analysis_complete',
        reportRef
      )
      
      expect(newState.history[2].diagnosisReportRef).toEqual(reportRef)
    })
  })

  describe('Property 25: Iteration Bound Enforcement', () => {
    it('should allow transitions up to iteration 3', () => {
      // Iteration 1 (initial)
      expect(state.iteration).toBe(1)
      
      // Iteration 2
      state = transitionHealingState(state, 'triggered', 'attempt_1')
      expect(state.iteration).toBe(2)
      expect(state.currentPhase).toBe('triggered')
      
      // Back to idle
      state = transitionHealingState(state, 'idle')
      expect(state.iteration).toBe(2)
      
      // Iteration 3
      state = transitionHealingState(state, 'triggered', 'attempt_2')
      expect(state.iteration).toBe(3)
      expect(state.currentPhase).toBe('triggered')
    })

    it('should block on 4th attempt (iteration >= 3)', () => {
      // Reach iteration 3
      state = transitionHealingState(state, 'triggered', 'attempt_1')
      state = transitionHealingState(state, 'idle')
      state = transitionHealingState(state, 'triggered', 'attempt_2')
      
      expect(state.iteration).toBe(3)
      expect(state.currentPhase).toBe('triggered')
      
      // Try 4th attempt
      state = transitionHealingState(state, 'idle')
      const blockedState = transitionHealingState(state, 'triggered', 'attempt_3')
      
      expect(blockedState.currentPhase).toBe('blocked')
      expect(blockedState.blocked?.reason).toBe('iteration_limit_exceeded')
      expect(blockedState.iteration).toBe(3)  // Iteration doesn't increment when blocked
    })

    it('should have iteration_limit_exceeded reason when blocked', () => {
      // Reach iteration 3
      state = transitionHealingState(state, 'triggered', 'attempt_1')
      state = transitionHealingState(state, 'idle')
      state = transitionHealingState(state, 'triggered', 'attempt_2')
      state = transitionHealingState(state, 'idle')
      
      // Try 4th attempt
      const blockedState = transitionHealingState(state, 'triggered', 'attempt_3')
      
      expect(blockedState.currentPhase).toBe('blocked')
      expect(blockedState.blocked?.reason).toBe('iteration_limit_exceeded')
    })
  })

  describe('Query Functions', () => {
    it('should get current phase', () => {
      expect(getCurrentPhase(state)).toBe('idle')
      
      state = transitionHealingState(state, 'triggered')
      expect(getCurrentPhase(state)).toBe('triggered')
    })

    it('should check if blocked', () => {
      expect(isBlocked(state)).toBe(false)
      
      state = transitionHealingState(state, 'blocked', 'test_reason')
      expect(isBlocked(state)).toBe(true)
    })

    it('should check if reached iteration limit', () => {
      expect(hasReachedIterationLimit(state)).toBe(false)
      
      state = transitionHealingState(state, 'triggered')
      expect(hasReachedIterationLimit(state)).toBe(false)  // iteration = 2
      
      state = transitionHealingState(state, 'idle')
      state = transitionHealingState(state, 'triggered')
      expect(hasReachedIterationLimit(state)).toBe(true)  // iteration = 3
      
      state = transitionHealingState(state, 'idle')
      // 4th attempt will be blocked, but before that iteration is still 3
      expect(hasReachedIterationLimit(state)).toBe(true)
    })

    it('should get last history entry', () => {
      let entry = getLastHistoryEntry(state)
      expect(entry.phase).toBe('idle')
      
      state = transitionHealingState(state, 'triggered', 'test_reason')
      entry = getLastHistoryEntry(state)
      expect(entry.phase).toBe('triggered')
      expect(entry.reason).toBe('test_reason')
    })
  })

  describe('Invariant Validation', () => {
    it('should validate valid HealingState', () => {
      expect(validateHealingStateInvariants(state)).toBe(true)
    })

    it('should validate after transitions', () => {
      state = transitionHealingState(state, 'triggered')
      expect(validateHealingStateInvariants(state)).toBe(true)
      
      state = transitionHealingState(state, 'diagnosing')
      expect(validateHealingStateInvariants(state)).toBe(true)
    })

    it('should reject state with invalid iteration', () => {
      const invalid: HealingState = {
        ...state,
        iteration: 5,
      }
      expect(validateHealingStateInvariants(invalid)).toBe(false)
    })

    it('should reject state with empty history', () => {
      const invalid: HealingState = {
        ...state,
        history: [],
      }
      expect(validateHealingStateInvariants(invalid)).toBe(false)
    })

    it('should reject blocked state without blocked details', () => {
      const invalid: HealingState = {
        ...state,
        currentPhase: 'blocked',
        blocked: undefined,
      }
      expect(validateHealingStateInvariants(invalid)).toBe(false)
    })

    it('should accept blocked state with blocked details', () => {
      state = transitionHealingState(state, 'blocked', 'test_reason')
      expect(validateHealingStateInvariants(state)).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty reason in transition', () => {
      const newState = transitionHealingState(state, 'triggered')
      expect(newState.history[1].reason).toBeUndefined()
    })

    it('should handle multiple transitions in sequence', () => {
      state = transitionHealingState(state, 'triggered', 'attempt_1')
      state = transitionHealingState(state, 'diagnosing', 'analysis_started')
      state = transitionHealingState(state, 'idle', 'analysis_complete')
      
      expect(state.history).toHaveLength(4)
      expect(state.currentPhase).toBe('idle')
      expect(state.iteration).toBe(2)
    })

    it('should preserve workItemId through transitions', () => {
      const workItemId = state.workItemId
      state = transitionHealingState(state, 'triggered')
      state = transitionHealingState(state, 'diagnosing')
      
      expect(state.workItemId).toBe(workItemId)
    })

    it('should maintain schema_version through transitions', () => {
      state = transitionHealingState(state, 'triggered')
      state = transitionHealingState(state, 'diagnosing')
      
      expect(state.schema_version).toBe('1.0')
    })
  })

  describe('Round-trip Serialization with Complex State', () => {
    it('should preserve complex state through serialization', () => {
      const reportRef = {
        blobRef: 'blob://sha256-abc123',
        generatedAt: Date.now(),
      }
      
      state = transitionHealingState(state, 'triggered', 'user_request')
      state = transitionHealingState(state, 'diagnosing', 'analysis_started', reportRef)
      state = transitionHealingState(state, 'idle', 'analysis_complete')
      
      const json = serializeHealingState(state)
      const deserialized = deserializeHealingState(json)
      
      expect(deserialized.workItemId).toBe(state.workItemId)
      expect(deserialized.currentPhase).toBe(state.currentPhase)
      expect(deserialized.iteration).toBe(state.iteration)
      expect(deserialized.history).toHaveLength(state.history.length)
      expect(deserialized.history[2].diagnosisReportRef).toEqual(reportRef)
    })

    it('should preserve blocked state through serialization', () => {
      state = transitionHealingState(state, 'blocked', 'error_type_not_allowed')
      
      const json = serializeHealingState(state)
      const deserialized = deserializeHealingState(json)
      
      expect(deserialized.currentPhase).toBe('blocked')
      expect(deserialized.blocked?.reason).toBe('error_type_not_allowed')
      expect(deserialized.blocked?.blockedAt).toBeGreaterThan(0)
    })
  })
})
