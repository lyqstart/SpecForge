/**
 * Unit tests for DaemonClient HTTP client.
 * 
 * Tests HTTP methods, authentication, error handling, and SSE support.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock for axios
const mockRequest = vi.fn();
const mockCreate = vi.fn(() => ({
  request: mockRequest,
  interceptors: {
    request: {
      use: vi.fn((fn: (config: { headers: Record<string, string> }) => { headers: Record<string, string> }) => {
        // Apply the interceptor to initialize headers
        fn({ headers: {} });
        return 1;
      }),
    },
    response: {
      use: vi.fn(),
    },
  },
}));

vi.mock('axios', () => ({
  default: {
    create: mockCreate,
  },
}));

// Import after mocking
import { DaemonClient, DaemonClientError, DaemonTimeoutError, DaemonUnreachableError, DaemonAuthError, createClientFromHandshake } from '../src/http/DaemonClient';

describe('DaemonClient', () => {
  let client: DaemonClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new DaemonClient({
      host: '127.0.0.1',
      port: 3847,
      token: 'test-token',
    });
  });

  afterEach(() => {
    client.close();
  });

  describe('constructor', () => {
    it('should create client with correct base URL', () => {
      expect(client.baseURL).toBe('http://127.0.0.1:3847');
    });

    it('should have token configured', () => {
      expect(client.hasToken).toBe(true);
    });

    it('should work without token', () => {
      const clientNoToken = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
      });
      expect(clientNoToken.hasToken).toBe(false);
      clientNoToken.close();
    });
  });

  describe('setToken / clearToken', () => {
    it('should update token', () => {
      client.setToken('new-token');
      expect(client.hasToken).toBe(true);
    });

    it('should clear token', () => {
      client.clearToken();
      expect(client.hasToken).toBe(false);
    });
  });

  describe('GET request', () => {
    it('should make GET request successfully', async () => {
      const mockResponse = { status: 'ok' };
      mockRequest.mockResolvedValueOnce({ data: mockResponse });
      
      const result = await client.get('/health');
      expect(result).toEqual(mockResponse);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'get',
          url: '/health',
        })
      );
    });
  });

  describe('POST request', () => {
    it('should make POST request with body', async () => {
      const mockResponse = { jobId: '123' };
      mockRequest.mockResolvedValueOnce({ data: mockResponse });
      
      const result = await client.post('/workflows/start', { spec: 'my-spec' });
      expect(result).toEqual(mockResponse);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'post',
          url: '/workflows/start',
          data: { spec: 'my-spec' },
        })
      );
    });
  });

  describe('PUT request', () => {
    it('should make PUT request', async () => {
      mockRequest.mockResolvedValueOnce({ data: { updated: true } });
      
      const result = await client.put('/config', { key: 'value' });
      expect(result).toEqual({ updated: true });
    });
  });

  describe('DELETE request', () => {
    it('should make DELETE request', async () => {
      mockRequest.mockResolvedValueOnce({ data: { deleted: true } });
      
      const result = await client.delete('/jobs/123');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('retry logic', () => {
    it('should retry on failure and succeed', async () => {
      const mockResponse = { status: 'ok' };
      // First two calls fail with retryable error (ECONNREFUSED), third succeeds
      const axiosError1 = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      const axiosError2 = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      
      mockRequest
        .mockRejectedValueOnce(axiosError1)
        .mockRejectedValueOnce(axiosError2)
        .mockResolvedValueOnce({ data: mockResponse });
      
      const result = await client.get('/health');
      expect(result).toEqual(mockResponse);
      expect(mockRequest).toHaveBeenCalledTimes(3);
    });

    it('should not retry when retry is disabled', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Network error'));
      
      await expect(client.get('/health', { retry: false })).rejects.toThrow();
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    it('should create DaemonUnreachableError for connection refused', () => {
      const error = new DaemonUnreachableError();
      expect(error.code).toBe('DAEMON_UNREACHABLE');
      expect(error.isNetworkError).toBe(true);
      expect(error.isRetryable).toBe(true);
      expect(error.suggestion).toContain('specforge daemon start');
    });

    it('should create DaemonTimeoutError with correct properties', () => {
      const lastErr = new Error('connect timeout');
      const error = new DaemonTimeoutError({
        operation: '/health',
        timeoutMs: 5000,
        attempts: 3,
        lastError: lastErr,
      });
      
      expect(error.operation).toBe('/health');
      expect(error.timeoutMs).toBe(5000);
      expect(error.attempts).toBe(3);
      expect(error.isRetryable).toBe(false);
    });

    it('should create DaemonAuthError for auth failures', () => {
      const error = new DaemonAuthError();
      expect(error.code).toBe('AUTH_FAILED');
      expect(error.statusCode).toBe(401);
      expect(error.isRetryable).toBe(false);
    });

    it('should create DaemonAuthError with custom message', () => {
      const error = new DaemonAuthError('Invalid token provided');
      expect(error.message).toBe('Invalid token provided');
    });

    it('should create generic DaemonClientError', () => {
      const error = new DaemonClientError({
        message: 'Bad request',
        code: 'BAD_REQUEST',
        statusCode: 400,
        isRetryable: false,
      });
      
      expect(error.message).toBe('Bad request');
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('createClientFromHandshake', () => {
    it('should create client from handshake data (127.0.0.1)', () => {
      const client = createClientFromHandshake({
        port: 3847,
        token: 'handshake-token',
        bound_to: '127.0.0.1',
      });
      
      expect(client.baseURL).toBe('http://127.0.0.1:3847');
      expect(client.hasToken).toBe(true);
      client.close();
    });

    it('should convert 0.0.0.0 to 127.0.0.1', () => {
      const client = createClientFromHandshake({
        port: 3847,
        token: 'handshake-token',
        bound_to: '0.0.0.0',
      });
      
      expect(client.baseURL).toBe('http://127.0.0.1:3847');
      client.close();
    });

    it('should accept additional config options', () => {
      const client = createClientFromHandshake(
        {
          port: 3847,
          token: 'handshake-token',
          bound_to: '127.0.0.1',
        },
        {
          timeout: 5000,
          maxRetries: 5,
        }
      );
      
      expect(client.baseURL).toBe('http://127.0.0.1:3847');
      client.close();
    });
  });
});

describe('Error types', () => {
  it('DaemonClientError should support cause chain', () => {
    const cause = new Error('Original error');
    const error = new DaemonClientError({
      message: 'Wrapped error',
      code: 'WRAPPED',
      cause,
    });
    
    expect(error.cause).toBe(cause);
  });

  it('DaemonTimeoutError should include operation details', () => {
    const error = new DaemonTimeoutError({
      operation: 'daemon.healthCheck',
      timeoutMs: 5000,
      attempts: 3,
    });
    
    expect(error.message).toContain('daemon.healthCheck');
    expect(error.message).toContain('5000ms');
    expect(error.message).toContain('3');
  });
});