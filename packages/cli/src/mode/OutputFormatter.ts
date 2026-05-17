/**
 * OutputFormatter - Handles output formatting for both interactive and JSON modes
 * 
 * Interactive mode: uses chalk for colorful, human-readable output
 * JSON mode: returns structured JSON without colors
 */

import chalk from 'chalk';
import type { OutputMode } from './ModeSwitch';

/**
 * Formatter options
 */
export interface FormatterOptions {
  /** The output mode */
  mode: OutputMode;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Pretty print JSON (only applies to JSON mode) */
  pretty?: boolean;
}

/**
 * CLI output categories for formatting
 */
export type OutputCategory = 
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'debug'
  | 'title'
  | 'subtitle'
  | 'code'
  | 'list-item';

/**
 * OutputFormatter class for handling formatted output
 */
export class OutputFormatter {
  private mode: OutputMode;
  private verbose: boolean;
  private pretty: boolean;
  private chalk: chalk.Chalk;

  constructor(options: FormatterOptions) {
    this.mode = options.mode;
    this.verbose = options.verbose || false;
    this.pretty = options.pretty !== false;
    this.chalk = chalk;
    
    // Disable colors in JSON mode
    if (this.mode === 'json') {
      this.chalk = new chalk.Instance({ level: 0 });
    }
  }

  /**
   * Get color for a category in interactive mode
   */
  private getCategoryColor(category: OutputCategory): chalk.Chalk {
    switch (category) {
      case 'success':
        return this.chalk.green.bold;
      case 'error':
        return this.chalk.red.bold;
      case 'warning':
        return this.chalk.yellow.bold;
      case 'info':
        return this.chalk.cyan;
      case 'debug':
        return this.chalk.gray;
      case 'title':
        return this.chalk.blue.bold.underline;
      case 'subtitle':
        return this.chalk.blue.bold;
      case 'code':
        return this.chalk.gray.bgBlack;
      case 'list-item':
        return this.chalk.white;
      default:
        return this.chalk.white;
    }
  }

  /**
   * Format a message based on category
   */
  formatCategory(message: string, category: OutputCategory): string {
    if (this.mode === 'json') {
      return message;
    }
    const colorFn = this.getCategoryColor(category);
    return colorFn(message);
  }

  /**
   * Format success message
   */
  success(message: string): string {
    return this.formatCategory(`✓ ${message}`, 'success');
  }

  /**
   * Format error message
   */
  error(message: string): string {
    return this.formatCategory(`✗ ${message}`, 'error');
  }

  /**
   * Format warning message
   */
  warning(message: string): string {
    return this.formatCategory(`⚠ ${message}`, 'warning');
  }

  /**
   * Format info message
   */
  info(message: string): string {
    return this.formatCategory(`ℹ ${message}`, 'info');
  }

  /**
   * Format debug message (only shows in verbose mode)
   */
  debug(message: string): string {
    if (!this.verbose) {
      return '';
    }
    return this.formatCategory(`🔍 ${message}`, 'debug');
  }

  /**
   * Format a title
   */
  title(message: string): string {
    return this.formatCategory(message, 'title');
  }

  /**
   * Format a subtitle
   */
  subtitle(message: string): string {
    return this.formatCategory(message, 'subtitle');
  }

  /**
   * Format code/monospace text
   */
  code(message: string): string {
    return this.formatCategory(`\`${message}\``, 'code');
  }

  /**
   * Format a list item with optional bullet
   */
  listItem(message: string, bullet: string = '•'): string {
    return this.formatCategory(`${bullet} ${message}`, 'list-item');
  }

  /**
   * Format data as JSON or pretty-printed object
   */
  formatData(data: unknown): string {
    if (this.mode === 'json') {
      return JSON.stringify(data);
    }
    
    // Interactive mode - pretty print
    if (typeof data === 'string') {
      return data;
    }
    return JSON.stringify(data, null, 2);
  }

  /**
   * Format a table for interactive mode
   */
  formatTable(headers: string[], rows: string[][]): string {
    if (this.mode === 'json') {
      const tableData = rows.map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((header, i) => {
          obj[header] = row[i] || '';
        });
        return obj;
      });
      return this.formatData(tableData);
    }

    // Calculate column widths
    const widths = headers.map((h, i) => {
      const maxRowWidth = Math.max(...rows.map(r => (r[i] || '').length));
      return Math.max(h.length, maxRowWidth);
    });

    // Build header row
    const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
    const separator = widths.map(w => '─'.repeat(w)).join('  ');

    // Build data rows
    const dataRows = rows.map(row => 
      row.map((cell, i) => (cell || '').padEnd(widths[i])).join('  ')
    );

    return [headerRow, separator, ...dataRows].join('\n');
  }

  /**
   * Format an error for output
   */
  formatError(error: Error & { code?: string; hint?: string }): string {
    if (this.mode === 'json') {
      const errorObj: Record<string, unknown> = {
        error: error.name || 'Error',
        message: error.message,
      };
      if (error.code) {
        errorObj.code = error.code;
      }
      if (error.hint) {
        errorObj.hint = error.hint;
      }
      return JSON.stringify(errorObj, null, this.pretty ? 2 : 0);
    }

    // Interactive mode
    let output = this.error(error.message);
    if (error.code) {
      output += `\n  ${this.chalk.gray(`Code: ${error.code}`)}`;
    }
    if (error.hint) {
      output += `\n  ${this.chalk.yellow('Hint:')} ${error.hint}`;
    }
    return output;
  }

  /**
   * Format a list of items
   */
  formatList(items: string[], ordered: boolean = false): string {
    if (this.mode === 'json') {
      return JSON.stringify({ items });
    }

    return items.map((item, index) => {
      const prefix = ordered ? `${index + 1}.` : '•';
      return this.listItem(item, prefix);
    }).join('\n');
  }

  /**
   * Format key-value pairs
   */
  formatKeyValue(key: string, value: string): string {
    if (this.mode === 'json') {
      return JSON.stringify({ [key]: value });
    }
    return `${this.chalk.cyan(key)}: ${value}`;
  }

  /**
   * Format progress indicator (interactive only)
   */
  formatProgress(current: number, total: number, message: string = ''): string {
    if (this.mode === 'json') {
      return JSON.stringify({ current, total, message });
    }

    const percentage = Math.round((current / total) * 100);
    const filled = '█'.repeat(Math.floor(percentage / 5));
    const empty = '░'.repeat(20 - Math.floor(percentage / 5));
    
    let output = `${this.chalk.cyan('Progress:')} [${filled}${empty}] ${percentage}%`;
    if (message) {
      output += ` ${message}`;
    }
    return output;
  }

  /**
   * Get the current mode
   */
  getMode(): OutputMode {
    return this.mode;
  }

  /**
   * Create formatter from mode
   */
  static create(mode: OutputMode, verbose: boolean = false): OutputFormatter {
    return new OutputFormatter({ mode, verbose });
  }
}

/**
 * Create an output formatter from process arguments
 */
export function createFormatter(args: string[] = process.argv): OutputFormatter {
  const isJson = args.some(arg => arg === '--json' || arg === '-j');
  const verbose = args.some(arg => arg === '--verbose' || arg === '-v');
  return OutputFormatter.create(isJson ? 'json' : 'interactive', verbose);
}

/**
 * Create an output formatter from parsed args
 */
export function createFormatterFromArgs(args: { json?: boolean; verbose?: boolean }): OutputFormatter {
  const mode: OutputMode = args.json ? 'json' : 'interactive';
  const verbose = args.verbose || false;
  return OutputFormatter.create(mode, verbose);
}