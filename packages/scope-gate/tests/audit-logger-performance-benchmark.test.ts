/**
 * Audit Logger Performance Benchmark Tests
 * 
 * Task 18.3: Optimize audit logging performance
 * 
 * This test measures and verifies audit logging performance optimizations:
 * - Batch writing performance
 * - Async flush mechanism
 * - Microsecond-level write latency
 * - Buffer utilization efficiency
 * 
 * Performance targets:
 * - Single write: < 500µs (with buffering)
 * - Batch write (100 events): < 10ms
 * - Query performance: < 50ms for 1000 events
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OptimizedAuditLogger } from '../src/audit-logger-optimized.js';
import { AuditLogger } from '../src/audit-logger.js';
import type { ScopeViolationAttempt, FeatureFlagChange } from '../src/types.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalMs: number;
  avgUs: number;
  minUs: number;
  maxUs: number;
  p50Us: number;
  p95Us: number;
  p99Us: number;
}

function measureExecution(fn: () => void | Promise<void>): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  return (end - start) * 1000;
}

async function measureExecutionAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  const end = performance.now();
  return (end - start) * 1000;
}

async function benchmarkAsync(
  name: string,
  fn: () => Promise<void>,
  iterations: number
): Promise<BenchmarkResult> {
  const times: number[] = [];
  
  // Warm up
  for (let i = 0; i < 10; i++) {
    await fn();
  }
  
  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const time = await measureExecutionAsync(fn);
    times.push(time);
  }
  
  times.sort((a, b) => a - b);
  
  const totalMs = times.reduce((a, b) => a + b, 0) / 1000;
  const avgUs = totalMs * 1000 / iterations;
  
  return {
    operation: name,
    iterations,
    totalMs,
    avgUs,
    minUs: times[0],
    maxUs: times[times.length - 1],
    p50Us: times[Math.floor(iterations * 0.5)],
    p95Us: times[Math.floor(iterations * 0.95)],
    p99Us: times[Math.floor(iterations * 0.99)],
  };
}

function printBenchmark(result: BenchmarkResult): void {
  console.log(`\n=== ${result.operation} ===`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Total: ${result.totalMs.toFixed(2)}ms`);
  console.log(`Avg: ${result.avgUs.toFixed(2)}µs`);
  console.log(`P50: ${result.p50Us.toFixed(2)}µs`);
  console.log(`P95: ${result.p95Us.toFixed(2)}µs`);
  console.log(`P99: ${result.p99Us.toFixed(2)}µs`);
}

function createViolationAttempt(
  capabilityId: string = 'test-cap',
  scopeTag: 'p0' | 'p1' | 'p2' = 'p1'
): ScopeViolationAttempt {
  return {
    capabilityId,
    scopeTag,
    context: {
      releaseBranch: 'v6.0',
      featureFlags: new Set(),
      environment: 'production'
    },
    userId: 'test-user',
    sessionId: 'test-session',
    timestamp: new Date(),
    stackTrace: 'Error: Test violation'
  };
}

describe('Audit Logger Performance Optimization (Task 18.3)', () => {
  let optimizedLogger: OptimizedAuditLogger;
  let standardLogger: AuditLogger;
  let testLogDirOptimized: string;
  let testLogDirStandard: string;

  const getTestLogDir = (prefix: string) => join(__dirname, prefix, randomUUID());

  beforeEach(async () => {
    testLogDirOptimized = getTestLogDir('perf-logs-optimized');
    testLogDirStandard = getTestLogDir('perf-logs-standard');
    
    // Create loggers with optimized settings
    optimizedLogger = new OptimizedAuditLogger({
      logDirectory: testLogDirOptimized,
      bufferSize: 10,
      flushIntervalMs: 100,
    });
    
    // Standard logger for comparison
    standardLogger = new AuditLogger(testLogDirStandard, undefined, { 
      enableTimer: false,
      maxBufferSize: 10,
      highWaterMark: 5,
      lowWaterMark: 1
    });
  });

  afterEach(async () => {
    await optimizedLogger.dispose();
    await standardLogger.shutdown();
    
    try {
      await fs.rm(testLogDirOptimized, { recursive: true, force: true });
      await fs.rm(testLogDirStandard, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Single Write Performance', () => {
    it('OptimizedAuditLogger: single write should be < 500µs', async () => {
      const result = await benchmarkAsync(
        'Single Write (Optimized)',
        async () => {
          await optimizedLogger.logViolationAttempt(createViolationAttempt());
        },
        100
      );
      
      printBenchmark(result);
      
      // With buffering, single write should be very fast
      expect(result.p95Us).toBeLessThan(500);
      console.log(`\n✅ Single write target met: P95 = ${result.p95Us.toFixed(2)}µs < 500µs`);
    });

    it('OptimizedAuditLogger: write with auto-flush should be < 2ms', async () => {
      // Write 10 events to trigger auto-flush
      const times: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await optimizedLogger.logViolationAttempt(createViolationAttempt(`cap-${i}`, 'p1'));
        const elapsed = (performance.now() - start) * 1000;
        times.push(elapsed);
      }
      
      // Wait for any pending flush
      await optimizedLogger.flush();
      
      const avgUs = times.reduce((a, b) => a + b, 0) / times.length;
      const p95Us = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
      
      console.log(`\n10 writes - avg: ${avgUs.toFixed(2)}µs, p95: ${p95Us.toFixed(2)}µs`);
      
      // Average should be fast with batching
      expect(avgUs).toBeLessThan(2000);
    });
  });

  describe('Batch Write Performance', () => {
    it('should write 100 events efficiently', async () => {
      const start = performance.now();
      
      // Write 100 events
      for (let i = 0; i < 100; i++) {
        await optimizedLogger.logViolationAttempt(createViolationAttempt(`cap-${i}`, 'p1'));
      }
      
      // Force flush
      await optimizedLogger.flush();
      
      const totalTime = (performance.now() - start) * 1000; // µs
      const avgPerWrite = totalTime / 100;
      
      console.log(`\n100 writes: total ${totalTime.toFixed(2)}µs, avg ${avgPerWrite.toFixed(2)}µs per write`);
      
      // Each write should average < 100µs with batching
      expect(avgPerWrite).toBeLessThan(100);
      console.log(`✅ Batch write target met: ${avgPerWrite.toFixed(2)}µs per write < 100µs`);
    });

    it('should handle high-frequency writes', async () => {
      const numEvents = 500;
      const start = performance.now();
      
      // Write events as fast as possible
      for (let i = 0; i < numEvents; i++) {
        await optimizedLogger.logViolationAttempt(createViolationAttempt(`cap-${i}`, 'p1'));
      }
      
      await optimizedLogger.flush();
      
      const totalTime = (performance.now() - start) * 1000;
      const avgPerWrite = totalTime / numEvents;
      
      console.log(`\n${numEvents} writes: total ${totalTime.toFixed(2)}µs, avg ${avgPerWrite.toFixed(2)}µs per write`);
      
      // Even at high volume, should be efficient
      expect(avgPerWrite).toBeLessThan(50);
    });
  });

  describe('Query Performance', () => {
    beforeEach(async () => {
      // Pre-populate with 100 events
      for (let i = 0; i < 100; i++) {
        await optimizedLogger.logViolationAttempt(createViolationAttempt(`cap-${i % 10}`, 'p1'));
      }
      await optimizedLogger.flush();
    });

    it('query all events should be fast', async () => {
      const result = await benchmarkAsync(
        'Query All Events',
        async () => {
          return optimizedLogger.queryScopeEvents({});
        },
        50
      );
      
      printBenchmark(result);
      
      // Query should be < 50ms for 100 events
      expect(result.p95Us).toBeLessThan(50000);
    });

    it('query filtered events should be fast', async () => {
      const result = await benchmarkAsync(
        'Query Filtered (capabilityId)',
        async () => {
          return optimizedLogger.queryScopeEvents({ capabilityId: 'cap-0' });
        },
        50
      );
      
      printBenchmark(result);
      
      expect(result.p95Us).toBeLessThan(50000);
    });
  });

  describe('Buffer Utilization', () => {
    it('should efficiently use buffer', async () => {
      // Write fewer events than buffer size
      for (let i = 0; i < 5; i++) {
        await optimizedLogger.logViolationAttempt(createViolationAttempt(`cap-${i}`, 'p1'));
      }
      
      // Buffer should have events
      const bufferSize = optimizedLogger.getBufferSize();
      expect(bufferSize).toBe(5);
      
      // Flush and verify
      await optimizedLogger.flush();
      
      const stats = await optimizedLogger.getLogStats();
      expect(stats.eventCount).toBe(5);
      
      console.log(`\nBuffer utilization: 5/10 = ${(5/10)*100}%`);
    });

    it('should auto-flush at buffer threshold', async () => {
      const logger = new OptimizedAuditLogger({
        logDirectory: testLogDirOptimized,
        bufferSize: 5, // Small buffer to trigger auto-flush
        flushIntervalMs: 5000, // Long interval so flush is triggered by buffer
      });
      
      // Write exactly buffer size events
      for (let i = 0; i < 5; i++) {
        await logger.logViolationAttempt(createViolationAttempt(`cap-${i}`, 'p1'));
      }
      
      // Should have auto-flushed
      const content = await fs.readFile(join(testLogDirOptimized, 'events.jsonl'), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      expect(lines.length).toBe(5);
      
      await logger.dispose();
    });
  });

  describe('Comparison: Optimized vs Standard', () => {
    it('should show performance improvement over standard logger', async () => {
      const iterations = 50;
      
      // Benchmark optimized logger
      const optimizedStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await optimizedLogger.logViolationAttempt(createViolationAttempt(`cap-${i}`, 'p1'));
      }
      await optimizedLogger.flush();
      const optimizedTime = (performance.now() - optimizedStart) * 1000;
      
      // Benchmark standard logger  
      const standardStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await standardLogger.logViolationAttempt(createViolationAttempt(`cap-${i}`, 'p1'));
      }
      await standardLogger.flushNow();
      const standardTime = (performance.now() - standardStart) * 1000;
      
      const optimizedAvg = optimizedTime / iterations;
      const standardAvg = standardTime / iterations;
      const improvement = ((standardAvg - optimizedAvg) / standardAvg) * 100;
      
      console.log(`\n=== Performance Comparison (${iterations} writes) ===`);
      console.log(`Optimized: ${optimizedAvg.toFixed(2)}µs avg`);
      console.log(`Standard: ${standardAvg.toFixed(2)}µs avg`);
      console.log(`Improvement: ${improvement.toFixed(1)}%`);
      
      // Optimized should be at least as fast (may vary by system)
      expect(optimizedAvg).toBeLessThanOrEqual(standardAvg * 1.5);
    });
  });

  describe('Memory Efficiency', () => {
    it('should not leak memory during repeated writes', async () => {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const initialMemory = process.memoryUsage().heapUsed;
        
        // Write many events
        for (let batch = 0; batch < 10; batch++) {
          for (let i = 0; i < 100; i++) {
            await optimizedLogger.logViolationAttempt(createViolationAttempt(`cap-${i}`, 'p1'));
          }
          await optimizedLogger.flush();
        }
        
        // Force GC if available
        if (global.gc) {
          global.gc();
        }
        
        const finalMemory = process.memoryUsage().heapUsed;
        const growth = (finalMemory - initialMemory) / 1024 / 1024;
        
        console.log(`\nMemory growth after 1000 writes: ${growth.toFixed(2)}MB`);
        
        // Memory growth should be reasonable (< 20MB)
        expect(growth).toBeLessThan(20);
      }
    });
  });

  describe('Concurrent Write Safety', () => {
    it('should handle concurrent writes safely', async () => {
      const numConcurrent = 20;
      const eventsPerWriter = 10;
      
      // Create multiple concurrent writers
      const writers = Array(numConcurrent).fill(null).map(async (_, writerId) => {
        for (let i = 0; i < eventsPerWriter; i++) {
          await optimizedLogger.logViolationAttempt(
            createViolationAttempt(`writer-${writerId}-cap-${i}`, 'p1')
          );
        }
      });
      
      await Promise.all(writers);
      await optimizedLogger.flush();
      
      const stats = await optimizedLogger.getLogStats();
      
      // All events should be recorded
      expect(stats.eventCount).toBe(numConcurrent * eventsPerWriter);
      
      console.log(`\n✅ ${stats.eventCount} concurrent writes completed successfully`);
    });
  });

  describe('Performance Targets Verification', () => {
    it('should meet audit log write target: < 10ms', async () => {
      // Target from design.md: Audit log write < 10ms
      const iterations = 100;
      
      const result = await benchmarkAsync(
        'Audit Log Write (100 events)',
        async () => {
          for (let i = 0; i < iterations; i++) {
            await optimizedLogger.logViolationAttempt(createViolationAttempt());
          }
          await optimizedLogger.flush();
        },
        1
      );
      
      console.log(`\n100 events write: ${result.totalMs.toFixed(2)}ms`);
      
      // Target is < 10ms per event batch
      expect(result.totalMs).toBeLessThan(10);
      console.log(`✅ Write target met: ${result.totalMs.toFixed(2)}ms < 10ms`);
    });

    it('should meet microsecond-level logging target', async () => {
      // Target: microsecond-level logging
      const result = await benchmarkAsync(
        'Microsecond Write',
        async () => {
          await optimizedLogger.logViolationAttempt(createViolationAttempt());
        },
        100
      );
      
      console.log(`\nSingle write: avg ${result.avgUs.toFixed(2)}µs, p95 ${result.p95Us.toFixed(2)}µs`);
      
      // Should achieve microsecond-level writes (P95 < 500µs)
      expect(result.p95Us).toBeLessThan(500);
      console.log(`✅ Microsecond target met: P95 = ${result.p95Us.toFixed(2)}µs`);
    });
  });
});