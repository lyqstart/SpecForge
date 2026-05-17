/**
 * Unit tests for JobTracker component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  JobTracker,
  JobTrackerError,
  JobNotFoundError,
  JobWaitTimeoutError,
  isTerminalStatus,
  TERMINAL_STATES,
} from '../src/job/JobTracker';

describe('JobTracker', () => {
  // Mock client for testing
  const createMockClient = (responses: Record<string, unknown> = {}) => {
    return {
      get: vi.fn(async (path: string) => {
        const jobId = path.split('/').pop();
        if (responses[jobId!]) {
          return responses[jobId!];
        }
        throw new Error(`Mock: no response for ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        const jobId = path.split('/').pop()?.replace('/cancel', '');
        if (responses[jobId!]) {
          return responses[jobId!];
        }
        return body;
      }),
    };
  };

  describe('isTerminalStatus', () => {
    it('should return true for terminal states', () => {
      expect(isTerminalStatus('completed')).toBe(true);
      expect(isTerminalStatus('failed')).toBe(true);
      expect(isTerminalStatus('blocked')).toBe(true);
      expect(isTerminalStatus('cancelled')).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      expect(isTerminalStatus('pending')).toBe(false);
      expect(isTerminalStatus('running')).toBe(false);
    });
  });

  describe('TERMINAL_STATES', () => {
    it('should contain all terminal states', () => {
      expect(TERMINAL_STATES).toContain('completed');
      expect(TERMINAL_STATES).toContain('failed');
      expect(TERMINAL_STATES).toContain('blocked');
      expect(TERMINAL_STATES).toContain('cancelled');
    });
  });

  describe('createJob', () => {
    it('should create a job and return job info with unique ID', async () => {
      const mockClient = createMockClient();
      const tracker = new JobTracker({ client: mockClient });

      const job = await tracker.createJob('spec start', { template: 'default' });

      expect(job.jobId).toMatch(/^job-/);
      expect(job.status).toBe('pending');
      expect(job.command).toBe('spec start');
      expect(job.createdAt).toBeDefined();
      expect(typeof job.createdAt).toBe('number');
    });

    it('should use returned jobId from daemon if provided', async () => {
      const mockClient = createMockClient({
        '': { jobId: 'daemon-job-123', status: 'running', command: 'spec start', createdAt: Date.now() },
      });
      const tracker = new JobTracker({ client: mockClient });

      const job = await tracker.createJob('spec start');

      expect(mockClient.post).toHaveBeenCalled();
    });

    it('should generate unique job IDs', async () => {
      const mockClient = createMockClient();
      const tracker = new JobTracker({ client: mockClient });

      const job1 = await tracker.createJob('command 1');
      const job2 = await tracker.createJob('command 2');

      expect(job1.jobId).not.toBe(job2.jobId);
    });
  });

  describe('getJobStatus', () => {
    it('should return job status from daemon', async () => {
      const mockStatus = {
        jobId: 'job-123',
        status: 'running' as const,
        command: 'spec start',
        createdAt: Date.now() - 1000,
        updatedAt: Date.now(),
      };
      const mockClient = createMockClient({ 'job-123': mockStatus });
      const tracker = new JobTracker({ client: mockClient });

      const status = await tracker.getJobStatus('job-123');

      expect(status.jobId).toBe('job-123');
      expect(status.status).toBe('running');
      expect(mockClient.get).toHaveBeenCalledWith('/jobs/job-123');
    });

    it('should throw JobTrackerError when daemon is unreachable', async () => {
      const mockClient = {
        get: vi.fn().mockRejectedValueOnce(
          new Error('connect ECONNREFUSED 127.0.0.1:3847')
        ),
        post: vi.fn(),
      };
      const tracker = new JobTracker({ client: mockClient });

      await expect(tracker.getJobStatus('nonexistent')).rejects.toThrow(JobTrackerError);
    });
  });

  describe('waitForJob', () => {
    it('should return immediately if job is already in terminal state', async () => {
      const completedStatus = {
        jobId: 'job-123',
        status: 'completed' as const,
        command: 'spec start',
        result: { success: true },
        createdAt: Date.now() - 5000,
        updatedAt: Date.now(),
      };
      const mockClient = createMockClient({ 'job-123': completedStatus });
      const tracker = new JobTracker({ client: mockClient, defaultInterval: 100 });

      const status = await tracker.waitForJob('job-123', { timeout: 5000 });

      expect(status.status).toBe('completed');
      expect(status.result).toEqual({ success: true });
    });

    it('should poll until terminal state is reached', async () => {
      let callCount = 0;
      const mockClient = {
        get: vi.fn(async () => {
          callCount++;
          if (callCount < 3) {
            return {
              jobId: 'job-123',
              status: 'running' as const,
              command: 'spec start',
              createdAt: Date.now() - 5000,
              updatedAt: Date.now(),
            };
          }
          return {
            jobId: 'job-123',
            status: 'completed' as const,
            command: 'spec start',
            result: { success: true },
            createdAt: Date.now() - 5000,
            updatedAt: Date.now(),
          };
        }),
        post: vi.fn(),
      };
      const tracker = new JobTracker({ client: mockClient, defaultInterval: 10 });

      const status = await tracker.waitForJob('job-123', { timeout: 5000 });

      expect(status.status).toBe('completed');
      expect(callCount).toBe(3);
    });

    it('should throw JobWaitTimeoutError on timeout', async () => {
      const mockClient = {
        get: vi.fn(async () => ({
          jobId: 'job-123',
          status: 'running' as const,
          command: 'spec start',
          createdAt: Date.now() - 5000,
          updatedAt: Date.now(),
        })),
        post: vi.fn(),
      };
      const tracker = new JobTracker({ client: mockClient, defaultInterval: 10 });

      await expect(
        tracker.waitForJob('job-123', { timeout: 50 })
      ).rejects.toThrow(JobWaitTimeoutError);
    });

    it('should call onUpdate callback on each poll', async () => {
      let callCount = 0;
      const onUpdate = vi.fn();
      
      const mockClient = {
        get: vi.fn(async () => {
          callCount++;
          if (callCount < 2) {
            return {
              jobId: 'job-123',
              status: 'running' as const,
              command: 'spec start',
              createdAt: Date.now() - 5000,
              updatedAt: Date.now(),
            };
          }
          return {
            jobId: 'job-123',
            status: 'completed' as const,
            command: 'spec start',
            createdAt: Date.now() - 5000,
            updatedAt: Date.now(),
          };
        }),
        post: vi.fn(),
      };
      const tracker = new JobTracker({ client: mockClient, defaultInterval: 10 });

      await tracker.waitForJob('job-123', { 
        timeout: 5000,
        onUpdate,
      });

      expect(onUpdate).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelJob', () => {
    it('should send cancel request to daemon', async () => {
      const mockClient = {
        get: vi.fn(),
        post: vi.fn(async () => ({ success: true })),
      };
      const tracker = new JobTracker({ client: mockClient });

      await tracker.cancelJob('job-123');

      expect(mockClient.post).toHaveBeenCalledWith('/jobs/job-123/cancel', {});
    });
  });

  describe('listJobs', () => {
    it('should return list of jobs', async () => {
      const jobs = [
        { jobId: 'job-1', status: 'completed' as const, command: 'spec start', createdAt: Date.now(), updatedAt: Date.now() },
        { jobId: 'job-2', status: 'running' as const, command: 'spec start', createdAt: Date.now(), updatedAt: Date.now() },
      ];
      const mockClient = {
        get: vi.fn().mockResolvedValue(jobs),
        post: vi.fn(),
      };
      const tracker = new JobTracker({ client: mockClient });

      const result = await tracker.listJobs();

      expect(result).toHaveLength(2);
    });

    it('should filter by status when provided', async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue([]),
        post: vi.fn(),
      };
      const tracker = new JobTracker({ client: mockClient });

      await tracker.listJobs({ status: 'completed', limit: 10 });

      expect(mockClient.get).toHaveBeenCalledWith('/jobs?status=completed&limit=10');
    });
  });

  describe('JobTrackerError', () => {
    it('should create error with correct properties', () => {
      const error = new JobTrackerError({
        message: 'Test error',
        code: 'TEST_CODE',
        jobId: 'job-123',
        isRetryable: true,
      });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.jobId).toBe('job-123');
      expect(error.isRetryable).toBe(true);
    });
  });

  describe('JobNotFoundError', () => {
    it('should create error with correct properties', () => {
      const error = new JobNotFoundError('job-456');

      expect(error.message).toContain('job-456');
      expect(error.code).toBe('JOB_NOT_FOUND');
      expect(error.jobId).toBe('job-456');
    });
  });
});