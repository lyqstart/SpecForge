/**
 * Test Setup and Mock Configuration for CLI Testing
 * 
 * This file provides:
 * - Mock Daemon HTTP responses
 * - Test fixtures and utilities
 * - Common test setup/teardown logic
 * - Mock implementations of core components
 */

import { vi } from 'vitest';
import type { DaemonClient } from '../src/http/DaemonClient';
import type { JobTracker } from '../src/job/JobTracker';
import type { BlobHandler } from '../src/blob/BlobHandler';

/**
 * Mock Daemon HTTP Response Types
 */
export interface MockDaemonResponse {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
}

/**
 * Mock Daemon Configuration
 */
export interface MockDaemonConfig {
  baseURL?: string;
  token?: string;
  enableBlobHandling?: boolean;
  blobThreshold?: number;
}

/**
 * Mock Daemon Client for testing
 * Simulates HTTP responses without actual network calls
 */
export class MockDaemonClient {
  private responses: Map<string, MockDaemonResponse> = new Map();
  private requestLog: Array<{ method: string; path: string; body?: unknown }> = [];
  private config: MockDaemonConfig;

  constructor(config: MockDaemonConfig = {}) {
    this.config = {
      baseURL: 'http://127.0.0.1:3000',
      token: 'test-token-12345',
      enableBlobHandling: true,
      blobThreshold: 64 * 1024,
      ...config,
    };
  }

  /**
   * Register a mock response for a specific path
   */
  registerResponse(path: string, response: MockDaemonResponse): void {
    this.responses.set(path, response);
  }

  /**
   * Mock GET request
   */
  async get<T = unknown>(path: string): Promise<T> {
    this.requestLog.push({ method: 'GET', path });
    const response = this.responses.get(path);
    if (!response) {
      throw new Error(`No mock response registered for GET ${path}`);
    }
    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
    }
    return response.data as T;
  }

  /**
   * Mock POST request
   */
  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    this.requestLog.push({ method: 'POST', path, body });
    const response = this.responses.get(path);
    if (!response) {
      throw new Error(`No mock response registered for POST ${path}`);
    }
    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
    }
    return response.data as T;
  }

  /**
   * Mock PUT request
   */
  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    this.requestLog.push({ method: 'PUT', path, body });
    const response = this.responses.get(path);
    if (!response) {
      throw new Error(`No mock response registered for PUT ${path}`);
    }
    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
    }
    return response.data as T;
  }

  /**
   * Mock DELETE request
   */
  async delete<T = unknown>(path: string): Promise<T> {
    this.requestLog.push({ method: 'DELETE', path });
    const response = this.responses.get(path);
    if (!response) {
      throw new Error(`No mock response registered for DELETE ${path}`);
    }
    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
    }
    return response.data as T;
  }

  /**
   * Get request log for assertions
   */
  getRequestLog(): Array<{ method: string; path: string; body?: unknown }> {
    return [...this.requestLog];
  }

  /**
   * Clear request log
   */
  clearRequestLog(): void {
    this.requestLog = [];
  }

  /**
   * Get configuration
   */
  getConfig(): MockDaemonConfig {
    return { ...this.config };
  }

  /**
   * Clear all registered responses
   */
  clearResponses(): void {
    this.responses.clear();
  }
}

/**
 * Common Test Fixtures
 */
