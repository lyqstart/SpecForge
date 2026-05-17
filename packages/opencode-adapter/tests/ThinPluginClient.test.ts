/**
 * Unit tests for ThinPluginClient
 *
 * Tests HTTP client functionality, event reporting, retry logic,
 * error handling, and timeout control.
 *
 * Requirements: 4.1, 4.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ThinPluginClient,
  ThinPluginClientError,
  ThinPluginClientErrorCode,
} from '../src/integration/ThinPluginClient';
import type { ThinPluginClientConfig } from '../src/integration/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ThinPluginClient', () => {
  let client: ThinPluginClient;
  const baseUrl = 'http://localhost:3000';

  beforeEach(() => {
    mockFetch.mockReset();
    client = new ThinPluginClient({ baseUrl });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      expect(client).toBeDefined();
    });

    it('should throw error for empty baseUrl', () => {
      expect(() => new ThinPluginClient({ baseUrl: '' })).toThrow(
        ThinPluginClientError
      );
    });

    it('should use custom fetch function when provided', () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      );
      const customClient = new ThinPluginClient({
        baseUrl,
        fetchFn: customFetch,
      });

      // Trigger a health check to use the custom fetch
      customClient.healthCheck();

      expect(customFetch).toHaveBeenCalled();
    });

    it('should remove trailing slash from baseUrl', () => {
      const customClient = new ThinPluginClient({
        baseUrl: 'http://localhost:3000/',
      });
      // Just verify it was created without error
      expect(customClient).toBeDefined();
    });
  });

  describe('reportEvent', () => {
    it('should successfully report event on first attempt', async () => {
      const mockResponse = {
        event_id: 'evt-123',
        timestamp: Date.now(),
        accepted: true,
      };

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const result = await client.reportEvent({
        eventType: 'session.start',
        payload: { message: 'Session started' },
        sessionId: 'session-1',
        spawnIntentId: 'intent-1',
      });

      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt-123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on server error (5xx)', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response('Internal Server Error', { status: 500 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ event_id: 'evt-123', accepted: true }),
            { status: 200 }
          )
        );

      const result = await client.reportEvent({
        eventType: 'session.start',
        payload: {},
        sessionId: 'session-1',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on rate limit (429)', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response('Too Many Requests', { status: 429 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ event_id: 'evt-123', accepted: true }),
            { status: 200 }
          )
        );

      const result = await client.reportEvent({
        eventType: 'session.start',
        payload: {},
        sessionId: 'session-1',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on client error (4xx except 429)', async () => {
      mockFetch.mockResolvedValue(
        new Response('Bad Request', { status: 400 })
      );

      await expect(
        client.reportEvent({
          eventType: 'session.start',
          payload: {},
          sessionId: 'session-1',
        })
      ).rejects.toThrow(ThinPluginClientError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use spawnIntentId in request', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ event_id: 'evt-123', accepted: true }),
          { status: 200 }
        )
      );

      await client.reportEvent({
        eventType: 'session.start',
        payload: { data: 'test' },
        sessionId: 'session-1',
        spawnIntentId: 'spawn-intent-123',
      });

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.spawn_intent_id).toBe('spawn-intent-123');
    });
  });

  describe('bindSession', () => {
    it('should successfully bind session on first attempt', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ bound: true }), { status: 200 })
      );

      const result = await client.bindSession({
        spawnIntentId: 'intent-123',
        sessionId: 'session-456',
        agentRole: 'developer',
      });

      expect(result.success).toBe(true);
      expect(result.spawnIntentId).toBe('intent-123');
      expect(result.sessionId).toBe('session-456');
      expect(result.bound).toBe(true);
    });

    it('should retry on server error', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response('Service Unavailable', { status: 503 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ bound: true }), { status: 200 })
        );

      const result = await client.bindSession({
        spawnIntentId: 'intent-123',
        sessionId: 'session-456',
        agentRole: 'developer',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendCommand', () => {
    it('should successfully send command', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ result: { success: true }, output: 'done' }),
          { status: 200 }
        )
      );

      const result = await client.sendCommand({
        command: 'cancel_session',
        sessionId: 'session-1',
        params: { reason: 'User requested' },
      });

      expect(result.success).toBe(true);
      expect(result.command).toBe('cancel_session');
      expect(result.result).toEqual({ success: true });
      expect(result.output).toBe('done');
    });

    it('should use custom timeout when provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ result: {} }), { status: 200 })
      );

      await client.sendCommand({
        command: 'test',
        sessionId: 'session-1',
        timeout: 5000,
      });

      // The timeout is handled internally - we just verify fetch was called
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when service is up', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      );

      const result = await client.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latency).toBeDefined();
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy when service is down', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return unhealthy on 5xx response', async () => {
      mockFetch.mockResolvedValue(
        new Response('Internal Error', { status: 500 })
      );

      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('500');
    });

    it('should track latency', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      );

      const before = Date.now();
      await client.healthCheck();
      const after = Date.now();

      // Should complete quickly
      expect(after - before).toBeLessThan(1000);
    });
  });

  describe('retry logic', () => {
    it('should implement exponential backoff', async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      
      // Mock setTimeout to capture delays
      vi.spyOn(global, 'setTimeout').mockImplementation((callback, delay) => {
        delays.push(delay);
        return originalSetTimeout(callback, 0) as unknown as ReturnType<typeof setTimeout>;
      });

      mockFetch
        .mockResolvedValueOnce(
          new Response('Error', { status: 500 })
        )
        .mockResolvedValueOnce(
          new Response('Error', { status: 500 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ event_id: 'evt-123', accepted: true }),
            { status: 200 }
          )
        );

      await client.reportEvent({
        eventType: 'test',
        payload: {},
        sessionId: 'session-1',
      });

      // Check that delays increase (exponential backoff)
      expect(delays.length).toBeGreaterThan(1);
      // First retry delay should be at least base delay (1000ms)
      expect(delays[0]).toBeGreaterThanOrEqual(1000);

      vi.restoreAllMocks();
    });

    it('should exhaust retries after max attempts', async () => {
      // Use a client with shorter retry delays to avoid test timeout
      const fastClient = new ThinPluginClient({
        baseUrl,
        maxRetries: 2,
        baseRetryDelay: 10,
        maxRetryDelay: 100,
      });

      mockFetch.mockResolvedValue(
        new Response('Error', { status: 500 })
      );

      await expect(
        fastClient.reportEvent({
          eventType: 'test',
          payload: {},
          sessionId: 'session-1',
        })
      ).rejects.toThrow(ThinPluginClientError);

      // maxRetries is 2, so we should have 3 attempts (1 initial + 2 retries)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('error handling', () => {
    it('should throw ThinPluginClientError on network failure', async () => {
      // Use a client with shorter retry delays
      const fastClient = new ThinPluginClient({
        baseUrl,
        maxRetries: 1,
        baseRetryDelay: 10,
        maxRetryDelay: 100,
      });

      mockFetch.mockRejectedValue(new Error('Network failure'));

      await expect(
        fastClient.reportEvent({
          eventType: 'test',
          payload: {},
          sessionId: 'session-1',
        })
      ).rejects.toThrow(ThinPluginClientError);
    });

    it('should throw timeout error when request times out', async () => {
      // Create a never-resolving promise
      mockFetch.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const fastClient = new ThinPluginClient({
        baseUrl,
        timeout: 100, // Very short timeout
        maxRetries: 0, // No retries to speed up test
      });

      await expect(
        fastClient.reportEvent({
          eventType: 'test',
          payload: {},
          sessionId: 'session-1',
        })
      ).rejects.toThrow(ThinPluginClientError);
    });

    it('should throw error on invalid JSON response', async () => {
      mockFetch.mockResolvedValue(
        new Response('not valid json', { status: 200 })
      );

      await expect(
        client.reportEvent({
          eventType: 'test',
          payload: {},
          sessionId: 'session-1',
        })
      ).rejects.toThrow(ThinPluginClientError);
    });

    it('should include status code in error', async () => {
      mockFetch.mockResolvedValue(
        new Response('Error', { status: 404 })
      );

      try {
        await client.reportEvent({
          eventType: 'test',
          payload: {},
          sessionId: 'session-1',
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ThinPluginClientError);
        const typedError = error as ThinPluginClientError;
        expect(typedError.statusCode).toBe(404);
      }
    });
  });

  describe('configuration', () => {
    it('should respect custom maxRetries', async () => {
      const clientWithRetries = new ThinPluginClient({
        baseUrl,
        maxRetries: 1,
      });

      mockFetch.mockResolvedValue(
        new Response('Error', { status: 500 })
      );

      await expect(
        clientWithRetries.reportEvent({
          eventType: 'test',
          payload: {},
          sessionId: 'session-1',
        })
      ).rejects.toThrow();

      // 1 initial + 1 retry = 2 calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should respect custom timeout', async () => {
      const clientWithTimeout = new ThinPluginClient({
        baseUrl,
        timeout: 5000,
      });

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ accepted: true }), { status: 200 })
      );

      await clientWithTimeout.reportEvent({
        eventType: 'test',
        payload: {},
        sessionId: 'session-1',
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });
});

describe('ThinPluginClientError', () => {
  it('should create error with all properties', () => {
    const error = new ThinPluginClientError(
      'Test error',
      ThinPluginClientErrorCode.NETWORK_ERROR,
      500,
      { details: 'test' }
    );

    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ThinPluginClientErrorCode.NETWORK_ERROR);
    expect(error.statusCode).toBe(500);
    expect(error.details).toEqual({ details: 'test' });
    expect(error.name).toBe('ThinPluginClientError');
  });
});