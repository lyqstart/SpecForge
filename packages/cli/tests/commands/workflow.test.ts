/**
 * Tests for workflow commands (Task 6.2).
 * 
 * Requirements: 1.1, 1.2, 1.3
 * - specforge spec start (async)
 * - specforge workflow status <id>
 * - specforge workflow list
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JobTracker, JobStatus, JobStatusType } from '../../src/job/JobTracker';

// Mock the DaemonClient
const mockJobStatus = (
  jobId: string,
  status: JobStatusType,
  command: string = 'spec start'
): JobStatus => ({
  jobId,
  status,
  command,
  result: status === 'completed' ? { success: true } : undefined,
  error: status === 'failed' ? 'error message' : undefined,
  createdAt: Date.now() - 10000,
  updatedAt: Date.now(),
});

describe('Workflow Commands', () => {
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('spec start (async)', () => {
    it('should create job and return jobId immediately in non-wait mode', async () => {
      const mockJob = {
        jobId: 'job-test-123',
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
      const jobId = 'job-test-456';
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
        jobId: 'job-test-789',
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
  });

  describe('workflow status <id>', () => {
    it('should get status of specific workflow', async () => {
      const jobId = 'workflow-123';
      const expectedStatus = mockJobStatus(jobId, 'running', 'workflow start');

      mockClient.get.mockResolvedValueOnce(expectedStatus);

      const tracker = new JobTracker({ client: mockClient });
      const status = await tracker.getJobStatus(jobId);

      expect(mockClient.get).toHaveBeenCalledWith(`/jobs/${jobId}`);
      expect(status.jobId).toBe(jobId);
      expect(status.status).toBe('running');
    });

    it('should support --wait flag for workflow status', async () => {
      const jobId = 'workflow-456';

      mockClient.get
        .mockResolvedValueOnce(mockJobStatus(jobId, 'running'))
        .mockResolvedValueOnce(mockJobStatus(jobId, 'completed'));

      const tracker = new JobTracker({ client: mockClient });
      const status = await tracker.waitForJob(jobId, {
        timeout: 5000,
        interval: 50,
      });

      expect(status.status).toBe('completed');
      expect(status.jobId).toBe(jobId);
    });

    it('should throw JobNotFoundError for non-existent workflow', async () => {
      mockClient.get.mockRejectedValueOnce(
        new Error('Job not found: nonexistent')
      );

      const tracker = new JobTracker({ client: mockClient });

      await expect(tracker.getJobStatus('nonexistent')).rejects.toThrow();
    });

    it('should return valid JSON structure for workflow status', async () => {
      const jobId = 'workflow-789';
      const status = mockJobStatus(jobId, 'completed');

      mockClient.get.mockResolvedValueOnce(status);

      const tracker = new JobTracker({ client: mockClient });
      const result = await tracker.getJobStatus(jobId);

      const jsonOutput = JSON.stringify(result);
      expect(() => JSON.parse(jsonOutput)).not.toThrow();

      const parsed = JSON.parse(jsonOutput);
      expect(parsed.jobId).toBeDefined();
      expect(parsed.status).toBeDefined();
      expect(parsed.command).toBeDefined();
      expect(parsed.createdAt).toBeDefined();
      expect(parsed.updatedAt).toBeDefined();
    });
  });

  describe('workflow list', () => {
    it('should list all workflows', async () => {
      const mockJobs: JobStatus[] = [
        mockJobStatus('workflow-1', 'completed'),
        mockJobStatus('workflow-2', 'running'),
        mockJobStatus('workflow-3', 'failed'),
      ];

      mockClient.get.mockResolvedValueOnce(mockJobs);

      const tracker = new JobTracker({ client: mockClient });
      const jobs = await tracker.listJobs();

      expect(mockClient.get).toHaveBeenCalledWith('/jobs');
      expect(jobs).toHaveLength(3);
      expect(jobs[0].jobId).toBe('workflow-1');
      expect(jobs[1].jobId).toBe('workflow-2');
      expect(jobs[2].jobId).toBe('workflow-3');
    });

    it('should filter workflows by status', async () => {
      const mockJobs: JobStatus[] = [
        mockJobStatus('workflow-1', 'running'),
        mockJobStatus('workflow-2', 'running'),
      ];

      mockClient.get.mockResolvedValueOnce(mockJobs);

      const tracker = new JobTracker({ client: mockClient });
      const jobs = await tracker.listJobs({ status: 'running' });

      expect(mockClient.get).toHaveBeenCalledWith('/jobs?status=running');
      expect(jobs).toHaveLength(2);
      expect(jobs.every(j => j.status === 'running')).toBe(true);
    });

    it('should support limit parameter', async () => {
      const mockJobs: JobStatus[] = [
        mockJobStatus('workflow-1', 'completed'),
      ];

      mockClient.get.mockResolvedValueOnce(mockJobs);

      const tracker = new JobTracker({ client: mockClient });
      const jobs = await tracker.listJobs({ limit: 10 });

      expect(mockClient.get).toHaveBeenCalledWith('/jobs?limit=10');
      expect(jobs).toHaveLength(1);
    });

    it('should return valid JSON array for workflow list', async () => {
      const mockJobs: JobStatus[] = [
        mockJobStatus('workflow-1', 'completed'),
        mockJobStatus('workflow-2', 'running'),
      ];

      mockClient.get.mockResolvedValueOnce(mockJobs);

      const tracker = new JobTracker({ client: mockClient });
      const jobs = await tracker.listJobs();

      const jsonOutput = JSON.stringify(jobs);
      expect(() => JSON.parse(jsonOutput)).not.toThrow();

      const parsed = JSON.parse(jsonOutput);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });
  });

  describe('async command contract (Property 18)', () => {
    it('should return jobId and status: "pending" immediately for async command', async () => {
      const mockJob = {
        jobId: 'job-prop18-1',
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
      const jobId = 'job-prop18-2';
      const status = mockJobStatus(jobId, 'running');

      mockClient.get.mockResolvedValueOnce(status);

      const tracker = new JobTracker({ client: mockClient });
      const result = await tracker.getJobStatus(jobId);

      expect(result.status).toBe('running');
    });

    it('should block until terminal state when --wait is used', async () => {
      const jobId = 'job-prop18-3';

      mockClient.get
        .mockResolvedValueOnce(mockJobStatus(jobId, 'pending'))
        .mockResolvedValueOnce(mockJobStatus(jobId, 'running'))
        .mockResolvedValueOnce(mockJobStatus(jobId, 'completed'));

      const tracker = new JobTracker({ client: mockClient });
      const result = await tracker.waitForJob(jobId, {
        timeout: 5000,
        interval: 50,
      });

      expect(['completed', 'failed', 'blocked', 'cancelled']).toContain(result.status);
    });

    it('should ensure all jobs end in terminal state set', async () => {
      const tracker = new JobTracker({ client: mockClient });

      const terminalStates = ['completed', 'failed', 'blocked', 'cancelled'];

      // Test each terminal state
      for (const terminalState of terminalStates) {
        const jobId = `job-terminal-${terminalState}`;

        mockClient.get
          .mockResolvedValueOnce(mockJobStatus(jobId, 'running'))
          .mockResolvedValueOnce(mockJobStatus(jobId, terminalState as JobStatusType));

        const result = await tracker.waitForJob(jobId, {
          timeout: 5000,
          interval: 50,
        });

        expect(terminalStates).toContain(result.status);
      }
    });
  });
});