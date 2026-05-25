/**
 * Help Command for SpecForge CLI
 * 
 * Provides help functionality with:
 * - Command-specific help
 * - Interactive suggestions
 * - Dual-mode output
 * 
 * @packageDocumentation
 */

import yargs, { Argv, Arguments } from 'yargs';
import { ModeSwitch } from '../mode-switch';
import { HelpSystem, createDefaultHelpSystem } from '../help/HelpSystem';
import { createModeSwitchFromYargs, getArgvArrayFromYargs } from '../mode-utils';

/**
 * Help command handler
 */
export async function commandHelp(
  argv: Arguments<{
    command?: string;
    subcommand?: string;
    json?: boolean;
  }>
): Promise<void> {
  const modeSwitch = new ModeSwitch(argv);
  const helpSystem = createDefaultHelpSystem();
  
  if (argv.command) {
    // Show help for specific command
    const helpText = helpSystem.generateCommandHelp(
      argv.command as string,
      modeSwitch,
      argv.subcommand as string | undefined
    );
    console.log(helpText);
  } else {
    // Show general help
    const helpText = helpSystem.generateGeneralHelp(modeSwitch);
    console.log(helpText);
  }
}

/**
 * Add help commands to yargs parser
 */
export function addHelpCommands(yargsInstance: Argv): Argv {
  return yargsInstance
    .command(
      'help',
      'Show help information',
      (yargsInstance: Argv) => {
        return yargsInstance
          .positional('command', {
            type: 'string',
            describe: 'Command to get help for',
          })
          .positional('subcommand', {
            type: 'string',
            describe: 'Subcommand to get help for',
          });
      },
      async (argv: Arguments) => {
        await commandHelp(argv);
      }
    )
    .help(false) // Disable default yargs help to use our custom implementation
    .option('help', {
      type: 'boolean',
      describe: 'Show help',
      alias: 'h',
      default: false,
    })
    .option('version', {
      type: 'boolean',
      describe: 'Show version',
      alias: 'V',
      default: false,
    })
    .middleware((argv) => {
      // Handle --help and --version flags
      const modeSwitch = new ModeSwitch(argv);
      const helpSystem = createDefaultHelpSystem();
      
      if (argv.help) {
        if (argv._.length > 0) {
          // Show help for specific command
          const command = argv._[0] as string;
          const subcommand = argv._[1] as string | undefined;
          const helpText = helpSystem.generateCommandHelp(command, modeSwitch, subcommand);
          console.log(helpText);
          process.exit(0);
        } else {
          // Show general help
          const helpText = helpSystem.generateGeneralHelp(modeSwitch);
          console.log(helpText);
          process.exit(0);
        }
      }
      
      if (argv.version) {
        if (modeSwitch.isJson()) {
          console.log(JSON.stringify({
            appName: 'SpecForge',
            version: '0.1.0',
            cliVersion: '0.1.0',
          }, null, 2));
        } else {
          console.log('SpecForge CLI v0.1.0');
        }
        process.exit(0);
      }
      
      return undefined;
    }, true)
    .fail((msg, err, yargs) => {
      const modeSwitch = new ModeSwitch(process.argv.slice(2));
      const helpSystem = createDefaultHelpSystem();
      
      if (msg) {
        // Parse the error message to see if it's an unknown command
        const unknownCommandMatch = msg.match(/Not enough arguments|Unknown argument|Command .* not found/i);
        if (unknownCommandMatch && (yargs.parsed as any)?.argv?._?.[0]) {
          const input = (yargs.parsed as any).argv._.join(' ');
          const suggestions = helpSystem.generateSuggestions(input, modeSwitch);
          console.error(suggestions);
        } else {
          console.error(modeSwitch.formatError(msg));
        }
      } else if (err) {
        console.error(modeSwitch.formatError(err));
      } else {
        console.error('An unknown error occurred');
      }
      
      process.exit(1);
    });
}

/**
 * Generate suggestions for unknown command
 */
export function handleUnknownCommand(input: string, modeSwitch: ModeSwitch): void {
  const helpSystem = createDefaultHelpSystem();
  const suggestions = helpSystem.generateSuggestions(input, modeSwitch);
  console.error(suggestions);
  process.exit(1);
}

/**
 * Direct entry point for help command
 */
export async function runHelpCommand(
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
      'help [command] [subcommand]',
      'Show help information',
      (yargsInstance: Argv) => {
        return yargsInstance
          .positional('command', {
            type: 'string',
            describe: 'Command to get help for',
          })
          .positional('subcommand', {
            type: 'string',
            describe: 'Subcommand to get help for',
          });
      },
      async (argv: Arguments) => {
        await commandHelp(argv);
      }
    )
    .demandCommand(0, '')
    .help()
    .alias('help', 'h');

  parser.parse();
}

// Run if executed directly
if (require.main === module) {
  runHelpCommand(process.argv.slice(2)).catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}