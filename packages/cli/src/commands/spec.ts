/**
 * Spec Management Commands
 * 
 * Provides commands to manage specs:
 * - start: Start a new spec (async)
 * - list: List all specs
 * - status: Get spec status
 * - cancel: Cancel a running spec
 * 
 * @packageDocumentation
 */

import yargs, { Argv, Arguments } from 'yargs';
import { DaemonClient } from '../http/DaemonClient';
import { ModeSwitch, formatError } from '../mode-switch';
import { toCliError, DaemonUnreachableError, InvalidInputError } from '../errors';
import { JobTracker, createJobTracker } from '../job';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SPEC_DIR_NAME } from '../utils/directory-layout';

/**
 * Runtime directory path (~/.specforge/runtime)
 */
function getRuntimeDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, SPEC_DIR_NAME, 'runtime');
}

/**
 * Daemon handshake file path
 */
function getHandshakePath(): string {
  return path.join(getRuntimeDir(), 'daemon.sock.json');
}

/**
 * Read handshake file and create client
 */
function getDaemonClient(): DaemonClient {
  const handshakePath = getHandshakePath();
  
  // Default values
  let port = 3847;
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

  return new DaemonClient({
    host,
    port,
    token,
  });
}

/**
 * Get job tracker instance
 */
function getJobTracker(): JobTracker {
  const client = getDaemonClient();
  return createJobTracker(client);
}

/**
 * Spec type definition
 */
export interface Spec {
  /** Unique spec identifier */
  id: string;
  /** Spec name */
  name: string;
  /** Current status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled';
  /** Template used */
  template?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Completion timestamp (if completed) */
  completedAt?: number;
  /** Error message (if failed) */
  error?: string;
  /** Result data (if completed) */
  result?: unknown;
}

/**
 * Spec list response
 */
