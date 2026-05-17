/**
 * Exponential Backoff for job status polling (Task 9.2).
 *
 * Provides:
 * - Exponential backoff with configurable base interval
 * - Maximum interval cap
 * - Randomization to prevent thundering herd
 * - Smart polling based on job type and expected duration
 *
 * @packageDocumentation
 */

/**
 * Exponential backoff configuration
 */
export interface ExponentialBackoffConfig {
  /** Initial interval in milliseconds (default: 100) */
  initialInterval?: number;
  /** Maximum interval in milliseconds (default: 5000) */
  maxInterval?: number;
  /** Backoff multiplier (default: 2.0) */
  multiplier?: number;
  /** Randomization factor (0.0 to 1.0, default: 0.1) */
  randomizationFactor?: number;
}

/**
 * Job type for smart polling
 */
export type JobType = 'short' | 'medium' | 'long' | 'unknown';

/**
 * Job duration estimates (milliseconds)
 */
export const JOB_DURATION_ESTIMATES: Record<JobType, number> = {
  short: 5000,    // < 5s
  medium: 30000,  // 5s - 30s
  long: 120000,   // > 30s
  unknown: 30000, // default to medium
};

/**
 * Smart polling configuration based on job type
 */
export interface SmartPollingConfig {
  /** Job type */
  jobType: JobType;
  /** Expected duration in milliseconds */
  expectedDuration?: number;
  /** Custom backoff config override */
  backoffConfig?: ExponentialBackoffConfig;
}

/**
 * Exponential backoff calculator with randomization.
 * 
 * Uses the formula: 
 * interval = min(maxInterval, initialInterval * multiplier^attempt) * (1 + randomizationFactor * random())
 * 
 * @example
 * ```typescript
 * const backoff = new ExponentialBackoff({
 *   initialInterval: 100,
 *   maxInterval: 5000,
 *   multiplier: 2.0,
 *   randomizationFactor: 0.1,
 * });
 * 
 * // Get intervals for first 10 attempts
 * for (let i = 0; i < 10; i++) {
 *   console.log(`Attempt ${i}: ${backoff.nextInterval(i)}ms`);
 * }
 * ```
 */
export class ExponentialBackoff {
  private readonly initialInterval: number;
  private readonly maxInterval: number;
  private readonly multiplier: number;
  private readonly randomizationFactor: number;

  /**
   * Create a new ExponentialBackoff instance.
   * 
   * @param config - Backoff configuration
   */
  constructor(config: ExponentialBackoffConfig = {}) {
    this.initialInterval = config.initialInterval ?? 100;
    this.maxInterval = config.maxInterval ?? 5000;
    this.multiplier = config.multiplier ?? 2.0;
    this.randomizationFactor = config.randomizationFactor ?? 0.1;
  }

  /**
   * Calculate the next interval with exponential backoff and randomization.
   * 
   * @param attempt - Current attempt number (0-indexed)
   * @returns Interval in milliseconds
   */
  nextInterval(attempt: number): number {
    if (attempt < 0) {
      throw new Error(`Attempt must be non-negative, got ${attempt}`);
    }

    // Calculate base interval with exponential growth
    const baseInterval = this.initialInterval * Math.pow(this.multiplier, attempt);
    
    // Apply randomization (jitter) to prevent thundering herd
    const randomOffset = this.randomizationFactor * baseInterval * Math.random();
    const interval = baseInterval + randomOffset;
    
    // Cap at maximum interval
    return Math.min(this.maxInterval, interval);
  }

  /**
   * Get the total wait time for a number of attempts.
   * 
   * @param attempts - Number of attempts
   * @returns Total wait time in milliseconds
   */
  totalWaitTime(attempts: number): number {
    if (attempts <= 0) {
      return 0;
    }
    
    let total = 0;
    for (let i = 0; i < attempts; i++) {
      total += this.nextInterval(i);
    }
    return total;
  }
}

/**
 * Smart polling strategy based on job type.
 */
export class SmartPollingStrategy {
  private readonly backoff: ExponentialBackoff;
  private readonly jobType: JobType;
  private readonly expectedDuration: number;

  /**
   * Create a new SmartPollingStrategy instance.
   * 
   * @param config - Smart polling configuration
   */
  constructor(config: SmartPollingConfig) {
    this.jobType = config.jobType;
    this.expectedDuration = config.expectedDuration ?? JOB_DURATION_ESTIMATES[config.jobType];
    this.backoff = new ExponentialBackoff(config.backoffConfig);
  }

  /**
   * Get the initial polling interval for this job type.
   * 
   * Short jobs: poll more frequently (100ms)
   * Medium jobs: moderate polling (500ms)
   * Long jobs: less frequent polling (1000ms)
   * 
   * @returns Initial interval in milliseconds
   */
  getInitialInterval(): number {
    switch (this.jobType) {
      case 'short':
        return 100;
      case 'medium':
        return 500;
      case 'long':
        return 1000;
      default:
        return 500;
    }
  }

  /**
   * Get the maximum polling interval for this job type.
   * 
   * @returns Maximum interval in milliseconds
   */
  getMaxInterval(): number {
    switch (this.jobType) {
      case 'short':
        return 1000;
      case 'medium':
        return 2000;
      case 'long':
        return 5000;
      default:
        return 2000;
    }
  }

