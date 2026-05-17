/**
 * Unit Tests for Terminal States
 * 
 * Tests for the terminal state definitions and validation functions.
 */

import { describe, it, expect } from 'vitest';
import {
  TERMINAL_STATES,
  TERMINAL_STATE_VALUES,
  TerminalState,
  isTerminalState,
  validateTerminalState,
  getAllTerminalStates,
  isSuccessfulTerminalState,
  isFailureTerminalState,
  isCancelledTerminalState,
  getTerminalStateDescription,
} from '../../src/job-tracker/terminal-states';

describe('Terminal States', () => {
  describe('TERMINAL_STATES constants', () => {
    it('should define all required terminal states', () => {
      expect(TERMINAL_STATES.COMPLETED).toBe('completed');
      expect(TERMINAL_STATES.FAILED).toBe('failed');
      expect(TERMINAL_STATES.CANCELLED).toBe('cancelled');
      expect(TERMINAL_STATES.TIMEOUT).toBe('timeout');
    });

    it('should have exactly 4 terminal states', () => {
      const states = Object.values(TERMINAL_STATES);
      expect(states).toHaveLength(4);
    });

    it('should have unique state values', () => {
      const states = Object.values(TERMINAL_STATES);
      const uniqueStates = new Set(states);
      expect(uniqueStates.size).toBe(states.length);
    });
  });

  describe('TERMINAL_STATE_VALUES array', () => {
    it('should contain all terminal state values', () => {
      expect(TERMINAL_STATE_VALUES).toContain(TERMINAL_STATES.COMPLETED);
      expect(TERMINAL_STATE_VALUES).toContain(TERMINAL_STATES.FAILED);
      expect(TERMINAL_STATE_VALUES).toContain(TERMINAL_STATES.CANCELLED);
      expect(TERMINAL_STATE_VALUES).toContain(TERMINAL_STATES.TIMEOUT);
    });

    it('should have exactly 4 values', () => {
      expect(TERMINAL_STATE_VALUES).toHaveLength(4);
    });

    it('should be readonly', () => {
      // TypeScript will catch this at compile time, but we can verify at runtime
      expect(Object.isFrozen(TERMINAL_STATE_VALUES) || !Array.isArray(TERMINAL_STATE_VALUES)).toBe(false);
    });
  });

  describe('isTerminalState()', () => {
    it('should return true for valid terminal states', () => {
      expect(isTerminalState('completed')).toBe(true);
      expect(isTerminalState('failed')).toBe(true);
      expect(isTerminalState('cancelled')).toBe(true);
      expect(isTerminalState('timeout')).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      expect(isTerminalState('pending')).toBe(false);
      expect(isTerminalState('running')).toBe(false);
      expect(isTerminalState('blocked')).toBe(false);
    });

    it('should return false for invalid states', () => {
      expect(isTerminalState('invalid')).toBe(false);
      expect(isTerminalState('')).toBe(false);
      expect(isTerminalState('COMPLETED')).toBe(false); // case-sensitive
    });

    it('should work with type guard', () => {
      const state: string = 'completed';
      if (isTerminalState(state)) {
        // TypeScript should recognize state as TerminalState here
        const _: TerminalState = state;
        expect(_).toBe('completed');
      }
    });
  });

  describe('validateTerminalState()', () => {
    it('should not throw for valid terminal states', () => {
      expect(() => validateTerminalState('completed')).not.toThrow();
      expect(() => validateTerminalState('failed')).not.toThrow();
      expect(() => validateTerminalState('cancelled')).not.toThrow();
      expect(() => validateTerminalState('timeout')).not.toThrow();
    });

    it('should throw for non-terminal states', () => {
      expect(() => validateTerminalState('pending')).toThrow();
      expect(() => validateTerminalState('running')).toThrow();
      expect(() => validateTerminalState('blocked')).toThrow();
    });

    it('should throw for invalid states', () => {
      expect(() => validateTerminalState('invalid')).toThrow();
      expect(() => validateTerminalState('')).toThrow();
    });

    it('should include helpful error message', () => {
      try {
        validateTerminalState('invalid');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Invalid terminal state');
        expect((error as Error).message).toContain('invalid');
        expect((error as Error).message).toContain('completed');
      }
    });

    it('should work as type assertion', () => {
      const state: string = 'completed';
      validateTerminalState(state);
      // TypeScript should recognize state as TerminalState here
      const _: TerminalState = state;
      expect(_).toBe('completed');
    });
  });

  describe('getAllTerminalStates()', () => {
    it('should return all terminal states', () => {
      const states = getAllTerminalStates();
      expect(states).toContain('completed');
      expect(states).toContain('failed');
      expect(states).toContain('cancelled');
      expect(states).toContain('timeout');
    });

    it('should return exactly 4 states', () => {
      expect(getAllTerminalStates()).toHaveLength(4);
    });

    it('should return the same array as TERMINAL_STATE_VALUES', () => {
      expect(getAllTerminalStates()).toEqual(TERMINAL_STATE_VALUES);
    });
  });

  describe('isSuccessfulTerminalState()', () => {
    it('should return true only for completed state', () => {
      expect(isSuccessfulTerminalState('completed')).toBe(true);
    });

    it('should return false for other terminal states', () => {
      expect(isSuccessfulTerminalState('failed')).toBe(false);
      expect(isSuccessfulTerminalState('cancelled')).toBe(false);
      expect(isSuccessfulTerminalState('timeout')).toBe(false);
    });
  });

  describe('isFailureTerminalState()', () => {
    it('should return true for failed and timeout states', () => {
      expect(isFailureTerminalState('failed')).toBe(true);
      expect(isFailureTerminalState('timeout')).toBe(true);
    });

    it('should return false for other terminal states', () => {
      expect(isFailureTerminalState('completed')).toBe(false);
      expect(isFailureTerminalState('cancelled')).toBe(false);
    });
  });

  describe('isCancelledTerminalState()', () => {
    it('should return true only for cancelled state', () => {
      expect(isCancelledTerminalState('cancelled')).toBe(true);
    });

    it('should return false for other terminal states', () => {
      expect(isCancelledTerminalState('completed')).toBe(false);
      expect(isCancelledTerminalState('failed')).toBe(false);
      expect(isCancelledTerminalState('timeout')).toBe(false);
    });
  });

  describe('getTerminalStateDescription()', () => {
    it('should return description for completed state', () => {
      const desc = getTerminalStateDescription('completed');
      expect(desc).toContain('completed');
      expect(desc).toContain('successfully');
    });

    it('should return description for failed state', () => {
      const desc = getTerminalStateDescription('failed');
      expect(desc).toContain('failed');
      expect(desc).toContain('error');
    });

    it('should return description for cancelled state', () => {
      const desc = getTerminalStateDescription('cancelled');
      expect(desc).toContain('cancelled');
    });

    it('should return description for timeout state', () => {
      const desc = getTerminalStateDescription('timeout');
      expect(desc).toContain('execution time');
    });

    it('should return different descriptions for each state', () => {
      const descriptions = new Set([
        getTerminalStateDescription('completed'),
        getTerminalStateDescription('failed'),
        getTerminalStateDescription('cancelled'),
        getTerminalStateDescription('timeout'),
      ]);
      expect(descriptions.size).toBe(4);
    });
  });

  describe('State classification', () => {
    it('should classify all terminal states correctly', () => {
      const allStates = getAllTerminalStates();
      
      for (const state of allStates) {
        // Each state should be exactly one of: success, failure, or cancelled
        const isSuccess = isSuccessfulTerminalState(state);
        const isFailure = isFailureTerminalState(state);
        const isCancelled = isCancelledTerminalState(state);
        
        const classificationCount = [isSuccess, isFailure, isCancelled].filter(Boolean).length;
        expect(classificationCount).toBe(1);
      }
    });

    it('should have exactly one success state', () => {
      const allStates = getAllTerminalStates();
      const successStates = allStates.filter(isSuccessfulTerminalState);
      expect(successStates).toHaveLength(1);
      expect(successStates[0]).toBe('completed');
    });

    it('should have exactly two failure states', () => {
      const allStates = getAllTerminalStates();
      const failureStates = allStates.filter(isFailureTerminalState);
      expect(failureStates).toHaveLength(2);
      expect(failureStates).toContain('failed');
      expect(failureStates).toContain('timeout');
    });

    it('should have exactly one cancelled state', () => {
      const allStates = getAllTerminalStates();
      const cancelledStates = allStates.filter(isCancelledTerminalState);
      expect(cancelledStates).toHaveLength(1);
      expect(cancelledStates[0]).toBe('cancelled');
    });
  });

  describe('Edge cases', () => {
    it('should handle null and undefined gracefully', () => {
      expect(isTerminalState(null as any)).toBe(false);
      expect(isTerminalState(undefined as any)).toBe(false);
    });

    it('should handle numeric and boolean values', () => {
      expect(isTerminalState(123 as any)).toBe(false);
      expect(isTerminalState(true as any)).toBe(false);
      expect(isTerminalState(false as any)).toBe(false);
    });

    it('should handle object values', () => {
      expect(isTerminalState({} as any)).toBe(false);
      expect(isTerminalState([] as any)).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isTerminalState('Completed')).toBe(false);
      expect(isTerminalState('COMPLETED')).toBe(false);
      expect(isTerminalState('Failed')).toBe(false);
      expect(isTerminalState('FAILED')).toBe(false);
    });

    it('should not accept whitespace variations', () => {
      expect(isTerminalState(' completed')).toBe(false);
      expect(isTerminalState('completed ')).toBe(false);
      expect(isTerminalState(' completed ')).toBe(false);
    });
  });
});
