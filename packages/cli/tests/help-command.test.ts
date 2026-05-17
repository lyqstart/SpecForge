/**
 * Help Command Tests
 * 
 * Tests for the help command integration with yargs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { addHelpCommands } from '../src/commands/help';
import { ModeSwitch } from '../src/mode-switch';

// Mock console.log and console.error
const mockConsoleLog = vi.fn();
const mockConsoleError = vi.fn();
const mockProcessExit = vi.fn();

describe('Help Command Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(mockConsoleLog);
    vi.spyOn(console, 'error').mockImplementation(mockConsoleError);
    vi.spyOn(process, 'exit').mockImplementation(mockProcessExit);
    process.argv = ['node', 'cli.js'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Help Command', () => {
    it('should show general help when no command specified', async () => {
      const parser = yargs(['help'])
        .options({
          json: { type: 'boolean', default: false },
        })
        .command('help [command] [subcommand]', 'Show help information', () => {}, () => {
          // This would be called by the actual command handler
          const modeSwitch = new ModeSwitch([]);
          expect(modeSwitch.isHuman()).toBe(true);
        });

      addHelpCommands(parser);

      await parser.parse();
      
      // The middleware should handle --help flag
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it('should show command-specific help', async () => {
      const parser = yargs(['help', 'daemon'])
        .options({
          json: { type: 'boolean', default: false },
        })
        .command('help [command] [subcommand]', 'Show help information', () => {}, () => {
          const modeSwitch = new ModeSwitch([]);
          expect(modeSwitch.isHuman()).toBe(true);
        });

      addHelpCommands(parser);

      await parser.parse();
    });

    it('should handle --help flag for specific command', async () => {
      const parser = yargs(['daemon', '--help'])
        .options({
          json: { type: 'boolean', default: false },
          help: { type: 'boolean', default: true },
        });

      addHelpCommands(parser);

      // The middleware should intercept --help and exit
      await parser.parse();
      
      // Should have called process.exit(0)
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should handle --version flag', async () => {
      const parser = yargs(['--version'])
        .options({
          json: { type: 'boolean', default: false },
          version: { type: 'boolean', default: true },
        });

      addHelpCommands(parser);

      await parser.parse();
      
      // Should have called process.exit(0)
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should handle JSON mode with --json flag', async () => {
      const parser = yargs(['--help', '--json'])
        .options({
          json: { type: 'boolean', default: true },
          help: { type: 'boolean', default: true },
        });

      addHelpCommands(parser);

      await parser.parse();
      
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown commands with suggestions', async () => {
      const parser = yargs(['unknown-command'])
        .options({
          json: { type: 'boolean', default: false },
        })
        .fail((msg, err) => {
          expect(msg).toBeDefined();
          // The fail handler should call our suggestion logic
        });

      addHelpCommands(parser);

      await parser.parse();
      
      // Should have called process.exit(1)
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle validation errors', async () => {
      const parser = yargs(['daemon']) // Missing subcommand
        .options({
          json: { type: 'boolean', default: false },
        })
        .command('daemon', 'Manage daemon', (yargs) => {
          return yargs.demandCommand(1, 'Specify a daemon subcommand');
        }, () => {})
        .fail((msg, err) => {
          expect(msg).toContain('Specify a daemon subcommand');
        });

      addHelpCommands(parser);

      await parser.parse();
      
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('ModeSwitch Integration', () => {
    it('should format errors correctly in human mode', () => {
      const modeSwitch = new ModeSwitch('human');
      const error = new Error('Test error');
      const formatted = modeSwitch.formatError(error);
      
      expect(formatted).toContain('Error: Test error');
    });

    it('should format errors correctly in JSON mode', () => {
      const modeSwitch = new ModeSwitch('json');
      const error = new Error('Test error');
      const formatted = modeSwitch.formatError(error);
      const parsed = JSON.parse(formatted);
      
      expect(parsed.error).toBe(true);
      expect(parsed.code).toBeDefined();
      expect(parsed.message).toBe('Test error');
    });

    it('should format data correctly in human mode', () => {
      const modeSwitch = new ModeSwitch('human');
      const data = { test: 'value' };
      const formatted = modeSwitch.formatData(data);
      
      expect(formatted).toContain('test');
      expect(formatted).toContain('value');
    });

    it('should format data correctly in JSON mode', () => {
      const modeSwitch = new ModeSwitch('json');
      const data = { test: 'value' };
      const formatted = modeSwitch.formatData(data);
      const parsed = JSON.parse(formatted);
      
      expect(parsed.test).toBe('value');
    });

    it('should format success messages correctly', () => {
      const modeSwitch = new ModeSwitch('human');
      const formatted = modeSwitch.formatSuccess('Operation completed');
      
      expect(formatted).toContain('✓ Operation completed');
    });
  });
});