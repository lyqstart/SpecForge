/**
 * Help System for SpecForge CLI
 * 
 * Provides user-friendly help with:
 * - Command-specific help
 * - Examples for each command
 * - Interactive mode hints and suggestions
 * - Dual-mode output (interactive and JSON)
 * 
 * @packageDocumentation
 */

import { ModeSwitch, Mode } from '../mode-switch';

/**
 * Command definition for help system
 */
export interface CommandDefinition {
  /** Command name (e.g., "daemon", "workflow") */
  name: string;
  /** Brief description */
  description: string;
  /** Whether this is an async command */
  async?: boolean;
  /** Subcommands if any */
  subcommands?: SubcommandDefinition[];
  /** Parameters for this command */
  parameters?: ParameterDefinition[];
  /** Examples for this command */
  examples?: ExampleDefinition[];
  /** Common errors and solutions */
  troubleshooting?: TroubleshootingItem[];
}

/**
 * Subcommand definition
 */
export interface SubcommandDefinition {
  /** Subcommand name */
  name: string;
  /** Brief description */
  description: string;
  /** Parameters for this subcommand */
  parameters?: ParameterDefinition[];
  /** Examples for this subcommand */
  examples?: ExampleDefinition[];
}

/**
 * Parameter definition
 */
export interface ParameterDefinition {
  /** Parameter name (with -- prefix for flags) */
  name: string;
  /** Type of parameter */
  type: 'string' | 'number' | 'boolean' | 'array';
  /** Whether parameter is required */
  required: boolean;
  /** Description */
  description: string;
  /** Default value if any */
  default?: unknown;
  /** Aliases (e.g., -d for --detach) */
  aliases?: string[];
}

/**
 * Example definition
 */
export interface ExampleDefinition {
  /** Example description */
  description: string;
  /** Example command */
  command: string;
  /** Expected output (for interactive mode) */
  output?: string;
}

/**
 * Troubleshooting item
 */
export interface TroubleshootingItem {
  /** Problem description */
  problem: string;
  /** Solution */
  solution: string;
}

/**
 * Help system configuration
 */
export interface HelpSystemConfig {
  /** Application name */
  appName: string;
  /** Application version */
  version: string;
  /** Global flags available for all commands */
  globalFlags: ParameterDefinition[];
  /** All available commands */
  commands: CommandDefinition[];
}

/**
 * Help system for generating user-friendly help
 */
export class HelpSystem {
  private config: HelpSystemConfig;

  constructor(config: HelpSystemConfig) {
    this.config = config;
  }

  /**
   * Generate help for a specific command
   */
  generateCommandHelp(commandName: string, modeSwitch: ModeSwitch, subcommandName?: string): string {
    const command = this.config.commands.find(cmd => cmd.name === commandName);
    if (!command) {
      return this.formatError(`Command "${commandName}" not found`, modeSwitch);
    }

    if (subcommandName && command.subcommands) {
      const subcommand = command.subcommands.find(sub => sub.name === subcommandName);
      if (!subcommand) {
        return this.formatError(`Subcommand "${subcommandName}" not found for command "${commandName}"`, modeSwitch);
      }
      return this.formatSubcommandHelp(command, subcommand, modeSwitch);
    }

    return this.formatCommandHelp(command, modeSwitch);
  }

  /**
   * Generate general help (list of commands)
   */
  generateGeneralHelp(modeSwitch: ModeSwitch): string {
    if (modeSwitch.isJson()) {
      return JSON.stringify({
        appName: this.config.appName,
        version: this.config.version,
        commands: this.config.commands.map(cmd => ({
          name: cmd.name,
          description: cmd.description,
          async: cmd.async,
        })),
        globalFlags: this.config.globalFlags,
      }, null, 2);
    }

    // Interactive mode
    let output = `${this.config.appName} v${this.config.version}\n\n`;
    output += 'Usage: specforge <command> [options]\n\n';
    output += 'Available commands:\n\n';

    for (const cmd of this.config.commands) {
      const asyncMarker = cmd.async ? ' (async)' : '';
      output += `  ${cmd.name.padEnd(15)} ${cmd.description}${asyncMarker}\n`;
    }

    output += '\nGlobal options:\n';
    for (const flag of this.config.globalFlags) {
      const aliases = flag.aliases ? `, ${flag.aliases.join(', ')}` : '';
      const required = flag.required ? ' (required)' : '';
      const defaultValue = flag.default !== undefined ? ` [default: ${flag.default}]` : '';
      output += `  ${flag.name}${aliases}${required}\n`;
      output += `      ${flag.description}${defaultValue}\n`;
    }

    output += '\nFor more information on a specific command, run:\n';
    output += `  specforge <command> --help\n`;
    output += `  specforge <command> <subcommand> --help\n`;

    return output;
  }

