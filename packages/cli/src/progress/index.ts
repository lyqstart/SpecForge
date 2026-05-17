/**
 * Progress indicators for SpecForge CLI.
 * 
 * Provides:
 * - Spinner for async operations (interactive mode only)
 * - Progress bars for long operations
 * - Status updates for `--wait` mode
 * - Dual-mode support (interactive vs JSON)
 * 
 * @packageDocumentation
 */

export * from './ProgressIndicator';
export * from './Spinner';
export * from './ProgressBar';
export * from './JobProgress';