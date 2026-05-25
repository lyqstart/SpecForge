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
 * 
 * Startup flow (per version-unification spec):
 * 1. Check StartupCompatibilityChecker.check() before command execution
 * 2. NORMAL_RW → proceed with command, apply version-leak-filter
 * 3. MIGRATE → run migration chain, then proceed
 * 4. DEGRADED_* → print diagnostics and exit non-zero
 */

import yargs, { Argv, Arguments } from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DaemonClient } from './http/DaemonClient';
import { createJobTracker, JobTracker, isTerminalStatus, JobStatusType } from './job';
import { AuthManager } from './auth';
import { ProgressIndicatorFactory } from './progress/ProgressIndicator';
import { createJobProgress } from './progress/JobProgress';
import { ModeSwitch } from './mode-switch';
import { toCliError } from './errors';
import { addHelpCommands, handleUnknownCommand } from './commands/help';
import { addDaemonCommands } from './commands/daemon-client';
import { addOpenCodeServerCommands } from './commands/opencode-server';
import { addWebhookCommands } from './commands/webhook';
import { addUtilityCommands } from './commands/utility';
import { addSpecCommands } from './commands/spec';
import { addPluginCommands } from './commands/plugin';
import { addServicesCommands } from './commands/services';
import { runVersionCommand } from './commands/version';
import { runDoctorCommand } from './commands/doctor';
import { initCommandHandler } from './commands/init';
import { wrapWriter, VersionLeakFilteringWriter, StartupMode } from './reporter/version-leak-filter';

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
  'project-dir'?: string;
  'user-manifest-path'?: string;
}

// =============================================================================
// Startup Compatibility Check (Task 15.1)
// =============================================================================

/**
 * Global startup mode - set during CLI initialization
 */
let startupMode: StartupMode | null = null;

/**
 * Get the current startup mode.
 * @returns The startup mode or null if not yet initialized
 */
export function getStartupMode(): StartupMode | null {
  return startupMode;
}

/**
 * Run startup compatibility check and handle the result.
 * 
 * This implements the startup flow per version-unification spec:
 * - NORMAL_RW: return null (proceed normally)
 * - MIGRATE: return migration runner function
 * - DEGRADED_*: print diagnostics and exit non-zero
 * 
 * @param projectDir - Project directory path
 * @param userManifestPath - User manifest path (optional)
 * @returns 'proceed' to continue, 'exit' to exit, or migration info
 */
async function runStartupCheck(
  projectDir: string,
  userManifestPath?: string
): Promise<'proceed' | 'exit' | { migrate: { from: number; to: number; projectDir: string } }> {
  // Dynamic import to avoid ESM loading issues at module init time
  let vu: typeof import('@specforge/version-unification');
  try {
    vu = await import('@specforge/version-unification');
  } catch (err) {
    // If version-unification can't load, still allow CLI to run in limited mode
    console.error(`Warning: Could not load version-unification module: ${err instanceof Error ? err.message : String(err)}`);
    return 'proceed';
  }

  // Get constants
  const minSupportedDataSchema = vu.MIN_SUPPORTED_DATA_SCHEMA;
  const highestKnownSchema = vu.HIGHEST_KNOWN_SCHEMA;

  // Determine manifest paths
  const defaultUserManifestPath = path.join(os.homedir(), '.specforge', 'manifest.json');
  const actualUserManifestPath = userManifestPath ?? defaultUserManifestPath;
  const projectManifestPath = path.join(projectDir, '.specforge', 'manifest.json');

  // Read project manifest to get data_schema_version
  let dataSchemaVersion: number | null = null;
  try {
    const raw = await fs.promises.readFile(projectManifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'data_schema_version' in parsed &&
      typeof (parsed as { data_schema_version: unknown }).data_schema_version === 'number'
    ) {
      dataSchemaVersion = (parsed as { data_schema_version: number }).data_schema_version;
    }
  } catch {
    // Manifest doesn't exist or can't be read - will go through bootstrap later
    // For now, treat as NORMAL_RW so bootstrap can proceed
    dataSchemaVersion = null;
  }

  // If no valid data_schema_version, assume NORMAL_RW (bootstrap will handle initialization)
  const effectiveDataSchemaVersion = dataSchemaVersion ?? minSupportedDataSchema;

  // Run startup compatibility check
  const mode = vu.StartupCompatibilityChecker.check({
    dataSchemaVersion: effectiveDataSchemaVersion,
    minSupportedDataSchema,
    highestKnownSchema,
  });

  // Store for later use by version-leak-filter
  startupMode = mode;

  // Handle each mode
  switch (mode.kind) {
    case 'NORMAL_RW':
      return 'proceed';

    case 'MIGRATE':
      return {
        migrate: {
          from: mode.from,
          to: mode.to,
          projectDir,
        },
      };

    case 'DEGRADED_HIGHER_THAN_KNOWN':
      vu.DegradedReporter.print('HIGHER_THAN_KNOWN', {
        observed: mode.observed,
        highest: mode.highest,
      });
      return 'exit';

    case 'DEGRADED_MIGRATION_FAILED':
      vu.DegradedReporter.print('MIGRATION_FAILED', {
        pair: mode.pair,
        logPath: mode.logPath,
      });
      return 'exit';
  }
}

/**
 * Apply version-leak-filter to stdout/stderr.
 * Should be called after startup check succeeds.
 */
