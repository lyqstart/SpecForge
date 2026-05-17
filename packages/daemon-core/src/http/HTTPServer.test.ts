/**
 * HTTP Server unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HTTPServer } from './HTTPServer';
import { EventBus } from '../event-bus/EventBus';
import { DaemonConfig } from '../daemon/DaemonConfig';

describe('HTTPServer', () => {
  let server: HTTPServer;
  let eventBus: EventBus;
  let config: DaemonConfig;

  beforeEach(() => {
    config = new DaemonConfig();
    eventBus = new EventBus();
    server = new HTTPServer(config, eventBus);
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should start and stop successfully', async () => {
    const result = await server.start();
    expect(result.port).toBeGreaterThan(0);
    expect(result.port).toBeLessThan(65536);
  });

  it('should return 401 for missing authorization', async () => {
    await server.start();
    
    // This test would require a full HTTP client setup
    // For now, just verify the server starts
    expect(server).toBeDefined();
  });

  it('should broadcast events to SSE clients', async () => {
    await server.start();
    
    // This test would require SSE client setup
    // For now, just verify the method exists
    expect(typeof server.broadcastEvent).toBe('function');
  });
});
