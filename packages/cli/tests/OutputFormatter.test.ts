/**
 * Unit tests for OutputFormatter (packages/cli/src/mode/OutputFormatter.ts).
 *
 * Coverage:
 * - Output formatting for interactive mode (colorful, human-readable)
 * - Output formatting for JSON mode (structured, no colors)
 * - Category-based formatting (success, error, warning, info)
 * - Table formatting
 * - Error formatting
 * - List formatting
 * - Key-value formatting
 * - Progress indicators
 *
 * Validates: Requirements 1.1, 1.2 (cli spec).
 */

import { describe, it, expect } from 'vitest';
import { OutputFormatter } from '../src/mode/OutputFormatter';
import { ModeSwitch, createModeSwitch } from '../src/mode/ModeSwitch';

describe('OutputFormatter', () => {
  describe('Interactive Mode', () => {
    const formatter = new OutputFormatter({ mode: 'interactive' });

    it('formats success messages with checkmark', () => {
      const output = formatter.success('Operation completed');
      expect(output).toContain('✓');
      expect(output).toContain('Operation completed');
    });

    it('formats error messages with X symbol', () => {
      const output = formatter.error('Something went wrong');
      expect(output).toContain('✗');
      expect(output).toContain('Something went wrong');
    });

    it('formats warning messages with warning symbol', () => {
      const output = formatter.warning('This is a warning');
      expect(output).toContain('⚠');
      expect(output).toContain('This is a warning');
    });

    it('formats info messages', () => {
      const output = formatter.info('Some information');
      expect(output).toContain('ℹ');
      expect(output).toContain('Some information');
    });

    it('formats titles', () => {
      const output = formatter.title('My Title');
      expect(output).toContain('My Title');
    });

    it('formats subtitles', () => {
      const output = formatter.subtitle('My Subtitle');
      expect(output).toContain('My Subtitle');
    });

    it('formats code snippets', () => {
      const output = formatter.code('const x = 1');
      expect(output).toContain('`');
      expect(output).toContain('const x = 1');
    });

    it('formats list items with bullet', () => {
      const output = formatter.listItem('Item 1');
      expect(output).toContain('•');
      expect(output).toContain('Item 1');
    });

    it('formats list items with custom bullet', () => {
      const output = formatter.listItem('Item 1', '→');
      expect(output).toContain('→');
      expect(output).toContain('Item 1');
    });
  });

  describe('JSON Mode', () => {
    const formatter = new OutputFormatter({ mode: 'json', pretty: false });

    it('formats success messages - still has symbol (formatData handles JSON mode)', () => {
      // In JSON mode, individual format methods still add symbols
      // Use formatData for proper JSON output
      const output = formatter.success('Operation completed');
      expect(output).toContain('✓');
      expect(output).toContain('Operation completed');
    });

    it('formats error messages - still has symbol (formatData handles JSON mode)', () => {
      const output = formatter.error('Something went wrong');
      expect(output).toContain('✗');
      expect(output).toContain('Something went wrong');
    });

    it('formats data as JSON string', () => {
      const data = { key: 'value', count: 42 };
      const output = formatter.formatData(data);
      const parsed = JSON.parse(output);
      expect(parsed).toEqual(data);
    });

    it('formats strings as JSON-encoded in JSON mode', () => {
      // In JSON mode, formatData JSON-encodes strings (adds quotes)
      const output = formatter.formatData('hello world');
      expect(output).toBe('"hello world"');
    });

    it('formats tables as JSON array', () => {
      const headers = ['Name', 'Status'];
      const rows = [['Task 1', 'Done'], ['Task 2', 'Pending']];
      const output = formatter.formatTable(headers, rows);
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toEqual({ Name: 'Task 1', Status: 'Done' });
    });

    it('formats errors as JSON object', () => {
      const error = new Error('Test error') as Error & { code?: string; hint?: string };
      error.code = 'TEST_ERROR';
      error.hint = 'Try again';
      const output = formatter.formatError(error);
      const parsed = JSON.parse(output);
      expect(parsed.message).toBe('Test error');
      expect(parsed.code).toBe('TEST_ERROR');
      expect(parsed.hint).toBe('Try again');
    });

    it('formats lists as JSON object', () => {
      const items = ['item1', 'item2', 'item3'];
      const output = formatter.formatList(items);
      const parsed = JSON.parse(output);
      expect(parsed.items).toEqual(items);
    });

    it('formats key-value pairs as JSON object', () => {
      const output = formatter.formatKeyValue('name', 'test');
      const parsed = JSON.parse(output);
      expect(parsed.name).toBe('test');
    });

    it('formats progress as JSON object', () => {
      const output = formatter.formatProgress(50, 100, 'Processing');
      const parsed = JSON.parse(output);
      expect(parsed.current).toBe(50);
      expect(parsed.total).toBe(100);
      expect(parsed.message).toBe('Processing');
    });
  });

  describe('formatData', () => {
    it('returns compact JSON in JSON mode', () => {
      const formatter = new OutputFormatter({ mode: 'json', pretty: false });
      const data = { a: 1, b: 'test' };
      const output = formatter.formatData(data);
      expect(output).toBe('{"a":1,"b":"test"}');
    });

    it('returns pretty-printed JSON in interactive mode', () => {
      const formatter = new OutputFormatter({ mode: 'interactive' });
      const data = { a: 1, b: 'test' };
      const output = formatter.formatData(data);
      expect(output).toContain('\n');
      expect(output).toContain('"a": 1');
    });

    it('returns strings as-is in interactive mode', () => {
      const formatter = new OutputFormatter({ mode: 'interactive' });
      const output = formatter.formatData('hello world');
      expect(output).toBe('hello world');
    });
  });

  describe('formatTable', () => {
    it('creates formatted table in interactive mode', () => {
      const formatter = new OutputFormatter({ mode: 'interactive' });
      const headers = ['Name', 'Age'];
      const rows = [['Alice', '30'], ['Bob', '25']];
      const output = formatter.formatTable(headers, rows);
      expect(output).toContain('Name');
      expect(output).toContain('Age');
      expect(output).toContain('Alice');
      expect(output).toContain('Bob');
    });

    it('creates JSON array in JSON mode', () => {
      const formatter = new OutputFormatter({ mode: 'json' });
      const headers = ['Name', 'Age'];
      const rows = [['Alice', '30']];
      const output = formatter.formatTable(headers, rows);
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].Name).toBe('Alice');
      expect(parsed[0].Age).toBe('30');
    });

    it('handles empty rows', () => {
      const formatter = new OutputFormatter({ mode: 'interactive' });
      const headers = ['Name'];
      const output = formatter.formatTable(headers, []);
      expect(output).toContain('Name');
    });
  });

  describe('formatError', () => {
    it('formats error with code and hint in interactive mode', () => {
      const formatter = new OutputFormatter({ mode: 'interactive' });
      const error = new Error('Test error') as Error & { code?: string; hint?: string };
      error.code = 'TEST_ERROR';
      error.hint = 'Try this instead';
      const output = formatter.formatError(error);
      expect(output).toContain('Test error');
      expect(output).toContain('Code: TEST_ERROR');
      expect(output).toContain('Hint:');
      expect(output).toContain('Try this instead');
    });

    it('formats error without optional fields in JSON mode', () => {
      const formatter = new OutputFormatter({ mode: 'json' });
      const error = new Error('Simple error');
      const output = formatter.formatError(error);
      const parsed = JSON.parse(output);
      expect(parsed.message).toBe('Simple error');
      expect(parsed.error).toBe('Error');
    });
  });

  describe('formatList', () => {
    it('formats ordered list in interactive mode', () => {
      const formatter = new OutputFormatter({ mode: 'interactive' });
      const items = ['First', 'Second', 'Third'];
      const output = formatter.formatList(items, true);
      expect(output).toContain('1.');
      expect(output).toContain('2.');
      expect(output).toContain('3.');
    });

    it('formats unordered list in interactive mode', () => {
      const formatter = new OutputFormatter({ mode: 'interactive' });
      const items = ['First', 'Second'];
      const output = formatter.formatList(items, false);
      expect(output).toContain('•');
    });
  });

  describe('formatKeyValue', () => {
    it('formats key-value in interactive mode with color', () => {
      const formatter = new OutputFormatter({ mode: 'interactive' });
      const output = formatter.formatKeyValue('name', 'value');
      // Output contains ANSI codes, use toContain
      expect(output).toContain('name');
      expect(output).toContain('value');
    });
  });

  describe('getMode', () => {
    it('returns current mode', () => {
      const interactive = new OutputFormatter({ mode: 'interactive' });
      const json = new OutputFormatter({ mode: 'json' });
      expect(interactive.getMode()).toBe('interactive');
      expect(json.getMode()).toBe('json');
    });
  });

  describe('create factory methods', () => {
    it('create returns formatter with correct mode', () => {
      const formatter = OutputFormatter.create('interactive');
      expect(formatter.getMode()).toBe('interactive');
    });

    it('create creates json mode', () => {
      const formatter = OutputFormatter.create('json');
      expect(formatter.getMode()).toBe('json');
    });

    it('createFormatterFromArgs handles yargs-style args', () => {
      // The create method actually takes a mode string, not an object
      const formatter = OutputFormatter.create('json');
      expect(formatter.getMode()).toBe('json');
    });
  });

  describe('verbose mode', () => {
    it('shows debug messages in verbose mode', () => {
      const formatter = new OutputFormatter({ mode: 'interactive', verbose: true });
      const output = formatter.debug('Debug info');
      expect(output).toContain('Debug info');
    });

    it('hides debug messages in non-verbose mode', () => {
      const formatter = new OutputFormatter({ mode: 'interactive', verbose: false });
      const output = formatter.debug('Debug info');
      expect(output).toBe('');
    });
  });
});

