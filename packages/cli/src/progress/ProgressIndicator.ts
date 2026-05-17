/**
 * Progress indicator interface and factory.
 * 
 * Progress indicators are only shown in interactive mode.
 * In JSON mode, progress updates are suppressed to maintain clean,
 * parseable output for machine consumption.
 */

import { OutputMode } from '../mode';

/**
 * Progress indicator interface.
 */
export interface ProgressIndicator {
  /**
   * Start the progress indicator.
   */
  start(): void;
  
  /**
   * Update the progress indicator with a message.
   * 
   * @param message - Progress message
   */
  update(message: string): void;
  
  /**
   * Complete the progress indicator with a success message.
   * 
   * @param message - Success message (optional)
   */
  succeed(message?: string): void;
  
  /**
   * Complete the progress indicator with a failure message.
   * 
   * @param message - Failure message (optional)
   */
  fail(message?: string): void;
  
  /**
   * Stop the progress indicator without a completion message.
   */
  stop(): void;
}

/**
 * No-op progress indicator for JSON mode.
 */
class NoopProgressIndicator implements ProgressIndicator {
  start(): void {}
  update(): void {}
  succeed(): void {}
  fail(): void {}
  stop(): void {}
}

/**
 * Progress indicator factory.
 */
export class ProgressIndicatorFactory {
  /**
   * Create a progress indicator based on the current mode.
   * 
   * @param mode - Output mode
   * @param type - Indicator type ('spinner' | 'bar')
   * @param initialMessage - Initial message
   * @returns Progress indicator instance
   */
  static create(
    mode: OutputMode,
    type: 'spinner' | 'bar',
    initialMessage: string
  ): ProgressIndicator {
    // In JSON mode, return a no-op indicator
    if (mode === 'json') {
      return new NoopProgressIndicator();
    }
    
    // In interactive mode, create the appropriate indicator
    if (type === 'spinner') {
      return new Spinner(initialMessage);
    } else {
      return new ProgressBar(initialMessage);
    }
  }
}

// Import after declaration to avoid circular dependencies
import { Spinner } from './Spinner';
import { ProgressBar } from './ProgressBar';