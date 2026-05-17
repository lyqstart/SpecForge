#!/usr/bin/env node

/**
 * SpecForge CLI - Command Line Interface for SpecForge V6
 * 
 * Provides dual-mode access to the Daemon:
 * - Interactive mode: colorful, human-readable output
 * - JSON mode: machine-friendly structured output (--json flag)
 * 
 * Enhanced with user-friendly help system including:
 * - Command-specific help
 * - Examples for each command
 * - Interactive mode hints and suggestions
 */

import yargs, { Argv, Arguments } from 'yargs';
import { hideBin } from 'yargs/helpers';
import { DaemonClient } from './http/DaemonClient';
import { createJobTracker, JobTracker, isTerminalStatus, JobStatusType } from './job';
import { AuthManager } from './auth';
import { ProgressIndicatorFactory } from './progress/ProgressIndicator';
import { createJobProgress } from './progress/JobProgress';
import { ModeSwitch } from './mode-switch';
import { toCliError } from './errors';
import { addHelpCommands, handleUnknownCommand } from './commands/help';
import { addDaemonCommands } from './commands/daemon';
import { addWebhookCommands } from './commands/webhook';
import { addUtilityCommands } from './commands/utility';
import { addSpecCommands } from './commands/spec';
import { addPluginCommands } from './commands/plugin';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * CLI version - should match package.json version
 */
export const CLI_VERSION = '0.1.0';

/**
 * Output mode types
 */
export type OutputMode = 'interactive' | 'json';

/**
 * Global CLI state
 */
let daemonClient: DaemonClient | null = null;
let jobTracker: JobTracker | null = null;
let authManager: AuthManager | null = null;

/**
 * Get the runtime directory path (~/.specforge/runtime)
 */
function getRuntimeDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.specforge', 'runtime');
}

/**
 * Get the daemon handshake file path
 */
function getHandshakePath(): string {
  return path.join(getRuntimeDir(), 'daemon.sock.json');
}

/**
 * Initialize the daemon client
 */
async function getDaemonClient(): Promise<DaemonClient> {
  if (daemonClient) {
    return daemonClient;
  }

  const handshakePath = getHandshakePath();
  
  // Try to read handshake file
  let port = 3847; // Default port
  let token = '';
  let host = '127.0.0.1';
  
  if (fs.existsSync(handshakePath)) {
    try {
      const handshake = JSON.parse(fs.readFileSync(handshakePath, 'utf-8'));
      port = handshake.port;
      token = handshake.token;
      host = handshake.bound_to === '0.0.0.0' ? '127.0.0.1' : handshake.bound_to;
    } catch {
      // Use defaults if handshake file is invalid
    }
  }

  daemonClient = new DaemonClient({
    host,
    port,
    token,
  });

  return daemonClient;
}

/**
 * Get or create the job tracker
 */
async function getJobTracker(): Promise<JobTracker> {
  if (jobTracker) {
    return jobTracker;
  }

  const client = await getDaemonClient();
  jobTracker = createJobTracker(client);
  return jobTracker;
}

/**
 * Global CLI options
 */
export interface GlobalOptions {
  json: boolean;
  verbose: boolean;
  help: boolean;
  version: boolean;
}

/**
 * Parse command line arguments with enhanced help system
 */
export function parseArgs(argv: string[] = process.argv): Argv<GlobalOptions> {
  return yargs(argv)
    .options({
      json: {
        type: 'boolean',
        describe: 'Output in JSON format (machine-friendly)',
        alias: 'j',
        default: false,
      },
      verbose: {
        type: 'boolean',
        describe: 'Enable verbose output',
        alias: 'v',
        default: false,
      },
      help: {
        type: 'boolean',
        describe: 'Show help',
        alias: 'h',
        default: false,
      },
      version: {
        type: 'boolean',
        describe: 'Show version',
        alias: 'V',
        default: false,
      },
    })
    .version(CLI_VERSION)
    .help(false) // Disable default yargs help to use our custom implementation
    .strict();
}

/**
 * Check if running in JSON mode
 */
export function isJsonMode(argv: GlobalOptions): boolean {
  return argv.json;
}

/**
 * Format output based on mode
 */
export function formatOutput(data: unknown, mode: OutputMode): string {
  const modeSwitch = new ModeSwitch(mode === 'json' ? 'json' : 'human');
  return modeSwitch.formatData(data);
}

/**
 * Format error based on mode
 */
export function formatError(error: Error, mode: OutputMode, hint?: string): string {
  const modeSwitch = new ModeSwitch(mode === 'json' ? 'json' : 'human');
  const cliError = toCliError(error);
  return modeSwitch.formatError(cliError);
}

/**
 * Helper to run async command with optional wait
 */
