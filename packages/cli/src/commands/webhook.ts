/**
 * Webhook Management Commands
 * 
 * Provides commands to manage webhooks:
 * - register: Register a new webhook endpoint
 * - list: List all registered webhooks
 * - delete: Delete a webhook by ID
 * 
 * @packageDocumentation
 */

import yargs, { Argv, Arguments } from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DaemonClient } from '../http/DaemonClient';
import { ModeSwitch, formatError } from '../mode-switch';
import { toCliError, DaemonUnreachableError, InvalidInputError } from '../errors';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

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
 * Webhook type definition (mirrors daemon API)
 */
export interface Webhook {
  /** Unique webhook identifier */
  id: string;
  /** Webhook URL */
  url: string;
  /** Event patterns to match */
  events: string[];
  /** Whether the webhook is active */
  active: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** Last trigger timestamp */
  lastTriggeredAt?: number;
}

/**
 * Webhook register response
 */
interface RegisterResponse {
  success: boolean;
  webhook: Webhook;
  message: string;
}

/**
 * Webhook list response
 */
interface ListResponse {
  webhooks: Webhook[];
  total: number;
}

/**
 * Webhook delete response
 */
interface DeleteResponse {
  success: boolean;
  message: string;
}

/**
 * Register webhook command
 */
export async function commandRegister(
  argv: Arguments<{
    url: string;
    events: string;
  }>,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  
  // Parse events from comma-separated string to array
  const events = argv.events.split(',').map(e => e.trim()).filter(e => e.length > 0);
  
  if (events.length === 0) {
    const cliError = new InvalidInputError(
      'At least one event pattern is required',
      'Use --events "event1,event2" to specify event patterns'
    );
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }

  try {
    // Call daemon-core /api/webhooks/register endpoint
    const response = await client.post<RegisterResponse>('/api/webhooks/register', {
      url: argv.url,
      events,
    });

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(response));
    } else {
      console.log(modeSwitch.formatSuccess('Webhook registered successfully'));
      console.log(`\nWebhook Details:`);
      console.log(`  ID:     ${response.webhook.id}`);
      console.log(`  URL:    ${response.webhook.url}`);
      console.log(`  Events: ${response.webhook.events.join(', ')}`);
      console.log(`  Status: ${response.webhook.active ? 'Active' : 'Inactive'}`);
      console.log(`\nUse "specforge webhook delete ${response.webhook.id}" to remove this webhook.`);
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * List webhooks command
 */
export async function commandList(
  _argv: Arguments,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  
  try {
    // Call daemon-core /api/webhooks endpoint
    const response = await client.get<ListResponse>('/api/webhooks');

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(response));
    } else {
      if (response.webhooks.length === 0) {
        console.log('No webhooks registered.');
        console.log('\nUse "specforge webhook register --url <url> --events <pattern>" to add one.');
        return;
      }

      console.log(`Found ${response.total} webhook(s):\n`);
      
      for (const webhook of response.webhooks) {
        const statusIcon = webhook.active ? '✓' : '✗';
        console.log(`${statusIcon} Webhook: ${webhook.id}`);
        console.log(`  URL:    ${webhook.url}`);
        console.log(`  Events: ${webhook.events.join(', ')}`);
        
        const created = new Date(webhook.createdAt).toLocaleString();
        console.log(`  Created: ${created}`);
        
        if (webhook.lastTriggeredAt) {
          const triggered = new Date(webhook.lastTriggeredAt).toLocaleString();
          console.log(`  Last Triggered: ${triggered}`);
        }
        
        console.log('');
      }
      
      console.log('Use "specforge webhook delete <id>" to remove a webhook.');
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * Delete webhook command
 */
export async function commandDelete(
  argv: Arguments<{
    id: string;
  }>,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  const webhookId = argv.id;

  try {
    // Call daemon-core /api/webhooks/:id endpoint
    const response = await client.delete<DeleteResponse>(`/api/webhooks/${encodeURIComponent(webhookId)}`);

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(response));
    } else {
      console.log(modeSwitch.formatSuccess(response.message));
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * Add webhook commands to yargs parser
 */
export function addWebhookCommands(yargsInstance: Argv): Argv {
  return yargsInstance.command(
    'webhook',
    'Manage webhooks',
    (yargsInstance: Argv) => {
      return yargsInstance
        .command(
          'register',
          'Register a new webhook',
          (yargsInstance: Argv) => {
            return yargsInstance
              .option('url', {
                type: 'string',
                describe: 'Webhook URL (must be HTTPS in production)',
                demandOption: true,
              })
              .option('events', {
                type: 'string',
                describe: 'Event patterns to subscribe (comma-separated, e.g., "gate.*,workflow.completed")',
                demandOption: true,
              });
          },
          async (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            await commandRegister(argv as any, modeSwitch);
          }
        )
        .command(
          'list',
          'List all registered webhooks',
          () => {},
          async (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            await commandList(argv, modeSwitch);
          }
        )
        .command(
          'delete',
          'Delete a webhook',
          (yargsInstance: Argv) => {
            return yargsInstance
              .positional('id', {
                type: 'string',
                describe: 'Webhook ID to delete',
                demandOption: true,
              });
          },
          async (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            await commandDelete(argv as any, modeSwitch);
          }
        )
        .demandCommand(1, 'Specify a webhook subcommand (register, list, delete)');
    }
  );
}

/**
 * Direct entry point for webhook commands (when called from cli.ts)
 */
export async function runWebhookCommand(
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
      'register',
      'Register a new webhook',
      (yargsInstance: Argv) => {
        return yargsInstance
          .option('url', {
            type: 'string',
            describe: 'Webhook URL',
            demandOption: true,
          })
          .option('events', {
            type: 'string',
            describe: 'Event patterns (comma-separated)',
            demandOption: true,
          });
      },
      async (argv: Arguments) => {
        const modeSwitch = new ModeSwitch(argv);
        await commandRegister(argv as any, modeSwitch);
      }
    )
    .command(
      'list',
      'List webhooks',
      () => {},
      async (argv: Arguments) => {
        const modeSwitch = new ModeSwitch(argv);
        await commandList(argv, modeSwitch);
      }
    )
    .command(
      'delete',
      'Delete a webhook',
      (yargsInstance: Argv) => {
        return yargsInstance
          .positional('id', {
            type: 'string',
            describe: 'Webhook ID',
            demandOption: true,
          });
      },
      async (argv: Arguments) => {
        const modeSwitch = new ModeSwitch(argv);
        await commandDelete(argv as any, modeSwitch);
      }
    )
    .demandCommand(1, 'Specify a subcommand: register, list, or delete')
    .help()
    .alias('help', 'h');

  parser.parse();
}

// Run if executed directly
if (require.main === module) {
  runWebhookCommand(process.argv.slice(2)).catch((err) => {
    console.error(formatError(err, 'human'));
    process.exit(1);
  });
}