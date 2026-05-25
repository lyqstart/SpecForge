/**
 * Shutdown priority enumeration - higher priority runs first during shutdown.
 * Order: stop-accepting → drain → flush → close → release
 */
export type ShutdownPriority =
  | "stop-accepting"  // Stop accepting new connections
  | "drain"           // Drain pending operations
  | "flush"           // Flush to disk / persist
  | "close"           // Close connections / handles
  | "release";       // Release resources

/**
 * A shutdown task to be executed during graceful shutdown.
 * Receives an AbortSignal to check for cancellation.
 */
export type ShutdownTask = (signal: AbortSignal) => Promise<void>;

/**
 * Shutdown task with metadata.
 */
export interface ShutdownTaskEntry {
  /** Unique name for the task */
  name: string;
  /** The task to execute */
  task: ShutdownTask;
  /** Priority determining execution order */
  priority: ShutdownPriority;
}