  /**
   * Get the recommended polling interval for a given attempt.
   * 
   * @param attempt - Current attempt number (0-indexed)
   * @returns Recommended interval in milliseconds
   */
  getRecommendedInterval(attempt: number): number {
    const backoff = new ExponentialBackoff({
      initialInterval: this.getInitialInterval(),
      maxInterval: this.getMaxInterval(),
      multiplier: 2.0,
      randomizationFactor: 0.1,
    });
    return backoff.nextInterval(attempt);
  }

  /**
   * Estimate the number of polling attempts until timeout.
   * 
   * @param timeout - Timeout in milliseconds
   * @returns Estimated number of attempts
   */
  estimateAttempts(timeout: number): number {
    let total = 0;
    let attempts = 0;
    
    while (total < timeout) {
      total += this.getRecommendedInterval(attempts);
      attempts++;
    }
    
    return attempts;
  }
}

/**
 * Create a smart polling strategy for a job.
 * 
 * @param command - Job command name
 * @param expectedDuration - Optional expected duration override
 * @returns SmartPollingStrategy instance
 */
export function createSmartPollingStrategy(
  command: string,
  expectedDuration?: number
): SmartPollingStrategy {
  // Determine job type based on command
  let jobType: JobType = 'unknown';
  
  if (command.includes('spec') || command.includes('workflow')) {
    jobType = 'long';
  } else if (command.includes('heal') || command.includes('config')) {
    jobType = 'medium';
  } else {
    jobType = 'short';
  }
  
  return new SmartPollingStrategy({
    jobType,
    expectedDuration,
  });
}

/**
 * Batch polling result for multiple jobs.
 */
export interface BatchPollResult {
  /** Job ID */
  jobId: string;
  /** Current status */
  status: string;
  /** Whether this job has reached terminal state */
  isTerminal: boolean;
  /** Error if any */
  error?: string;
}

/**
 * Batch polling configuration.
 */
export interface BatchPollConfig {
  /** Job IDs to poll */
  jobIds: string[];
  /** Function to get single job status */
  getStatus: (jobId: string) => Promise<{ status: string; error?: string }>;
  /** Maximum batch size */
  maxBatchSize?: number;
}

/**
 * Batch polling utility for efficient multiple job status queries.
 */
export class BatchPoller {
  private readonly getStatus: (jobId: string) => Promise<{ status: string; error?: string }>;
  private readonly maxBatchSize: number;

  /**
   * Create a new BatchPoller instance.
   * 
   * @param config - Batch polling configuration
   */
  constructor(config: BatchPollConfig) {
    this.getStatus = config.getStatus;
    this.maxBatchSize = config.maxBatchSize ?? 10;
  }

  /**
   * Poll multiple jobs and return their statuses.
   * 
   * @param jobIds - Job IDs to poll
   * @returns Array of poll results
   */
  async poll(jobIds: string[]): Promise<BatchPollResult[]> {
    const results: BatchPollResult[] = [];
    
    // Process in batches
    for (let i = 0; i < jobIds.length; i += this.maxBatchSize) {
      const batch = jobIds.slice(i, i + this.maxBatchSize);
      
      // Poll batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (jobId) => {
          try {
            const response = await this.getStatus(jobId);
            return {
              jobId,
              status: response.status,
              isTerminal: this.isTerminalStatus(response.status),
              error: response.error,
            };
          } catch (error) {
            return {
              jobId,
              status: 'error',
              isTerminal: true,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );
      
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Check if a status is terminal.
   * 
   * @param status - Status string
   * @returns Whether status is terminal
   */
  private isTerminalStatus(status: string): boolean {
    const terminalStatuses = ['completed', 'failed', 'blocked', 'cancelled', 'error'];
    return terminalStatuses.includes(status);
  }

  /**
   * Wait for all jobs to reach terminal state.
   * 
   * @param jobIds - Job IDs to wait for
   * @param options - Wait options
   * @returns Map of job IDs to final statuses
   */
  async waitForAll(
    jobIds: string[],
    options?: {
      timeout?: number;
      interval?: number;
      onProgress?: (completed: number, total: number) => void;
    }
  ): Promise<Map<string, BatchPollResult>> {
    const timeout = options?.timeout ?? 300000; // 5 minutes
    const interval = options?.interval ?? 1000;
    const onProgress = options?.onProgress;
    
    const startTime = Date.now();
    const results = new Map<string, BatchPollResult>();
    
    while (true) {
      // Check timeout
      if (Date.now() - startTime >= timeout) {
        throw new Error(`Batch wait timeout after ${timeout}ms`);
      }
      
      // Poll all jobs
      const batchResults = await this.poll(jobIds);
      
      // Update results map
      for (const result of batchResults) {
        results.set(result.jobId, result);
      }
      
      // Check if all are terminal
      const allTerminal = batchResults.every(r => r.isTerminal);
      if (allTerminal) {
        return results;
      }
      
      // Update progress callback
      const completed = batchResults.filter(r => r.isTerminal).length;
      onProgress?.(completed, batchResults.length);
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
}
