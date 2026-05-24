/**
 * E1 Integration Test — Daemon Lifecycle
 *
 * Tests:
 * - Daemon complete start/stop
 * - Handshake file created on start
 * - Handshake file removed on stop
 * - Port auto-assignment (port=0)
 * - Duplicate start rejected
 * - /health endpoint accessible without auth
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'http';
import * as fs from 'fs/promises';
import { Daemon } from '../../src/daemon/Daemon';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';

function httpGet(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('HTTP timeout')), 5000);
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { clearTimeout(timeout); resolve({ statusCode: res.statusCode ?? 0, body }); });
      res.on('error', (err) => { clearTimeout(timeout); reject(err); });
    }).on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

describe('E1 Daemon Lifecycle', () => {
  let daemon: Daemon;
  let config: DaemonConfig;

  beforeEach(async () => {
    daemon = new Daemon();
    config = new DaemonConfig();
  }, 30000);

  afterEach(async () => {
    if (daemon.isDaemonRunning()) {
      await daemon.stop();
    }
  }, 15000);

  it('should start and stop daemon cleanly', async () => {
    await daemon.start();
    expect(daemon.isDaemonRunning()).toBe(true);

    await daemon.stop();
    expect(daemon.isDaemonRunning()).toBe(false);
  });

  it('should create handshake file on start', async () => {
    await daemon.start();

    const handshakePath = config.getHandshakeFile();
    const content = await fs.readFile(handshakePath, 'utf-8');
    const handshake = JSON.parse(content);

    expect(typeof handshake.pid).toBe('number');
    expect(handshake.pid).toBeGreaterThan(0);
    expect(typeof handshake.port).toBe('number');
    expect(handshake.port).toBeGreaterThan(0);
    expect(typeof handshake.token).toBe('string');
    expect(handshake.token.length).toBeGreaterThan(0);
    expect(handshake.schemaVersion).toBe('1.0');

    await daemon.stop();
  });

  it('should remove handshake file on stop', async () => {
    await daemon.start();
    const handshakePath = config.getHandshakeFile();

    await fs.access(handshakePath);

    await daemon.stop();

    await expect(fs.access(handshakePath)).rejects.toThrow();
  });

  it('should auto-assign port (port=0)', async () => {
    await daemon.start();

    const handshakePath = config.getHandshakeFile();
    const content = await fs.readFile(handshakePath, 'utf-8');
    const handshake = JSON.parse(content);

    expect(handshake.port).toBeGreaterThan(0);
    expect(handshake.port).toBeLessThan(65536);

    await daemon.stop();
  });

  it('should reject duplicate start', async () => {
    await daemon.start();

    await expect(daemon.start()).rejects.toThrow('already running');

    await daemon.stop();
  });

  it('should serve /health without authentication', async () => {
    await daemon.start();

    const handshakePath = config.getHandshakeFile();
    const content = await fs.readFile(handshakePath, 'utf-8');
    const handshake = JSON.parse(content);
    const port = handshake.port as number;

    const { statusCode, body } = await httpGet(`http://127.0.0.1:${port}/health`);

    expect(statusCode).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe('ok');

    await daemon.stop();
  });
});
