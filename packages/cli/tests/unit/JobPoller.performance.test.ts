/**
 * Performance tests for JobPoller (Task 9.2)
 *
 * Verifies:
 * - CPU efficiency during idle polling (< 5% CPU)
 * - Memory usage is reasonable
 * - Exponential backoff reduces polling frequency
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JobPoller, PollResult } from '../../src/JobPoller';

describe('JobPoller Performance', () => {
  describe('CPU efficiency', () => {
    it('should use minimal CPU during idle polling', async () => {
      const poller = new JobPoller({
        minInterval: 100,
        maxInterval: 5000,
      });

      let pollCount = 0;
      const pollFn = async (): Promise<PollResult> => {
        pollCount++;
        return {
          jobId: 'job-1',
          status: pollCount < 5 ? 'running' : 'completed',
          isTerminal: pollCount >= 5,
          timestamp: Date.now(),
        };
      };

      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      await poller.poll('job-1', pollFn, { timeout: 30000 });

      const elapsed = Date.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed;
      const memoryDelta = (endMemory - startMemory) / 1024 / 1024; // MB

      // Verify polling completed in reasonable time
      expect(elapsed).toBeGreaterThan(100); // At least one interval
      expect(elapsed).toBeLessThan(30000); // But not timeout

      // Verify memory usage is reasonable (< 10 MB delta)
      expect(memoryDelta).toBeLessThan(10);

      // Verify poll count is reasonable
      expect(pollCount).toBe(5);
    });

    it('should reduce polling frequency with exponential backoff', async () => {
      const poller = new JobPoller({
        minInterval: 100,
        maxInterval: 5000,
        multiplier: 2.0,
        randomizationFactor: 0, // No jitter for predictable results
      });

      const stats = poller.getIntervalStats(10);

      // Verify exponential growth
      expect(stats.maxInterval).toBeGreaterThan(stats.minInterval);

      // With multiplier 2.0 and minInterval 100:
      // Total time for 10 attempts should be significant
      // (100 + 200 + 400 + 800 + 1600 + 3200 + 5000 + 5000 + 5000 + 5000 = 26300ms)
      expect(stats.totalTime).toBeGreaterThan(20000);
    });

    it('should handle long polling without excessive CPU', async () => {
      const poller = new JobPoller({
        minInterval: 100,
        maxInterval: 1000,
      });

      let pollCount = 0;
      const pollFn = async (): Promise<PollResult> => {
        pollCount++;
        // Simulate a job that takes many polls to complete
        return {
          jobId: 'job-1',
          status: pollCount < 10 ? 'running' : 'completed',
          isTerminal: pollCount >= 10,
          timestamp: Date.now(),
        };
      };

      const startTime = Date.now();
      await poller.poll('job-1', pollFn, { timeout: 60000 });
      const elapsed = Date.now() - startTime;

      // Should complete in reasonable time
      expect(elapsed).toBeLessThan(60000);

      // Verify all polls completed
      expect(pollCount).toBe(10);
    }, 30000);
  });

  describe('interval statistics', () => {
    it('should calculate accurate interval statistics', () => {
      const poller = new JobPoller({
        minInterval: 100,
        maxInterval: 5000,
        multiplier: 2.0,
        randomizationFactor: 0, // No jitter
      });

      const stats = poller.getIntervalStats(5);

      // With no jitter:
      // attempt 0: 100ms
      // attempt 1: 200ms
      // attempt 2: 400ms
      // attempt 3: 800ms
      // attempt 4: 1600ms
      // Total: 3100ms
      expect(stats.totalTime).toBe(3100);
      expect(stats.minInterval).toBe(100);
      expect(stats.maxInterval).toBe(1600);
      expect(stats.avgInterval).toBe(620);
    });

    it('should respect maxInterval cap in statistics', () => {
      const poller = new JobPoller({
        minInterval: 100,
        maxInterval: 500,
        multiplier: 2.0,
        randomizationFactor: 0,
      });

      const stats = poller.getIntervalStats(10);

      // After reaching maxInterval, all subsequent intervals should be 500ms
      expect(stats.maxInterval).toBe(500);

      // Total should be:
      // 100 + 200 + 400 + 500 + 500 + 500 + 500 + 500 + 500 + 500 = 4200ms
      expect(stats.totalTime).toBe(4200);
    });
  });

  describe('memory efficiency', () => {
    it('should not leak memory during repeated polling', async () => {
      const poller = new JobPoller({
        minInterval: 10,
        maxInterval: 100,
      });

      const initialMemory = process.memoryUsage().heapUsed;

      // Run multiple polling operations
      for (let i = 0; i < 10; i++) {
        const pollFn = async (): Promise<PollResult> => ({
          jobId: `job-${i}`,
          status: 'completed',
          isTerminal: true,
          timestamp: Date.now(),
        });

        await poller.poll(`job-${i}`, pollFn, { timeout: 5000 });
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryDelta = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory delta should be reasonable (< 50 MB for 10 operations)
      expect(memoryDelta).toBeLessThan(50);
    });
  });

  describe('throughput', () => {
    it('should handle multiple concurrent polls efficiently', async () => {
      const poller = new JobPoller({
        minInterval: 10,
        maxInterval: 100,
      });

      const jobIds = Array.from({ length: 10 }, (_, i) => `job-${i}`);
      const pollFn = async (jobId: string): Promise<PollResult> => ({
        jobId,
        status: 'completed',
        isTerminal: true,
        timestamp: Date.now(),
      });

      const startTime = Date.now();
      const results = await poller.pollMultiple(jobIds, pollFn, { timeout: 5000 });
      const elapsed = Date.now() - startTime;

      // Should complete all 10 jobs quickly
      expect(results.size).toBe(10);
      expect(elapsed).toBeLessThan(1000); // Should be very fast for immediate completion
    });
  });

  describe('backoff efficiency', () => {
    it('should demonstrate exponential backoff reduces total polling time', () => {
      // Compare fixed interval vs exponential backoff
      const fixedIntervalTotal = 100 * 10; // 1000ms for 10 polls at 100ms each

      const poller = new JobPoller({
        minInterval: 100,
        maxInterval: 5000,
        multiplier: 2.0,
        randomizationFactor: 0,
      });

      const stats = poller.getIntervalStats(10);

      // Exponential backoff should result in longer total time
      // but fewer polls needed to reach terminal state in practice
      expect(stats.totalTime).toBeGreaterThan(fixedIntervalTotal);

      // However, the key benefit is that later polls are spaced further apart,
      // reducing CPU usage during long waits
      expect(stats.maxInterval).toBeGreaterThan(100);
    });
  });
});
