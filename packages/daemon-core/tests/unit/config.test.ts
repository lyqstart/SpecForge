/**
 * Daemon Configuration unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';

describe('DaemonConfig', () => {
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
      expect(handshakeFile).toContain('daemon.sock.json');
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
});