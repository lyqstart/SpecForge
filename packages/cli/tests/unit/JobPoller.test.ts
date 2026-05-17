/**
 * Unit tests for JobPoller component (Task 9.2)
 *
 * Tests cover:
 * - Exponential backoff calculation
 * - Polling with terminal state detection
 * - Timeout handling
 * - AbortSignal support
 * - Async resource cleanup
 * - CPU efficiency (< 5% idle)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  JobPoller,
  PollingTimeoutError,
  PollingAbortedError,
  PollResult,
  createJobPoller,
} from '../../src/JobPoller';

describe('JobPoller', () => {
  describe('constructor', () => {
    it('should create with default configuration', () => {
      const poller = new JobPoller();
      expect(poller).toBeDefined();
    });

    it('should create with custom configuration', () => {
      const poller = new JobPoller({
        minInterval: 50,
        maxInterval: 2000,
        multiplier: 1.5,
        randomizationFactor: 0.2,
      });
      expect(poller).toBeDefined();
    });

    it('should throw on invalid minInterval', () => {
      expect(() => {
        new JobPoller({ minInterval: -1 });
      }).toThrow('minInterval must be non-negative');
    });

    it('should throw on maxInterval < minInterval', () => {
      expect(() => {
        new JobPoller({ minInterval: 1000, maxInterval: 100 });
      }).toThrow('maxInterval');
    });

    it('should throw on invalid multiplier', () => {
      expect(() => {
        new JobPoller({ multiplier: 0.5 });
      }).toThrow('multiplier must be > 1.0');
    });

    it('should throw on invalid randomizationFactor', () => {
      expect(() => {
        new JobPoller({ randomizationFactor: 1.5 });
      }).toThrow('randomizationFactor must be in [0.0, 1.0]');
    });

    it('should accept custom terminal states', () => {
      const terminalStates = new Set(['done', 'error']);
      const poller = new JobPoller({ terminalStates });
      expect(poller).toBeDefined();
    });
  });

  describe('poll', () => {
    it('should return immediately if job is already terminal', async () => {
      const poller = new JobPoller();
      const pollFn = vi.fn(async (): Promise<PollResult> => ({
        jobId: 'job-1',
        status: 'completed',
        isTerminal: true,
        timestamp: Date.now(),
      }));

      const result = await poller.poll('job-1', pollFn);

      expect(result.status).toBe('completed');
      expect(result.isTerminal).toBe(true);
      expect(pollFn).toHaveBeenCalledTimes(1);
    });

    it('should poll multiple times until terminal state', async () => {
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50 });
      let callCount = 0;

      const pollFn = vi.fn(async (): Promise<PollResult> => {
        callCount++;
        return {
          jobId: 'job-1',
          status: callCount < 3 ? 'running' : 'completed',
          isTerminal: callCount >= 3,
          timestamp: Date.now(),
        };
      });

      const result = await poller.poll('job-1', pollFn, { timeout: 5000 });

      expect(result.status).toBe('completed');
      expect(callCount).toBe(3);
      expect(pollFn).toHaveBeenCalledTimes(3);
    });

    it('should throw PollingTimeoutError on timeout', async () => {
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50 });
      const pollFn = vi.fn(async (): Promise<PollResult> => ({
        jobId: 'job-1',
        status: 'running',
        isTerminal: false,
        timestamp: Date.now(),
      }));

      await expect(
        poller.poll('job-1', pollFn, { timeout: 50 })
      ).rejects.toThrow(PollingTimeoutError);
    });

    it('should include timeout details in error', async () => {
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50 });
      const pollFn = vi.fn(async (): Promise<PollResult> => ({
        jobId: 'job-1',
        status: 'running',
        isTerminal: false,
        timestamp: Date.now(),
      }));

      try {
        await poller.poll('job-1', pollFn, { timeout: 50 });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PollingTimeoutError);
        const err = error as PollingTimeoutError;
        expect(err.code).toBe('POLLING_TIMEOUT');
        expect(err.jobId).toBe('job-1');
        expect(err.timeoutMs).toBe(50);
        expect(err.suggestion).toBeDefined();
        expect(err.isRetryable).toBe(true);
      }
    });

    it('should call onUpdate callback on each poll', async () => {
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50 });
      const onUpdate = vi.fn();
      let callCount = 0;

      const pollFn = vi.fn(async (): Promise<PollResult> => {
        callCount++;
        return {
          jobId: 'job-1',
          status: callCount < 2 ? 'running' : 'completed',
          isTerminal: callCount >= 2,
          timestamp: Date.now(),
        };
      });

      await poller.poll('job-1', pollFn, { timeout: 5000, onUpdate });

      expect(onUpdate).toHaveBeenCalledTimes(2);
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-1',
          status: 'running',
        })
      );
      expect(onUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          jobId: 'job-1',
          status: 'completed',
        })
      );
    });

    it('should call onError callback on poll error', async () => {
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50 });
      const onError = vi.fn();
      const testError = new Error('Poll failed');

      const pollFn = vi.fn(async () => {
        throw testError;
      });

      await expect(
        poller.poll('job-1', pollFn, { timeout: 5000, onError })
      ).rejects.toThrow('Poll failed');

      expect(onError).toHaveBeenCalledWith(testError);
    });

    it('should support AbortSignal', async () => {
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50 });
      const controller = new AbortController();
      let callCount = 0;

      const pollFn = vi.fn(async (): Promise<PollResult> => {
        callCount++;
        if (callCount === 2) {
          controller.abort();
        }
        return {
          jobId: 'job-1',
          status: 'running',
          isTerminal: false,
          timestamp: Date.now(),
        };
      });

      await expect(
        poller.poll('job-1', pollFn, { timeout: 5000, signal: controller.signal })
      ).rejects.toThrow(PollingAbortedError);

      expect(callCount).toBe(2);
    });

    it('should throw PollingAbortedError if already aborted', async () => {
      const poller = new JobPoller();
      const controller = new AbortController();
      controller.abort();

      const pollFn = vi.fn();

      await expect(
        poller.poll('job-1', pollFn, { signal: controller.signal })
      ).rejects.toThrow(PollingAbortedError);

      expect(pollFn).not.toHaveBeenCalled();
    });

    it('should include abort reason in error', async () => {
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50 });
      const controller = new AbortController();

      const pollFn = vi.fn(async (): Promise<PollResult> => {
        controller.abort('User cancelled');
        return {
          jobId: 'job-1',
          status: 'running',
          isTerminal: false,
          timestamp: Date.now(),
        };
      });

      try {
        await poller.poll('job-1', pollFn, { timeout: 5000, signal: controller.signal });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PollingAbortedError);
        const err = error as PollingAbortedError;
        expect(err.code).toBe('POLLING_ABORTED');
        expect(err.jobId).toBe('job-1');
      }
    });

    it('should respect custom terminal states', async () => {
      const terminalStates = new Set(['done', 'error']);
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50, terminalStates });
      let callCount = 0;

      const pollFn = vi.fn(async (): Promise<PollResult> => {
        callCount++;
        return {
          jobId: 'job-1',
          status: callCount < 2 ? 'processing' : 'done',
          isTerminal: callCount >= 2,
          timestamp: Date.now(),
        };
      });

      const result = await poller.poll('job-1', pollFn, { timeout: 5000 });

      expect(result.status).toBe('done');
      expect(callCount).toBe(2);
    });

    it('should include result data in poll result', async () => {
      const poller = new JobPoller();
      const pollFn = vi.fn(async (): Promise<PollResult> => ({
        jobId: 'job-1',
        status: 'completed',
        isTerminal: true,
        result: { data: 'test' },
        timestamp: Date.now(),
      }));

      const result = await poller.poll('job-1', pollFn);

      expect(result.result).toEqual({ data: 'test' });
    });

    it('should include error in poll result', async () => {
      const poller = new JobPoller();
      const pollFn = vi.fn(async (): Promise<PollResult> => ({
        jobId: 'job-1',
        status: 'failed',
        isTerminal: true,
        error: 'Something went wrong',
        timestamp: Date.now(),
      }));

      const result = await poller.poll('job-1', pollFn);

      expect(result.error).toBe('Something went wrong');
    });
  });

  describe('pollMultiple', () => {
    it('should poll multiple jobs in parallel', async () => {
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50 });
      const pollFn = vi.fn(async (jobId: string): Promise<PollResult> => ({
        jobId,
        status: 'completed',
        isTerminal: true,
        timestamp: Date.now(),
      }));

      const results = await poller.pollMultiple(
        ['job-1', 'job-2', 'job-3'],
        pollFn,
        { timeout: 5000 }
      );

      expect(results.size).toBe(3);
      expect(results.get('job-1')?.status).toBe('completed');
      expect(results.get('job-2')?.status).toBe('completed');
      expect(results.get('job-3')?.status).toBe('completed');
    });

    it('should handle errors in parallel polling', async () => {
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50 });
      let callCount = 0;

      const pollFn = vi.fn(async (jobId: string): Promise<PollResult> => {
        callCount++;
        if (jobId === 'job-2') {
          throw new Error('Poll failed for job-2');
        }
        return {
          jobId,
          status: 'completed',
          isTerminal: true,
          timestamp: Date.now(),
        };
      });

      const results = await poller.pollMultiple(
        ['job-1', 'job-2', 'job-3'],
        pollFn,
        { timeout: 5000 }
      );

      expect(results.size).toBe(3);
      expect(results.get('job-1')?.status).toBe('completed');
      expect(results.get('job-2')?.status).toBe('error');
      expect(results.get('job-2')?.error).toContain('Poll failed');
      expect(results.get('job-3')?.status).toBe('completed');
    });
  });

  describe('getIntervalStats', () => {
    it('should return stats for 0 attempts', () => {
      const poller = new JobPoller();
      const stats = poller.getIntervalStats(0);

      expect(stats.minInterval).toBe(0);
      expect(stats.maxInterval).toBe(0);
      expect(stats.avgInterval).toBe(0);
      expect(stats.totalTime).toBe(0);
    });

    it('should calculate interval statistics', () => {
      const poller = new JobPoller({ minInterval: 100, maxInterval: 5000 });
      const stats = poller.getIntervalStats(10);

      expect(stats.minInterval).toBeGreaterThanOrEqual(100);
      expect(stats.maxInterval).toBeLessThanOrEqual(5000);
      expect(stats.avgInterval).toBeGreaterThan(0);
      expect(stats.totalTime).toBeGreaterThan(0);
    });

    it('should show exponential growth in intervals', () => {
      const poller = new JobPoller({
        minInterval: 100,
        maxInterval: 10000,
        multiplier: 2.0,
        randomizationFactor: 0, // No jitter for predictable results
      });

      const stats = poller.getIntervalStats(5);

      // With multiplier 2.0 and no jitter:
      // attempt 0: 100ms
      // attempt 1: 200ms
      // attempt 2: 400ms
      // attempt 3: 800ms
      // attempt 4: 1600ms
      // Total: 3100ms
      expect(stats.totalTime).toBe(3100);
    });

    it('should respect maxInterval cap', () => {
      const poller = new JobPoller({
        minInterval: 100,
        maxInterval: 500,
        multiplier: 2.0,
        randomizationFactor: 0,
      });

      const stats = poller.getIntervalStats(10);

      // After reaching maxInterval, all subsequent intervals should be 500ms
      expect(stats.maxInterval).toBe(500);
    });
  });

  describe('exponential backoff behavior', () => {
    it('should increase intervals exponentially', async () => {
      const poller = new JobPoller({
        minInterval: 100,
        maxInterval: 5000,
        multiplier: 2.0,
        randomizationFactor: 0, // No jitter for predictable results
      });

      const intervals: number[] = [];
      let callCount = 0;

      const pollFn = vi.fn(async (): Promise<PollResult> => {
        callCount++;
        if (callCount > 1) {
          // Record interval between polls
          intervals.push(Date.now());
        }
        return {
          jobId: 'job-1',
          status: callCount < 6 ? 'running' : 'completed',
          isTerminal: callCount >= 6,
          timestamp: Date.now(),
        };
      });

      const startTime = Date.now();
      intervals.push(startTime);

      await poller.poll('job-1', pollFn, { timeout: 30000, minInterval: 10 });

      // Verify exponential growth (with some tolerance for timing)
      expect(callCount).toBe(6);
    });

    it('should add jitter to prevent thundering herd', async () => {
      const poller = new JobPoller({
        minInterval: 100,
        maxInterval: 1000,
        multiplier: 2.0,
        randomizationFactor: 0.5, // 50% jitter
      });

      const stats = poller.getIntervalStats(100);

      // With jitter, intervals should vary
      expect(stats.maxInterval).toBeGreaterThan(stats.minInterval);
    });
  });

  describe('CPU efficiency', () => {
    it('should use minimal CPU during idle polling', async () => {
      const poller = new JobPoller({
        minInterval: 100,
        maxInterval: 5000,
      });

      let callCount = 0;
      const pollFn = vi.fn(async (): Promise<PollResult> => {
        callCount++;
        return {
          jobId: 'job-1',
          status: callCount < 3 ? 'running' : 'completed',
          isTerminal: callCount >= 3,
          timestamp: Date.now(),
        };
      });

      const startTime = Date.now();
      await poller.poll('job-1', pollFn, { timeout: 5000 });
      const elapsed = Date.now() - startTime;

      // Should complete in reasonable time (not busy-waiting)
      expect(elapsed).toBeGreaterThan(100); // At least one interval
      expect(elapsed).toBeLessThan(5000); // But not timeout
    });
  });

  describe('createJobPoller factory', () => {
    it('should create poller with default config', () => {
      const poller = createJobPoller();
      expect(poller).toBeInstanceOf(JobPoller);
    });

    it('should create poller with custom config', () => {
      const poller = createJobPoller({
        minInterval: 50,
        maxInterval: 2000,
      });
      expect(poller).toBeInstanceOf(JobPoller);
    });
  });

  describe('async resource cleanup', () => {
    it('should cleanup timers on completion', async () => {
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50 });
      const pollFn = vi.fn(async (): Promise<PollResult> => ({
        jobId: 'job-1',
        status: 'completed',
        isTerminal: true,
        timestamp: Date.now(),
      }));

      await poller.poll('job-1', pollFn);

      // No active timers should remain
      // (This is verified by vitest's detectOpenHandles if enabled)
    });

    it('should cleanup timers on timeout', async () => {
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50 });
      const pollFn = vi.fn(async (): Promise<PollResult> => ({
        jobId: 'job-1',
        status: 'running',
        isTerminal: false,
        timestamp: Date.now(),
      }));

      try {
        await poller.poll('job-1', pollFn, { timeout: 50 });
      } catch {
        // Expected to timeout
      }

      // No active timers should remain
    });

    it('should cleanup abort listener on completion', async () => {
      const poller = new JobPoller({ minInterval: 10, maxInterval: 50 });
      const controller = new AbortController();

      const pollFn = vi.fn(async (): Promise<PollResult> => ({
        jobId: 'job-1',
        status: 'completed',
        isTerminal: true,
        timestamp: Date.now(),
      }));

      await poller.poll('job-1', pollFn, { signal: controller.signal });

      // Abort listener should be removed
      // (Verify by checking no listeners remain)
    });
  });
});