export const testFixtures = {
  /**
   * Sample daemon health check response
   */
  daemonHealthResponse: {
    status: 200,
    data: {
      status: 'healthy',
      version: '0.1.0',
      uptime: 3600,
      timestamp: Date.now(),
    },
  },

  /**
   * Sample async job response (pending)
   */
  asyncJobPendingResponse: {
    status: 200,
    data: {
      jobId: 'job-test-12345',
      status: 'pending',
      command: 'spec.create',
      createdAt: Date.now(),
    },
  },

  /**
   * Sample async job response (completed)
   */
  asyncJobCompletedResponse: {
    status: 200,
    data: {
      jobId: 'job-test-12345',
      status: 'completed',
      result: { specId: 'spec-123', name: 'Test Spec' },
      completedAt: Date.now(),
    },
  },

  /**
   * Sample async job response (failed)
   */
  asyncJobFailedResponse: {
    status: 200,
    data: {
      jobId: 'job-test-12345',
      status: 'failed',
      error: 'Spec creation failed: invalid name',
      failedAt: Date.now(),
    },
  },

  /**
   * Sample blob reference response
   */
  blobReferenceResponse: {
    status: 200,
    data: {
      content: 'blob://a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2',
    },
  },

  /**
   * Sample error response (401 Unauthorized)
   */
  unauthorizedResponse: {
    status: 401,
    data: {
      error: 'unauthorized',
      message: 'Invalid or missing authentication token',
    },
  },

  /**
   * Sample error response (404 Not Found)
   */
  notFoundResponse: {
    status: 404,
    data: {
      error: 'not_found',
      message: 'Resource not found',
    },
  },

  /**
   * Sample error response (500 Internal Server Error)
   */
  serverErrorResponse: {
    status: 500,
    data: {
      error: 'internal_server_error',
      message: 'An unexpected error occurred',
    },
  },

  /**
   * Sample webhook registration response
   */
  webhookRegistrationResponse: {
    status: 200,
    data: {
      webhookId: 'webhook-test-12345',
      url: 'https://example.com/webhook',
      events: ['gate.*', 'permission.denied'],
      enabled: true,
      createdAt: Date.now(),
    },
  },

  /**
   * Sample command list response
   */
  commandListResponse: {
    status: 200,
    data: {
      commands: [
        {
          name: 'daemon',
          description: 'Manage SpecForge Daemon',
          async: false,
        },
        {
          name: 'spec',
          description: 'Manage specifications',
          async: true,
        },
        {
          name: 'workflow',
          description: 'Manage workflows',
          async: true,
        },
      ],
    },
  },
};

/**
 * Test Utilities
 */
export const testUtils = {
  /**
   * Create a mock daemon client with default configuration
   */
  createMockDaemonClient(config?: MockDaemonConfig): MockDaemonClient {
    return new MockDaemonClient(config);
  },

  /**
   * Generate a random job ID
   */
  generateJobId(): string {
    return `job-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
  },

  /**
   * Generate a random session ID
   */
  generateSessionId(): string {
    return `session-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
  },

  /**
   * Generate a random blob reference
   */
  generateBlobReference(): string {
    const hex = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    return `blob://${hex}`;
  },

  /**
   * Create a large string (for testing blob conversion)
   */
  createLargeString(sizeKiB: number): string {
    const sizeBytes = sizeKiB * 1024;
    return 'x'.repeat(sizeBytes);
  },

  /**
   * Create a large object (for testing blob conversion)
   */
  createLargeObject(sizeKiB: number): Record<string, unknown> {
    const sizeBytes = sizeKiB * 1024;
    const content = 'x'.repeat(sizeBytes);
    return {
      data: content,
      metadata: {
        size: sizeBytes,
        timestamp: Date.now(),
      },
    };
  },

  /**
   * Wait for a condition to be true (with timeout)
   */
  async waitFor(
    condition: () => boolean,
    timeoutMs: number = 5000,
    intervalMs: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    while (!condition()) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  },

  /**
   * Create a mock async job status response
   */
  createJobStatusResponse(
    jobId: string,
    status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled',
    result?: unknown,
    error?: string
  ) {
    return {
      status: 200,
      data: {
        jobId,
        status,
        result,
        error,
        updatedAt: Date.now(),
      },
    };
  },

  /**
   * Create a mock command response
   */
  createCommandResponse(command: string, args?: unknown, async?: boolean) {
    return {
      status: 200,
      data: {
        command,
        args,
        async: async ?? false,
        timestamp: Date.now(),
      },
    };
  },
};

/**
 * Global Test Setup
 * Called before all tests
 */
export function setupGlobalTestEnvironment(): void {
  // Suppress console output during tests (optional)
  // vi.spyOn(console, 'log').mockImplementation(() => {});
  // vi.spyOn(console, 'error').mockImplementation(() => {});
}

/**
 * Global Test Teardown
 * Called after all tests
 */
export function teardownGlobalTestEnvironment(): void {
  // Clean up any global state
  vi.clearAllMocks();
}

/**
 * Per-Test Setup
 * Call this in beforeEach() to reset state
 */
export function setupTestCase(): void {
  // Reset any test-specific state
  vi.clearAllMocks();
}

/**
 * Per-Test Teardown
 * Call this in afterEach() to clean up
 */
export function teardownTestCase(): void {
  // Clean up test-specific resources
  vi.clearAllMocks();
}

/**
 * Export all utilities for convenient importing
 */
export default {
  MockDaemonClient,
  testFixtures,
  testUtils,
  setupGlobalTestEnvironment,
  teardownGlobalTestEnvironment,
  setupTestCase,
  teardownTestCase,
};
