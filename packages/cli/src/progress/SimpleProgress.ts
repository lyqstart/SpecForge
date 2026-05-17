/**
 * Simple progress indicator for CLI.
 * 
 * Provides basic progress indication for async operations.
 * Only shows progress in interactive mode.
 * In JSON mode, all progress methods are no-ops.
 */

/**
 * Simple progress indicator interface.
 */
export interface SimpleProgress {
  /**
   * Start progress indication.
   */
  start(): void;
  
  /**
   * Update progress message.
   */
  update(message: string): void;
  
  /**
   * Complete with success.
   */
  succeed(message?: string): void;
  
  /**
   * Complete with failure.
   */
  fail(message?: string): void;
  
  /**
   * Stop progress indication.
   */
  stop(): void;
}

/**
 * No-op progress indicator for JSON mode.
 */
class NoopProgress implements SimpleProgress {
  start(): void {}
  update(): void {}
  succeed(): void {}
  fail(): void {}
  stop(): void {}
}

/**
 * Simple spinner for interactive mode.
 */
class SimpleSpinner implements SimpleProgress {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private message: string;
  private isRunning = false;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.render();
    
    this.intervalId = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, 80);
  }

  update(message: string): void {
    this.message = message;
    if (this.isRunning) {
      this.render();
    }
  }

  succeed(message?: string): void {
    this.stop();
    console.log(`✓ ${message || this.message}`);
  }

  fail(message?: string): void {
    this.stop();
    console.log(`✗ ${message || this.message}`);
  }

  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
  }

  private render(): void {
    const frame = this.frames[this.frameIndex];
    process.stdout.write(`\r${frame} ${this.message}`);
  }
}

/**
 * Create a simple progress indicator.
 * 
 * @param isInteractive - Whether we're in interactive mode
 * @param message - Initial message
 * @returns Progress indicator
 */
export function createSimpleProgress(isInteractive: boolean, message: string): SimpleProgress {
  if (!isInteractive) {
    return new NoopProgress();
  }
  return new SimpleSpinner(message);
}

/**
 * Create job progress tracker.
 * 
 * @param isInteractive - Whether we're in interactive mode
 * @param jobId - Job ID
 * @returns Job progress tracker
 */
export function createSimpleJobProgress(isInteractive: boolean, jobId: string): {
  update: (status: { status: string; error?: string }) => void;
  complete: (status: { status: string; error?: string }) => void;
  stop: () => void;
} {
  const progress = createSimpleProgress(isInteractive, `Waiting for job ${jobId}...`);
  
  return {
    update: (status) => {
      if (isInteractive) {
        progress.update(`Job ${jobId}: ${status.status}`);
      }
    },
    
    complete: (status) => {
      if (status.status === 'completed') {
        progress.succeed(`Job ${jobId} completed`);
      } else if (status.status === 'failed') {
        progress.fail(`Job ${jobId} failed: ${status.error || 'Unknown error'}`);
      } else {
        progress.stop();
        if (isInteractive) {
          console.log(`Job ${jobId} ended with status: ${status.status}`);
        }
      }
    },
    
    stop: () => {
      progress.stop();
    }
  };
}