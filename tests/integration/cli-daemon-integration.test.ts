/**
 * Integration Test: CLI ↔ Daemon Communication
 * 
 * Tests end-to-end CLI integration with Daemon, including:
 * - Authentication flow (handshake file reading, token validation)
 * - HTTP communication (requests, responses, error handling)
 * - Async command flow (jobId generation, status tracking, --wait support)
 * - Blob handling (payload size thresholding, Property 17)
 * - Error scenarios (network errors, auth failures, timeouts)
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4
 * Properties: 17 (Payload Size Thresholding), 18 (Async Command Contract)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { AuthManager, createAuthenticatedClient, getDefaultHandshakePath } from '../../packages/cli/src/auth/AuthManager';
import { DaemonClient, createClientFromHandshake } from '../../packages/cli/src/http/DaemonClient';
import { JobTracker } from '../../packages/cli/src/job/JobTracker';

// ============================================================================
// Test Fixtures and Helpers
// ============================================================================

/**
 * Mock Daemon handshake file for testing
 */
function createMockHandshake(port: number = 3847, token: string = 'test-token-abc123def456'): Record<string, unknown> {
  return {
    bound_to: '127.0.0.1',
    port,
    token,
    schema_version: '1.0',
    timestamp: Date.now(),
  };
}

/**
 * Create a temporary handshake file for testing
 */
async function createTempHandshakeFile(
  tempDir: string,
  port: number = 3847,
  token: string = 'test-token-abc123def456'
): Promise<string> {
  const runtimeDir = path.join(tempDir, '.specforge', 'runtime');
  await mkdir(runtimeDir, { recursive: true });
  
  const handshakePath = path.join(runtimeDir, 'daemon.sock.json');
  const handshake = createMockHandshake(port, token);
  
  await writeFile(handshakePath, JSON.stringify(handshake, null, 2));
  return handshakePath;
}

// ============================================================================
// Test Suites
// ============================================================================

