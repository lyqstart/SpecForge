/**
 * ModeSwitch - Handles output mode detection and switching
 * 
 * Provides dual-mode output:
 * - Interactive mode: colorful, human-readable output
 * - JSON mode: machine-friendly structured output (--json flag)
 */

import chalk from 'chalk';

/**
 * Output mode types
 */
export type OutputMode = 'interactive' | 'json';

/**
 * ModeSwitch configuration options
 */
export interface ModeSwitchOptions {
  /** Force a specific mode regardless of CLI args */
  forceMode?: OutputMode;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * ModeSwitch class for handling output mode
 */
export class ModeSwitch {
  private mode: OutputMode;
  private verbose: boolean;

  /**
   * Create a new ModeSwitch instance
   */
  constructor(options: ModeSwitchOptions = {}) {
    this.mode = options.forceMode || 'interactive';
    this.verbose = options.verbose || false;
  }

  /**
   * Detect mode from CLI arguments
   * Checks for --json or -j flag
   */
  static detectMode(args: string[] = process.argv): OutputMode {
    // Check for --json or -j flags
    const jsonFlags = ['--json', '-j'];
    return args.some(arg => jsonFlags.includes(arg)) ? 'json' : 'interactive';
  }

  /**
   * Detect mode from yargs parsed arguments
   */
  static fromParsedArgs(args: { json?: boolean }): OutputMode {
    return args.json ? 'json' : 'interactive';
  }

  /**
   * Set the current mode
   */
  setMode(mode: OutputMode): void {
    this.mode = mode;
    if (this.verbose) {
      console.error(`ModeSwitch: Mode set to ${mode}`);
    }
  }

  /**
   * Get the current mode
   */
  getMode(): OutputMode {
    return this.mode;
  }

  /**
   * Check if currently in JSON mode
   */
  isJsonMode(): boolean {
    return this.mode === 'json';
  }

  /**
   * Check if currently in interactive mode
   */
  isInteractiveMode(): boolean {
    return this.mode === 'interactive';
  }

  /**
   * Enable or disable colors (useful for JSON mode)
   */
  getChalkInstance(): chalk.Chalk {
    if (this.mode === 'json') {
      // Return a no-op chalk instance for JSON mode
      return chalk.level === 0 ? chalk : chalk;
    }
    return chalk;
  }
}

/**
 * Helper function to create ModeSwitch from process arguments
 */
export function createModeSwitch(args: string[] = process.argv): ModeSwitch {
  const mode = ModeSwitch.detectMode(args);
  return new ModeSwitch({ forceMode: mode });
}

/**
 * Helper function to create ModeSwitch from parsed yargs args
 */
export function createModeSwitchFromArgs(args: { json?: boolean }): ModeSwitch {
  const mode = ModeSwitch.fromParsedArgs(args);
  return new ModeSwitch({ forceMode: mode });
}