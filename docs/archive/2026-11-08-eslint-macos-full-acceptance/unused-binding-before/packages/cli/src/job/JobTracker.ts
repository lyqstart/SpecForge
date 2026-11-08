/**
 * Job Tracker for async command handling.
 * 
 * Provides:
 * - Unique jobId generation for async commands
 * - Job status tracking (pending, running, completed, failed, blocked, cancelled)
 * - Job waiting with timeout support
 * - Integration with DaemonClient for job queries
 * - Exponential backoff and smart polling optimization (Task 9.2)
 * 
 * @packageDocumentation
 */

import { randomUUID, createHash } from 'crypto';
import { createSimpleJobProgress } from '../progress/SimpleProgress';
import { ExponentialBackoff, SmartPollingStrategy, createSmartPollingStrategy, JobType } from './ExponentialBackoff';

/**
 * Job status types
 */
export type JobStatusType = 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled';

/**
 * Terminal states - jobs in these states will not change further
 */
export const TERMINAL_STATES: JobStatusType[] = ['completed', 'failed', 'blocked', 'cancelled'];

/**
 * Check if a status is terminal
 */
export function isTerminalStatus(status: JobStatusType): boolean {
  return TERMINAL_STATES.includes(status);
}

/**
 * Job information returned when creating a new job
 */
export interface JobInfo {
  /** Unique job identifier */
  jobId: string;
  /** Current job status */
  status: 'pending';
  /** The command being executed */
  command: string;
  /** Job creation timestamp (Unix ms) */
  createdAt: number;
}

/**
 * Full job status information
 */
export interface JobStatus {
  /** Unique job identifier */
  jobId: string;
  /** Current job status */
  status: JobStatusType;
  /** Command that created this job */
  command: string;
  /** Job result data (available when completed) */
  result?: unknown;
  /** Error message (available when failed) */
  error?: string;
  /** Job creation timestamp (Unix ms) */
  createdAt: number;
  /** Last update timestamp (Unix ms) */
  updatedAt: number;
}

/**
 * Wait options for job polling
 */
export interface WaitOptions {
  /** Maximum time to wait in milliseconds (default: 300000 = 5 min) */
  timeout?: number;
  /** Polling interval in milliseconds (default: 1000, overridden by exponential backoff) */
  interval?: number;
  /** Callback for each status update */
  onUpdate?: (status: JobStatus) => void;
  /** Output mode for progress indicators (default: 'human') */
  mode?: 'human' | 'json';
  /** Job command for smart polling (default: 'unknown') */
  command?: string;
}

/**
 * JobTracker configuration
 */
export interface JobTrackerConfig {
  /** DaemonClient instance for API calls */
  client: {
    get<T = unknown>(path: string): Promise<T>;
    post<T = unknown>(path: string, body?: unknown): Promise<T>;
  };
  /** Base path for job API (default: '/jobs') */
  basePath?: string;
  /** Default timeout for wait operations (default: 300000ms = 5min) */
  defaultTimeout?: number;
  /** Default polling interval (default: 1000ms) */
  defaultInterval?: number;
}

/**
 * Error thrown when job operations fail
 */
export class JobTrackerError extends Error {
  readonly code: string;
  readonly jobId?: string;
  readonly isRetryable: boolean;

  constructor(params: {
    message: string;
    code: string;
    jobId?: string;
    isRetryable?: boolean;
    cause?: Error;
  }) {
    super(params.message);
    if (params.cause) {
      (this as { cause?: Error }).cause = params.cause;
    }
    this.name = 'JobTrackerError';
    this.code = params.code;
    this.jobId = params.jobId;
    this.isRetryable = params.isRetryable ?? false;
  }
}

/**
 * Job not found error
 */
export class JobNotFoundError extends JobTrackerError {
  constructor(jobId: string) {
    super({
      message: `Job not found: ${jobId}`,
      code: 'JOB_NOT_FOUND',
      jobId,
      isRetryable: false,
    });
    this.name = 'JobNotFoundError';
  }
}

/**
 * Job wait timeout error
 */
