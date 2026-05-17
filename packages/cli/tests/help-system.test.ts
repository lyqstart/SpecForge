/**
 * Help System Tests
 * 
 * Tests for the user-friendly help system including:
 * - Command-specific help generation
 * - Examples formatting
 * - Interactive mode hints and suggestions
 * - Dual-mode output (interactive and JSON)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HelpSystem, createDefaultHelpSystem, CommandDefinition } from '../src/help/HelpSystem';
import { ModeSwitch } from '../src/mode-switch';

describe('HelpSystem', () => {
  let helpSystem: HelpSystem;

  beforeEach(() => {
    helpSystem = createDefaultHelpSystem();
  });

  describe('General Help', () => {
    it('should generate general help in interactive mode', () => {
      const modeSwitch = new ModeSwitch('human');
      const helpText = helpSystem.generateGeneralHelp(modeSwitch);
      
      expect(helpText).toContain('SpecForge v0.1.0');
      expect(helpText).toContain('Usage: specforge <command> [options]');
      expect(helpText).toContain('Available commands:');
      expect(helpText).toContain('daemon');
      expect(helpText).toContain('Manage the SpecForge daemon');
      expect(helpText).toContain('Global options:');
      expect(helpText).toContain('--json');
      expect(helpText).toContain('Output in JSON format');
    });

    it('should generate general help in JSON mode', () => {
      const modeSwitch = new ModeSwitch('json');
      const helpText = helpSystem.generateGeneralHelp(modeSwitch);
      const parsed = JSON.parse(helpText);
      
      expect(parsed.appName).toBe('SpecForge');
      expect(parsed.version).toBe('0.1.0');
      expect(Array.isArray(parsed.commands)).toBe(true);
      expect(parsed.commands.length).toBeGreaterThan(0);
      expect(Array.isArray(parsed.globalFlags)).toBe(true);
      
      const daemonCommand = parsed.commands.find((cmd: any) => cmd.name === 'daemon');
      expect(daemonCommand).toBeDefined();
      expect(daemonCommand.description).toBe('Manage the SpecForge daemon');
    });
  });

  describe('Command-Specific Help', () => {
    it('should generate help for daemon command in interactive mode', () => {
      const modeSwitch = new ModeSwitch('human');
      const helpText = helpSystem.generateCommandHelp('daemon', modeSwitch);
      
      expect(helpText).toContain('daemon - Manage the SpecForge daemon');
      expect(helpText).toContain('Subcommands:');
      expect(helpText).toContain('start');
      expect(helpText).toContain('Start the daemon');
      expect(helpText).toContain('stop');
      expect(helpText).toContain('Stop the daemon');
      expect(helpText).toContain('Examples:');
      expect(helpText).toContain('Troubleshooting:');
    });

    it('should generate help for daemon command in JSON mode', () => {
      const modeSwitch = new ModeSwitch('json');
      const helpText = helpSystem.generateCommandHelp('daemon', modeSwitch);
      const parsed = JSON.parse(helpText);
      
      expect(parsed.command).toBe('daemon');
      expect(parsed.description).toBe('Manage the SpecForge daemon');
      expect(Array.isArray(parsed.subcommands)).toBe(true);
      expect(parsed.subcommands.length).toBeGreaterThan(0);
      expect(Array.isArray(parsed.examples)).toBe(true);
      expect(Array.isArray(parsed.troubleshooting)).toBe(true);
    });

    it('should generate help for daemon start subcommand in interactive mode', () => {
      const modeSwitch = new ModeSwitch('human');
      const helpText = helpSystem.generateCommandHelp('daemon', modeSwitch, 'start');
      
      expect(helpText).toContain('daemon start - Start the daemon');
      expect(helpText).toContain('Options:');
      expect(helpText).toContain('--detach');
      expect(helpText).toContain('Run in background');
      expect(helpText).toContain('Examples:');
      expect(helpText).toContain('specforge daemon start');
    });

    it('should generate help for daemon start subcommand in JSON mode', () => {
      const modeSwitch = new ModeSwitch('json');
      const helpText = helpSystem.generateCommandHelp('daemon', modeSwitch, 'start');
      const parsed = JSON.parse(helpText);
      
      expect(parsed.command).toBe('daemon');
      expect(parsed.subcommand).toBe('start');
      expect(parsed.description).toBe('Start the daemon');
      expect(Array.isArray(parsed.parameters)).toBe(true);
      expect(Array.isArray(parsed.examples)).toBe(true);
    });

    it('should return error for unknown command', () => {
      const modeSwitch = new ModeSwitch('human');
      const helpText = helpSystem.generateCommandHelp('unknown', modeSwitch);
      
      expect(helpText).toContain('Error: Command "unknown" not found');
    });

    it('should return error for unknown subcommand', () => {
      const modeSwitch = new ModeSwitch('human');
      const helpText = helpSystem.generateCommandHelp('daemon', modeSwitch, 'unknown');
      
      expect(helpText).toContain('Error: Subcommand "unknown" not found for command "daemon"');
    });
  });

  describe('Command Suggestions', () => {
    it('should generate suggestions for misspelled commands in interactive mode', () => {
      const modeSwitch = new ModeSwitch('human');
      const suggestions = helpSystem.generateSuggestions('dameon', modeSwitch);
      
      expect(suggestions).toContain('Command "dameon" not found.');
      expect(suggestions).toContain('Did you mean one of these?');
      expect(suggestions).toContain('daemon');
    });

    it('should generate suggestions for misspelled commands in JSON mode', () => {
      const modeSwitch = new ModeSwitch('json');
      const suggestions = helpSystem.generateSuggestions('dameon', modeSwitch);
      const parsed = JSON.parse(suggestions);
      
      expect(parsed.input).toBe('dameon');
      expect(Array.isArray(parsed.suggestions)).toBe(true);
      expect(parsed.suggestions).toContain('daemon');
    });

    it('should handle no suggestions found', () => {
      const modeSwitch = new ModeSwitch('human');
      const suggestions = helpSystem.generateSuggestions('xyz123', modeSwitch);
      
      expect(suggestions).toContain('Command "xyz123" not found.');
      expect(suggestions).toContain('Use "specforge --help" to see available commands.');
    });
  });

  describe('Custom Configuration', () => {
    it('should work with custom command configuration', () => {
      const customConfig: CommandDefinition = {
        name: 'test',
        description: 'Test command',
        async: true,
        parameters: [
          {
            name: '--flag',
            type: 'boolean',
            required: false,
            description: 'Test flag',
            default: false,
          },
        ],
        examples: [
          {
            description: 'Test example',
            command: 'specforge test --flag',
          },
        ],
        troubleshooting: [
          {
            problem: 'Test problem',
            solution: 'Test solution',
          },
        ],
      };

      const customHelpSystem = new HelpSystem({
        appName: 'TestApp',
        version: '1.0.0',
        globalFlags: [],
        commands: [customConfig],
      });

      const modeSwitch = new ModeSwitch('human');
      const helpText = customHelpSystem.generateCommandHelp('test', modeSwitch);
      
      expect(helpText).toContain('test - Test command');
      expect(helpText).toContain('(This is an asynchronous command)');
      expect(helpText).toContain('Options:');
      expect(helpText).toContain('--flag');
      expect(helpText).toContain('Test flag');
      expect(helpText).toContain('Examples:');
      expect(helpText).toContain('Test example');
      expect(helpText).toContain('Troubleshooting:');
      expect(helpText).toContain('Test problem');
      expect(helpText).toContain('Test solution');
    });
  });

  describe('Levenshtein Distance', () => {
    it('should calculate correct Levenshtein distances', () => {
      // Access private method through any cast for testing
      const helpSystemAny = helpSystem as any;
      
      expect(helpSystemAny.levenshteinDistance('', '')).toBe(0);
      expect(helpSystemAny.levenshteinDistance('a', '')).toBe(1);
      expect(helpSystemAny.levenshteinDistance('', 'a')).toBe(1);
      expect(helpSystemAny.levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(helpSystemAny.levenshteinDistance('saturday', 'sunday')).toBe(3);
      expect(helpSystemAny.levenshteinDistance('daemon', 'dameon')).toBe(2);
    });
  });

  describe('Mode Detection', () => {
    it('should detect JSON mode from argv', () => {
      const modeSwitch = new ModeSwitch(['--json']);
      expect(modeSwitch.isJson()).toBe(true);
      expect(modeSwitch.isHuman()).toBe(false);
    });

    it('should detect human mode by default', () => {
      const modeSwitch = new ModeSwitch([]);
      expect(modeSwitch.isJson()).toBe(false);
      expect(modeSwitch.isHuman()).toBe(true);
    });

    it('should detect JSON mode with -j alias', () => {
      const modeSwitch = new ModeSwitch(['-j']);
      expect(modeSwitch.isJson()).toBe(true);
    });
  });
});