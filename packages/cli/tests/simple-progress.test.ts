/**
 * Simple progress indicator tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSimpleProgress, createSimpleJobProgress } from '../src/progress/SimpleProgress';

describe('SimpleProgress', () => {
  let originalStdoutWrite: typeof process.stdout.write;
  let stdoutOutput: string[] = [];
  let originalConsoleLog: typeof console.log;
  let consoleOutput: string[] = [];

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutOutput = [];
    process.stdout.write = vi.fn((chunk: any) => {
      stdoutOutput.push(chunk.toString());
      return true;
    }) as any;

    originalConsoleLog = console.log;
    consoleOutput = [];
    console.log = vi.fn((...args: any[]) => {
      consoleOutput.push(args.map(arg => String(arg)).join(' '));
    }) as any;

    vi.useFakeTimers();
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    console.log = originalConsoleLog;
    vi.useRealTimers();
  });

  it('should create no-op progress for non-interactive mode', () => {
    const progress = createSimpleProgress(false, 'Test message');
    expect(progress).toBeDefined();
    
    // No-op should not throw errors
    expect(() => {
      progress.start();
      progress.update('Test');
      progress.succeed();
      progress.fail();
      progress.stop();
    }).not.toThrow();
  });

  it('should create spinner for interactive mode', () => {
    const progress = createSimpleProgress(true, 'Test message');
    expect(progress).toBeDefined();
  });

  it('should start and render spinner', () => {
    const progress = createSimpleProgress(true, 'Test message');
    progress.start();
    
    expect(stdoutOutput.length).toBeGreaterThan(0);
    expect(stdoutOutput[0]).toContain('Test message');
  });

  it('should update spinner message', () => {
    const progress = createSimpleProgress(true, 'Initial message');
    progress.start();
    
    stdoutOutput.length = 0; // Clear output
    progress.update('Updated message');
    
    // Advance timer to trigger render
    vi.advanceTimersByTime(80);
    
    expect(stdoutOutput.some(output => output.includes('Updated message'))).toBe(true);
  });

  it('should succeed with message', () => {
    const progress = createSimpleProgress(true, 'Test message');
    progress.start();
    
    stdoutOutput.length = 0; // Clear output
    progress.succeed('Success!');
    
    expect(consoleOutput.some(output => output.includes('✓ Success!'))).toBe(true);
  });

  it('should fail with message', () => {
    const progress = createSimpleProgress(true, 'Test message');
    progress.start();
    
    stdoutOutput.length = 0; // Clear output
    progress.fail('Failed!');
    
    expect(consoleOutput.some(output => output.includes('✗ Failed!'))).toBe(true);
  });
});

describe('SimpleJobProgress', () => {
  let originalConsoleLog: typeof console.log;
  let consoleOutput: string[] = [];

  beforeEach(() => {
    originalConsoleLog = console.log;
    consoleOutput = [];
    console.log = vi.fn((...args: any[]) => {
      consoleOutput.push(args.map(arg => String(arg)).join(' '));
    }) as any;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it('should create job progress for interactive mode', () => {
    const progress = createSimpleJobProgress(true, 'test-job-123');
    expect(progress).toBeDefined();
    expect(progress.update).toBeDefined();
    expect(progress.complete).toBeDefined();
    expect(progress.stop).toBeDefined();
  });

  it('should create job progress for non-interactive mode', () => {
    const progress = createSimpleJobProgress(false, 'test-job-123');
    expect(progress).toBeDefined();
  });

  it('should update job status in interactive mode', () => {
    const progress = createSimpleJobProgress(true, 'test-job-123');
    
    // We can't easily test the stdout output, but we can verify the function exists
    expect(() => {
      progress.update({ status: 'running' });
    }).not.toThrow();
  });

  it('should complete job with success in interactive mode', () => {
    const progress = createSimpleJobProgress(true, 'test-job-123');
    
    progress.complete({ status: 'completed' });
    
    expect(consoleOutput.some(output => output.includes('✓ Job test-job-123 completed'))).toBe(true);
  });

  it('should complete job with failure in interactive mode', () => {
    const progress = createSimpleJobProgress(true, 'test-job-123');
    
    progress.complete({ status: 'failed', error: 'Test error' });
    
    expect(consoleOutput.some(output => output.includes('✗ Job test-job-123 failed: Test error'))).toBe(true);
  });

  it('should handle other statuses in interactive mode', () => {
    const progress = createSimpleJobProgress(true, 'test-job-123');
    
    progress.complete({ status: 'cancelled' });
    
    expect(consoleOutput.some(output => output.includes('Job test-job-123 ended with status: cancelled'))).toBe(true);
  });
});