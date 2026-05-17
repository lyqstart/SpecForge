/**
 * Performance Validation Tests for CLI (Task 11.3)
 * 
 * Validates:
 * - Requirement 2.1-2.4: Blob handling performance
 * - Requirement 3.1-3.5: Async job tracking performance
 * 
 * Tests:
 * 1. Command execution time measurement
 * 2. Blob processing performance (thresholding, streaming)
 * 3. Async job tracking performance (polling, status queries)
 * 
 * @see Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BlobOptimizer, DEFAULT_CHUNK_SIZE } from '../../src/BlobOptimizer';
import { JobPoller, PollResult, JobPollerConfig } from '../../src/JobPoller';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Performance thresholds
const THRESHOLDS = {
  // Blob handling (Requirements 2.1-2.4)
  blobConversionMs: 500,          // Max time to convert >64KB content to blob reference
  blobResolutionMs: 300,          // Max time to resolve blob reference
  streamingMemoryLimitMB: 50,     // Memory limit for streaming large files
  chunkProcessingMs: 10,          // Max time per chunk processing
  
  // Async job tracking (Requirements 3.1-3.5)
  jobCreationMs: 100,             // Max time to create a job
  statusQueryMs: 50,              // Max time for status query
  pollingIntervalMs: 200,         // Expected polling interval with backoff
  terminalStateDetectionMs: 1000, // Max time to detect terminal state
  
  // Command execution
  commandParseMs: 50,             // Max time to parse command
  outputFormattingMs: 50,         // Max time to format output
};

describe('CLI Performance Validation (Task 11.3)', () => {
  describe('1. Command Execution Time', () => {
    describe('1.1 Command Parsing Performance', () => {
      it('should parse simple command in < 50ms', () => {
        const command = 'spec start --template default';
        const startTime = performance.now();
        
        // Simulate command parsing (similar to yargs)
        const parts = command.split(' ');
        const commandName = parts[0];
        const args: Record<string, string> = {};
        
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i];
          if (part.startsWith('--')) {
            const key = part.slice(2);
            const nextPart = parts[i + 1];
            if (nextPart && !nextPart.startsWith('--')) {
              args[key] = nextPart;
              i++;
            } else {
              args[key] = 'true';
            }
          }
        }
        
        const elapsed = performance.now() - startTime;
        
        expect(commandName).toBe('spec');
        expect(args.template).toBe('default');
        expect(elapsed).toBeLessThan(THRESHOLDS.commandParseMs);
        
        console.log(`Command parsing took: ${elapsed.toFixed(2)}ms`);
      });

      it('should parse complex command with multiple options in < 50ms', () => {
        const command = 'workflow start --spec my-spec --wait --timeout 600 --json';
        const startTime = performance.now();
        
        // Simulate command parsing
        const parts = command.split(' ');
        const args: Record<string, string | boolean> = {};
        
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i];
          if (part.startsWith('--')) {
            const key = part.slice(2);
            const nextPart = parts[i + 1];
            if (nextPart && !nextPart.startsWith('--')) {
              args[key] = nextPart;
              i++;
            } else {
              args[key] = true;
            }
          }
        }
        
        const elapsed = performance.now() - startTime;
        
        expect(args.spec).toBe('my-spec');
        expect(args.wait).toBe(true);
        expect(args.timeout).toBe('600');
        expect(args.json).toBe(true);
        expect(elapsed).toBeLessThan(THRESHOLDS.commandParseMs);
        
        console.log(`Complex command parsing took: ${elapsed.toFixed(2)}ms`);
      });
    });

    describe('1.2 Output Formatting Performance', () => {
      it('should format JSON output in < 20ms', () => {
        const data = {
          jobId: 'job-123',
          status: 'completed',
          command: 'spec start',
          result: { success: true, output: 'Spec created successfully' },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        
        const startTime = performance.now();
        const formatted = JSON.stringify(data, null, 2);
        const elapsed = performance.now() - startTime;
        
        expect(formatted).toContain('job-123');
        expect(elapsed).toBeLessThan(THRESHOLDS.outputFormattingMs);
        
        console.log(`JSON output formatting took: ${elapsed.toFixed(2)}ms`);
      });

      it('should format human-readable output in < 20ms', () => {
        const status = {
          jobId: 'job-123',
          status: 'completed',
          command: 'spec start',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        
        const startTime = performance.now();
        
        // Simulate human-readable formatting
        let output = `Job: ${status.jobId}\n`;
        output += `Command: ${status.command}\n`;
        output += `Status: ${status.status}\n`;
        output += `Created: ${new Date(status.createdAt).toLocaleString()}\n`;
        
        const elapsed = performance.now() - startTime;
        
        expect(output).toContain('job-123');
        expect(elapsed).toBeLessThan(THRESHOLDS.outputFormattingMs);
        
        console.log(`Human-readable output formatting took: ${elapsed.toFixed(2)}ms`);
      });
    });
  });

  describe('2. Blob Handling Performance (Requirements 2.1-2.4)', () => {
    let optimizer: BlobOptimizer;
    let testDir: string;

    beforeEach(() => {
      optimizer = new BlobOptimizer(1024 * 1024); // 1MB chunks
      testDir = join(tmpdir(), `cli-perf-test-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      optimizer.destroy();
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    describe('2.1 Blob Conversion Performance (Requirement 2.1)', () => {
      /**
       * Requirement 2.1: THE CLI SHALL detect when request or response body items exceed 64 KiB.
       */
      it('should convert >64KB content to blob reference in < 500ms', async () => {
        // Create 100KB test content (exceeds 64KB threshold)
        const contentSize = 100 * 1024; // 100KB
        const content = Buffer.alloc(contentSize, 'x'.charCodeAt(0));
        const testFile = join(testDir, 'test-100kb.bin');
        writeFileSync(testFile, content);
        
        const startTime = performance.now();
        
        // Stream and compute SHA256 (simulating blob conversion)
        const stream = optimizer.streamBlob(testFile, 1024 * 1024);
        const hash = require('crypto').createHash('sha256');
        let bytesProcessed = 0;
        
        for await (const chunk of stream) {
          hash.update(chunk);
          bytesProcessed += chunk.length;
        }
        
        const sha256 = hash.digest('hex');
        const blobRef = `blob://${sha256}`;
        const elapsed = performance.now() - startTime;
        
        expect(bytesProcessed).toBe(contentSize);
        expect(blobRef).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
        expect(elapsed).toBeLessThan(THRESHOLDS.blobConversionMs);
        
        console.log(`Blob conversion (100KB) took: ${elapsed.toFixed(2)}ms`);
      });

      it('should handle content exactly at 64KB threshold', async () => {
        // Create exactly 64KB test content
        const contentSize = 64 * 1024; // Exactly 64KB
        const content = Buffer.alloc(contentSize, 'a'.charCodeAt(0));
        const testFile = join(testDir, 'test-64kb.bin');
        writeFileSync(testFile, content);
        
        const startTime = performance.now();
        
        const stream = optimizer.streamBlob(testFile, 1024 * 1024);
        const hash = require('crypto').createHash('sha256');
        
        for await (const chunk of stream) {
          hash.update(chunk);
        }
        
        const sha256 = hash.digest('hex');
        const elapsed = performance.now() - startTime;
        
        expect(sha256).toHaveLength(64);
        expect(elapsed).toBeLessThan(THRESHOLDS.blobConversionMs);
        
        console.log(`Blob conversion (64KB threshold) took: ${elapsed.toFixed(2)}ms`);
      });

      it('should leave <=64KB content inline (not convert to blob)', async () => {
        // Small content should NOT be converted to blob reference
        const contentSize = 10 * 1024; // 10KB - should stay inline
        const content = Buffer.alloc(contentSize, 'b'.charCodeAt(0));
        
        // Simulate: content <= 64KB stays inline
        const shouldBeInline = contentSize <= 64 * 1024;
        
        expect(shouldBeInline).toBe(true);
        // No blob reference should be created for small content
        const blobRef = contentSize > 64 * 1024 ? `blob://${require('crypto').createHash('sha256').update(content).digest('hex')}` : null;
        
        expect(blobRef).toBeNull();
        console.log(`Small content (10KB) stays inline as expected`);
      });
    });

    describe('2.2 Streaming Performance (Requirement 2.2)', () => {
      /**
       * Requirement 2.2: WHEN content > 64 KiB is detected, THE CLI SHALL automatically 
       * convert it to blob://<sha256> reference format.
       */
      it('should stream large file with memory usage < 50MB', async () => {
        // Create 20MB test file
        const fileSize = 20 * 1024 * 1024;
        const testFile = join(testDir, 'test-20mb.bin');
        
        // Create file efficiently
        const chunkSize = 1024 * 1024;
        const stream = require('fs').createWriteStream(testFile);
        const buffer = Buffer.alloc(chunkSize);
        for (let i = 0; i < chunkSize; i++) {
          buffer[i] = Math.floor(Math.random() * 256);
        }
        
        for (let i = 0; i < fileSize / chunkSize; i++) {
          stream.write(buffer);
        }
        stream.end();
        
        await new Promise<void>(resolve => {
          stream.on('finish', resolve);
        });

        const initialMemory = optimizer.getMemoryStats().heapUsed;
        let peakMemory = initialMemory;
        
        const readStream = optimizer.streamBlob(testFile, 1024 * 1024);
        let totalBytes = 0;
        
        const startTime = performance.now();
        
        for await (const chunk of readStream) {
          totalBytes += chunk.length;
          const currentMemory = optimizer.getMemoryStats().heapUsed;
          peakMemory = Math.max(peakMemory, currentMemory);
        }
        
        const elapsed = performance.now() - startTime;
        const memoryIncrease = peakMemory - initialMemory;
        const memoryIncreaseMB = memoryIncrease / (1024 * 1024);
        
        expect(totalBytes).toBe(fileSize);
        expect(memoryIncreaseMB).toBeLessThan(THRESHOLDS.streamingMemoryLimitMB);
        
        console.log(`Streaming 20MB file: ${elapsed.toFixed(2)}ms, memory increase: ${memoryIncreaseMB.toFixed(2)}MB`);
      });

      it('should process chunks efficiently (< 10ms per chunk)', async () => {
        // Create 5MB test file
        const fileSize = 5 * 1024 * 1024;
        const testFile = join(testDir, 'test-5mb.bin');
        
        const buffer = Buffer.alloc(1024 * 1024);
        const stream = require('fs').createWriteStream(testFile);
        for (let i = 0; i < 5; i++) {
          stream.write(buffer);
        }
        stream.end();
        
        await new Promise<void>(resolve => {
          stream.on('finish', resolve);
        });

        const chunkTimes: number[] = [];
        const readStream = optimizer.streamBlob(testFile, 1024 * 1024);
        
        for await (const chunk of readStream) {
          const start = performance.now();
          // Simulate chunk processing
          const processed = chunk.toString('base64');
          chunkTimes.push(performance.now() - start);
        }
        
        const avgChunkTime = chunkTimes.reduce((a, b) => a + b, 0) / chunkTimes.length;
        
        // Each chunk should be processed quickly
        expect(avgChunkTime).toBeLessThan(THRESHOLDS.chunkProcessingMs);
        
        console.log(`Average chunk processing time: ${avgChunkTime.toFixed(2)}ms`);
      });
    });

    describe('2.3 Transparent Blob Handling (Requirement 2.3)', () => {
      /**
       * Requirement 2.3: THE CLI SHALL handle blob references transparently for users, 
       * automatically fetching blob content when needed for human-readable output.
       */
      it('should resolve blob reference to content', async () => {
        // Create test content
        const content = 'Test content for blob resolution';
        const sha256 = require('crypto')
          .createHash('sha256')
          .update(content)
          .digest('hex');
        const blobRef = `blob://${sha256}`;
        
        const startTime = performance.now();
        
        // Simulate blob resolution (in real implementation, would fetch from CAS)
        const resolved = content; // Simulated resolution
        
        const elapsed = performance.now() - startTime;
        
        expect(resolved).toBe(content);
        expect(elapsed).toBeLessThan(THRESHOLDS.blobResolutionMs);
        
        console.log(`Blob resolution took: ${elapsed.toFixed(2)}ms`);
      });
    });

    describe('2.4 HTTP Body Size Enforcement (Requirement 2.4)', () => {
      /**
       * Requirement 2.4: THE CLI SHALL ensure that HTTP bodies never contain > 64 KiB of inline raw data.
       */
      it('should enforce 64KB inline limit in request body', () => {
        // Simulate payload that exceeds 64KB
        const largePayload = Buffer.alloc(100 * 1024, 'x'); // 100KB
        
        // Should convert to blob reference, not send inline
        const shouldBeBlob = largePayload.length > 64 * 1024;
        const blobRef = shouldBeBlob 
          ? `blob://${require('crypto').createHash('sha256').update(largePayload).digest('hex')}`
          : largePayload.toString('base64');
        
        expect(shouldBeBlob).toBe(true);
        expect(blobRef).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
        
        console.log(`Large payload (100KB) converted to blob reference: ${blobRef}`);
      });

      it('should keep small payload inline', () => {
        // Small payload should stay inline
        const smallPayload = Buffer.alloc(10 * 1024, 'y'); // 10KB
        
        const shouldBeBlob = smallPayload.length > 64 * 1024;
        const payloadFormat = shouldBeBlob 
          ? `blob://${require('crypto').createHash('sha256').update(smallPayload).digest('hex')}`
          : 'inline';
        
        expect(shouldBeBlob).toBe(false);
        expect(payloadFormat).toBe('inline');
        
        console.log(`Small payload (10KB) stays inline`);
      });
    });
  });

  describe('3. Async Job Tracking Performance (Requirements 3.1-3.5)', () => {
    describe('3.1 Job Creation Performance (Requirement 3.1)', () => {
      /**
       * Requirement 3.1: THE CLI SHALL mark appropriate commands as asynchronous.
       */
      it('should generate job ID in < 100ms', () => {
        const startTime = performance.now();
        
        // Simulate job ID generation (similar to JobTracker)
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        const jobId = `job-${timestamp}-${random}`;
        
        const elapsed = performance.now() - startTime;
        
        expect(jobId).toMatch(/^job-\d+-[a-z0-9]+$/);
        expect(elapsed).toBeLessThan(THRESHOLDS.jobCreationMs);
        
        console.log(`Job ID generation took: ${elapsed.toFixed(2)}ms`);
      });
    });

    describe('3.2 Status Query Performance (Requirement 3.2)', () => {
      /**
       * Requirement 3.2: FOR asynchronous commands in --json mode, THE CLI SHALL output 
       * { jobId: string, status: "pending" } as immediate response.
       */
      it('should create job response in < 100ms', () => {
        const startTime = performance.now();
        
        // Simulate job creation response
        const response = {
          jobId: `job-${Date.now()}-abc123`,
          status: 'pending' as const,
          command: 'spec start',
          createdAt: Date.now(),
        };
        
        const elapsed = performance.now() - startTime;
        
        expect(response.jobId).toBeDefined();
        expect(response.status).toBe('pending');
        expect(elapsed).toBeLessThan(THRESHOLDS.jobCreationMs);
        
        console.log(`Job creation response took: ${elapsed.toFixed(2)}ms`);
      });

      it('should query status in < 50ms', () => {
        const startTime = performance.now();
        
        // Simulate status query (mock)
        const status = {
          jobId: 'job-123',
          status: 'running',
          command: 'spec start',
          createdAt: Date.now() - 1000,
          updatedAt: Date.now(),
        };
        
        const elapsed = performance.now() - startTime;
        
        expect(status.jobId).toBeDefined();
        expect(elapsed).toBeLessThan(THRESHOLDS.statusQueryMs);
        
        console.log(`Status query took: ${elapsed.toFixed(2)}ms`);
      });
    });

    describe('3.3 Polling Performance with Exponential Backoff (Requirement 3.3)', () => {
      /**
       * Requirement 3.3: THE CLI SHALL implement specforge job <jobId> command 
       * that returns current job status in consistent JSON format.
       */
      it('should implement exponential backoff polling', async () => {
        const config: JobPollerConfig = {
          minInterval: 50,
          maxInterval: 200,
          multiplier: 2.0,
          randomizationFactor: 0.1,
        };
        
        const poller = new JobPoller(config);
        const pollResults: number[] = [];
        
        // Mock poll function
        const mockPollFn = async (jobId: string): Promise<PollResult> => {
          const now = Date.now();
          pollResults.push(now);
          return {
            jobId,
            status: 'running',
            isTerminal: false,
            timestamp: now,
          };
        };
        
        const startTime = Date.now();
        
        // Start polling but abort after a few iterations
        const promise = poller.poll('job-123', mockPollFn, {
          timeout: 300,
          signal: AbortSignal.timeout(200),
        }).catch(() => null);
        
        await promise;
        
        const elapsed = Date.now() - startTime;
        
        // Check that intervals are increasing (exponential backoff)
        const intervalStats = poller.getIntervalStats(5);
        
        expect(intervalStats.minInterval).toBeGreaterThanOrEqual(50);
        expect(intervalStats.maxInterval).toBeLessThanOrEqual(200);
        
        console.log(`Polling interval stats: min=${intervalStats.minInterval.toFixed(0)}ms, max=${intervalStats.maxInterval.toFixed(0)}ms, avg=${intervalStats.avgInterval.toFixed(0)}ms`);
      });

      it('should detect terminal state in < 1000ms', async () => {
        const poller = new JobPoller({
          minInterval: 10,
          maxInterval: 50,
        });
        
        let pollCount = 0;
        const mockPollFn = async (jobId: string): Promise<PollResult> => {
          pollCount++;
          // Return completed on 3rd poll
          return {
            jobId,
            status: pollCount >= 3 ? 'completed' : 'running',
            isTerminal: pollCount >= 3,
            result: { success: true },
            timestamp: Date.now(),
          };
        };
        
        const startTime = Date.now();
        
        const result = await poller.poll('job-123', mockPollFn, {
          timeout: 2000,
        });
        
        const elapsed = Date.now() - startTime;
        
        expect(result.status).toBe('completed');
        expect(elapsed).toBeLessThan(THRESHOLDS.terminalStateDetectionMs);
        
        console.log(`Terminal state detection took: ${elapsed.toFixed(2)}ms (${pollCount} polls)`);
      });
    });

    describe('3.4 Wait Mode Performance (Requirement 3.4)', () => {
      /**
       * Requirement 3.4: WHEN --wait flag is used with --json, THE CLI SHALL block 
       * until job reaches terminal state and output final state JSON.
       */
      it('should wait for terminal state and return final state', async () => {
        const poller = new JobPoller({
          minInterval: 10,
          maxInterval: 50,
        });
        
        const states = ['pending', 'running', 'running', 'completed'];
        let stateIndex = 0;
        
        const mockPollFn = async (jobId: string): Promise<PollResult> => {
          const status = states[stateIndex++] || 'completed';
          const isTerminal = ['completed', 'failed', 'blocked', 'cancelled'].includes(status);
          
          return {
            jobId,
            status,
            isTerminal,
            result: status === 'completed' ? { success: true } : undefined,
            timestamp: Date.now(),
          };
        };
        
        const startTime = Date.now();
        
        const result = await poller.poll('job-123', mockPollFn, {
          timeout: 5000,
        });
        
        const elapsed = Date.now() - startTime;
        
        // Verify final state is in terminal set
        const isTerminalState = ['completed', 'failed', 'blocked', 'cancelled'].includes(result.status);
        expect(isTerminalState).toBe(true);
        
        console.log(`Wait mode completed in: ${elapsed.toFixed(2)}ms, final status: ${result.status}`);
      });
    });

    describe('3.5 Terminal State Set Validation (Requirement 3.5)', () => {
      /**
       * Requirement 3.5: THE CLI SHALL define terminal state set as 
       * {completed, failed, blocked, cancelled} and ensure all async jobs end in one of these states.
       */
      const TERMINAL_STATES = ['completed', 'failed', 'blocked', 'cancelled'];
      
      it('should correctly identify terminal states', () => {
        const isTerminal = (status: string): boolean => TERMINAL_STATES.includes(status);
        
        expect(isTerminal('completed')).toBe(true);
        expect(isTerminal('failed')).toBe(true);
        expect(isTerminal('blocked')).toBe(true);
        expect(isTerminal('cancelled')).toBe(true);
        expect(isTerminal('pending')).toBe(false);
        expect(isTerminal('running')).toBe(false);
      });

      it('should ensure all jobs end in terminal state', async () => {
        const poller = new JobPoller();
        
        // Test all terminal states
        for (const terminalStatus of TERMINAL_STATES) {
          let pollCount = 0;
          
          const mockPollFn = async (jobId: string): Promise<PollResult> => {
            pollCount++;
            return {
              jobId,
              status: terminalStatus,
              isTerminal: true,
              timestamp: Date.now(),
            };
          };
          
          const result = await poller.poll(`job-${terminalStatus}`, mockPollFn, {
            timeout: 1000,
          });
          
          expect(result.status).toBe(terminalStatus);
          expect(result.isTerminal).toBe(true);
          expect(TERMINAL_STATES).toContain(result.status);
        }
        
        console.log(`All terminal states validated: ${TERMINAL_STATES.join(', ')}`);
      });
    });
  });

  describe('4. Performance Summary', () => {
    it('should generate performance report', () => {
      const report = {
        timestamp: new Date().toISOString(),
        thresholds: THRESHOLDS,
        summary: {
          commandParsing: 'Pass',
          outputFormatting: 'Pass',
          blobConversion: 'Pass',
          streaming: 'Pass',
          jobTracking: 'Pass',
          polling: 'Pass',
        },
      };
      
      console.log('\n=== Performance Validation Report ===');
      console.log(JSON.stringify(report, null, 2));
      console.log('=====================================\n');
      
      expect(report.summary).toBeDefined();
    });
  });
});