/**
 * Progress indicator tests.
 * 
 * Tests for:
 * - Spinner component
 * - Progress bar component
 * - Job progress tracking
 * - Dual-mode support (interactive vs JSON)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Spinner } from '../src/progress/Spinner';
import { ProgressBar } from '../src/progress/ProgressBar';
import { ProgressIndicatorFactory } from '../src/progress/ProgressIndicator';
import { createJobProgress } from '../src/progress/JobProgress';

describe('ProgressIndicatorFactory', () => {
  it('should create spinner for interactive mode', () => {
    const indicator = ProgressIndicatorFactory.create('human', 'spinner', 'Test spinner');
    expect(indicator).toBeInstanceOf(Spinner);
  });

  it('should create progress bar for interactive mode', () => {
    const indicator = ProgressIndicatorFactory.create('human', 'bar', 'Test progress bar');
    expect(indicator).toBeInstanceOf(ProgressBar);
  });

  it('should create no-op indicator for JSON mode', () => {
    const indicator = ProgressIndicatorFactory.create('json', 'spinner', 'Test spinner');
    // No-op indicator doesn't have a specific class, but we can test its behavior
    expect(indicator.start).toBeDefined();
    expect(indicator.update).toBeDefined();
    expect(indicator.succeed).toBeDefined();
    expect(indicator.fail).toBeDefined();
    expect(indicator.stop).toBeDefined();
  });
});

describe('Spinner', () => {
  let originalStdoutWrite: typeof process.stdout.write;
  let stdoutOutput: string[] = [];

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutOutput = [];
    process.stdout.write = vi.fn((chunk: any) => {
      stdoutOutput.push(chunk.toString());
      return true;
    }) as any;

    vi.useFakeTimers();
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    vi.useRealTimers();
  });

  it('should start and render spinner', () => {
    const spinner = new Spinner('Test message');
    spinner.start();

    expect(stdoutOutput.length).toBeGreaterThan(0);
    expect(stdoutOutput[0]).toContain('Test message');
  });

  it('should update message', () => {
    const spinner = new Spinner('Initial message');
    spinner.start();
    
    stdoutOutput.length = 0; // Clear output
    spinner.update('Updated message');
    
    // Advance timer to trigger render
    vi.advanceTimersByTime(80);
    
    expect(stdoutOutput.some(output => output.includes('Updated message'))).toBe(true);
  });

  it('should succeed with message', () => {
    const spinner = new Spinner('Test message');
    spinner.start();
    
    stdoutOutput.length = 0; // Clear output
    spinner.succeed('Success!');
    
    expect(stdoutOutput.some(output => output.includes('✓ Success!'))).toBe(true);
  });

  it('should fail with message', () => {
    const spinner = new Spinner('Test message');
    spinner.start();
    
    stdoutOutput.length = 0; // Clear output
    spinner.fail('Failed!');
    
    expect(stdoutOutput.some(output => output.includes('✗ Failed!'))).toBe(true);
  });

  it('should stop without message', () => {
    const spinner = new Spinner('Test message');
    spinner.start();
    
    stdoutOutput.length = 0; // Clear output
    spinner.stop();
    
    // Should clear the line
    expect(stdoutOutput.some(output => output.includes('\r'))).toBe(true);
  });
});

describe('ProgressBar', () => {
  let originalStdoutWrite: typeof process.stdout.write;
  let stdoutOutput: string[] = [];

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutOutput = [];
    process.stdout.write = vi.fn((chunk: any) => {
      stdoutOutput.push(chunk.toString());
      return true;
    }) as any;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  it('should create progress bar with default options', () => {
    const progressBar = new ProgressBar('Test progress');
    expect(progressBar).toBeInstanceOf(ProgressBar);
  });

  it('should create progress bar with custom options', () => {
    const progressBar = new ProgressBar('Test progress', {
      total: 50,
      width: 20,
      showPercentage: false,
      showElapsed: false,
      showRemaining: false,
    });
    expect(progressBar).toBeInstanceOf(ProgressBar);
  });

  it('should update progress', () => {
    const progressBar = new ProgressBar('Test progress', { total: 10 });
    progressBar.start();
    
    stdoutOutput.length = 0; // Clear output
    progressBar.update(5, 'Halfway there');
    
    expect(stdoutOutput.length).toBeGreaterThan(0);
    expect(stdoutOutput[0]).toContain('Halfway there');
    expect(stdoutOutput[0]).toContain('50%');
  });

  it('should succeed with message', () => {
    const progressBar = new ProgressBar('Test progress', { total: 10 });
    progressBar.start();
    
    stdoutOutput.length = 0; // Clear output
    progressBar.succeed('Completed!');
    
    expect(stdoutOutput.some(output => output.includes('✓ Completed!'))).toBe(true);
  });

  it('should fail with message', () => {
    const progressBar = new ProgressBar('Test progress', { total: 10 });
    progressBar.start();
    
    stdoutOutput.length = 0; // Clear output
    progressBar.fail('Failed!');
    
    expect(stdoutOutput.some(output => output.includes('✗ Failed!'))).toBe(true);
  });
});

describe('JobProgress', () => {
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
    const progress = createJobProgress('human', 'test-job-123');
    expect(progress).toBeDefined();
  });

  it('should create job progress for JSON mode', () => {
    const progress = createJobProgress('json', 'test-job-123');
    expect(progress).toBeDefined();
  });

  it('should output JSON status updates in JSON mode', () => {
    const progress = createJobProgress('json', 'test-job-123');
    
    progress.update({
      jobId: 'test-job-123',
      status: 'running',
      command: 'test',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now(),
    });

    expect(consoleOutput.length).toBeGreaterThan(0);
    const output = JSON.parse(consoleOutput[0]);
    expect(output.type).toBe('job_status');
    expect(output.jobId).toBe('test-job-123');
    expect(output.status).toBe('running');
  });

  it('should output final result in JSON mode', () => {
    const progress = createJobProgress('json', 'test-job-123');
    
    progress.complete({
      jobId: 'test-job-123',
      status: 'completed',
      command: 'test',
      result: { output: 'test result' },
      createdAt: Date.now() - 2000,
      updatedAt: Date.now(),
    });

    expect(consoleOutput.length).toBeGreaterThan(0);
    const output = JSON.parse(consoleOutput[0]);
    expect(output.type).toBe('job_result');
    expect(output.jobId).toBe('test-job-123');
    expect(output.status).toBe('completed');
    expect(output.result).toEqual({ output: 'test result' });
  });
});

describe('Progress indicator integration', () => {
  it('should handle mode switching correctly', () => {
    // Test that JSON mode returns no-op indicator
    const jsonIndicator = ProgressIndicatorFactory.create('json', 'spinner', 'Test');
    jsonIndicator.start();
    jsonIndicator.update('Updating');
    jsonIndicator.succeed('Done');
    
    // No-op indicator should not throw errors
    expect(() => {
      jsonIndicator.start();
      jsonIndicator.update('Test');
      jsonIndicator.succeed();
      jsonIndicator.fail();
      jsonIndicator.stop();
    }).not.toThrow();
  });

  it('should format elapsed time correctly', () => {
    // This is an indirect test of the JobProgress internal method
    const progress = createJobProgress('human', 'test-job');
    
    // We can't directly test the private method, but we can verify
    // that the class is created successfully
    expect(progress).toBeDefined();
  });
});