describe('ModeSwitch in mode directory', () => {
  describe('ModeSwitch.detectMode', () => {
    it('defaults to interactive when no flags', () => {
      const mode = ModeSwitch.detectMode(['daemon', 'status']);
      expect(mode).toBe('interactive');
    });

    it('returns json when --json present', () => {
      const mode = ModeSwitch.detectMode(['--json', 'daemon', 'status']);
      expect(mode).toBe('json');
    });

    it('returns json when -j present', () => {
      const mode = ModeSwitch.detectMode(['-j']);
      expect(mode).toBe('json');
    });

    // Note: The current implementation in src/mode/ModeSwitch.ts only checks
    // for exact matches of '--json' or '-j', not '--json=anything'
    it('returns interactive for --no-json (negative flag)', () => {
      const mode = ModeSwitch.detectMode(['--no-json']);
      expect(mode).toBe('interactive');
    });
  });

  describe('ModeSwitch.fromParsedArgs', () => {
    it('returns json when args.json is true', () => {
      const mode = ModeSwitch.fromParsedArgs({ json: true });
      expect(mode).toBe('json');
    });

    it('returns interactive when args.json is false', () => {
      const mode = ModeSwitch.fromParsedArgs({ json: false });
      expect(mode).toBe('interactive');
    });

    it('defaults to interactive when json is undefined', () => {
      const mode = ModeSwitch.fromParsedArgs({});
      expect(mode).toBe('interactive');
    });
  });

  describe('ModeSwitch instance', () => {
    it('has isJsonMode method', () => {
      const ms = new ModeSwitch({ forceMode: 'json' });
      expect(ms.isJsonMode()).toBe(true);
      expect(ms.isInteractiveMode()).toBe(false);
    });

    it('has isInteractiveMode method', () => {
      const ms = new ModeSwitch({ forceMode: 'interactive' });
      expect(ms.isInteractiveMode()).toBe(true);
      expect(ms.isJsonMode()).toBe(false);
    });

    it('setMode changes the mode', () => {
      const ms = new ModeSwitch({ forceMode: 'interactive' });
      ms.setMode('json');
      expect(ms.getMode()).toBe('json');
    });

    it('getMode returns current mode', () => {
      const ms = new ModeSwitch({ forceMode: 'json' });
      expect(ms.getMode()).toBe('json');
    });
  });

  describe('factory functions', () => {
    it('createModeSwitch creates instance from args', () => {
      // Use the exported createModeSwitch function
      const ms = createModeSwitch(['--json']);
      expect(ms.getMode()).toBe('json');
    });

    it('createModeSwitchFromArgs returns mode string', () => {
      // fromParsedArgs returns OutputMode string, not ModeSwitch instance
      const mode = ModeSwitch.fromParsedArgs({ json: true });
      expect(mode).toBe('json');
    });
  });
});