/**
 * RetryCounter Types
 */

export type RetryStatus = 'active' | 'blocked' | 'escalated';

export interface RetryState {
  workItemId: string;
  currentPhase: string;
  attempts: number;
  maxAttempts: number;
  lastError: string;
  lastAttemptAt: number;
  status: RetryStatus;
}

export interface RetryExhaustedEvent {
  type: 'agent.roster.retry_exhausted';
  workItemId: string;
  phase: string;
  attempts: number;
  lastError: string;
}
