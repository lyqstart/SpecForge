/**
 * Spinner for async operations.
 * 
 * Provides a simple animated spinner for short async operations.
 * Only active in interactive mode.
 */

import { ProgressIndicator } from './ProgressIndicator';

/**
 * Spinner implementation.
 */
export class Spinner implements ProgressIndicator {
  private readonly frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private message: string;
  private isRunning = false;
  private lastLineLength = 0;

  /**
   * Create a new spinner.
   * 
   * @param initialMessage - Initial message to display
   */
  constructor(initialMessage: string) {
    this.message = initialMessage;
  }

  /**
   * Start the spinner.
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.render();
    
    // Update animation every 80ms
    this.intervalId = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, 80);
  }

  /**
   * Update the spinner message.
   * 
   * @param message - New message
   */
  update(message: string): void {
    this.message = message;
    if (this.isRunning) {
      this.render();
    }
  }

  /**
   * Complete the spinner with success.
   * 
   * @param message - Success message (optional)
   */
  succeed(message?: string): void {
    this.stop();
    this.clearLine();
    if (message) {
      console.log(`✓ ${message}`);
    } else {
      console.log(`✓ ${this.message}`);
    }
  }

  /**
   * Complete the spinner with failure.
   * 
   * @param message - Failure message (optional)
   */
  fail(message?: string): void {
    this.stop();
    this.clearLine();
    if (message) {
      console.log(`✗ ${message}`);
    } else {
      console.log(`✗ ${this.message}`);
    }
  }

  /**
   * Stop the spinner without completion message.
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.clearLine();
  }

  /**
   * Render the current spinner state.
   */
  private render(): void {
    this.clearLine();
    const frame = this.frames[this.frameIndex];
    const line = `${frame} ${this.message}`;
    process.stdout.write(line);
    this.lastLineLength = line.length;
  }

  /**
   * Clear the current line.
   */
  private clearLine(): void {
    if (this.lastLineLength > 0) {
      process.stdout.write('\r' + ' '.repeat(this.lastLineLength) + '\r');
      this.lastLineLength = 0;
    }
  }
}