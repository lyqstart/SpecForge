/**
 * Terminal States for Async Commands
 * 
 * Defines the terminal state set for asynchronous commands in the CLI.
 * Terminal states are states that a job will not transition out of once reached.
 * 
 * @packageDocumentation
 */

/**
 * Terminal state constants for async commands
 * 
 * These represent the final states that an async job can reach:
 * - `completed`: Job finished successfully
 * - `failed`: Job encountered an error and failed
 * - `cancelled`: Job was cancelled by user or system
 * - `timeout`: Job exceeded the maximum allowed execution time
 */
export const TERMINAL_STATES = {
  /** Job completed successfully */
  COMPLETED: 'completed',
  /** Job failed with an error */
  FAILED: 'failed',
  /** Job was cancelled */
  CANCELLED: 'cancelled',
  /** Job exceeded timeout */
  TIMEOUT: 'timeout',
} as const;

/**
 * Type for terminal state values
 */
export type TerminalState = typeof TERMINAL_STATES[keyof typeof TERMINAL_STATES];

/**
 * Array of all terminal state values
 */
export const TERMINAL_STATE_VALUES: readonly TerminalState[] = [
  TERMINAL_STATES.COMPLETED,
  TERMINAL_STATES.FAILED,
  TERMINAL_STATES.CANCELLED,
  TERMINAL_STATES.TIMEOUT,
] as const;

/**
 * Check if a given state is a terminal state
 * 
 * @param state - The state to check
 * @returns true if the state is terminal, false otherwise
 * 
 * @example
 * ```typescript
 * isTerminalState('completed'); // true
 * isTerminalState('running');   // false
 * ```
 */
export function isTerminalState(state: string): state is TerminalState {
  return TERMINAL_STATE_VALUES.includes(state as TerminalState);
}

/**
 * Validate that a state is a valid terminal state
 * 
 * @param state - The state to validate
 * @throws {Error} If the state is not a valid terminal state
 * 
 * @example
 * ```typescript
 * validateTerminalState('completed'); // OK
 * validateTerminalState('running');   // throws Error
 * ```
 */
export function validateTerminalState(state: string): asserts state is TerminalState {
  if (!isTerminalState(state)) {
    throw new Error(
      `Invalid terminal state: "${state}". ` +
      `Valid terminal states are: ${TERMINAL_STATE_VALUES.join(', ')}`
    );
  }
}

/**
 * Get all valid terminal states
 * 
 * @returns Array of all valid terminal state values
 */
export function getAllTerminalStates(): readonly TerminalState[] {
  return TERMINAL_STATE_VALUES;
}

/**
 * Check if a state represents a successful completion
 * 
 * @param state - The state to check
 * @returns true if the state represents success, false otherwise
 */
export function isSuccessfulTerminalState(state: TerminalState): boolean {
  return state === TERMINAL_STATES.COMPLETED;
}

/**
 * Check if a state represents a failure
 * 
 * @param state - The state to check
 * @returns true if the state represents failure, false otherwise
 */
export function isFailureTerminalState(state: TerminalState): boolean {
  return state === TERMINAL_STATES.FAILED || state === TERMINAL_STATES.TIMEOUT;
}

/**
 * Check if a state represents user cancellation
 * 
 * @param state - The state to check
 * @returns true if the state represents cancellation, false otherwise
 */
export function isCancelledTerminalState(state: TerminalState): boolean {
  return state === TERMINAL_STATES.CANCELLED;
}

/**
 * Get a human-readable description of a terminal state
 * 
 * @param state - The terminal state
 * @returns Human-readable description
 */
export function getTerminalStateDescription(state: TerminalState): string {
  switch (state) {
    case TERMINAL_STATES.COMPLETED:
      return 'Job completed successfully';
    case TERMINAL_STATES.FAILED:
      return 'Job failed with an error';
    case TERMINAL_STATES.CANCELLED:
      return 'Job was cancelled';
    case TERMINAL_STATES.TIMEOUT:
      return 'Job exceeded the maximum execution time';
    default:
      const _exhaustive: never = state;
      return _exhaustive;
  }
}
