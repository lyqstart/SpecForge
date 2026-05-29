/**
 * Daemon Configuration unit tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { PersonalPathResolver, EnterprisePathResolver } from '../../src/daemon/path-resolver';

describe('DaemonConfig', () => {
  // -----------------------------------------------------------------------
  // Env isolation helpers
  // -----------------------------------------------------------------------
  const SAVED_ENV: Record<string, string | undefined> = {};

  function saveEnv(key: string): void {
    SAVED_ENV[key] = process.env[key];
  }

  function restoreEnv(key: string): void {
    if (SAVED_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = SAVED_ENV[key];
    }
  }

  beforeEach(() => {
    saveEnv('SPECFORGE_MODE');
    saveEnv('SPECFORGE_INGEST_ENABLED');
  });

  afterEach(() => {
    restoreEnv('SPECFORGE_MODE');
    restoreEnv('SPECFORGE_INGEST_ENABLED');
  });

  // -----------------------------------------------------------------------
  // Constructor basics (existing tests, updated for delegation)
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('should create default configuration', () => {
      const config = new DaemonConfig();
      expect(config).toBeDefined();
    });

    it('should set correct runtime directory', () => {
      const config = new DaemonConfig();
      const runtimeDir = config.getRuntimeDir();

      expect(runtimeDir).toContain('.specforge');
      expect(runtimeDir).toContain('runtime');
    });

    it('should set correct handshake file path', () => {
      const config = new DaemonConfig();
      const handshakeFile = config.getHandshakeFile();

      expect(handshakeFile).toContain('.specforge');
      expect(handshakeFile).toContain('runtime');
      expect(handshakeFile).toContain('handshake.json');
    });

    it('should set max payload size to 64 KiB', () => {
      const config = new DaemonConfig();
      const maxPayload = config.getMaxPayloadSize();

      expect(maxPayload).toBe(64 * 1024);
    });

    it('should set schema version to 1.0', () => {
      const config = new DaemonConfig();
      const schemaVersion = config.getSchemaVersion();

      expect(schemaVersion).toBe('1.0');
    });
  });

  // -----------------------------------------------------------------------
  // parseStartOptions (existing)
  // -----------------------------------------------------------------------
  describe('parseStartOptions', () => {
    it('should detect --foreground flag', () => {
      const config = new DaemonConfig(['node', 'daemon.js', '--foreground']);

      expect(config.isForeground()).toBe(true);
    });

    it('should detect --no-foreground flag', () => {
      const config = new DaemonConfig(['node', 'daemon.js', '--no-foreground']);

      expect(config.isForeground()).toBe(false);
    });

    it('should default to foreground', () => {
      const config = new DaemonConfig(['node', 'daemon.js']);

      expect(config.isForeground()).toBe(true);
    });

    it('should handle multiple arguments', () => {
      const config = new DaemonConfig(['node', 'daemon.js', '--verbose', '--foreground', '--port', '3000']);

      expect(config.isForeground()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getters (existing, updated)
  // -----------------------------------------------------------------------
  describe('getters', () => {
    let config: DaemonConfig;

    beforeEach(() => {
      config = new DaemonConfig();
    });

    it('should return consistent runtime directory', () => {
      const dir1 = config.getRuntimeDir();
      const dir2 = config.getRuntimeDir();

      expect(dir1).toBe(dir2);
    });

    it('should return consistent handshake file', () => {
      const file1 = config.getHandshakeFile();
      const file2 = config.getHandshakeFile();

      expect(file1).toBe(file2);
    });
  });

  // -----------------------------------------------------------------------
  // Mode parsing (new)
  // -----------------------------------------------------------------------
  describe('mode parsing', () => {
    it('should default to personal when no args or env set', () => {
      delete process.env.SPECFORGE_MODE;
      const config = new DaemonConfig([]);
      expect(config.getMode()).toBe('personal');
    });

    it('should parse --mode personal from CLI', () => {
      delete process.env.SPECFORGE_MODE;
      const config = new DaemonConfig(['node', 'daemon.js', '--mode', 'personal']);
      expect(config.getMode()).toBe('personal');
    });

    it('should parse --mode enterprise from CLI', () => {
      delete process.env.SPECFORGE_MODE;
      const config = new DaemonConfig(['node', 'daemon.js', '--mode', 'enterprise']);
      expect(config.getMode()).toBe('enterprise');
    });

    it('should parse SPECFORGE_MODE=personal from env', () => {
      process.env.SPECFORGE_MODE = 'personal';
      const config = new DaemonConfig([]);
      expect(config.getMode()).toBe('personal');
    });

    it('should parse SPECFORGE_MODE=enterprise from env', () => {
      process.env.SPECFORGE_MODE = 'enterprise';
      const config = new DaemonConfig([]);
      expect(config.getMode()).toBe('enterprise');
    });

    it('should prefer CLI --mode over env SPECFORGE_MODE', () => {
      process.env.SPECFORGE_MODE = 'personal';
      const config = new DaemonConfig(['node', 'daemon.js', '--mode', 'enterprise']);
      expect(config.getMode()).toBe('enterprise');
    });

    it('should fall back to default when CLI --mode has no value after it', () => {
      delete process.env.SPECFORGE_MODE;
      const config = new DaemonConfig(['node', 'daemon.js', '--mode']);
      expect(config.getMode()).toBe('personal');
    });

    it('should fall back to default and warn when CLI --mode value is invalid', () => {
      delete process.env.SPECFORGE_MODE;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = new DaemonConfig(['node', 'daemon.js', '--mode', 'invalid_mode']);
      expect(config.getMode()).toBe('personal');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid mode "invalid_mode"'),
      );

      warnSpy.mockRestore();
    });

    it('should fall back to default and warn when SPECFORGE_MODE env is invalid', () => {
      process.env.SPECFORGE_MODE = 'invalid_mode';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = new DaemonConfig([]);
      expect(config.getMode()).toBe('personal');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid SPECFORGE_MODE="invalid_mode"'),
      );

      warnSpy.mockRestore();
    });

    it('should never throw on invalid mode (daemon must start successfully)', () => {
      delete process.env.SPECFORGE_MODE;
      // Invalid CLI value must not throw
      expect(() => new DaemonConfig(['node', 'daemon.js', '--mode', 'bogus'])).not.toThrow();
      // Invalid env value must not throw
      process.env.SPECFORGE_MODE = 'bogus';
      expect(() => new DaemonConfig([])).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // PathResolver factory (new)
  // -----------------------------------------------------------------------
  describe('getPathResolver', () => {
    it('should return PersonalPathResolver for personal mode', () => {
      delete process.env.SPECFORGE_MODE;
      const config = new DaemonConfig(['node', 'daemon.js', '--mode', 'personal']);
      expect(config.getPathResolver()).toBeInstanceOf(PersonalPathResolver);
    });

    it('should return EnterprisePathResolver for enterprise mode', () => {
      delete process.env.SPECFORGE_MODE;
      const config = new DaemonConfig(['node', 'daemon.js', '--mode', 'enterprise']);
      expect(config.getPathResolver()).toBeInstanceOf(EnterprisePathResolver);
    });

    it('should return PersonalPathResolver in default mode', () => {
      delete process.env.SPECFORGE_MODE;
      const config = new DaemonConfig([]);
      expect(config.getPathResolver()).toBeInstanceOf(PersonalPathResolver);
    });
  });

  // -----------------------------------------------------------------------
  // RuntimeDir / HandshakeFile delegation (new)
  // -----------------------------------------------------------------------
  describe('getRuntimeDir delegation', () => {
    it('should delegate to pathResolver.resolveDaemonRuntimeDir', () => {
      delete process.env.SPECFORGE_MODE;
      const config = new DaemonConfig(['node', 'daemon.js', '--mode', 'personal']);
      const direct = config.getPathResolver().resolveDaemonRuntimeDir();
      expect(config.getRuntimeDir()).toBe(direct);
    });
  });

  describe('getHandshakeFile delegation', () => {
    it('should delegate to pathResolver.resolveHandshakePath', () => {
      delete process.env.SPECFORGE_MODE;
      const config = new DaemonConfig(['node', 'daemon.js', '--mode', 'personal']);
      const direct = config.getPathResolver().resolveHandshakePath();
      expect(config.getHandshakeFile()).toBe(direct);
    });
  });

  // -----------------------------------------------------------------------
  // Feature flag: isIngestEnabled (new)
  // -----------------------------------------------------------------------
  describe('isIngestEnabled', () => {
    it('should default to true when SPECFORGE_INGEST_ENABLED is not set', () => {
      delete process.env.SPECFORGE_INGEST_ENABLED;
      const config = new DaemonConfig([]);
      expect(config.isIngestEnabled()).toBe(true);
    });

    it('should return true when SPECFORGE_INGEST_ENABLED=true', () => {
      process.env.SPECFORGE_INGEST_ENABLED = 'true';
      const config = new DaemonConfig([]);
      expect(config.isIngestEnabled()).toBe(true);
    });

    it('should return false when SPECFORGE_INGEST_ENABLED=false', () => {
      process.env.SPECFORGE_INGEST_ENABLED = 'false';
      const config = new DaemonConfig([]);
      expect(config.isIngestEnabled()).toBe(false);
    });

    it('should treat any non-"false" value as true', () => {
      process.env.SPECFORGE_INGEST_ENABLED = '0';
      const config = new DaemonConfig([]);
      expect(config.isIngestEnabled()).toBe(true);
    });
  });
});
