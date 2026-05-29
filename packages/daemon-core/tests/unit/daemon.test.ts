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
    await daemon.start();
    expect(daemon.isDaemonRunning()).toBe(true);
    
    await daemon.stop();
    expect(daemon.isDaemonRunning()).toBe(false);
  }, 30_000);

  it('should broadcast events', async () => {
    await daemon.start();
    
    const event = {
      eventId: '1',
      ts: Date.now(),
      projectId: 'test',
      category: 'session',
      action: 'test.event',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };
    
    await daemon.broadcastEvent(event);
  }, 30_000);
});