  /**
   * Generate suggestions for unknown commands
   */
  generateSuggestions(input: string, modeSwitch: ModeSwitch): string {
    const allCommands = this.config.commands.flatMap(cmd => {
      const names = [cmd.name];
      if (cmd.subcommands) {
        names.push(...cmd.subcommands.map(sub => `${cmd.name} ${sub.name}`));
      }
      return names;
    });

    // Simple Levenshtein distance for suggestions
    const suggestions = allCommands
      .map(cmd => ({
        command: cmd,
        distance: this.levenshteinDistance(input.toLowerCase(), cmd.toLowerCase())
      }))
      .filter(item => item.distance <= 3)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    if (modeSwitch.isJson()) {
      return JSON.stringify({
        input,
        suggestions: suggestions.map(s => s.command),
      }, null, 2);
    }

    if (suggestions.length === 0) {
      return `Command "${input}" not found. Use "specforge --help" to see available commands.`;
    }

    let output = `Command "${input}" not found.\n\n`;
    output += 'Did you mean one of these?\n';
    for (const suggestion of suggestions) {
      output += `  ${suggestion.command}\n`;
    }
    output += '\nUse "specforge --help" to see all available commands.';

    return output;
  }

  /**
   * Format command help for output
   */
  private formatCommandHelp(command: CommandDefinition, modeSwitch: ModeSwitch): string {
    if (modeSwitch.isJson()) {
      return JSON.stringify({
        command: command.name,
        description: command.description,
        async: command.async,
        subcommands: command.subcommands?.map(sub => ({
          name: sub.name,
          description: sub.description,
        })),
        parameters: command.parameters,
        examples: command.examples,
        troubleshooting: command.troubleshooting,
      }, null, 2);
    }

    // Interactive mode
    let output = `${command.name} - ${command.description}\n`;
    if (command.async) {
      output += '  (This is an asynchronous command)\n';
    }
    output += '\n';

    if (command.subcommands && command.subcommands.length > 0) {
      output += 'Subcommands:\n';
      for (const sub of command.subcommands) {
        output += `  ${sub.name.padEnd(15)} ${sub.description}\n`;
      }
      output += '\n';
      output += 'For help on a specific subcommand, run:\n';
      output += `  specforge ${command.name} <subcommand> --help\n\n`;
    }

    if (command.parameters && command.parameters.length > 0) {
      output += 'Options:\n';
      for (const param of command.parameters) {
        const aliases = param.aliases ? `, ${param.aliases.join(', ')}` : '';
        const required = param.required ? ' (required)' : '';
        const defaultValue = param.default !== undefined ? ` [default: ${param.default}]` : '';
        output += `  ${param.name}${aliases}${required}\n`;
        output += `      ${param.description}${defaultValue}\n`;
      }
      output += '\n';
    }

    if (command.examples && command.examples.length > 0) {
      output += 'Examples:\n';
      for (const example of command.examples) {
        output += `  # ${example.description}\n`;
        output += `  ${example.command}\n`;
        if (example.output) {
          output += `  ${example.output}\n`;
        }
        output += '\n';
      }
    }

    if (command.troubleshooting && command.troubleshooting.length > 0) {
      output += 'Troubleshooting:\n';
      for (const item of command.troubleshooting) {
        output += `  Problem: ${item.problem}\n`;
        output += `  Solution: ${item.solution}\n\n`;
      }
    }

    // Add global flags section
    if (this.config.globalFlags.length > 0) {
      output += 'Global options (available for all commands):\n';
      for (const flag of this.config.globalFlags) {
        const aliases = flag.aliases ? `, ${flag.aliases.join(', ')}` : '';
        output += `  ${flag.name}${aliases}\n`;
        output += `      ${flag.description}\n`;
      }
    }

    return output;
  }