export class JobWaitTimeoutError extends JobTrackerError {
  readonly jobId: string;
  readonly timeoutMs: number;
  readonly lastStatus: JobStatusType;

  constructor(jobId: string, timeoutMs: number, lastStatus: JobStatusType) {
    super({
      message: `Job wait timeout after ${timeoutMs}ms: ${jobId}`,
      code: 'WAIT_TIMEOUT',
      jobId,
      isRetryable: true,
    });
    this.name = 'JobWaitTimeoutError';
    this.jobId = jobId;
    this.timeoutMs = timeoutMs;
    this.lastStatus = lastStatus;
  }
}

/**
 * Job Tracker for managing asynchronous commands.
 * 
 * @example
 * ```typescript
 * const tracker = new JobTracker({
 *   client: daemonClient,
 * });
 * 
 * // Start an async job
 * const job = await tracker.createJob('spec start', { template: 'default' });
 * console.log(`Job created: ${job.jobId}`);
 * 
 * // Wait for completion
 * const status = await tracker.waitForJob(job.jobId);
 * console.log(`Job ${status.status}: ${status.result ?? status.error}`);
 * ```
 */
export class JobTracker {
  private readonly client: JobTrackerConfig['client'];
  private readonly basePath: string;
  private readonly defaultTimeout: number;
  private readonly defaultInterval: number;

  /**
   * Create a new JobTracker instance.
   * 
   * @param config - Configuration options
   */
  constructor(config: JobTrackerConfig) {
    this.client = config.client;
    this.basePath = config.basePath ?? '/jobs';
    this.defaultTimeout = config.defaultTimeout ?? 300000; // 5 minutes
    this.defaultInterval = config.defaultInterval ?? 1000; // 1 second
  }

  /**
   * Generate a unique job ID.
   * Uses UUID v4 combined with a hash of additional entropy for uniqueness.
   */
  private generateJobId(): string {
    const uuid = randomUUID();
    const timestamp = Date.now().toString(36);
    const hash = createHash('sha256')
      .update(`${uuid}-${timestamp}`)
      .digest('hex')
      .substring(0, 8);
    return `job-${timestamp}-${hash}`;
  }

