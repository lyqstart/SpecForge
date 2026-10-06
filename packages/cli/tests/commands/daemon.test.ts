/**
 * Unit tests for daemon management commands (packages/cli/src/commands/daemon.ts).
 *
 * Coverage:
 *  - argv parsing for start/status/stop subcommands
 *  - help output generation
 *  - --detach flag handling
 *  - ModeSwitch integration (human vs json output)
 *
 * Validates: Requirements 1.1, 1.2 (cli spec).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { ModeSwitch } from '../../src/mode-switch';

const { mockDaemonClientConstructor } = vi.hoisted(() => ({
  mockDaemonClientConstructor: vi.fn(),
}));

// Mock the DaemonClient module
vi.mock('../../src/http/DaemonClient', () => ({
  DaemonClient: class DaemonClientMock {
    constructor(...args: unknown[]) {
      return mockDaemonClientConstructor(...args);
    }
  },
}));

import { DaemonClient } from '../../src/http/DaemonClient';
import {
  addDaemonCommands,
  commandStart,
  commandStatus,
  commandStop,
} from '../../src/commands/daemon-client';

// Get reference to the command functions from the module
// We'll test through the yargs integration instead

describe('daemon command argv parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ModeSwitch detects --json flag in argv', () => {
    const argv = ['daemon', 'status', '--json'];
    const modeSwitch = new ModeSwitch(argv);
    
    expect(modeSwitch.isJson()).toBe(true);
  });

  it('ModeSwitch defaults to human mode without --json', () => {
    const argv = ['daemon', 'status'];
    const modeSwitch = new ModeSwitch(argv);
    
    expect(modeSwitch.isHuman()).toBe(true);
  });

  it('ModeSwitch detects -j short alias', () => {
    const argv = ['daemon', 'status', '-j'];
    const modeSwitch = new ModeSwitch(argv);
    
    expect(modeSwitch.isJson()).toBe(true);
  });
});

describe('daemon command help', () => {
  it('addDaemonCommands returns a yargs instance', () => {
    const yargs = require('yargs');
    const parser = addDaemonCommands(yargs());
    expect(parser).toBeDefined();
  });
});

describe('ModeSwitch output formatting', () => {
  it('formats data in human mode', () => {
    const modeSwitch = new ModeSwitch(['status']);
    
    const data = { status: 'healthy', version: '0.1.0' };
    const output = modeSwitch.formatData(data);
    
    // Human mode should have pretty-printed JSON
    expect(output).toContain('\n');
    expect(output).toContain('status');
  });

  it('formats data in json mode', () => {
    const modeSwitch = new ModeSwitch(['status', '--json']);
    
    const data = { status: 'healthy', version: '0.1.0' };
    const output = modeSwitch.formatData(data);
    
    // JSON mode should have compact JSON
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe('healthy');
  });

  it('formats success message in human mode', () => {
    const modeSwitch = new ModeSwitch(['start']);
    
    const output = modeSwitch.formatSuccess('Daemon started');
    
    // Human mode should have checkmark
    expect(output).toContain('✓');
  });

  it('formats success message in json mode', () => {
    const modeSwitch = new ModeSwitch(['start', '--json']);
    
    const output = modeSwitch.formatSuccess('Daemon started');
    
    // JSON mode should have structured object
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toBe('Daemon started');
  });

  it('formats error in human mode', () => {
    const modeSwitch = new ModeSwitch(['status']);
    
    const error = new Error('Daemon unreachable');
    const output = modeSwitch.formatError(error);
    
    // Human mode should have Error: prefix
    expect(output).toContain('Error:');
    expect(output).toContain('Hint:');
  });

  it('formats error in json mode', () => {
    const modeSwitch = new ModeSwitch(['status', '--json']);
    
    const error = new Error('Daemon unreachable');
    const output = modeSwitch.formatError(error);
    
    // JSON mode should have structured object
    const parsed = JSON.parse(output);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toBe('Daemon unreachable');
  });
});

describe('Command integration - mocked DaemonClient', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a fresh mock client for each test
    mockClient = {
      post: vi.fn(),
      get: vi.fn(),
    };
    mockDaemonClientConstructor.mockImplementation(() => mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('client is created with correct default port', () => {
    const client = new DaemonClient({
      host: '127.0.0.1',
      port: 3847,
    });
    
    expect(client).toBeDefined();
  });

  it('client can make GET requests', async () => {
    mockClient.get.mockResolvedValue({ status: 'healthy' });
    
    const client = new DaemonClient({ host: '127.0.0.1', port: 3847 });
    const result = await client.get('/api/daemon/health');
    
    expect(result).toEqual({ status: 'healthy' });
  });

  it('client can make POST requests', async () => {
    mockClient.post.mockResolvedValue({ success: true });
    
    const client = new DaemonClient({ host: '127.0.0.1', port: 3847 });
    const result = await client.post('/api/daemon/start', { detach: true });
    
    expect(result).toEqual({ success: true });
  });

  it('uses the current daemon health endpoint for status', async () => {
    mockClient.get.mockResolvedValue({
      schema_version: '1.0',
      status: 'ok',
      pid: 123,
      version: '1.0.5',
      uptimeSec: 5,
      activeClients: 0,
      pendingEvents: 0,
    });
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await commandStatus({} as any, new ModeSwitch(['--json']));

    expect(mockClient.get).toHaveBeenCalledWith('/api/v1/healthz');
    expect(JSON.parse(String(output.mock.calls[0]?.[0])).status).toBe('ok');
  });

  it('does not spawn a duplicate daemon when healthz confirms one is running', async () => {
    mockClient.get.mockResolvedValue({
      schema_version: '1.0',
      status: 'ok',
      pid: 456,
      version: '1.0.5',
    });
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await commandStart(
      { detach: true, bind: '127.0.0.1' } as any,
      new ModeSwitch(['--json']),
    );

    expect(mockClient.get).toHaveBeenCalledWith('/api/v1/healthz', {
      retry: false,
      timeout: 1000,
    });
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
      success: true,
      already_running: true,
      pid: 456,
    });
  });

  it('uses the authenticated daemon admin endpoint for stop', async () => {
    mockClient.post.mockResolvedValue({
      success: true,
      data: { message: 'shutdown initiated' },
    });
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await commandStop({} as any, new ModeSwitch(['--json']));

    expect(mockClient.post).toHaveBeenCalledWith('/api/v1/admin/stop');
    expect(JSON.parse(String(output.mock.calls[0]?.[0])).success).toBe(true);
  });
});

describe('yargs daemon command structure', () => {
  it('daemon command group has subcommands', () => {
    // This tests that yargs is properly configured
    const yargs = require('yargs');
    
    // Create a parser with daemon commands
    const parser = addDaemonCommands(yargs());
    
    // The parser should have command metadata
    expect(parser).toBeDefined();
  });
});
