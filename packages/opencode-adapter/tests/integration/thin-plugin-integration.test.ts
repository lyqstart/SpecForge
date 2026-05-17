/**
 * Integration Tests: ThinPluginClient Communication
 *
 * Tests the ThinPluginClient's integration with a simulated OpenCode
 * Thin Plugin server, including event reporting, session binding,
 * command execution, and error recovery scenarios.
 *
 * Requirements: 4.1, 4.2, 6.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ThinPluginClient,
  ThinPluginClientError,
  ThinPluginClientErrorCode,
} from '../../src/integration/ThinPluginClient';

/**
 * Mock server that simulates Thin Plugin behavior
 */
class MockThinPluginServer {
  private handlers: Map<string, (req: Request) => Promise<Response>> = new Map();
  private latencyMs = 0;
  private failureRate = 0;

  constructor() {
    this.setupHandlers();
  }

  private setupHandlers() {
    // Health check
    this.handlers.set('/health', async () => {
      await this.simulateLatency();
      if (this.shouldFail()) {
        return new Response('Service Unavailable', { status: 503 });
      }
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    });

    // Event report
    this.handlers.set('/v1/ingest/event', async (req) => {
      await this.simulateLatency();
      if (this.shouldFail()) {
        return new Response('Internal Server Error', { status: 500 });
      }
      const body = await req.json();
      return new Response(
        JSON.stringify({
          event_id: `evt-${Date.now()}`,
          accepted: true,
          timestamp: Date.now(),
        }),
        { status: 200 }
      );
    });

    // Session bind
    this.handlers.set('/v1/session/bind', async (req) => {
      await this.simulateLatency();
      if (this.shouldFail()) {
        return new Response('Internal Server Error', { status: 500 });
      }
      const body = await req.json();
      return new Response(
        JSON.stringify({ bound: true, session_id: body.session_id }),
        { status: 200 }
      );
    });

    // Command
    this.handlers.set('/v1/command', async (req) => {
      await this.simulateLatency();
      if (this.shouldFail()) {
        return new Response('Internal Server Error', { status: 500 });
      }
      const body = await req.json();
      return new Response(
        JSON.stringify({
          result: { executed: true, command: body.command },
          output: `Command ${body.command} executed`,
        }),
        { status: 200 }
      );
    });
  }

  private async simulateLatency(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    }
  }

  private shouldFail(): boolean {
    return this.failureRate > 0 && Math.random() < this.failureRate;
  }

  setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  setFailureRate(rate: number): void {
    this.failureRate = rate;
  }

  async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const handler = this.handlers.get(url.pathname);
    if (!handler) {
      return new Response('Not Found', { status: 404 });
    }
    return handler(req);
  }
}