interface SpecListResponse {
  specs: Spec[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Spec start command
 */
export async function commandStart(
  argv: Arguments<{
    template?: string;
    wait: boolean;
    timeout: number;
  }>,
  modeSwitch: ModeSwitch
): Promise<void> {
  const tracker = getJobTracker();
  
  try {
    const job = await tracker.createJob('spec start', {
      template: argv.template,
    });

    if (argv.wait) {
      // Wait for completion
      const status = await tracker.waitForJob(job.jobId, {
        timeout: argv.timeout * 1000,
        mode: modeSwitch.isJson() ? 'json' : 'human',
      });

      if (modeSwitch.isJson()) {
        console.log(modeSwitch.formatData(status));
      } else {
        if (status.status === 'completed') {
          console.log(modeSwitch.formatSuccess(`Spec completed successfully`));
          if (status.result) {
            console.log(`Result: ${JSON.stringify(status.result, null, 2)}`);
          }
        } else if (status.status === 'failed') {
          console.log(modeSwitch.formatError({
            name: 'SpecFailed',
            message: status.error || 'Spec failed',
          }));
          process.exit(1);
        } else {
          console.log(`Spec status: ${status.status}`);
        }
      }
    } else {
      // Non-wait mode
      if (modeSwitch.isJson()) {
        console.log(modeSwitch.formatData({
          jobId: job.jobId,
          status: job.status,
          command: job.command,
          template: argv.template,
        }));
      } else {
        console.log(modeSwitch.formatSuccess('Spec started successfully'));
        console.log(`Job ID: ${job.jobId}`);
        console.log(`Template: ${argv.template || 'default'}`);
        console.log(`Status: ${job.status}`);
        console.log(`\nUse "specforge spec status ${job.jobId}" to check status.`);
        console.log(`Use "specforge spec status ${job.jobId} --wait" to wait for completion.`);
      }
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * Spec list command
 */
export async function commandList(
  argv: Arguments<{
    status?: string;
    limit: number;
    page: number;
  }>,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  
  try {
    // Build query parameters
    const queryParams = new URLSearchParams();
    if (argv.status) {
      queryParams.append('status', argv.status);
    }
    if (argv.limit) {
      queryParams.append('limit', argv.limit.toString());
    }
    if (argv.page) {
      queryParams.append('page', argv.page.toString());
    }

    const queryString = queryParams.toString();
    const path = queryString ? `/api/specs?${queryString}` : '/api/specs';

    // Call daemon-core /api/specs endpoint
    const response = await client.get<SpecListResponse>(path);

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(response));
    } else {
      if (response.specs.length === 0) {
        console.log('No specs found.');
        if (argv.status) {
          console.log(`Try removing the --status filter to see all specs.`);
        }
        return;
      }

      console.log(`Found ${response.total} spec(s) (page ${response.page}/${Math.ceil(response.total / response.pageSize)}):\n`);
      
      for (const spec of response.specs) {
        const statusIcon = spec.status === 'completed' ? '✓' : 
                          spec.status === 'running' ? '⏳' : 
                          spec.status === 'failed' ? '✗' : 
                          spec.status === 'pending' ? '⏱️' : 
                          spec.status === 'blocked' ? '🚫' : '❌';
        
        console.log(`${statusIcon} Spec: ${spec.id}`);
        console.log(`  Name: ${spec.name}`);
        console.log(`  Status: ${spec.status}`);
        
        if (spec.template) {
          console.log(`  Template: ${spec.template}`);
        }
        
        const created = new Date(spec.createdAt).toLocaleString();
        console.log(`  Created: ${created}`);
        
        if (spec.updatedAt !== spec.createdAt) {
          const updated = new Date(spec.updatedAt).toLocaleString();
          console.log(`  Updated: ${updated}`);
        }
        
        if (spec.completedAt) {
          const completed = new Date(spec.completedAt).toLocaleString();
          console.log(`  Completed: ${completed}`);
        }
        
        console.log('');
      }
      
      console.log('Use "specforge spec status <id>" to get detailed status of a spec.');
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * Spec status command
 */
export async function commandStatus(
  argv: Arguments<{
    id: string;
    wait: boolean;
    timeout: number;
  }>,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  const specId = argv.id;
  
  try {
    if (argv.wait) {
      // Wait for spec completion using job tracker
      const tracker = getJobTracker();
      const status = await tracker.waitForJob(specId, {
        timeout: argv.timeout * 1000,
        mode: modeSwitch.isJson() ? 'json' : 'human',
      });

      if (modeSwitch.isJson()) {
        console.log(modeSwitch.formatData(status));
      } else {
        if (status.status === 'completed') {
          console.log(modeSwitch.formatSuccess(`Spec completed successfully`));
          if (status.result) {
            console.log(`Result: ${JSON.stringify(status.result, null, 2)}`);
          }
        } else if (status.status === 'failed') {
          console.log(modeSwitch.formatError({
            name: 'SpecFailed',
            message: status.error || 'Spec failed',
          }));
          process.exit(1);
        } else {
          console.log(`Spec status: ${status.status}`);
        }
      }
    } else {
      // Get current status
      const spec = await client.get<Spec>(`/api/specs/${encodeURIComponent(specId)}`);

      if (modeSwitch.isJson()) {
        console.log(modeSwitch.formatData(spec));
      } else {
        const statusIcon = spec.status === 'completed' ? '✓' : 
                          spec.status === 'running' ? '⏳' : 
                          spec.status === 'failed' ? '✗' : 
                          spec.status === 'pending' ? '⏱️' : 
                          spec.status === 'blocked' ? '🚫' : '❌';
        
        console.log(`${statusIcon} Spec: ${spec.id}`);
        console.log(`  Name: ${spec.name}`);
        console.log(`  Status: ${spec.status}`);
        
        if (spec.template) {
          console.log(`  Template: ${spec.template}`);
        }
        
        const created = new Date(spec.createdAt).toLocaleString();
        console.log(`  Created: ${created}`);
        
        if (spec.updatedAt !== spec.createdAt) {
          const updated = new Date(spec.updatedAt).toLocaleString();
          console.log(`  Updated: ${updated}`);
        }
        
        if (spec.completedAt) {
          const completed = new Date(spec.completedAt).toLocaleString();
          console.log(`  Completed: ${completed}`);
        }
        
        if (spec.error) {
          console.log(`  Error: ${spec.error}`);
        }
        
        if (spec.result) {
          console.log(`  Result: ${JSON.stringify(spec.result, null, 2)}`);
        }
      }
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * Spec cancel command
 */
export async function commandCancel(
  argv: Arguments<{
    id: string;
  }>,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  const specId = argv.id;
  
  try {
    // Call daemon-core /api/specs/:id/cancel endpoint
    const response = await client.post<{
      success: boolean;
      message: string;
      spec: Spec;
    }>(`/api/specs/${encodeURIComponent(specId)}/cancel`);

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(response));
    } else {
      console.log(modeSwitch.formatSuccess(response.message));
      console.log(`Spec ID: ${response.spec.id}`);
      console.log(`New Status: ${response.spec.status}`);
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * Add spec commands to yargs parser
 */
export function addSpecCommands(yargsInstance: Argv): Argv {
  return yargsInstance.command(
    'spec',
    'Manage specs',
    (yargsInstance: Argv) => {
      return yargsInstance
        .command(
          'start',
          'Start a new spec (async)',
          (yargsInstance: Argv) => {
            return yargsInstance
              .option('template', {
                type: 'string',
                describe: 'Spec template to use',
                alias: 't',
              })
              .option('wait', {
                type: 'boolean',
                describe: 'Wait for spec to complete',
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
            const modeSwitch = new ModeSwitch(argv);
            await commandStart(argv as Arguments<{ template?: string; wait: boolean; timeout: number; }>, modeSwitch);
          }
        )
        .command(
          'list',
          'List all specs',
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
              })
              .option('page', {
                type: 'number',
                describe: 'Page number',
                default: 1,
              });
          },
          async (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            await commandList(argv as Arguments<{ status?: string; limit: number; page: number; }>, modeSwitch);
          }
        )
        .command(
          'status <id>',
          'Get spec status',
          (yargsInstance: Argv) => {
            return yargsInstance
              .positional('id', {
                type: 'string',
                describe: 'Spec ID',
                demandOption: true,
              })
              .option('wait', {
                type: 'boolean',
                describe: 'Wait for spec to complete',
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
            const modeSwitch = new ModeSwitch(argv);
            await commandStatus(argv as Arguments<{ id: string; wait: boolean; timeout: number; }>, modeSwitch);
          }
        )
        .command(
          'cancel <id>',
          'Cancel a running spec',
          (yargsInstance: Argv) => {
            return yargsInstance
              .positional('id', {
                type: 'string',
                describe: 'Spec ID to cancel',
                demandOption: true,
              });
          },
          async (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            await commandCancel(argv as Arguments<{ id: string; }>, modeSwitch);
          }
        )
        .demandCommand(1, 'Specify a spec subcommand (start, list, status, cancel)');
    }
  );
}

/**
 * Direct entry point for spec commands (when called from cli.ts)
 */
export async function runSpecCommand(
  argv: string[]
): Promise<void> {
  const parser = yargs(argv)
    .options({
      json: {
        type: 'boolean',
        describe: 'Output in JSON format',
        alias: 'j',
        default: false,
      },
    })
    .command(
      'start',
      'Start a new spec',
      (yargsInstance: Argv) => {
        return yargsInstance
          .option('template', {
            type: 'string',
            describe: 'Spec template to use',
            alias: 't',
          })
          .option('wait', {
            type: 'boolean',
            describe: 'Wait for spec to complete',
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
        const modeSwitch = new ModeSwitch(argv);
        await commandStart(argv as any, modeSwitch);
      }
    )
    .command(
      'list',
      'List specs',
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
        const modeSwitch = new ModeSwitch(argv);
        await commandList(argv as any, modeSwitch);
      }
    )
    .command(
      'status',
      'Get spec status',
      (yargsInstance: Argv) => {
        return yargsInstance
          .positional('id', {
            type: 'string',
            describe: 'Spec ID',
            demandOption: true,
          })
          .option('wait', {
            type: 'boolean',
            describe: 'Wait for spec to complete',
            alias: 'w',
            default: false,
          });
      },
      async (argv: Arguments) => {
        const modeSwitch = new ModeSwitch(argv);
        await commandStatus(argv as any, modeSwitch);
      }
    )
    .demandCommand(1, 'Specify a subcommand: start, list, or status')
    .help()
    .alias('help', 'h');

  parser.parse();
}

// Run if executed directly
if (require.main === module) {
  runSpecCommand(process.argv.slice(2)).catch((err) => {
    console.error(formatError(err, 'human'));
    process.exit(1);
  });
}
