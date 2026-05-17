/**
 * Job status and wait command implementation (Task 5.3).
 *
 * Provides:
 * - `specforge job <id>` — Query job status
 * - `--wait` flag support for async commands
 * - Terminal state validation
 * - Real-time progress output (interactive mode)
 * - Structured JSON output (--json mode)
 *
 * Terminal states: {completed, failed, blocked, cancelled}
 * (Property 18 requirement)
 *
 * @packageDocumentation
 */

import { JobTracker, JobStatus, isTerminalStatus, TERMINAL_STATES } from '../job/JobTracker';
import { ModeSwitch } from '../mode/ModeSwitch';
import { OutputFormatter } from '../mode/OutputFormatter';

/**
 * Job command handler for `specforge job <id>`.
 * Queries and displays job status.
 */
export async function handleJobCommand(
  jobId: string,
  options: {
    json?: boolean;
    tracker: JobTracker;
    modeSwitch: ModeSwitch;
    formatter: OutputFormatter;
  },
): Promise<void> {
  const { json = false, tracker, modeSwitch, formatter } = options;

  try {
    const status = await tracker.getJobStatus(jobId);
    
    if (json) {
      // JSON mode: output structured job status
      console.log(JSON.stringify({
        jobId: status.jobId,
        status: status.status,
        command: status.command,
        result: status.result,
        error: status.error,
        createdAt: status.createdAt,
        updatedAt: status.updatedAt,
      }, null, 2));
    } else {
      // Interactive mode: colorful output
      const output = formatter.formatJobStatus(status, 'interactive');
      console.log(output);
    }
  } catch (error) {
    const errorOutput = formatter.formatError(
      error instanceof Error ? error : new Error(String(error)),
      json ? 'json' : 'interactive'
    );
    console.error(errorOutput);
    process.exit(1);
  }
}

/**
 * Wait for job completion with optional timeout.
 * Implements Property 18: Async Command Contract
 *
 * @param jobId - Job identifier
 * @param options - Wait options
 */
export async function waitForJobCompletion(
  jobId: string,
  options: {
    timeout?: number;
    json?: boolean;
    tracker: JobTracker;
    formatter: OutputFormatter;
  },
): Promise<JobStatus> {
  const { timeout, json = false, tracker, formatter } = options;

  try {
    const finalStatus = await tracker.waitForJob(jobId, {
      timeout,
      mode: json ? 'json' : 'human',
      command: 'unknown', // Will be updated from job info
      onUpdate: (status) => {
        if (json) {
          // In JSON mode, output status updates as JSON lines
          console.log(JSON.stringify({
            type: 'status_update',
            jobId: status.jobId,
            status: status.status,
            updatedAt: status.updatedAt,
          }));
        }
      },
    });

    // Validate terminal state
    if (!isTerminalStatus(finalStatus.status)) {
      throw new Error(
        `Job ${jobId} did not reach terminal state: ${finalStatus.status}`
      );
    }

    if (json) {
      // Final status in JSON mode
      console.log(JSON.stringify({
        type: 'job_completed',
        jobId: finalStatus.jobId,
        status: finalStatus.status,
        result: finalStatus.result,
        error: finalStatus.error,
        createdAt: finalStatus.createdAt,
        updatedAt: finalStatus.updatedAt,
      }, null, 2));
    } else {
      // Interactive mode output
      const output = formatter.formatJobStatus(finalStatus, 'interactive');
      console.log(output);
    }

    return finalStatus;
  } catch (error) {
    const errorOutput = formatter.formatError(
      error instanceof Error ? error : new Error(String(error)),
      json ? 'json' : 'interactive'
    );
    console.error(errorOutput);
    throw error;
  }
}

/**
 * Validate that a job status is in a terminal state.
 * Terminal states: {completed, failed, blocked, cancelled}
 *
 * @param status - Job status to validate
 * @returns true if status is terminal
 */
export function validateTerminalState(status: JobStatus): boolean {
  return isTerminalStatus(status.status);
}

/**
 * Get the set of valid terminal states.
 * Property 18 requirement: {completed, failed, blocked, cancelled}
 *
 * @returns Set of terminal state strings
 */
export function getTerminalStates(): Set<string> {
  return new Set(TERMINAL_STATES);
}

/**
 * Check if a status string is a valid terminal state.
 *
 * @param status - Status string to check
 * @returns true if status is in terminal state set
 */
export function isValidTerminalState(status: string): boolean {
  return TERMINAL_STATES.includes(status as any);
}

/**
 * Format job status for display.
 * Handles both interactive and JSON modes.
 *
 * @param status - Job status
 * @param mode - Output mode
 * @returns Formatted string
 */
export function formatJobStatusOutput(
  status: JobStatus,
  mode: 'interactive' | 'json'
): string {
  if (mode === 'json') {
    return JSON.stringify({
      jobId: status.jobId,
      status: status.status,
      command: status.command,
      result: status.result,
      error: status.error,
      createdAt: status.createdAt,
      updatedAt: status.updatedAt,
    }, null, 2);
  }

  // Interactive mode
  let output = `Job: ${status.jobId}\n`;
  output += `Status: ${status.status}\n`;
  output += `Command: ${status.command}\n`;
  
  if (status.result) {
    output += `Result: ${JSON.stringify(status.result, null, 2)}\n`;
  }
  
  if (status.error) {
    output += `Error: ${status.error}\n`;
  }
  
  output += `Created: ${new Date(status.createdAt).toISOString()}\n`;
  output += `Updated: ${new Date(status.updatedAt).toISOString()}\n`;

  return output;
}
