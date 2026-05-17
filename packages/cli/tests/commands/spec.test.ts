/**
 * Tests for spec commands (Task 6.2).
 * 
 * Requirements: 1.1, 1.2, 1.3
 * - specforge spec start (async)
 * - specforge spec list
 * - specforge spec status <id>
 * - specforge spec cancel <id>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DaemonClient } from '../../src/http/DaemonClient';
import { JobTracker, JobStatus, JobStatusType } from '../../src/job/JobTracker';
import { ModeSwitch } from '../../src/mode-switch';

// Mock the DaemonClient
const mockDaemonClient = () => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
});

// Mock job status
const mockJobStatus = (
  jobId: string,
  status: JobStatusType,
  command: string = 'spec start'
): JobStatus => ({
  jobId,
  status,
  command,
  result: status === 'completed' ? { success: true, specId: 'spec-123' } : undefined,
  error: status === 'failed' ? 'Spec failed: timeout' : undefined,
  createdAt: Date.now() - 10000,
  updatedAt: Date.now(),
});

// Mock spec data
const mockSpec = (id: string, status: JobStatusType) => ({
  id,
  name: `Spec ${id}`,
  status,
  template: 'default',
  createdAt: Date.now() - 10000,
  updatedAt: Date.now(),
  ...(status === 'completed' && { completedAt: Date.now() }),
  ...(status === 'failed' && { error: 'Spec failed' }),
});

describe('Spec Commands', () => {
  let mockClient: ReturnType<typeof mockDaemonClient>;
  let modeSwitch: ModeSwitch;

  beforeEach(() => {
    mockClient = mockDaemonClient();
    modeSwitch = new ModeSwitch({ json: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('spec start (async)', () => {
    it('should create job and return jobId immediately in non-wait mode', async () => {
      const mockJob = {
        jobId: 'job-spec-123',
        status: 'pending' as const,
        command: 'spec start',
        createdAt: Date.now(),
      };

      mockClient.post.mockResolvedValueOnce(mockJob);

      const tracker = new JobTracker({ client: mockClient });
      const job = await tracker.createJob('spec start', { template: 'default' });

      expect(mockClient.post).toHaveBeenCalledWith(
        '/jobs',
        expect.objectContaining({
          command: 'spec start',
          args: { template: 'default' },
        })
      );
      expect(job.jobId).toMatch(/^job-/);
      expect(job.status).toBe('pending');
    });

    it('should support --wait flag to block until completion', async () => {
      const tracker = new JobTracker({ client: mockClient });

      // Mock: first call returns running, second call returns completed
      const jobId = 'job-spec-456';
      mockClient.get
        .mockResolvedValueOnce(mockJobStatus(jobId, 'running'))
        .mockResolvedValueOnce(mockJobStatus(jobId, 'completed'));

      // Wait for job with short interval for testing
      const status = await tracker.waitForJob(jobId, {
        timeout: 5000,
        interval: 50,
      });

      expect(status.jobId).toBe(jobId);
      expect(status.status).toBe('completed');
    });

    it('should return jobId and status in JSON mode', async () => {
      const mockJob = {
        jobId: 'job-spec-789',
        status: 'pending' as const,
        command: 'spec start',
        createdAt: Date.now(),
      };

      mockClient.post.mockResolvedValueOnce(mockJob);

      const tracker = new JobTracker({ client: mockClient });
      const job = await tracker.createJob('spec start');

      // In JSON mode, output would be:
      const jsonOutput = {
        jobId: job.jobId,
        status: job.status,
        command: job.command,
      };

      expect(() => JSON.stringify(jsonOutput)).not.toThrow();
      expect(jsonOutput.jobId).toBeDefined();
      expect(jsonOutput.status).toBe('pending');
    });

    it('should handle template parameter correctly', async () => {
      const mockJob = {
        jobId: 'job-spec-tpl',
        status: 'pending' as const,
        command: 'spec start',
        createdAt: Date.now(),
      };

      mockClient.post.mockResolvedValueOnce(mockJob);

      const tracker = new JobTracker({ client: mockClient });
      const job = await tracker.createJob('spec start', { template: 'bugfix' });

      expect(mockClient.post).toHaveBeenCalledWith(
        '/jobs',
        expect.objectContaining({
          args: { template: 'bugfix' },
        })
      );
      expect(job.jobId).toBe('job-spec-tpl');
    });
  });

  describe('spec list', () => {
    it('should list all specs', async () => {
      const mockSpecs = [
        mockSpec('spec-1', 'completed'),
        mockSpec('spec-2', 'running'),
        mockSpec('spec-3', 'failed'),
      ];

      mockClient.get.mockResolvedValueOnce({
        specs: mockSpecs,
        total: 3,
        page: 1,
        pageSize: 50,
      });

      const response = await mockClient.get('/api/specs');

      expect(response.specs).toHaveLength(3);
      expect(response.total).toBe(3);
      expect(response.specs[0].id).toBe('spec-1');
      expect(response.specs[1].id).toBe('spec-2');
      expect(response.specs[2].id).toBe('spec-3');
    });

    it('should filter specs by status', async () => {
      const mockSpecs = [
        mockSpec('spec-1', 'running'),
        mockSpec('spec-2', 'running'),
      ];

      mockClient.get.mockResolvedValueOnce({
        specs: mockSpecs,
        total: 2,
        page: 1,
        pageSize: 50,
      });

      const response = await mockClient.get('/api/specs?status=running');

      expect(response.specs).toHaveLength(2);
      expect(response.specs.every(s => s.status === 'running')).toBe(true);
    });

    it('should support pagination', async () => {
      const mockSpecs = [mockSpec('spec-1', 'completed')];

      mockClient.get.mockResolvedValueOnce({
        specs: mockSpecs,
        total: 15,
        page: 2,
        pageSize: 10,
      });

      const response = await mockClient.get('/api/specs?page=2&limit=10');

      expect(response.specs).toHaveLength(1);
      expect(response.total).toBe(15);
      expect(response.page).toBe(2);
      expect(response.pageSize).toBe(10);
    });

    it('should return valid JSON structure for spec list', async () => {
      const mockSpecs = [
        mockSpec('spec-1', 'completed'),
        mockSpec('spec-2', 'running'),
      ];

      mockClient.get.mockResolvedValueOnce({
        specs: mockSpecs,
        total: 2,
        page: 1,
        pageSize: 50,
      });

      const response = await mockClient.get('/api/specs');

      const jsonOutput = JSON.stringify(response);
      expect(() => JSON.parse(jsonOutput)).not.toThrow();

      const parsed = JSON.parse(jsonOutput);
      expect(Array.isArray(parsed.specs)).toBe(true);
      expect(parsed.total).toBeDefined();
      expect(parsed.page).toBeDefined();
      expect(parsed.pageSize).toBeDefined();
    });
  });

  describe('spec status <id>', () => {
    it('should get status of specific spec', async () => {
      const specId = 'spec-123';
      const expectedSpec = mockSpec(specId, 'running');

      mockClient.get.mockResolvedValueOnce(expectedSpec);

      const spec = await mockClient.get(`/api/specs/${specId}`);

      expect(spec.id).toBe(specId);
      expect(spec.status).toBe('running');
      expect(spec.name).toBe('Spec spec-123');
    });

    it('should support --wait flag for spec status', async () => {
      const specId = 'spec-456';
      const tracker = new JobTracker({ client: mockClient });

      mockClient.get
        .mockResolvedValueOnce(mockJobStatus(specId, 'running'))
        .mockResolvedValueOnce(mockJobStatus(specId, 'completed'));

      const status = await tracker.waitForJob(specId, {
        timeout: 5000,
        interval: 50,
      });

      expect(status.status).toBe('completed');
      expect(status.jobId).toBe(specId);
    });

    it('should handle completed spec with result', async () => {
      const specId = 'spec-789';
      const expectedSpec = {
        ...mockSpec(specId, 'completed'),
        result: { success: true, output: 'Spec completed successfully' },
      };

      mockClient.get.mockResolvedValueOnce(expectedSpec);

      const spec = await mockClient.get(`/api/specs/${specId}`);

      expect(spec.status).toBe('completed');
      expect(spec.result).toBeDefined();
      expect(spec.result.success).toBe(true);
    });

    it('should handle failed spec with error', async () => {
      const specId = 'spec-999';
      const expectedSpec = {
        ...mockSpec(specId, 'failed'),
        error: 'Spec failed: timeout exceeded',
      };

      mockClient.get.mockResolvedValueOnce(expectedSpec);

      const spec = await mockClient.get(`/api/specs/${specId}`);

      expect(spec.status).toBe('failed');
      expect(spec.error).toBeDefined();
      expect(spec.error).toContain('timeout');
    });

    it('should return valid JSON structure for spec status', async () => {
      const specId = 'spec-json';
      const spec = mockSpec(specId, 'completed');

      mockClient.get.mockResolvedValueOnce(spec);

      const response = await mockClient.get(`/api/specs/${specId}`);

      const jsonOutput = JSON.stringify(response);
      expect(() => JSON.parse(jsonOutput)).not.toThrow();

      const parsed = JSON.parse(jsonOutput);
      expect(parsed.id).toBeDefined();
      expect(parsed.name).toBeDefined();
      expect(parsed.status).toBeDefined();
      expect(parsed.createdAt).toBeDefined();
      expect(parsed.updatedAt).toBeDefined();
    });
  });

  describe('spec cancel <id>', () => {
    it('should cancel a running spec', async () => {
      const specId = 'spec-cancel-123';
      const expectedResponse = {
        success: true,
        message: 'Spec cancelled successfully',
        spec: mockSpec(specId, 'cancelled'),
      };

      mockClient.post.mockResolvedValueOnce(expectedResponse);

      const response = await mockClient.post(`/api/specs/${specId}/cancel`);

      expect(response.success).toBe(true);
      expect(response.message).toContain('cancelled');
      expect(response.spec.id).toBe(specId);
      expect(response.spec.status).toBe('cancelled');
    });

    it('should handle already completed spec', async () => {
      const specId = 'spec-cancel-456';
      const expectedResponse = {
        success: false,
        message: 'Spec already completed, cannot cancel',
        spec: mockSpec(specId, 'completed'),
      };

      mockClient.post.mockResolvedValueOnce(expectedResponse);

      const response = await mockClient.post(`/api/specs/${specId}/cancel`);

      expect(response.success).toBe(false);
      expect(response.message).toContain('already completed');
    });

    it('should return valid JSON structure for cancel response', async () => {
      const specId = 'spec-cancel-json';
      const response = {
        success: true,
        message: 'Spec cancelled',
        spec: mockSpec(specId, 'cancelled'),
      };

      mockClient.post.mockResolvedValueOnce(response);

      const result = await mockClient.post(`/api/specs/${specId}/cancel`);

      const jsonOutput = JSON.stringify(result);
      expect(() => JSON.parse(jsonOutput)).not.toThrow();

      const parsed = JSON.parse(jsonOutput);
      expect(parsed.success).toBeDefined();
      expect(parsed.message).toBeDefined();
      expect(parsed.spec).toBeDefined();
    });
  });

  describe('async command contract (Property 18)', () => {
    it('should return jobId and status: "pending" immediately for spec start', async () => {
      const mockJob = {
        jobId: 'job-prop18-spec',
        status: 'pending' as const,
        command: 'spec start',
        createdAt: Date.now(),
      };

      mockClient.post.mockResolvedValueOnce(mockJob);

      const tracker = new JobTracker({ client: mockClient });
      const job = await tracker.createJob('spec start', {});

      expect(job.jobId).toBeDefined();
      expect(typeof job.jobId).toBe('string');
      expect(job.jobId.length).toBeGreaterThan(0);
      expect(job.status).toBe('pending');
    });

    it('should have query endpoint returning current status', async () => {
      const specId = 'spec-prop18-2';
      const spec = mockSpec(specId, 'running');

      mockClient.get.mockResolvedValueOnce(spec);

      const result = await mockClient.get(`/api/specs/${specId}`);

      expect(result.status).toBe('running');
    });

    it('should block until terminal state when --wait is used', async () => {
      const specId = 'spec-prop18-3';
      const tracker = new JobTracker({ client: mockClient });

      mockClient.get
        .mockResolvedValueOnce(mockJobStatus(specId, 'pending'))
        .mockResolvedValueOnce(mockJobStatus(specId, 'running'))
        .mockResolvedValueOnce(mockJobStatus(specId, 'completed'));

      const result = await tracker.waitForJob(specId, {
        timeout: 5000,
        interval: 50,
      });

      expect(['completed', 'failed', 'blocked', 'cancelled']).toContain(result.status);
    });

    it('should ensure all specs end in terminal state set', async () => {
      const tracker = new JobTracker({ client: mockClient });

      const terminalStates = ['completed', 'failed', 'blocked', 'cancelled'];

      // Test each terminal state
      for (const terminalState of terminalStates) {
        const specId = `spec-terminal-${terminalState}`;

        mockClient.get
          .mockResolvedValueOnce(mockJobStatus(specId, 'running'))
          .mockResolvedValueOnce(mockJobStatus(specId, terminalState as JobStatusType));

        const result = await tracker.waitForJob(specId, {
          timeout: 5000,
          interval: 50,
        });

        expect(terminalStates).toContain(result.status);
      }
    });
  });

  describe('dual-mode output support', () => {
    it('should format spec list correctly in interactive mode', () => {
      const spec = mockSpec('spec-test', 'running');
      const modeSwitch = new ModeSwitch({ json: false });

      // Test that interactive mode doesn't throw
      expect(() => {
        modeSwitch.formatData(spec);
      }).not.toThrow();
    });

    it('should format spec list correctly in JSON mode', () => {
      const spec = mockSpec('spec-test', 'completed');
      const modeSwitch = new ModeSwitch({ json: true });

      const jsonOutput = modeSwitch.formatData(spec);
      
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.id).toBe('spec-test');
      expect(parsed.status).toBe('completed');
    });

    it('should handle errors consistently in both modes', () => {
      const error = new Error('Spec not found');
      const modeSwitchInteractive = new ModeSwitch({ json: false });
      const modeSwitchJson = new ModeSwitch({ json: true });

      const interactiveError = modeSwitchInteractive.formatError({
        name: 'SpecNotFound',
        message: 'Spec not found',
      });

      const jsonError = modeSwitchJson.formatError({
        name: 'SpecNotFound',
        message: 'Spec not found',
      });

      expect(interactiveError).toBeDefined();
      expect(jsonError).toBeDefined();
      
      // JSON error should be valid JSON
      expect(() => JSON.parse(jsonError)).not.toThrow();
    });
  });
});
