/**
 * Daemon integration tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Daemon } from '../../src/daemon/Daemon';

describe('Daemon', () => {
  let daemon: Daemon;

  beforeEach(() => {
    daemon = new Daemon();
  });

  afterEach(async () => {
    await daemon.stop();
  });

  it('should start and stop daemon', async () => {
    await expect(daemon.start()).resolves.not.toThrow();
    expect(daemon.isDaemonRunning()).toBe(true);
    
    await expect(daemon.stop()).resolves.not.toThrow();
    expect(daemon.isDaemonRunning()).toBe(false);
  });

  it('should broadcast events', async () => {
    await daemon.start();
    
    const event = {
      eventId: '1',
      ts: Date.now(),
      projectId: 'test',
      action: 'test.event',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };
    
    await expect(daemon.broadcastEvent(event)).resolves.not.toThrow();
  });
});
