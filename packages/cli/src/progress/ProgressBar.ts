/**
 * Progress bar for long operations.
 * 
 * Provides a visual progress bar for operations with known total steps.
 * Only active in interactive mode.
 */

import { ProgressIndicator } from './ProgressIndicator';

/**
 * Progress bar options.
 */
export interface ProgressBarOptions {
  /** Total number of steps (default: 100) */
  total?: number;
  /** Width of the bar in characters (default: 40) */
  width?: number;
  /** Whether to show percentage (default: true) */
  showPercentage?: boolean;
  /** Whether to show elapsed time (default: true) */
  showElapsed?: boolean;
  /** Whether to show remaining time estimate (default: true) */
  showRemaining?: boolean;
}

/**
 * Progress bar implementation.
 */
export class ProgressBar implements ProgressIndicator {
  private message: string;
  private current = 0;
  private total: number;
  private width: number;
  private showPercentage: boolean;
  private showElapsed: boolean;
  private showRemaining: boolean;
  private startTime: number | null = null;
  private isRunning = false;
  private lastLineLength = 0;

  /**
   * Create a new progress bar.
   * 
   * @param initialMessage - Initial message to display
   * @param options - Progress bar options
   */
  constructor(initialMessage: string, options: ProgressBarOptions = {}) {
    this.message = initialMessage;
    this.total = options.total ?? 100;
    this.width = options.width ?? 40;
    this.showPercentage = options.showPercentage ?? true;
    this.showElapsed = options.showElapsed ?? true;
    this.showRemaining = options.showRemaining ?? true;
  }

  /**
   * Start the progress bar.
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.startTime = Date.now();
    this.render();
  }

  /**
   * Update the progress bar.
   * 
   * @param message - Progress message or progress value
   * @param value - Optional progress value if first param is message
   */
  update(message: string): void;
  update(current: number, message?: string): void;
  
  update(arg: number | string, message?: string): void {
    if (typeof arg === 'string') {
      // If first arg is string, treat as message only
      this.message = arg;
    } else {
      // If first arg is number, update progress
      this.current = Math.min(Math.max(arg, 0), this.total);
      if (message) {
        this.message = message;
      }
    }
    
    if (this.isRunning) {
      this.render();
    }
  }

  /**
   * Complete the progress bar with success.
   * 
   * @param message - Success message (optional)
   */
  succeed(message?: string): void {
    this.current = this.total;
    this.stop();
    this.clearLine();
    if (message) {
      console.log(`✓ ${message}`);
    } else {
      console.log(`✓ ${this.message}`);
    }
  }

  /**
   * Complete the progress bar with failure.
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
   * Stop the progress bar without completion message.
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.clearLine();
  }

  /**
   * Render the current progress bar state.
   */
  private render(): void {
    this.clearLine();
    
    const percentage = this.total > 0 ? (this.current / this.total) : 0;
    const filledWidth = Math.floor(this.width * percentage);
    const emptyWidth = this.width - filledWidth;
    
    const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
    
    let line = `${this.message} [${bar}]`;
    
    if (this.showPercentage) {
      line += ` ${Math.round(percentage * 100)}%`;
    }
    
    if (this.startTime && (this.showElapsed || this.showRemaining)) {
      const elapsed = Date.now() - this.startTime;
      
      if (this.showElapsed) {
        line += ` ${this.formatTime(elapsed)}`;
      }
      
      if (this.showRemaining && percentage > 0 && percentage < 1) {
        const remaining = (elapsed / percentage) - elapsed;
        line += ` (${this.formatTime(remaining)} remaining)`;
      }
    }
    
    process.stdout.write(line);
    this.lastLineLength = line.length;
  }

  /**
   * Format time in milliseconds to human-readable string.
   */
  private formatTime(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m${seconds}s`;
    }
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