function applyVersionLeakFilter(): void {
  if (!startupMode) return;

  const filteredStdout = wrapWriter(process.stdout as unknown as import('./reporter/version-leak-filter').Writer, startupMode);
  const filteredStderr = wrapWriter(process.stderr as unknown as import('./reporter/version-leak-filter').Writer, startupMode);

  // Replace the global console methods with filtered versions
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = (chunk: string | Uint8Array) => filteredStdout.write(chunk);
  process.stderr.write = (chunk: string | Uint8Array) => filteredStderr.write(chunk);
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
    .version(false) // Disable yargs built-in version to use our custom implementation
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
 * Init command definitions
 */
function addInitCommands(yargsInstance: Argv): Argv {
  return yargsInstance.command(
    'init',
    'Initialize SpecForge installation',
    (yargsInstance: Argv) => {
      return yargsInstance
        .option('force', {
          type: 'boolean',
          describe: 'Overwrite existing config files',
          default: false,
        })
        .option('install-root', {
          type: 'string',
          describe: 'Custom installation root directory',
        });
    },
    async (argv: Arguments) => {
      await initCommandHandler(argv);
    }
  );
}

/**
 * Doctor command definition
 *
 * Implements `specforge doctor` per version-unification spec R10.3.
 * Prints code_version / min_supported_data_schema / data_schema_version /
 * user manifest absolute path / project manifest absolute path / mode.
 */
function addDoctorCommands(yargsInstance: Argv): Argv {
  return yargsInstance.command(
    'doctor',
    'Show SpecForge code/manifest/schema version diagnostics',
    (yargsInstance: Argv) => {
      return yargsInstance
        .option('project-dir', {
          type: 'string',
          describe: 'Project directory (defaults to cwd)',
        })
        .option('user-manifest-path', {
          type: 'string',
          describe: 'Path to user manifest (defaults to ~/.specforge/manifest.json)',
        });
    },
    async (argv: Arguments) => {
      const projectDirOpt = argv['project-dir'] as string | undefined;
      const userManifestPathOpt = argv['user-manifest-path'] as string | undefined;
      try {
        const code = await runDoctorCommand({
          projectDir: projectDirOpt,
          userManifestPath: userManifestPathOpt,
        });
        if (code !== 0) {
          process.exit(code);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`doctor: ${msg}`);
        process.exit(1);
      }
    }
  );
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
 * 
 * Startup flow:
 * 1. Parse arguments
 * 2. Run StartupCompatibilityChecker.check()
 * 3. Handle mode: NORMAL_RW → continue, MIGRATE → run migration, DEGRADED → exit
 * 4. Apply version-leak-filter to stdout/stderr
 * 5. Execute command
 */
export async function runCli(argv: string[] = process.argv): Promise<void> {
  const parser = parseArgs(argv);
  
  // Add all command groups with help system integrated
  const parserWithCommands = addHelpCommands(
    addServicesCommands(
      addOpenCodeServerCommands(
        addDaemonCommands(
          addInitCommands(
            addDoctorCommands(
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
          )
        )
      )
    )
  );
  
  // Parse arguments
  const parsedArgs = parserWithCommands.parseSync();
  
  // Handle --version flag (R10.2: ${getCodeVersion()}\n on stdout, exit 0;
  // diagnostic on stderr + non-zero on failure)
  if (parsedArgs.version) {
    runVersionCommand({
      write: (line) => {
        process.stdout.write(line);
      },
      writeErr: (line) => {
        process.stderr.write(line);
      },
    })
      .then((exitCode) => process.exit(exitCode))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`specforge: failed to determine code version: ${message}\n`);
        process.exit(1);
      });
    return;
  }

  // Task 15.1: Run startup compatibility check before executing any command
  const projectDir = (parsedArgs['project-dir'] as string | undefined) ?? process.cwd();
  const userManifestPath = parsedArgs['user-manifest-path'] as string | undefined;

  const startupResult = await runStartupCheck(projectDir, userManifestPath);

  if (startupResult === 'exit') {
    // Degraded mode - already printed diagnostics in runStartupCheck
    process.exit(1);
    return;
  }

  if ('migrate' in startupResult) {
    // Migration required - run migration chain
    let vu: typeof import('@specforge/version-unification');
    try {
      vu = await import('@specforge/version-unification');
    } catch (err) {
      console.error(`Failed to load version-unification module: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
      return;
    }

    const { from, to, projectDir: migrateProjectDir } = startupResult.migrate;
    const runner = new vu.MigrationRunner(migrateProjectDir);

    try {
      const result = await runner.run({ projectDir: migrateProjectDir, from, to });

      if (result.kind === 'OK') {
        console.log(`Migration completed: schema ${from} → ${to}`);
      } else if (result.kind === 'FAILED_ROLLED_BACK') {
        console.error(`Migration failed and was rolled back. See ${result.logPath}`);
        process.exit(1);
        return;
      } else if (result.kind === 'FAILED_NO_ROLLBACK') {
        console.error(`Migration failed without rollback. See ${result.logPath}`);
        process.exit(1);
        return;
      }
    } catch (err) {
      console.error(`Migration error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
      return;
    }
  }

  // Apply version-leak-filter to stdout/stderr in NORMAL_RW mode
  applyVersionLeakFilter();
  
  // Continue with normal command execution
  parserWithCommands.parse();
}

// Run CLI if executed directly
runCli().catch((err) => {
  console.error('CLI error:', err);
  process.exit(1);
});