  /**
   * Format subcommand help for output
   */
  private formatSubcommandHelp(
    command: CommandDefinition,
    subcommand: SubcommandDefinition,
    modeSwitch: ModeSwitch
  ): string {
    if (modeSwitch.isJson()) {
      return JSON.stringify({
        command: command.name,
        subcommand: subcommand.name,
        description: subcommand.description,
        parameters: subcommand.parameters,
        examples: subcommand.examples,
      }, null, 2);
    }

    // Interactive mode
    let output = `${command.name} ${subcommand.name} - ${subcommand.description}\n`;
    if (command.async) {
      output += '  (This is an asynchronous command)\n';
    }
    output += '\n';

    if (subcommand.parameters && subcommand.parameters.length > 0) {
      output += 'Options:\n';
      for (const param of subcommand.parameters) {
        const aliases = param.aliases ? `, ${param.aliases.join(', ')}` : '';
        const required = param.required ? ' (required)' : '';
        const defaultValue = param.default !== undefined ? ` [default: ${param.default}]` : '';
        output += `  ${param.name}${aliases}${required}\n`;
        output += `      ${param.description}${defaultValue}\n`;
      }
      output += '\n';
    }

    if (subcommand.examples && subcommand.examples.length > 0) {
      output += 'Examples:\n';
      for (const example of subcommand.examples) {
        output += `  # ${example.description}\n`;
        output += `  ${example.command}\n`;
        if (example.output) {
          output += `  ${example.output}\n`;
        }
        output += '\n';
      }
    }

    // Add global flags section
    if (this.config.globalFlags.length > 0) {
      output += 'Global options (available for all commands):\n';
      for (const flag of this.config.globalFlags) {
        const aliases = flag.aliases ? `, ${flag.aliases.join(', ')}` : '';
        output += `  ${flag.name}${aliases}\n`;
        output += `      ${flag.description}\n`;
      }
    }

    return output;
  }

  /**
   * Format error message
   */
  private formatError(message: string, modeSwitch: ModeSwitch): string {
    if (modeSwitch.isJson()) {
      return JSON.stringify({
        error: true,
        message,
      }, null, 2);
    }
    return `Error: ${message}`;
  }