async function runAsyncCommand(
  command: string,
  args: unknown,
  options: {
    mode: OutputMode;
    wait: boolean;
    timeout: number;
    description: string;
  }
): Promise<void> {
  const tracker = await getJobTracker();
  const modeSwitch = new ModeSwitch(options.mode === 'json' ? 'json' : 'human');

  if (options.wait) {
    // Wait mode with progress indication
    const job = await tracker.createJob(command, args);
    
    try {
      const status = await tracker.waitForJob(job.jobId, {
        timeout: options.timeout * 1000,
        mode: options.mode === 'interactive' ? 'human' : 'json',
      });
      console.log(formatJobStatus(status, options.mode));
    } catch (error) {
      // Use the new error handling system
      const cliError = toCliError(error);
      console.error(modeSwitch.formatError(cliError));
      throw error;
    }
  } else {
    // Non-wait mode - just return job info immediately
    const job = await tracker.createJob(command, args);
    
    if (options.mode === 'json') {
      console.log(modeSwitch.formatData({
        jobId: job.jobId,
        status: job.status,
        command: job.command,
      }));
    } else {
      console.log(`Job created: ${job.jobId}`);
      console.log(`Command: ${job.command}`);
      console.log(`Status: ${job.status}`);
      console.log(`\nUse "specforge job ${job.jobId}" to check status.`);
      console.log(`Use "specforge job ${job.jobId} --wait" to wait for completion.`);
    }
  }
}

/**
 * Common wait options for async commands
 */
interface AsyncCommandOptions {
  wait: boolean;
  timeout: number;
}

/**
 * Workflow command definitions
 */
function addWorkflowCommands(yargsInstance: Argv): Argv {
  return yargsInstance.command(
    'workflow',
    'Manage workflows',
    (yargsInstance: Argv) => {
      return yargsInstance
        .command(
          'start',
          'Start a new workflow (async)',
          (yargsInstance: Argv) => {
            return yargsInstance
              .option('spec', {
                type: 'string',
                describe: 'Spec to run',
                alias: 's',
                demandOption: true,
              })
              .option('wait', {
                type: 'boolean',
                describe: 'Wait for workflow to complete',
                alias: 'w',
                default: false,
              })
              .option('timeout', {
                type: 'number',
                describe: 'Timeout in seconds for --wait',
                default: 600,
              });
          },
          async (argv: Arguments) => {
            const mode: OutputMode = argv.json ? 'json' : 'interactive';
            const shouldWait = (argv.wait as AsyncCommandOptions['wait']) ?? false;
            const timeoutSec = (argv.timeout as AsyncCommandOptions['timeout']) ?? 600;
            const spec = argv.spec as string;

            try {
              await runAsyncCommand('workflow start', { spec }, {
                mode,
                wait: shouldWait,
                timeout: timeoutSec,
                description: 'Running workflow',
              });
            } catch (error) {
              const modeSwitch = new ModeSwitch(mode === 'json' ? 'json' : 'human');
              const cliError = toCliError(error);
              console.error(modeSwitch.formatError(cliError));
              process.exit(1);
            }
          }
        )
        .command(
          'status <id>',
          'Get workflow status',
          (yargsInstance: Argv) => {
            return yargsInstance
              .positional('id', {
                type: 'string',
                describe: 'Workflow ID',
                demandOption: true,
              })
              .option('wait', {
                type: 'boolean',
                describe: 'Wait for workflow to complete',
                alias: 'w',
                default: false,
              })
              .option('timeout', {
                type: 'number',
                describe: 'Timeout in seconds for --wait',
                default: 600,
              });
          },
          async (argv: Arguments) => {
            const mode: OutputMode = argv.json ? 'json' : 'interactive';
            const shouldWait = (argv.wait as AsyncCommandOptions['wait']) ?? false;
            const timeoutSec = (argv.timeout as AsyncCommandOptions['timeout']) ?? 600;
            const workflowId = argv.id as string;

            try {
              if (shouldWait) {
                const tracker = await getJobTracker();
                
                try {
                  const status = await tracker.waitForJob(workflowId, {
                    timeout: timeoutSec * 1000,
                    mode: mode === 'interactive' ? 'human' : 'json',
                  });
                  console.log(formatJobStatus(status, mode));
                } catch (error) {
                  throw error;
                }
              } else {
                const tracker = await getJobTracker();
                const status = await tracker.getJobStatus(workflowId);
                console.log(formatJobStatus(status, mode));
              }
            } catch (error) {
              const modeSwitch = new ModeSwitch(mode === 'json' ? 'json' : 'human');
              const cliError = toCliError(error);
              console.error(modeSwitch.formatError(cliError));
              process.exit(1);
            }
          }
        )
        .command(
          'list',
          'List workflows',
          () => {},
          async (argv: Arguments) => {
            const mode: OutputMode = argv.json ? 'json' : 'interactive';
            
            try {
              const tracker = await getJobTracker();
              const jobs = await tracker.listJobs({
                limit: 50,
              });

              if (mode === 'json') {
                console.log(JSON.stringify(jobs, null, 2));
              } else {
                if (jobs.length === 0) {
                  console.log('No workflows found.');
                  return;
                }

                console.log(`Found ${jobs.length} workflow(s):\n`);
                for (const job of jobs) {
                  console.log(formatJobStatus(job, mode));
                  console.log('---');
                }
              }
            } catch (error) {
              const modeSwitch = new ModeSwitch(mode === 'json' ? 'json' : 'human');
              const cliError = toCliError(error);
              console.error(modeSwitch.formatError(cliError));
              process.exit(1);
            }
          }
        )
        .demandCommand(1, 'Specify a workflow subcommand');
    }
  );
}



