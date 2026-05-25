/**
 * Graceful Shutdown Handler
 *
 * @specforge/service-management
 */

export {
  GracefulShutdownHandler,
  createGracefulShutdownHandler,
  type GracefulShutdownHandlerOptions,
  type ShutdownTaskResult,
} from './graceful-shutdown-handler.js';

export type { ShutdownTask, ShutdownTaskEntry } from '../types/shutdown.js';

// Re-export ShutdownPriority as both type and value (TypeScript merging trick)
import type { ShutdownPriority as ShutdownPriorityType } from '../types/shutdown.js';
export type ShutdownPriority = ShutdownPriorityType;

/**
 * ShutdownPriority constants — use these instead of raw strings
 * so Daemon.ts can write ShutdownPriority.STOP_ACCEPTING etc.
 */
export const ShutdownPriority = {
  STOP_ACCEPTING: 'stop-accepting' as const,
  DRAIN: 'drain' as const,
  FLUSH: 'flush' as const,
  CLOSE: 'close' as const,
  RELEASE: 'release' as const,
} as const;