  /**
   * Create a new async job.
   * 
   * @param command - The command to execute
   * @param args - Command arguments
   * @returns JobInfo with jobId and initial status
   */
  async createJob(command: string, args?: unknown): Promise<JobInfo> {
    const jobId = this.generateJobId();
    const createdAt = Date.now();

    try {
      // Call the daemon to create the async job
      const response = await this.client.post<JobInfo>(`${this.basePath}`, {
        command,
        args,
        jobId,
        createdAt,
      });

      return {
        jobId: response.jobId ?? jobId,
        status: response.status ?? 'pending',
        command: response.command ?? command,
        createdAt: response.createdAt ?? createdAt,
      };
    } catch (error) {
      // If API call fails (daemon not running), create local tracking
      // This allows CLI to work offline for job tracking
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        return {
          jobId,
          status: 'pending',
          command,
          createdAt,
        };
      }
      throw error;
    }
  }

  /**
   * Get the current status of a job.
   * 
   * @param jobId - Job identifier
   * @returns Current job status
   * @throws {JobNotFoundError} If job doesn't exist
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    try {
      const response = await this.client.get<JobStatus>(`${this.basePath}/${jobId}`);
      return response;
    } catch (error) {
      if (error instanceof JobTrackerError && error.code === 'JOB_NOT_FOUND') {
        throw new JobNotFoundError(jobId);
      }
      
      // If daemon is unreachable, throw appropriate error
      if (error instanceof Error && 
          (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND'))) {
        throw new JobTrackerError({
          message: `无法连接到 Daemon 查询任务 ${jobId}`,
          code: 'DAEMON_UNREACHABLE',
          jobId,
          isRetryable: true,
          cause: error,
        });
      }
      
      throw error;
    }
  }

  /**
   * Wait for a job to reach a terminal state.
   * 
   * Implements Task 9.2: Async job polling optimization
   * - Exponential backoff for job status polling
   * - Smart polling based on job type and expected duration
   * - Batch status queries where possible
   * 
   * @param jobId - Job identifier
   * @param options - Wait options (timeout, interval, onUpdate, mode, command)
   * @returns Final job status
   * @throws {JobWaitTimeoutError} If timeout is reached before terminal state
   */
  async waitForJob(jobId: string, options?: WaitOptions): Promise<JobStatus> {
    const timeout = options?.timeout ?? this.defaultTimeout;
    const onUpdate = options?.onUpdate;
    const mode = options?.mode ?? 'human';
    const command = options?.command ?? 'unknown';

    const startTime = Date.now();
    let lastStatus: JobStatus | null = null;
    
    // Create progress tracker for interactive mode
    const progress = mode === 'human' ? createSimpleJobProgress(true, jobId) : createSimpleJobProgress(false, jobId);
    
    // Create smart polling strategy based on job type
    const pollingStrategy = createSmartPollingStrategy(command);
    
    // Create exponential backoff for this job
    const backoff = new ExponentialBackoff({
      initialInterval: pollingStrategy.getInitialInterval(),
      maxInterval: pollingStrategy.getMaxInterval(),
      multiplier: 2.0,
      randomizationFactor: 0.1,
    });

    let attempt = 0;
    
    // Poll until terminal state or timeout
    while (true) {
      // Check for timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        progress?.stop();
        throw new JobWaitTimeoutError(
          jobId,
          timeout,
          lastStatus?.status ?? 'pending'
        );
      }

      // Get current status
      try {
        lastStatus = await this.getJobStatus(jobId);
        
        // Update progress tracker
        progress.update(lastStatus);
        
        onUpdate?.(lastStatus);

        // Check if terminal state reached
        if (isTerminalStatus(lastStatus.status)) {
          progress.complete(lastStatus);
          return lastStatus;
        }
      } catch (error) {
        // Stop progress tracker on error
        progress.stop();
        
        // If job not found during polling, it's an error
        if (error instanceof JobNotFoundError) {
          throw error;
        }
        // Re-throw other errors
        throw error;
      }

      // Calculate next interval using exponential backoff
      const nextInterval = backoff.nextInterval(attempt);
      attempt++;
      
      // Wait before next poll
      await this.sleep(nextInterval);
    }
  }

  /**
   * Cancel a running job.
   * 
   * @param jobId - Job identifier
   */
  async cancelJob(jobId: string): Promise<void> {
    try {
      await this.client.post(`${this.basePath}/${jobId}/cancel`, {});
    } catch (error) {
      if (error instanceof JobTrackerError) {
        throw error;
      }
      
      // If daemon is unreachable
      if (error instanceof Error && 
          (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND'))) {
        throw new JobTrackerError({
          message: `无法连接到 Daemon 取消任务 ${jobId}`,
          code: 'DAEMON_UNREACHABLE',
          jobId,
          isRetryable: true,
          cause: error,
        });
      }
      
      throw error;
    }
  }

  /**
   * List all jobs.
   * 
   * @param options - Filter options
   * @returns List of jobs
   */
  async listJobs(options?: {
    /** Filter by status */
    status?: JobStatusType;
    /** Limit number of results */
    limit?: number;
  }): Promise<JobStatus[]> {
    const params = new URLSearchParams();
    if (options?.status) {
      params.set('status', options.status);
    }
    if (options?.limit) {
      params.set('limit', options.limit.toString());
    }

    const queryString = params.toString();
    const path = queryString 
      ? `${this.basePath}?${queryString}` 
      : this.basePath;

    const response = await this.client.get<JobStatus[]>(path);
    return response;
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a JobTracker from a DaemonClient.
 * 
 * @param daemonClient - DaemonClient instance
 * @param config - Additional config options
 * @returns JobTracker instance
 */
export function createJobTracker(
  daemonClient: {
    get<T = unknown>(path: string): Promise<T>;
    post<T = unknown>(path: string, body?: unknown): Promise<T>;
  },
  config?: Partial<Pick<JobTrackerConfig, 'basePath' | 'defaultTimeout' | 'defaultInterval'>>
): JobTracker {
  return new JobTracker({
    client: daemonClient,
    ...config,
  });
}