/**
 * Event Logger for OpenCode Adapter
 *
 * Implements event logging for:
 * - adapter.version_mismatch: Kernel version mismatch events
 * - translation.failure: Translation failure events
 * - session.lifecycle: Session lifecycle events
 * - integration.error: Integration error events
 *
 * Events conform to the Daemon Event Bus specification.
 * All events use Daemon-neutral payload format (no OpenCode concepts leak).
 *
 * Requirements: 2.3
 */

/**
 * Event structure conforming to Daemon Event Bus specification
 */
export interface DaemonEvent {
  eventId: string;
  ts: number;
  projectId: string;
  action: string;
  payload: Record<string, unknown>;
  metadata: {
    schemaVersion: string;
    source: 'daemon' | 'client' | 'adapter';
  };
}

/**
 * Event Bus interface for publishing events
 * Implemented by Daemon Event Bus
 */
export interface EventBusLike {
  publish(event: DaemonEvent): void;
}

/**
 * Event action types
 */
export type AdapterEventAction =
  | 'adapter.version_mismatch'
  | 'translation.failure'
  | 'session.lifecycle'
  | 'integration.error';

/**
 * Event logger configuration
 */
export interface EventLoggerConfig {
  /** Project ID for events */
  projectId: string;
  /** Schema version for events */
  schemaVersion: string;
  /** Whether to enable verbose logging */
  verboseLogging: boolean;
}

/**
 * Event Bus type - accepts either daemon-core EventBus or compatible mock
 */
export type EventBus = EventBusLike | null;

/**
 * Default event logger configuration
 */
export const DEFAULT_EVENT_LOGGER_CONFIG: EventLoggerConfig = {
  projectId: 'opencode-adapter',
  schemaVersion: '1.0.0',
  verboseLogging: false,
};

/**
 * Event Logger class
 *
 * Provides event logging functionality for the OpenCode Adapter.
 * Events are published to the Daemon Event Bus if available, or logged to console.
 */
export class EventLogger {
  private config: EventLoggerConfig;
  private eventBus: EventBus = null;
  private eventCounter = 0;

  /**
   * Create a new EventLogger
   * @param config - Optional configuration
   */
  constructor(config: Partial<EventLoggerConfig> = {}) {
    this.config = { ...DEFAULT_EVENT_LOGGER_CONFIG, ...config };
  }

  /**
   * Set the Event Bus instance
   * Must be called before events can be published to the bus
   * @param eventBus - The Daemon Event Bus instance
   */
  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
  }

  /**
   * Get current configuration
   */
  getConfig(): EventLoggerConfig {
    return { ...this.config };
  }

  // ============================================================
  // Version Mismatch Events
  // ============================================================

  /**
   * Log version mismatch event
   * Called when OpenCode version is outside compatible range
   *
   * @param payload - Version mismatch details
   */
  logVersionMismatch(payload: {
    detectedVersion: string;
    requiredRange: string;
    reason: string;
    suggestedAction: 'upgrade_adapter' | 'downgrade_kernel' | 'check_versions';
  }): void {
    const event = this.buildEvent('adapter.version_mismatch', {
      detectedVersion: payload.detectedVersion,
      requiredRange: payload.requiredRange,
      reason: payload.reason,
      suggestedAction: payload.suggestedAction,
    });

    this.publish(event);
  }

  // ============================================================
  // Translation Failure Events
  // ============================================================

  /**
   * Log translation failure event
   * Called when translation from OpenCode format to Daemon format fails
   *
   * @param payload - Translation failure details
   */
  logTranslationFailure(payload: {
    sessionId?: string;
    translationType: 'context' | 'event' | 'tool' | 'capability';
    inputType: string;
    reason: string;
    unsupported?: boolean;
  }): void {
    const event = this.buildEvent('translation.failure', {
      sessionId: payload.sessionId,
      translationType: payload.translationType,
      inputType: payload.inputType,
      reason: payload.reason,
      unsupported: payload.unsupported ?? false,
      timestamp: new Date().toISOString(),
    });

    this.publish(event);
  }

  // ============================================================
  // Session Lifecycle Events
  // ============================================================

  /**
   * Log session lifecycle event
   * Called for session creation, activation, completion, and cancellation
   *
   * @param payload - Session lifecycle details
   */
  logSessionLifecycle(payload: {
    sessionId: string;
    spawnIntentId?: string;
    event: 'created' | 'activated' | 'completed' | 'cancelled' | 'error';
    reason?: string;
  }): void {
    const event = this.buildEvent('session.lifecycle', {
      sessionId: payload.sessionId,
      spawnIntentId: payload.spawnIntentId,
      event: payload.event,
      reason: payload.reason,
      timestamp: new Date().toISOString(),
    });

    this.publish(event);
  }

  // ============================================================
  // Integration Error Events
  // ============================================================

  /**
   * Log integration error event
   * Called when Thin Plugin, OpenCode client, or other integration fails
   *
   * @param payload - Integration error details
   */
  logIntegrationError(payload: {
    sessionId?: string;
    errorType: 'thin_plugin' | 'opencode_client' | 'daemon_startup' | 'session_binding' | 'unknown';
    code?: string;
    message: string;
    recoverable: boolean;
  }): void {
    const event = this.buildEvent('integration.error', {
      sessionId: payload.sessionId,
      errorType: payload.errorType,
      code: payload.code,
      message: payload.message,
      recoverable: payload.recoverable,
      timestamp: new Date().toISOString(),
    });

    this.publish(event);
  }

  // ============================================================
  // Private Methods
  // ============================================================

  /**
   * Build an event object conforming to Daemon Event Bus specification
   */
  private buildEvent(
    action: AdapterEventAction,
    payload: Record<string, unknown>
  ): DaemonEvent {
    const eventId = this.generateEventId();
    const ts = Date.now();

    const event: DaemonEvent = {
      eventId,
      ts,
      projectId: this.config.projectId,
      action,
      payload,
      metadata: {
        schemaVersion: this.config.schemaVersion,
        source: 'adapter',
      },
    };

    if (this.config.verboseLogging) {
      console.log(`[EventLogger] Publishing event: ${action}`, {
        eventId,
        ts: new Date(ts).toISOString(),
        projectId: this.config.projectId,
        payload,
      });
    }

    return event;
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    this.eventCounter++;
    return `evt-${Date.now()}-${this.eventCounter}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Publish event to Event Bus or log to console
   */
  private publish(event: DaemonEvent): void {
    if (this.eventBus && typeof this.eventBus.publish === 'function') {
      try {
        this.eventBus.publish(event);
      } catch (error) {
        console.error(`[EventLogger] Failed to publish event to Event Bus:`, error);
        this.logToConsole(event);
      }
    } else {
      // No Event Bus available - log to console
      this.logToConsole(event);
    }
  }

  /**
   * Log event to console (fallback when no Event Bus)
   */
  private logToConsole(event: DaemonEvent): void {
    console.log(`[EventLogger] ${event.action}`, {
      eventId: event.eventId,
      ts: new Date(event.ts).toISOString(),
      projectId: event.projectId,
      payload: event.payload,
    });
  }
}

/**
 * Create a standalone event logger instance
 */
export function createEventLogger(config?: Partial<EventLoggerConfig>): EventLogger {
  return new EventLogger(config);
}