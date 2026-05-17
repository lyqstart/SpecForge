/**
 * Mode Utilities for CLI
 * 
 * Helper functions for working with yargs arguments and ModeSwitch
 */

import { Mode, ModeSwitch } from './mode-switch';

/**
 * Extract mode from yargs arguments
 */
export function getModeFromYargs(argv: { json?: boolean }): Mode {
  return argv.json ? 'json' : 'human';
}

/**
 * Create ModeSwitch from yargs arguments
 */
export function createModeSwitchFromYargs(argv: { json?: boolean }): ModeSwitch {
  const mode = getModeFromYargs(argv);
  return new ModeSwitch(mode);
}

/**
 * Extract string array from yargs arguments for command suggestions
 */
export function getArgvArrayFromYargs(yargsParsed: any): string[] {
  if (!yargsParsed || !yargsParsed.argv || !yargsParsed.argv._) {
    return [];
  }
  
  const args: string[] = [];
  // Add the command itself
  if (yargsParsed.argv._.length > 0) {
    args.push(...yargsParsed.argv._.map((arg: any) => String(arg)));
  }
  
  // Add flags
  if (yargsParsed.argv.json) {
    args.push('--json');
  }
  if (yargsParsed.argv.verbose) {
    args.push('--verbose');
  }
  if (yargsParsed.argv.help) {
    args.push('--help');
  }
  if (yargsParsed.argv.version) {
    args.push('--version');
  }
  
  return args;
}