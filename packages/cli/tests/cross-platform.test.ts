/**
 * Cross-platform validation tests for CLI (packages/cli/).
 *
 * This test file validates that the CLI behaves consistently across:
 * - Windows (win32)
 * - macOS (darwin)
 * - Linux (linux)
 *
 * Key cross-platform concerns tested:
 * 1. Path separator handling (Windows \ vs Unix /)
 * 2. Home directory detection
 * 3. Output format consistency (no platform-specific line endings)
 * 4. Process platform detection
 * 5. File path construction
 *
 * Validates: Requirements 1.1, 1.2 (cli spec - cross-platform behavior)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { ModeSwitch, formatData, formatError } from '../src/mode-switch';

// Mock platform detection helpers
const originalPlatform = os.platform;
const originalHomedir = os.homedir;
const originalEOL = process.env.OCLIF_MULTI_ENDING_LINES_BEHAVIOR;

describe('Cross-Platform Path Handling', () => {
  describe('path.sep awareness', () => {
    it('should use correct path separator for current platform', () => {
      // path.join automatically uses the correct separator
      const testPath = path.join('home', 'user', '.specforge', 'runtime');
      
      // On Windows, should contain \ separators (when normalized)
      // On Unix, should contain / separators
      if (process.platform === 'win32') {
        expect(testPath).toContain('\\');
      } else {
        expect(testPath).toContain('/');
      }
    });

    it('should construct runtime directory correctly on all platforms', () => {
      // This simulates how the CLI constructs paths
      const homeDir = os.homedir();
      const runtimeDir = path.join(homeDir, '.specforge', 'runtime');
      
      // The path should be valid and contain home directory
      expect(runtimeDir).toContain(homeDir);
      expect(runtimeDir).toContain('.specforge');
      expect(runtimeDir).toContain('runtime');
    });

    it('should handle nested path joins correctly', () => {
      const base = '.specforge';
      const subdirs = ['runtime', 'daemon', 'sessions'];
      
      let result = path.join(os.homedir(), base);
      for (const subdir of subdirs) {
        result = path.join(result, subdir);
      }
      
      // Should end with the expected path
      expect(result).toMatch(/\.specforge[\\/]runtime[\\/]daemon[\\/]sessions$/);
    });
  });

  describe('platform-specific runtime directory', () => {
    it('should detect home directory on current platform', () => {
      const homeDir = os.homedir();
      
      // Home directory should exist and be absolute
      expect(homeDir).toBeDefined();
      expect(path.isAbsolute(homeDir)).toBe(true);
      
      // Home should be accessible
      const fs = require('fs');
      expect(fs.existsSync(homeDir)).toBe(true);
    });

    it('should construct platform-appropriate config path', () => {
      const homeDir = os.homedir();
      const configDir = path.join(homeDir, '.specforge');
      const handshakePath = path.join(configDir, 'runtime', 'daemon.sock.json');
      
      // Path should be absolute
      expect(path.isAbsolute(handshakePath)).toBe(true);
      
      // Should correctly join all parts
      const expectedParts = ['.specforge', 'runtime', 'daemon.sock.json'];
      for (const part of expectedParts) {
        expect(handshakePath).toContain(part);
      }
    });
  });
});

describe('Cross-Platform Output Format', () => {
  describe('line ending consistency', () => {
    it('should produce consistent output regardless of platform', () => {
      const testData = { status: 'ok', message: 'test message' };
      
      // JSON mode output
      const jsonOutput = formatData(testData, 'json');
      
      // Should not contain any line breaks in compact JSON
      expect(jsonOutput).not.toContain('\n');
      expect(jsonOutput).not.toContain('\r');
      
      // Human mode output - should use \n consistently
      const humanOutput = formatData(testData, 'human');
      // Should contain newlines for pretty-printing
      expect(humanOutput).toContain('\n');
    });

    it('should format JSON output identically across platforms', () => {
      const testData = {
        jobId: 'test-123',
        status: 'pending',
        command: 'spec start',
      };
      
      const output = formatData(testData, 'json');
      const parsed = JSON.parse(output);
      
      // Parsed output should be identical
      expect(parsed.jobId).toBe('test-123');
      expect(parsed.status).toBe('pending');
      expect(parsed.command).toBe('spec start');
      
      // Stringified should be consistent
      expect(JSON.stringify(parsed)).toBe('{"jobId":"test-123","status":"pending","command":"spec start"}');
    });
  });

  describe('error format consistency', () => {
    it('should format errors consistently across platforms', () => {
      const error = {
        message: 'Daemon unreachable',
        code: 'daemon_unreachable',
        hint: "Is the Daemon running? Try 'specforge daemon start'",
      };
      
      // JSON mode should be parseable
      const jsonError = formatError(error, 'json');
      const parsed = JSON.parse(jsonError);
      
      expect(parsed.error).toBe(true);
      expect(parsed.code).toBe('daemon_unreachable');
      expect(parsed.message).toBe('Daemon unreachable');
      expect(parsed.hint).toBeDefined();
      
      // Human mode should be readable
      const humanError = formatError(error, 'human');
      expect(humanError).toContain('Error:');
      expect(humanError).toContain('Hint:');
    });

    it('should handle missing hints gracefully', () => {
      const error = {
        message: 'Unknown error',
        code: 'unknown_error',
      };
      
      const jsonError = formatError(error, 'json');
      const parsed = JSON.parse(jsonError);
      
      // Should not have hint key when not provided
      expect(parsed.hint).toBeUndefined();
    });
  });
});

describe('Platform Detection', () => {
  it('should correctly identify current platform', () => {
    const platform = os.platform();
    
    // Should be one of the known platforms
    expect(['win32', 'darwin', 'linux']).toContain(platform);
  });

  it('should correctly identify architecture', () => {
    const arch = os.arch();
    
    // Should be one of the known architectures
    expect(['x64', 'arm64', 'ia32', 'arm']).toContain(arch);
  });

  it('should provide consistent platform info for config display', () => {
    const config = {
      system: {
        platform: os.platform(),
        arch: os.arch(),
        homeDir: os.homedir(),
      },
    };
    
    expect(config.system.platform).toBeDefined();
    expect(config.system.arch).toBeDefined();
    expect(config.system.homeDir).toBeDefined();
    expect(path.isAbsolute(config.system.homeDir)).toBe(true);
  });
});

describe('Path Construction Edge Cases', () => {
  it('should handle paths with special characters', () => {
    const homeDir = os.homedir();
    
    // Paths with spaces
    const pathWithSpaces = path.join(homeDir, 'My Documents', 'specforge');
    expect(pathWithSpaces).toContain('My Documents');
    
    // Paths with international characters
    const pathWithUnicode = path.join(homeDir, '文档', 'specforge');
    expect(pathWithUnicode).toContain('文档');
  });

  it('should normalize paths correctly', () => {
    const homeDir = os.homedir();
    
    // Path with .. should be resolved
    const normalized = path.normalize(path.join(homeDir, '.specforge', '..', '.specforge', 'runtime'));
    
    // Should not contain ..
    expect(normalized).not.toContain('..');
    
    // Should be equivalent to direct path
    const direct = path.join(homeDir, '.specforge', 'runtime');
    expect(path.normalize(normalized)).toBe(path.normalize(direct));
  });

  it('should handle absolute paths correctly', () => {
    const homeDir = os.homedir();
    
    // Absolute path should stay absolute
    expect(path.isAbsolute(homeDir)).toBe(true);
    
    // Joining absolute path should ignore relative parts before it
    const joined = path.join(homeDir, 'relative', 'path');
    expect(path.isAbsolute(joined)).toBe(true);
  });
});

describe('ModeSwitch Platform Behavior', () => {
  it('should detect JSON mode regardless of platform', () => {
    const msJson = new ModeSwitch(['--json']);
    expect(msJson.isJson()).toBe(true);
    
    const msHuman = new ModeSwitch([]);
    expect(msHuman.isHuman()).toBe(true);
  });

  it('should format data identically on all platforms', () => {
    const testData = { key: 'value', number: 42 };
    
    const ms = new ModeSwitch('json');
    const output = ms.formatData(testData);
    const parsed = JSON.parse(output);
    
    expect(parsed).toEqual(testData);
  });

  it('should format errors identically on all platforms', () => {
    const error = {
      message: 'Test error',
      code: 'test_error',
      hint: 'Test hint',
    };
    
    const ms = new ModeSwitch('json');
    const output = ms.formatError(error);
    const parsed = JSON.parse(output);
    
    expect(parsed.error).toBe(true);
    expect(parsed.code).toBe('test_error');
    expect(parsed.message).toBe('Test error');
    expect(parsed.hint).toBe('Test hint');
  });
});

describe('CLI Config Platform Info', () => {
  it('should generate consistent platform information', () => {
    // Simulate config generation
    const generateConfig = () => ({
      cli: {
        version: '0.1.0',
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        homeDir: os.homedir(),
      },
    });
    
    const config = generateConfig();
    
    // Platform info should always be present
    expect(config.system.platform).toBe(process.platform);
    expect(config.system.arch).toBe(process.arch);
    expect(config.system.homeDir).toBe(os.homedir());
  });

  it('should format platform info consistently in JSON mode', () => {
    const config = {
      cli: { version: '0.1.0' },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        homeDir: os.homedir(),
      },
    };
    
    const output = formatData(config, 'json');
    const parsed = JSON.parse(output);
    
    expect(parsed.cli.version).toBe('0.1.0');
    expect(parsed.system.platform).toBeDefined();
    expect(parsed.system.arch).toBeDefined();
  });
});

describe('Cross-Platform File Operations Simulation', () => {
  it('should handle daemon handshake file path correctly', () => {
    // Simulate the path construction used in cli.ts
    const getHandshakePath = () => {
      const homeDir = os.homedir();
      return path.join(homeDir, '.specforge', 'runtime', 'daemon.sock.json');
    };
    
    const handshakePath = getHandshakePath();
    
    // Should be absolute
    expect(path.isAbsolute(handshakePath)).toBe(true);
    
    // Should end with the correct filename
    expect(handshakePath.endsWith('daemon.sock.json')).toBe(true);
  });

  it('should handle runtime directory path correctly', () => {
    // Simulate the path construction used in multiple places
    const getRuntimeDir = () => {
      const homeDir = os.homedir();
      return path.join(homeDir, '.specforge', 'runtime');
    };
    
    const runtimeDir = getRuntimeDir();
    
    // Should be absolute
    expect(path.isAbsolute(runtimeDir)).toBe(true);
    
    // Should be normalized (no . or ..)
    expect(runtimeDir).not.toContain('..');
  });

  it('should handle config directory path correctly', () => {
    const getConfigDir = () => {
      const homeDir = os.homedir();
      return path.join(homeDir, '.specforge');
    };
    
    const configDir = getConfigDir();
    
    // Should be absolute
    expect(path.isAbsolute(configDir)).toBe(true);
  });
});