  /**
   * Calculate Levenshtein distance for suggestions
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

/**
 * Default help system configuration for SpecForge CLI
 */
export function createDefaultHelpSystem(): HelpSystem {
  const config: HelpSystemConfig = {
    appName: 'SpecForge',
    version: '0.1.0',
    globalFlags: [
      {
        name: '--json',
        type: 'boolean',
        required: false,
        description: 'Output in JSON format (machine-friendly)',
        aliases: ['-j'],
        default: false,
      },
      {
        name: '--verbose',
        type: 'boolean',
        required: false,
        description: 'Enable verbose output',
        aliases: ['-v'],
        default: false,
      },
      {
        name: '--help',
        type: 'boolean',
        required: false,
        description: 'Show help',
        aliases: ['-h'],
        default: false,
      },
      {
        name: '--version',
        type: 'boolean',
        required: false,
        description: 'Show version',
        aliases: ['-V'],
        default: false,
      },
    ],
    commands: [
      {
        name: 'daemon',
        description: 'Manage the SpecForge daemon',
        subcommands: [
          {
            name: 'start',
            description: 'Start the daemon',
            parameters: [
              {
                name: '--detach',
                type: 'boolean',
                required: false,
                description: 'Run in background (detach from terminal)',
                aliases: ['-d'],
                default: false,
              },
              {
                name: '--bind',
                type: 'string',
                required: false,
                description: 'Bind address',
                default: '127.0.0.1',
              },
            ],
            examples: [
              {
                description: 'Start daemon in foreground',
                command: 'specforge daemon start',
              },
              {
                description: 'Start daemon in background',
                command: 'specforge daemon start --detach',
              },
              {
                description: 'Start daemon on specific address',
                command: 'specforge daemon start --bind 0.0.0.0',
              },
            ],
          },
          {
            name: 'stop',
            description: 'Stop the daemon',
            examples: [
              {
                description: 'Stop the daemon',
                command: 'specforge daemon stop',
              },
            ],
          },
          {
            name: 'status',
            description: 'Check daemon status',
            examples: [
              {
                description: 'Check daemon health',
                command: 'specforge daemon status',
              },
              {
                description: 'Check daemon health in JSON format',
                command: 'specforge daemon status --json',
              },
            ],
          },
          {
            name: 'config',
            description: 'Configure daemon settings',
            parameters: [
              {
                name: '--bind',
                type: 'string',
                required: false,
                description: 'Bind address',
              },
              {
                name: '--require-auth',
                type: 'boolean',
                required: false,
                description: 'Require authentication',
                default: true,
              },
            ],
            examples: [
              {
                description: 'Configure daemon to bind to all interfaces',
                command: 'specforge daemon config --bind 0.0.0.0',
              },
              {
                description: 'Disable authentication (not recommended)',
                command: 'specforge daemon config --require-auth false',
              },
            ],
          },
        ],
        examples: [
          {
            description: 'Start daemon and check status',
            command: 'specforge daemon start --detach && specforge daemon status',
          },
        ],
        troubleshooting: [
          {
            problem: 'Daemon fails to start',
            solution: 'Check if port 3847 is already in use: `netstat -an | grep 3847`',
          },
          {
            problem: 'Cannot connect to daemon',
            solution: 'Ensure daemon is running: `specforge daemon status`. If not, start it: `specforge daemon start`',
          },
        ],
      },
      {
        name: 'spec',
        description: 'Manage specs',
        async: true,
        subcommands: [
          {
            name: 'start',
            description: 'Start a new spec (async)',
            parameters: [
              {
                name: '--template',
                type: 'string',
                required: false,
                description: 'Spec template to use',
                aliases: ['-t'],
              },
              {
                name: '--wait',
                type: 'boolean',
                required: false,
                description: 'Wait for spec to complete',
                aliases: ['-w'],
                default: false,
              },
              {
                name: '--timeout',
                type: 'number',
                required: false,
                description: 'Timeout in seconds for --wait',
                default: 300,
              },
            ],
            examples: [
              {
                description: 'Start a spec with default template',
                command: 'specforge spec start',
                output: 'Job created: spec-12345\nUse "specforge job spec-12345" to check status.',
              },
              {
                description: 'Start a spec with specific template and wait',
                command: 'specforge spec start --template bugfix --wait',
              },
              {
                description: 'Start a spec with custom timeout',
                command: 'specforge spec start --wait --timeout 600',
              },
            ],
          },
        ],
        troubleshooting: [
          {
            problem: 'Spec fails to start',
            solution: 'Check daemon logs for errors: `tail -f ~/.specforge/logs/daemon.log`',
          },
          {
            problem: 'Spec times out',
            solution: 'Increase timeout with --timeout flag or check if daemon is under heavy load',
          },
        ],
      },
      {
        name: 'workflow',
        description: 'Manage workflows',
        async: true,
        subcommands: [
          {
            name: 'start',
            description: 'Start a new workflow (async)',
            parameters: [
              {
                name: '--spec',
                type: 'string',
                required: true,
                description: 'Spec to run',
                aliases: ['-s'],
              },
              {
                name: '--wait',
                type: 'boolean',
                required: false,
                description: 'Wait for workflow to complete',
                aliases: ['-w'],
                default: false,
              },
              {
                name: '--timeout',
                type: 'number',
                required: false,
                description: 'Timeout in seconds for --wait',
                default: 600,
              },
            ],
            examples: [
              {
                description: 'Start a workflow for a spec',
                command: 'specforge workflow start --spec cli',
                output: 'Job created: workflow-67890\nUse "specforge job workflow-67890" to check status.',
              },
              {
                description: 'Start a workflow and wait for completion',
                command: 'specforge workflow start --spec cli --wait',
              },
            ],
          },
          {
            name: 'status',
            description: 'Get workflow status',
            parameters: [
              {
                name: 'id',
                type: 'string',
                required: true,
                description: 'Workflow ID',
              },
              {
                name: '--wait',
                type: 'boolean',
                required: false,
                description: 'Wait for workflow to complete',
                aliases: ['-w'],
                default: false,
              },
              {
                name: '--timeout',
                type: 'number',
                required: false,
                description: 'Timeout in seconds for --wait',
                default: 600,
              },
            ],
            examples: [
              {
                description: 'Check workflow status',
                command: 'specforge workflow status workflow-67890',
              },
              {
                description: 'Wait for workflow completion',
                command: 'specforge workflow status workflow-67890 --wait',
              },
            ],
          },
          {
            name: 'list',
            description: 'List workflows',
            parameters: [
              {
                name: '--limit',
                type: 'number',
                required: false,
                description: 'Limit number of results',
                default: 50,
              },
            ],
            examples: [
              {
                description: 'List recent workflows',
                command: 'specforge workflow list',
              },
              {
                description: 'List top 10 workflows',
                command: 'specforge workflow list --limit 10',
              },
            ],
          },
        ],
      },
      {
        name: 'job',
        description: 'Manage async jobs',
        subcommands: [
          {
            name: '<id>',
            description: 'Get job status',
            parameters: [
              {
                name: 'id',
                type: 'string',
                required: true,
                description: 'Job ID',
              },
              {
                name: '--wait',
                type: 'boolean',
                required: false,
                description: 'Wait for job to complete',
                aliases: ['-w'],
                default: false,
              },
              {
                name: '--timeout',
                type: 'number',
                required: false,
                description: 'Timeout in seconds for --wait',
                default: 300,
              },
            ],
            examples: [
              {
                description: 'Check job status',
                command: 'specforge job spec-12345',
              },
              {
                description: 'Wait for job completion',
                command: 'specforge job spec-12345 --wait',
              },
            ],
          },
          {
            name: 'list',
            description: 'List all jobs',
            parameters: [
              {
                name: '--status',
                type: 'string',
                required: false,
                description: 'Filter by status',
                choices: ['pending', 'running', 'completed', 'failed', 'blocked', 'cancelled'],
              },
              {
                name: '--limit',
                type: 'number',
                required: false,
                description: 'Limit number of results',
                default: 50,
              },
            ],
            examples: [
              {
                description: 'List all jobs',
                command: 'specforge job list',
              },
              {
                description: 'List only failed jobs',
                command: 'specforge job list --status failed',
              },
              {
                description: 'List top 10 running jobs',
                command: 'specforge job list --status running --limit 10',
              },
            ],
          },
        ],
        troubleshooting: [
          {
            problem: 'Job not found',
            solution: 'Check if job ID is correct. Use `specforge job list` to see all jobs.',
          },
          {
            problem: 'Job stuck in pending state',
            solution: 'Check daemon logs. The daemon may be overloaded or experiencing issues.',
          },
        ],
      },
      {
        name: 'webhook',
        description: 'Manage webhooks',
        subcommands: [
          {
            name: 'register',
            description: 'Register a new webhook',
            parameters: [
              {
                name: '--url',
                type: 'string',
                required: true,
                description: 'Webhook URL',
              },
              {
                name: '--events',
                type: 'string',
                required: true,
                description: 'Event pattern (e.g., "gate.*", "permission.denied")',
              },
              {
                name: '--secret',
                type: 'string',
                required: false,
                description: 'Secret for signing webhook payloads',
              },
            ],
            examples: [
              {
                description: 'Register webhook for all gate events',
                command: 'specforge webhook register --url https://example.com/webhook --events "gate.*"',
              },
              {
                description: 'Register webhook with secret',
                command: 'specforge webhook register --url https://example.com/webhook --events "permission.*" --secret my-secret-key',
              },
            ],
          },
          {
            name: 'list',
            description: 'List registered webhooks',
            examples: [
              {
                description: 'List all webhooks',
                command: 'specforge webhook list',
              },
            ],
          },
          {
            name: 'delete',
            description: 'Delete a webhook',
            parameters: [
              {
                name: 'id',
                type: 'string',
                required: true,
                description: 'Webhook ID',
              },
            ],
            examples: [
              {
                description: 'Delete a webhook',
                command: 'specforge webhook delete webhook-12345',
              },
            ],
          },
        ],
        troubleshooting: [
          {
            problem: 'Webhook not receiving events',
            solution: 'Check if URL is accessible from daemon. Test with `curl -X POST <url>`',
          },
          {
            problem: 'Webhook registration fails',
            solution: 'Ensure URL is valid and daemon can reach it. Check daemon logs for details.',
          },
        ],
      },
      {
        name: 'heal',
        description: 'Heal a work item',
        async: true,
        parameters: [
          {
            name: 'workItemId',
            type: 'string',
            required: true,
            description: 'Work item ID to heal',
          },
          {
            name: '--wait',
            type: 'boolean',
            required: false,
            description: 'Wait for heal to complete',
            aliases: ['-w'],
            default: false,
          },
          {
            name: '--timeout',
            type: 'number',
            required: false,
            description: 'Timeout in seconds for --wait',
            default: 300,
          },
        ],
        examples: [
          {
            description: 'Heal a work item',
            command: 'specforge heal workitem-12345',
            output: 'Job created: heal-12345\nUse "specforge job heal-12345" to check status.',
          },
          {
            description: 'Heal and wait for completion',
            command: 'specforge heal workitem-12345 --wait',
          },
        ],
        troubleshooting: [
          {
            problem: 'Heal fails',
            solution: 'Check if work item exists and is in a healable state. Use `specforge job list` to check status.',
          },
        ],
      },
      {
        name: 'config',
        description: 'Show or modify CLI configuration',
        examples: [
          {
            description: 'Show current configuration',
            command: 'specforge config',
          },
        ],
      },
      {
        name: 'version',
        description: 'Show CLI version',
        examples: [
          {
            description: 'Show version',
            command: 'specforge version',
          },
          {
            description: 'Show version in JSON format',
            command: 'specforge version --json',
          },
        ],
      },
    ],
  };

  return new HelpSystem(config);
}