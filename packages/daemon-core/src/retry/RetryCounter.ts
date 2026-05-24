/**
 * RetryCounter
 * Daemon-level retry counting for Gate failures
 * Replaces V5's natural-language retry instructions
 */

import { RetryState, RetryStatus, RetryExhaustedEvent } from './types.js';

export class RetryCounter {
  private retries: Map<string, RetryState> = new Map();
  private defaultMaxAttempts: number = 3;
  private eventHandler?: (event: RetryExhaustedEvent) => void;

  /**
   * Set event handler for retry_exhausted events
   */
  setEventHandler(handler: (event: RetryExhaustedEvent) => void): void {
    this.eventHandler = handler;
  }

  /**
   * Record a Gate failure and update retry state
   * @returns Updated RetryState
   */
  recordFailure(workItemId: string, phase: string, error: string): RetryState {
    const key = `${workItemId}:${phase}`;
    let state = this.retries.get(key);

    if (!state) {
      state = {
        workItemId,
        currentPhase: phase,
        attempts: 0,
        maxAttempts: this.defaultMaxAttempts,
        lastError: '',
        lastAttemptAt: 0,
        status: 'active' as RetryStatus,
      };
    }

    state.attempts++;
    state.lastError = error;
    state.lastAttemptAt = Date.now();

    if (state.attempts >= state.maxAttempts) {
      state.status = 'blocked';

      // Emit retry_exhausted event
      if (this.eventHandler) {
        this.eventHandler({
          type: 'agent.roster.retry_exhausted',
          workItemId,
          phase,
          attempts: state.attempts,
          lastError: error,
        });
      }
    } else {
      state.status = 'active';
    }

    this.retries.set(key, state);
    return { ...state };
  }

  /**
   * Check if a work item is blocked due to retry exhaustion
   */
  isBlocked(workItemId: string, phase?: string): boolean {
    if (phase) {
      const key = `${workItemId}:${phase}`;
      const state = this.retries.get(key);
      return state?.status === 'blocked';
    }

    // Check all phases for this work item
    for (const [key, state] of this.retries) {
      if (key.startsWith(`${workItemId}:`) && state.status === 'blocked') {
        return true;
      }
    }
    return false;
  }

  /**
   * Get retry state for a work item + phase
   */
  getState(workItemId: string, phase: string): RetryState | undefined {
    const key = `${workItemId}:${phase}`;
    const state = this.retries.get(key);
    return state ? { ...state } : undefined;
  }

  /**
   * Reset retry state for a work item (e.g., after successful retry)
   */
  reset(workItemId: string, phase: string): void {
    const key = `${workItemId}:${phase}`;
    this.retries.delete(key);
  }

  /**
   * Escalate to debugger (sets status to escalated)
   */
  escalate(workItemId: string, phase: string): RetryState | undefined {
    const key = `${workItemId}:${phase}`;
    const state = this.retries.get(key);
    if (state) {
      state.status = 'escalated';
      this.retries.set(key, state);
      return { ...state };
    }
    return undefined;
  }

  /**
   * Configure max attempts for new retry states
   */
  setDefaultMaxAttempts(max: number): void {
    this.defaultMaxAttempts = max;
  }

  /**
   * Get all blocked work items
   */
  getBlockedItems(): RetryState[] {
    const blocked: RetryState[] = [];
    for (const state of this.retries.values()) {
      if (state.status === 'blocked') {
        blocked.push({ ...state });
      }
    }
    return blocked;
  }

  /**
   * Clear all retry states
   */
  clear(): void {
    this.retries.clear();
  }
}