/**
 * Format job status for output
 */
function formatJobStatus(
  status: {
    jobId: string;
    status: JobStatusType;
    command: string;
    result?: unknown;
    error?: string;
    createdAt: number;
    updatedAt: number;
  },
  mode: OutputMode
): string {
  if (mode === 'json') {
    return JSON.stringify(status, null, 2);
  }

  // Interactive mode
  const created = new Date(status.createdAt).toLocaleString();
  const updated = new Date(status.updatedAt).toLocaleString();
  
  let output = `Job: ${status.jobId}\n`;
  output += `Command: ${status.command}\n`;
  output += `Status: ${status.status}\n`;
  output += `Created: ${created}\n`;
  output += `Updated: ${updated}\n`;

  if (status.status === 'completed' && status.result !== undefined) {
    output += `Result: ${JSON.stringify(status.result, null, 2)}\n`;
  }

  if (status.status === 'failed' && status.error) {
    output += `Error: ${status.error}\n`;
  }

  return output;
}

/**
 * Job command definitions
 */
function addJobCommands(yargsInstance: Argv): Argv {
  return yargsInstance
    .command(
      'job',
      'Manage async jobs',
      (yargsInstance: Argv) => {
        return yargsInstance
          .command(
            '<id>',
            'Get job status',
            (yargsInstance: Argv) => {
              return yargsInstance
                .positional('id', {
                  type: 'string',
                  describe: 'Job ID',
                  demandOption: true,
                })
                .option('wait', {
                  type: 'boolean',
                  describe: 'Wait for job to complete',
                  alias: 'w',
                  default: false,
                })
                .option('timeout', {
                  type: 'number',
                  describe: 'Timeout in seconds for --wait',
                  default: 300,
                });
            },
            async (argv: Arguments) => {
              const jobId = argv.id as string;
              const mode: OutputMode = argv.json ? 'json' : 'interactive';
              const shouldWait = argv.wait as boolean;
              const timeoutSec = argv.timeout as number;

              try {
                const tracker = await getJobTracker();

                if (shouldWait) {
                  // Wait for job completion
                  const status = await tracker.waitForJob(jobId, {
                    timeout: timeoutSec * 1000,
                    mode: mode === 'interactive' ? 'human' : 'json',
                  });

                  console.log(formatJobStatus(status, mode));
                } else {
                  // Just get current status
                  const status = await tracker.getJobStatus(jobId);
                  console.log(formatJobStatus(status, mode));
                }
              } catch (error) {
                if (mode === 'json') {
                  console.error(JSON.stringify({
                    error: error instanceof Error ? error.name : 'Error',
                    message: error instanceof Error ? error.message : String(error),
                  }, null, 2));
                } else {
                  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
                }
                process.exit(1);
              }
            }
          )
          .command(
            'list',
            'List all jobs',
            (yargsInstance: Argv) => {
              return yargsInstance
                .option('status', {
                  type: 'string',
                  describe: 'Filter by status',
                  choices: ['pending', 'running', 'completed', 'failed', 'blocked', 'cancelled'],
                })
                .option('limit', {
                  type: 'number',
                  describe: 'Limit number of results',
                  default: 50,
                });
            },
            async (argv: Arguments) => {
              const mode: OutputMode = argv.json ? 'json' : 'interactive';

              try {
                const tracker = await getJobTracker();
                const jobs = await tracker.listJobs({
                  status: argv.status as JobStatusType | undefined,
                  limit: argv.limit as number,
                });

                if (mode === 'json') {
                  console.log(JSON.stringify(jobs, null, 2));
                } else {
                  if (jobs.length === 0) {
                    console.log('No jobs found.');
                    return;
                  }

                  console.log(`Found ${jobs.length} job(s):\n`);
                  for (const job of jobs) {
                    console.log(formatJobStatus(job, mode));
                    console.log('---');
                  }
                }
              } catch (error) {
                if (mode === 'json') {
                  console.error(JSON.stringify({
                    error: error instanceof Error ? error.name : 'Error',
                    message: error instanceof Error ? error.message : String(error),
                  }, null, 2));
                } else {
                  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
                }
                process.exit(1);
              }
            }
          )
          .demandCommand(1, 'Specify a job subcommand (use "job <id>" or "job list")');
      }
    );
}

/**
 * Main CLI entry point with enhanced help system
 */
export function runCli(argv: string[] = process.argv): void {
  const parser = parseArgs(argv);
  
  // Add all command groups with help system integrated
  const parserWithCommands = addHelpCommands(
    addDaemonCommands(
      addSpecCommands(
        addPluginCommands(
          addWorkflowCommands(
            addJobCommands(
              addWebhookCommands(
                addUtilityCommands(parser)
              )
            )
          )
        )
      )
    )
  );
  
  // Parse and execute
  parserWithCommands.parse();
}

// Run CLI if executed directly
runCli();