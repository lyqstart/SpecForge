#!/usr/bin/env node

/**
 * SpecForge CLI - Command Line Interface for SpecForge
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
 * Project state and current-schema migration are owned by the Daemon. The CLI
 * does not inspect or migrate project manifests before dispatching commands.
 */

import yargs, { Argv, Arguments } from 'yargs';
import { hideBin } from 'yargs/helpers';


import { ModeSwitch } from './mode-switch';
import { toCliError } from './errors';
import { addHelpCommands } from './commands/help';
import { addDaemonCommands } from './commands/daemon-client';
import { addOpenCodeServerCommands } from './commands/opencode-server';
import { addUtilityCommands } from './commands/utility';
import { addServicesCommands } from './commands/services';
import { runVersionCommand } from './commands/version';
import { runDoctorCommand } from './commands/doctor';

/**
 * Output mode types
 */
export type OutputMode = 'interactive' | 'json';

/**
 * Global CLI options
 */
export interface GlobalOptions {
  json: boolean;
  verbose: boolean;
  help: boolean;
  'project-dir'?: string;
  'user-manifest-path'?: string;
}

/**
 * Parse command line arguments with enhanced help system
 */
export function parseArgs(argv: string[] = hideBin(process.argv)): Argv<GlobalOptions> {
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
export function formatError(error: Error, mode: OutputMode, _hint?: string): string {
  const modeSwitch = new ModeSwitch(mode === 'json' ? 'json' : 'human');
  const cliError = toCliError(error);
  return modeSwitch.formatError(cliError);
}

/**
 * Doctor command definition
 *
 * Reports the CLI version and the current Project Spec manifest status.
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
           describe: 'Path to user manifest (defaults to <OpenCode config>/specforge-manifest.json)',
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


/**
 * Main CLI entry point with enhanced help system
 * 
 * Project initialization and schema decisions are delegated to the Daemon.
 */
export async function runCli(argv: string[] = hideBin(process.argv)): Promise<void> {
  // Version is a global, command-independent operation. Handle it before
  // constructing the command tree so async builders/handlers are never forced
  // through yargs.parseSync().
  if (argv.includes('--version') || argv.includes('-V')) {
    const exitCode = await runVersionCommand({
      write: (line) => {
        process.stdout.write(line);
      },
      writeErr: (line) => {
        process.stderr.write(line);
      },
    });
    process.exit(exitCode);
    return;
  }

  const parser = parseArgs(argv);
  
  // The current daemon has no /jobs, /api/specs, /api/webhooks, or /api/plugins
  // routes. Keep those historical command modules out of the released parser
  // until their runtime contracts and end-to-end tests exist.
  const parserWithCommands = addHelpCommands(
    addServicesCommands(
      addOpenCodeServerCommands(
        addDaemonCommands(
          addDoctorCommands(
            addUtilityCommands(parser)
          )
        )
      )
    )
  );
  
  // Parse exactly once. The command tree contains async builders and handlers,
  // so the asynchronous yargs API is mandatory.
  await parserWithCommands.parse();
}

// Run CLI if executed directly
runCli().catch((err) => {
  console.error('CLI error:', err);
  process.exit(1);
});
