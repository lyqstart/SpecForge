import { loadAcceptedConfigSync } from '@specforge/configuration';
/**
 * Daemon Commands
 * 
 * Provides commands to manage the SpecForge daemon service:
 * - install-service: Install daemon as OS service
 * - uninstall-service: Uninstall daemon from OS service manager
 * - start: Start the daemon service
 * - stop: Stop the daemon service
 * - restart: Restart the daemon service
 * - status: Check daemon status
 * 
 * All commands support --json flag for machine-friendly output.
 * 
 * @packageDocumentation
 */

import yargs, { Argv, Arguments } from 'yargs';
import { handleInstallService } from './install-service';
import { handleUninstallService } from './uninstall-service';
import { handleStart } from './start';
import { handleStop } from './stop';
import { handleRestart } from './restart';
import { handleStatus } from './status';
import { ModeSwitch } from '../../mode-switch';
import {
  createConfigAccess,
  ConfigAccess,
} from '@specforge/configuration';

/**
 * Get configuration access instance
 */
function getConfigAccess(): ConfigAccess {
  return createConfigAccess(loadAcceptedConfigSync());
}

/**
 * Get stop timeout from config
 */
function getStopTimeoutFromConfig(): number {
  const config = getConfigAccess();
  const timeout = config.getOr<number>('service_management.stop_timeout_sec', 10);
  return timeout.value;
}

/**
 * Add daemon commands to yargs
 */
export function addDaemonCommands(yargs: Argv): Argv {
  return yargs
    .command(
      'daemon',
      'Manage the SpecForge daemon service',
      (yargs) => {
        return yargs
          .command(
            'install-service',
            'Install daemon as OS service',
            (yargs) => yargs.option('json', { type: 'boolean', describe: 'Output as JSON', alias: 'j', default: false }),
            (argv) => {
              const ms = new ModeSwitch(argv);
              handleInstallService(ms, !!argv.json);
            }
          )
          .command(
            'uninstall-service',
            'Uninstall daemon from OS service manager',
            (yargs) => yargs.option('json', { type: 'boolean', describe: 'Output as JSON', alias: 'j', default: false }),
            (argv) => {
              const ms = new ModeSwitch(argv);
              handleUninstallService(ms, !!argv.json);
            }
          )
          .command(
            'start',
            'Start the daemon service',
            (yargs) => yargs.option('json', { type: 'boolean', describe: 'Output as JSON', alias: 'j', default: false }),
            (argv) => {
              const ms = new ModeSwitch(argv);
              handleStart(ms, !!argv.json);
            }
          )
          .command(
            'stop',
            'Stop the daemon service',
            (yargs) =>
              yargs
                .option('json', { type: 'boolean', describe: 'Output as JSON', alias: 'j', default: false })
                .option('timeout', {
                  type: 'number',
                  describe: 'Stop timeout in seconds',
                  default: getStopTimeoutFromConfig(),
                }),
            (argv) => {
              const ms = new ModeSwitch(argv);
              handleStop(ms, !!argv.json, (argv.timeout as number) || getStopTimeoutFromConfig());
            }
          )
          .command(
            'restart',
            'Restart the daemon service',
            (yargs) =>
              yargs
                .option('json', { type: 'boolean', describe: 'Output as JSON', alias: 'j', default: false })
                .option('timeout', {
                  type: 'number',
                  describe: 'Stop timeout in seconds',
                  default: getStopTimeoutFromConfig(),
                }),
            (argv) => {
              const ms = new ModeSwitch(argv);
              handleRestart(ms, !!argv.json, (argv.timeout as number) || getStopTimeoutFromConfig());
            }
          )
          .command(
            'status',
            'Check daemon status',
            (yargs) => yargs.option('json', { type: 'boolean', describe: 'Output as JSON', alias: 'j', default: false }),
            (argv) => {
              const ms = new ModeSwitch(argv);
              handleStatus(ms, !!argv.json);
            }
          )
          .demandCommand(1, 'Specify a subcommand');
      },
      (argv) => {
        // Default: show help if no subcommand specified
        console.log('Usage: specforge daemon <command>');
        console.log('Commands: install-service, uninstall-service, start, stop, restart, status');
      }
    );
}