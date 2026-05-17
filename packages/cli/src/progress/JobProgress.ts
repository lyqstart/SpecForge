/**
 * Job progress tracking for `--wait` mode.
 * 
 * Provides status updates for async jobs in `--wait` mode.
 * In interactive mode, shows spinner and status updates.
 * In JSON mode, outputs structured status updates.
 */

import { OutputMode } from '../mode';
import { JobStatus, JobStatusType } from '../job/JobTracker';
import { ProgressIndicatorFactory } from './ProgressIndicator';

/**
 * Job progress tracker for `--wait` mode.
 */
export class JobProgress {
  private mode: OutputMode;
  private jobId: string;
  private spinner: ReturnType<typeof ProgressIndicatorFactory.create> | null = null;
  private lastStatus: JobStatusType | null = null;
  private startTime: number;

  /**
   * Create a new job progress tracker.
   * 
   * @param mode - Output mode
   * @param jobId - Job ID
   */
  constructor(mode: OutputMode, jobId: string) {
    this.mode = mode;
    this.jobId = jobId;
    this.startTime = Date.now();
    
    if (mode === 'interactive') {
      this.spinner = ProgressIndicatorFactory.create(mode, 'spinner', `Waiting for job ${jobId}...`);
      this.spinner.start();
    }
  }

  /**
   * Update job status.
   * 
   * @param status - Current job status
   */
  update(status: JobStatus): void {
    this.lastStatus = status.status;
    
    if (this.mode === 'json') {
      // In JSON mode, output structured status update
      console.log(JSON.stringify({
        type: 'job_status',
        jobId: this.jobId,
        status: status.status,
        elapsed: Date.now() - this.startTime,
        result: status.result,
        error: status.error,
      }));
    } else {
      // In interactive mode, update spinner message
      if (this.spinner) {
        const elapsed = this.formatElapsedTime();
        let message = `Job ${this.jobId}: ${this.formatStatus(status.status)}`;
        
        if (status.status === 'running') {
          message += ` (${elapsed})`;
        }
        
        this.spinner.update(message);
      }
    }
  }

  /**
   * Complete job progress tracking.
   * 
   * @param status - Final job status
   */
  complete(status: JobStatus): void {
    this.lastStatus = status.status;
    
    if (this.mode === 'json') {
      // In JSON mode, output final result
      console.log(JSON.stringify({
        type: 'job_result',
        jobId: this.jobId,
        status: status.status,
        elapsed: Date.now() - this.startTime,
        result: status.result,
        error: status.error,
      }));
    } else {
      // In interactive mode, show completion message
      if (this.spinner) {
        const elapsed = this.formatElapsedTime();
        
        if (status.status === 'completed') {
          this.spinner.succeed(`Job ${this.jobId} completed in ${elapsed}`);
        } else if (status.status === 'failed') {
          this.spinner.fail(`Job ${this.jobId} failed in ${elapsed}: ${status.error || 'Unknown error'}`);
        } else if (status.status === 'cancelled') {
          this.spinner.fail(`Job ${this.jobId} cancelled in ${elapsed}`);
        } else if (status.status === 'blocked') {
          this.spinner.fail(`Job ${this.jobId} blocked in ${elapsed}`);
        } else {
          this.spinner.stop();
          console.log(`Job ${this.jobId} ended with status: ${status.status} (${elapsed})`);
        }
      }
    }
  }

  /**
   * Stop progress tracking without completion message.
   */
  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
    }
  }

  /**
   * Format status for display.
   */
  private formatStatus(status: JobStatusType): string {
    const statusMap: Record<JobStatusType, string> = {
      pending: 'Pending',
      running: 'Running',
      completed: 'Completed',
      failed: 'Failed',
      blocked: 'Blocked',
      cancelled: 'Cancelled',
    };
    
    return statusMap[status] || status;
  }

  /**
   * Format elapsed time for display.
   */
  private formatElapsedTime(): string {
    const elapsed = Date.now() - this.startTime;
    
    if (elapsed < 1000) {
      return `${elapsed}ms`;
    } else if (elapsed < 60000) {
      return `${(elapsed / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      return `${minutes}m${seconds}s`;
    }
  }
}

/**
 * Create a job progress tracker.
 * 
 * @param mode - Output mode
 * @param jobId - Job ID
 * @returns Job progress tracker
 */
export function createJobProgress(mode: OutputMode, jobId: string): JobProgress {
  return new JobProgress(mode, jobId);
}