describe('Integration: ThinPluginClient with Mock Server', () => {
  let mockServer: MockThinPluginServer;
  let client: ThinPluginClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockServer = new MockThinPluginServer();
    
    // Create a fetch mock that routes to mock server
    fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      const req = new Request(url, options);
      return mockServer.handleRequest(req);
    });

    client = new ThinPluginClient({
      baseUrl: 'http://localhost:3000',
      timeout: 5000,
      maxRetries: 3,
      baseRetryDelay: 50,
      maxRetryDelay: 500,
      fetchFn: fetchMock,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('end-to-end event reporting', () => {
    it('should report event through full HTTP lifecycle', async () => {
      const result = await client.reportEvent({
        eventType: 'session.start',
        payload: { projectId: 'test-project', userId: 'user-1' },
        sessionId: 'session-abc123',
        spawnIntentId: 'intent-xyz789',
        timestamp: Date.now(),
      });

      expect(result.success).toBe(true);
      expect(result.eventId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      
      // Verify the request was made
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should include all required fields in event report', async () => {
      const timestamp = Date.now();
      
      await client.reportEvent({
        eventType: 'tool.called',
        payload: { toolName: 'sf_state_read', args: {} },
        sessionId: 'session-1',
        spawnIntentId: 'intent-1',
        timestamp,
        metadata: { traceId: 'trace-123' },
      });

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse((call[1] as RequestInit).body as string);
      
      expect(body.event_type).toBe('tool.called');
      expect(body.data).toEqual({ toolName: 'sf_state_read', args: {} });
      expect(body.sid).toBe('session-1');
      expect(body.spawn_intent_id).toBe('intent-1');
      expect(body.ts).toBe(timestamp);
      expect(body.metadata).toEqual({ traceId: 'trace-123' });
    });

    it('should handle batch event reporting', async () => {
      const events = [
        { type: 'session.start', payload: {} },
        { type: 'message.delta', payload: { chunk: 'Hello' } },
        { type: 'message.complete', payload: {} },
      ];

      const results = await Promise.all(
        events.map((evt) =>
          client.reportEvent({
            eventType: evt.type,
            payload: evt.payload,
            sessionId: 'session-batch',
            spawnIntentId: 'intent-batch',
          })
        )
      );

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('end-to-end session binding', () => {
    it('should bind session through full HTTP lifecycle', async () => {
      const result = await client.bindSession({
        spawnIntentId: 'intent-123',
        sessionId: 'session-456',
        agentRole: 'sf-orchestrator',
        metadata: { projectPath: '/workspace/test' },
      });

      expect(result.success).toBe(true);
      expect(result.spawnIntentId).toBe('intent-123');
      expect(result.sessionId).toBe('session-456');
      expect(result.bound).toBe(true);
    });

    it('should include agent role in bind request', async () => {
      await client.bindSession({
        spawnIntentId: 'intent-1',
        sessionId: 'session-1',
        agentRole: 'sf-designer',
      });

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse((call[1] as RequestInit).body as string);
      
      expect(body.agent_role).toBe('sf-designer');
    });
  });

  describe('end-to-end command execution', () => {
    it('should execute command through full HTTP lifecycle', async () => {
      const result = await client.sendCommand({
        command: 'cancel_session',
        sessionId: 'session-123',
        params: { reason: 'User requested' },
        timeout: 3000,
      });

      expect(result.success).toBe(true);
      expect(result.command).toBe('cancel_session');
      expect(result.sessionId).toBe('session-123');
      expect(result.output).toBeDefined();
    });

    it('should handle command with large payload', async () => {
      const largePayload = { data: 'x'.repeat(10000) };
      
      const result = await client.sendCommand({
        command: 'execute',
        sessionId: 'session-large',
        params: largePayload,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('error recovery and retry', () => {
    it('should recover from transient server errors', async () => {
      // First two requests fail, third succeeds
      let attempt = 0;
      const originalFetch = fetchMock.mockImplementation(async (url: string, opts?: RequestInit) => {
        attempt++;
        if (attempt <= 2) {
          return new Response('Error', { status: 500 });
        }
        return new Response(JSON.stringify({ accepted: true, event_id: 'evt-123' }), { status: 200 });
      });

      const result = await client.reportEvent({
        eventType: 'test',
        payload: {},
        sessionId: 'session-retry',
        spawnIntentId: 'intent-retry',
      });

      expect(result.success).toBe(true);
      expect(attempt).toBe(3);
    });

    it('should handle rate limiting (429) with retry', async () => {
      let attempt = 0;
      fetchMock.mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          return new Response('Too Many Requests', { 
            status: 429,
            headers: { 'Retry-After': '0' }
          });
        }
        return new Response(JSON.stringify({ accepted: true, event_id: 'evt-123' }), { status: 200 });
      });

      const result = await client.reportEvent({
        eventType: 'test',
        payload: {},
        sessionId: 'session-rate-limit',
        spawnIntentId: 'intent-rate-limit',
      });

      expect(result.success).toBe(true);
    });

    it('should fail gracefully after exhausting retries', async () => {
      fetchMock.mockResolvedValue(
        new Response('Service Unavailable', { status: 503 })
      );

      const fastClient = new ThinPluginClient({
        baseUrl: 'http://localhost:3000',
        maxRetries: 2,
        baseRetryDelay: 10,
        maxRetryDelay: 50,
        fetchFn: fetchMock,
      });

      await expect(
        fastClient.reportEvent({
          eventType: 'test',
          payload: {},
          sessionId: 'session-exhaust',
          spawnIntentId: 'intent-exhaust',
        })
      ).rejects.toThrow(ThinPluginClientError);

      // Should have made 3 attempts (1 initial + 2 retries)
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should not retry on client errors (4xx)', async () => {
      fetchMock.mockResolvedValue(
        new Response('Bad Request', { status: 400 })
      );

      await expect(
        client.reportEvent({
          eventType: 'test',
          payload: {},
          sessionId: 'session-client-error',
          spawnIntentId: 'intent-client-error',
        })
      ).rejects.toThrow(ThinPluginClientError);

      // Should only make 1 attempt for client errors
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('health check integration', () => {
    it('should perform health check and measure latency', async () => {
      const result = await client.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latency).toBeDefined();
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should report unhealthy when server is down', async () => {
      fetchMock.mockResolvedValue(
        new Response('Service Unavailable', { status: 503 })
      );

      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent event reports', async () => {
      const concurrentCount = 10;
      
      const results = await Promise.all(
        Array.from({ length: concurrentCount }, (_, i) =>
          client.reportEvent({
            eventType: 'message.delta',
            payload: { chunk: `part-${i}` },
            sessionId: 'session-concurrent',
            spawnIntentId: 'intent-concurrent',
          })
        )
      );

      expect(results).toHaveLength(concurrentCount);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should handle mixed operations concurrently', async () => {
      const operations = [
        client.healthCheck(),
        client.reportEvent({
          eventType: 'test',
          payload: {},
          sessionId: 'session-1',
          spawnIntentId: 'intent-1',
        }),
        client.bindSession({
          spawnIntentId: 'intent-2',
          sessionId: 'session-2',
          agentRole: 'test',
        }),
        client.sendCommand({
          command: 'ping',
          sessionId: 'session-3',
          params: {},
        }),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(4);
      expect(results[0].healthy).toBe(true);
      expect((results[1] as { success: boolean }).success).toBe(true);
      expect((results[2] as { success: boolean }).success).toBe(true);
      expect((results[3] as { success: boolean }).success).toBe(true);
    });
  });

  describe('timeout handling', () => {
    it('should handle slow server responses within timeout', async () => {
      mockServer.setLatency(100);
      
      const result = await client.reportEvent({
        eventType: 'test',
        payload: {},
        sessionId: 'session-slow',
        spawnIntentId: 'intent-slow',
      });

      expect(result.success).toBe(true);
    });

    it('should timeout on very slow responses', async () => {
      mockServer.setLatency(10000); // 10 second latency
      
      const quickClient = new ThinPluginClient({
        baseUrl: 'http://localhost:3000',
        timeout: 100, // 100ms timeout
        maxRetries: 0,
        fetchFn: fetchMock,
      });

      await expect(
        quickClient.reportEvent({
          eventType: 'test',
          payload: {},
          sessionId: 'session-timeout',
          spawnIntentId: 'intent-timeout',
        })
      ).rejects.toThrow(ThinPluginClientError);
    });
  });
});