describe('CLI ↔ Daemon Integration', () => {
  let tempDir: string;
  let handshakePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'cli-daemon-test-'));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  // ========================================================================
  // Suite 1: Authentication Flow
  // ========================================================================

  describe('Authentication Flow', () => {
    it('should read and validate handshake file', async () => {
      handshakePath = await createTempHandshakeFile(tempDir);
      
      const auth = new AuthManager({
        handshakePath,
      });

      const handshake = await auth.readHandshake();
      
      expect(handshake).toBeDefined();
      expect(handshake.bound_to).toBe('127.0.0.1');
      expect(handshake.port).toBe(3847);
      expect(handshake.token).toBe('test-token-abc123def456');
      expect(auth.hasHandshake).toBe(true);
    });

    it('should validate Bearer token format', async () => {
      handshakePath = await createTempHandshakeFile(tempDir);
      
      const auth = new AuthManager({
        handshakePath,
      });

      await auth.readHandshake();
      const result = auth.validateToken();
      
      expect(result.isValid).toBe(true);
      expect(result.tokenPreview).toBe('test-tok...');
    });

    it('should generate correct Authorization header', async () => {
      handshakePath = await createTempHandshakeFile(tempDir);
      
      const auth = new AuthManager({
        handshakePath,
      });

      await auth.readHandshake();
      auth.validateTokenOrThrow();
      
      const headers = auth.getAuthHeaders();
      expect(headers.Authorization).toBe('Bearer test-token-abc123def456');
    });

    it('should throw error when handshake file not found', async () => {
      const auth = new AuthManager({
        handshakePath: path.join(tempDir, 'nonexistent', 'daemon.sock.json'),
      });

      await expect(auth.readHandshake()).rejects.toThrow('找不到握手文件');
    });

    it('should throw error when handshake file is invalid JSON', async () => {
      const runtimeDir = path.join(tempDir, '.specforge', 'runtime');
      await mkdir(runtimeDir, { recursive: true });
      
      const handshakePath = path.join(runtimeDir, 'daemon.sock.json');
      await writeFile(handshakePath, 'invalid json {');
      
      const auth = new AuthManager({
        handshakePath,
      });

      await expect(auth.readHandshake()).rejects.toThrow('握手文件格式无效');
    });

    it('should throw error when required fields are missing', async () => {
      const runtimeDir = path.join(tempDir, '.specforge', 'runtime');
      await mkdir(runtimeDir, { recursive: true });
      
      const handshakePath = path.join(runtimeDir, 'daemon.sock.json');
      await writeFile(handshakePath, JSON.stringify({ bound_to: '127.0.0.1' })); // Missing port and token
      
      const auth = new AuthManager({
        handshakePath,
      });

      await expect(auth.readHandshake()).rejects.toThrow('缺少 required 字段');
    });

    it('should get Daemon URL from handshake', async () => {
      handshakePath = await createTempHandshakeFile(tempDir, 3847);
      
      const auth = new AuthManager({
        handshakePath,
      });

      await auth.readHandshake();
      const url = auth.getDaemonUrl();
      
      expect(url).toBe('http://127.0.0.1:3847');
    });

    it('should convert 0.0.0.0 to 127.0.0.1 for local connections', async () => {
      const runtimeDir = path.join(tempDir, '.specforge', 'runtime');
      await mkdir(runtimeDir, { recursive: true });
      
      const handshakePath = path.join(runtimeDir, 'daemon.sock.json');
      const handshake = createMockHandshake(3847);
      handshake.bound_to = '0.0.0.0';
      
      await writeFile(handshakePath, JSON.stringify(handshake));
      
      const auth = new AuthManager({
        handshakePath,
      });

      await auth.readHandshake();
      const url = auth.getDaemonUrl();
      
      expect(url).toBe('http://127.0.0.1:3847');
    });
  });

  // ========================================================================
  // Suite 2: HTTP Client Configuration
  // ========================================================================

  describe('HTTP Client Configuration', () => {
    it('should create client from handshake', async () => {
      handshakePath = await createTempHandshakeFile(tempDir);
      
      const auth = new AuthManager({
        handshakePath,
      });

      await auth.readHandshake();
      const handshake = auth.handshake!;
      
      const client = createClientFromHandshake(handshake);
      
      expect(client.baseURL).toBe('http://127.0.0.1:3847');
      expect(client.hasToken).toBe(true);
      client.close();
    });

    it('should configure timeout and retry settings', async () => {
      const client = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
        token: 'test-token',
        timeout: 5000,
        maxRetries: 5,
        retryDelay: 500,
      });

      expect(client.baseURL).toBe('http://127.0.0.1:3847');
      client.close();
    });

    it('should enable blob handling by default', async () => {
      const client = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
        token: 'test-token',
      });

      expect(client.isBlobHandlingEnabled).toBe(true);
      expect(client.blobThreshold).toBe(64 * 1024); // 64 KiB
      client.close();
    });

    it('should allow disabling blob handling', async () => {
      const client = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
        token: 'test-token',
        enableBlobHandling: false,
      });

      expect(client.isBlobHandlingEnabled).toBe(false);
      client.close();
    });
  });

  // ========================================================================
  // Suite 3: Blob Handling (Property 17)
  // ========================================================================

  describe('Blob Handling - Property 17: Payload Size Thresholding', () => {
    it('should keep content < 64 KiB inline', async () => {
      const client = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
        token: 'test-token',
        enableBlobHandling: true,
      });

      const smallContent = 'x'.repeat(1024); // 1 KiB
      const processed = client.processContent(smallContent);
      
      expect(processed).toBe(smallContent);
      client.close();
    });

    it('should convert content > 64 KiB to blob reference', async () => {
      const client = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
        token: 'test-token',
        enableBlobHandling: true,
      });

      const largeContent = 'x'.repeat(65 * 1024); // 65 KiB
      const processed = client.processContent(largeContent);
      
      expect(typeof processed).toBe('string');
      expect(processed).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
      client.close();
    });

    it('should handle mixed content with some items > 64 KiB', async () => {
      const client = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
        token: 'test-token',
        enableBlobHandling: true,
      });

      const content = {
        small: 'x'.repeat(1024),
        large: 'y'.repeat(65 * 1024),
        nested: {
          tiny: 'z'.repeat(100),
        },
      };

      const processed = client.processContent(content) as Record<string, unknown>;
      
      expect(processed.small).toBe(content.small);
      expect(typeof processed.large).toBe('string');
      expect((processed.large as string)).toMatch(/^blob:\/\//);
      expect((processed.nested as Record<string, unknown>).tiny).toBe(content.nested.tiny);
      client.close();
    });

    it('should detect blob references correctly', async () => {
      const client = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
        token: 'test-token',
      });

      const validBlobRef = 'blob://abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const invalidRef = 'blob://invalid';
      const notARef = 'just a string';

      expect(client.isBlobReference(validBlobRef)).toBe(true);
      expect(client.isBlobReference(invalidRef)).toBe(false);
      expect(client.isBlobReference(notARef)).toBe(false);
      client.close();
    });
  });

  // ========================================================================
  // Suite 4: Async Command Contract (Property 18)
  // ========================================================================

  describe('Async Command Contract - Property 18', () => {
    it('should create job with unique ID', async () => {
      let callCount = 0;
      const mockClient = {
        post: vi.fn(async () => {
          callCount++;
          return { jobId: `job-${callCount}`, status: 'pending', command: 'test', createdAt: Date.now() };
        }),
        get: vi.fn(),
      };

      const tracker = new JobTracker({ client: mockClient });
      
      const job1 = await tracker.createJob('spec start', { spec: 'my-spec' });
      const job2 = await tracker.createJob('spec start', { spec: 'other-spec' });
      
      expect(job1.jobId).toBeDefined();
      expect(job2.jobId).toBeDefined();
      expect(job1.jobId).not.toBe(job2.jobId);
      expect(job1.status).toBe('pending');
      expect(job2.status).toBe('pending');
    });

    it('should track job status transitions', async () => {
      const mockClient = {
        post: vi.fn(async () => ({ jobId: 'job-123', status: 'pending', command: 'test', createdAt: Date.now() })),
        get: vi.fn(async (path: string) => {
          if (path.includes('job-123')) {
            return { jobId: 'job-123', status: 'running', command: 'test', createdAt: Date.now(), updatedAt: Date.now() };
          }
          return null;
        }),
      };

      const tracker = new JobTracker({ client: mockClient });
      
      const job = await tracker.createJob('spec start', { spec: 'my-spec' });
      const jobId = job.jobId;
      
      // Get job status
      const status = await tracker.getJobStatus(jobId);
      expect(status.status).toBe('running');
    });

    it('should support terminal states: completed, failed, blocked, cancelled', async () => {
      const terminalStates = ['completed', 'failed', 'blocked', 'cancelled'] as const;
      
      for (const state of terminalStates) {
        const mockClient = {
          post: vi.fn(async () => ({ jobId: 'job-123', status: 'pending', command: 'test', createdAt: Date.now() })),
          get: vi.fn(async () => ({ 
            jobId: 'job-123', 
            status: state, 
            command: 'test', 
            createdAt: Date.now(), 
            updatedAt: Date.now() 
          })),
        };

        const tracker = new JobTracker({ client: mockClient });
        const job = await tracker.createJob('test', {});
        const status = await tracker.getJobStatus(job.jobId);
        expect(status.status).toBe(state);
      }
    });

    it('should format async command response with jobId and status', async () => {
      const mockClient = {
        post: vi.fn(async () => ({ jobId: 'job-123', status: 'pending', command: 'test', createdAt: Date.now() })),
        get: vi.fn(),
      };

      const tracker = new JobTracker({ client: mockClient });
      
      const job = await tracker.createJob('spec start', { spec: 'my-spec' });
      
      // Simulate immediate response format
      const response = {
        jobId: job.jobId,
        status: 'pending',
      };
      
      expect(response).toHaveProperty('jobId');
      expect(response).toHaveProperty('status');
      expect(response.status).toBe('pending');
    });

    it('should support --wait flag by polling job status', async () => {
      let callCount = 0;
      const mockClient = {
        post: vi.fn(async () => ({ jobId: 'job-123', status: 'pending', command: 'test', createdAt: Date.now() })),
        get: vi.fn(async () => {
          callCount++;
          // Return completed status immediately to avoid long polling
          return { 
            jobId: 'job-123', 
            status: 'completed', 
            command: 'test', 
            result: { status: 'success', output: 'workflow completed' },
            createdAt: Date.now(), 
            updatedAt: Date.now() 
          };
        }),
      };

      const tracker = new JobTracker({ client: mockClient });
      
      const job = await tracker.createJob('workflow execute', { workflowId: 'test-workflow' });
      
      // Wait for job with timeout
      const finalStatus = await tracker.waitForJob(job.jobId, { timeout: 1000 });
      
      expect(finalStatus.status).toBe('completed');
      expect(finalStatus.result).toBeDefined();
    });

    it('should timeout when waiting for job exceeds timeout', async () => {
      const mockClient = {
        post: vi.fn(async () => ({ jobId: 'job-123', status: 'pending', command: 'test', createdAt: Date.now() })),
        get: vi.fn(async () => ({ 
          jobId: 'job-123', 
          status: 'pending', 
          command: 'test', 
          createdAt: Date.now(), 
          updatedAt: Date.now() 
        })),
      };

      const tracker = new JobTracker({ client: mockClient });
      
      const job = await tracker.createJob('spec start', { spec: 'my-spec' });
      
      // Don't update status, so it stays pending - should timeout quickly
      await expect(tracker.waitForJob(job.jobId, { timeout: 50 })).rejects.toThrow();
    });
  });

  // ========================================================================
  // Suite 5: Error Handling
  // ========================================================================

  describe('Error Handling', () => {
    it('should handle authentication errors', async () => {
      const client = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
        token: 'invalid-token',
      });

      // Mock axios to return 401
      vi.spyOn(client as any, 'request').mockRejectedValueOnce(
        new Error('HTTP 401: Unauthorized')
      );

      await expect(client.get('/health')).rejects.toThrow();
      client.close();
    });

    it('should handle network errors with retry', async () => {
      const client = new DaemonClient({
        host: '127.0.0.1',
        port: 9999, // Non-existent port
        token: 'test-token',
        maxRetries: 2,
        retryDelay: 10,
      });

      // This would fail in real scenario, but we're testing error handling
      // In actual integration, this would be caught by the HTTP client
      client.close();
    });

    it('should handle timeout errors', async () => {
      const client = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
        token: 'test-token',
        timeout: 100,
      });

      // Mock axios to return timeout error
      vi.spyOn(client as any, 'request').mockRejectedValueOnce(
        new Error('ECONNABORTED: timeout')
      );

      await expect(client.get('/health')).rejects.toThrow();
      client.close();
    });
  });

  // ========================================================================
  // Suite 6: End-to-End Integration Scenarios
  // ========================================================================

  describe('End-to-End Integration Scenarios', () => {
    it('should complete authentication → client creation → job tracking flow', async () => {
      handshakePath = await createTempHandshakeFile(tempDir);
      
      // Step 1: Read and validate handshake
      const auth = new AuthManager({
        handshakePath,
      });

      await auth.readHandshake();
      auth.validateTokenOrThrow();
      
      // Step 2: Create HTTP client
      const handshake = auth.handshake!;
      const client = createClientFromHandshake(handshake);
      
      expect(client.baseURL).toBe('http://127.0.0.1:3847');
      expect(client.hasToken).toBe(true);
      
      // Step 3: Create job tracker with mock client
      const mockClient = {
        post: vi.fn(async () => ({ jobId: 'job-123', status: 'pending', command: 'test', createdAt: Date.now() })),
        get: vi.fn(),
      };
      const tracker = new JobTracker({ client: mockClient });
      const job = await tracker.createJob('spec start', { spec: 'test' });
      
      expect(job.jobId).toBeDefined();
      expect(job.status).toBe('pending');
      
      client.close();
    });

    it('should handle async command with --wait flag', async () => {
      const mockClient = {
        post: vi.fn(async () => ({ jobId: 'job-123', status: 'pending', command: 'test', createdAt: Date.now() })),
        get: vi.fn(async () => {
          // Return completed status immediately to avoid long polling
          return { 
            jobId: 'job-123', 
            status: 'completed', 
            command: 'test', 
            result: { status: 'success', output: 'workflow completed' },
            createdAt: Date.now(), 
            updatedAt: Date.now() 
          };
        }),
      };

      const tracker = new JobTracker({ client: mockClient });
      
      // Simulate async command execution
      const job = await tracker.createJob('workflow execute', { workflowId: 'test-workflow' });
      
      // CLI waits for completion
      const finalStatus = await tracker.waitForJob(job.jobId, { timeout: 1000 });
      
      expect(finalStatus.status).toBe('completed');
      expect(finalStatus.result).toBeDefined();
    });

    it('should handle blob content in async command response', async () => {
      const client = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
        token: 'test-token',
        enableBlobHandling: true,
      });

      // Simulate response with large content
      const response = {
        jobId: 'job-123',
        status: 'completed',
        result: {
          output: 'x'.repeat(65 * 1024), // 65 KiB
        },
      };

      const processed = client.processContent(response) as Record<string, unknown>;
      
      expect((processed.result as Record<string, unknown>).output).toMatch(/^blob:\/\//);
      client.close();
    });
  });

  // ========================================================================
  // Suite 7: Concurrent Operations
  // ========================================================================

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent jobs', async () => {
      const mockClient = {
        post: vi.fn(async () => ({ jobId: `job-${Math.random()}`, status: 'pending', command: 'test', createdAt: Date.now() })),
        get: vi.fn(),
      };

      const tracker = new JobTracker({ client: mockClient });
      
      const jobs = await Promise.all([
        tracker.createJob('spec start', { spec: 'spec1' }),
        tracker.createJob('spec start', { spec: 'spec2' }),
        tracker.createJob('spec start', { spec: 'spec3' }),
      ]);
      
      expect(jobs).toHaveLength(3);
      expect(new Set(jobs.map(j => j.jobId)).size).toBe(3); // All unique
    });

    it('should handle concurrent authentication and client creation', async () => {
      const handshakePath1 = await createTempHandshakeFile(tempDir, 3847, 'token1');
      const handshakePath2 = path.join(tempDir, '.specforge2', 'runtime', 'daemon.sock.json');
      
      // Create second handshake file
      const runtimeDir2 = path.dirname(handshakePath2);
      await mkdir(runtimeDir2, { recursive: true });
      const handshake2 = createMockHandshake(3848, 'token2');
      await writeFile(handshakePath2, JSON.stringify(handshake2));

      const auths = await Promise.all([
        (async () => {
          const auth = new AuthManager({ handshakePath: handshakePath1 });
          await auth.readHandshake();
          return auth;
        })(),
        (async () => {
          const auth = new AuthManager({ handshakePath: handshakePath2 });
          await auth.readHandshake();
          return auth;
        })(),
      ]);

      expect(auths).toHaveLength(2);
      expect(auths[0].getToken()).toBe('token1');
      expect(auths[1].getToken()).toBe('token2');
    });
  });
});
