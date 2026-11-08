/**
 * ThinPluginClient - HTTP client for Thin Plugin communication
 *
 * Provides HTTP communication with the Thin Plugin for:
 * - Event reporting to Daemon
 * - Session binding (first-contact binding strategy)
 * - Command reception from Daemon
 *
 * Requirements: 4.1, 4.2
 */

import {
  ThinPluginClientConfig,
  ThinPluginEventReportRequest,
  ThinPluginEventReportResponse,
  ThinPluginSessionBindRequest,
  ThinPluginSessionBindResponse,
  ThinPluginCommandRequest,
  ThinPluginCommandResponse,
  ThinPluginHealthCheckResponse,
  EventReportResult,
  SessionBindResult,
  CommandResult,
} from './types';

/**
 * Error codes for ThinPluginClient
 */
export enum ThinPluginClientErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  SERVER_ERROR = 'SERVER_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',
  CONFIG_ERROR = 'CONFIG_ERROR',
  ABORTED = 'ABORTED',
}

/**
 * Custom error class for ThinPluginClient errors
 */
export class ThinPluginClientError extends Error {
  constructor(
    message: string,
    public readonly code: ThinPluginClientErrorCode,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ThinPluginClientError';
  }
}

/**
 * ThinPluginClient - HTTP client for Thin Plugin communication
 *
 * Implements:
 * - HTTP client with configurable endpoints
 * - Event reporting with retry logic (exponential backoff)
 * - Session binding for first-contact strategy
 * - Timeout and error handling
 *
 * Requirements: 4.1, 4.2
 */
export class ThinPluginClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelay: number;
  private readonly maxRetryDelay: number;
  private readonly retryMultiplier: number;
  private readonly fetchFn: typeof fetch;

  /**
   * Create a new ThinPluginClient
   * @param config - Client configuration
   */
  constructor(config: ThinPluginClientConfig) {
    // Validate configuration
    if (!config.baseUrl || config.baseUrl.trim().length === 0) {
      throw new ThinPluginClientError(
        'baseUrl is required',
        ThinPluginClientErrorCode.CONFIG_ERROR
      );
    }

    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = config.timeout ?? 10000;
    this.maxRetries = config.maxRetries ?? 3;
    this.baseRetryDelay = config.baseRetryDelay ?? 1000;
    this.maxRetryDelay = config.maxRetryDelay ?? 30000;
    this.retryMultiplier = config.retryMultiplier ?? 2;

    // Allow custom fetch function for testing
    this.fetchFn = config.fetchFn ?? fetch;
  }

  /**
   * Report an event to the Daemon via Thin Plugin
   *
   * Implements exponential backoff retry logic for transient failures.
   *
   * @param request - Event report request
   * @returns Promise resolving to event report result
   */
  async reportEvent(request: ThinPluginEventReportRequest): Promise<EventReportResult> {
    const endpoint = `${this.baseUrl}/v1/ingest/event`;
    
    let lastError: ThinPluginClientError | undefined;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      attempt++;

      try {
        const response = await this.executeWithTimeout(
          this.fetchFn(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'OpenCodeAdapter/1.0.0',
            },
            body: JSON.stringify({
              event_type: request.eventType,
              data: request.payload,
              sid: request.sessionId,
              spawn_intent_id: request.spawnIntentId,
              ts: request.timestamp ?? Date.now(),
              metadata: request.metadata,
            }),
          }),
          this.timeout
        );

        // Check response status
        if (!response.ok) {
          const errorBody = await this.safeReadBody(response);
          
          // Non-retryable errors (4xx except 429)
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw new ThinPluginClientError(
              `Event report failed: ${response.status} ${response.statusText}`,
              ThinPluginClientErrorCode.SERVER_ERROR,
              response.status,
              { body: errorBody }
            );
          }

          // Retryable errors (5xx, 429)
          throw new ThinPluginClientError(
            `Event report failed (retryable): ${response.status} ${response.statusText}`,
            ThinPluginClientErrorCode.SERVER_ERROR,
            response.status,
            { body: errorBody, retryable: true }
          );
        }

        // Parse successful response
        const result = await this.safeJsonParse<ThinPluginEventReportResponse>(response);
        
        return {
          success: true,
          eventId: result.event_id ?? `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          timestamp: result.timestamp ?? Date.now(),
        };
      } catch (error) {
        lastError = this.normalizeError(error);

        // Don't retry on non-retryable errors
        if (!this.isRetryableError(lastError)) {
          throw lastError;
        }

        // Check if we have retries left
        if (attempt <= this.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          await this.sleep(delay);
          continue;
        }
      }
    }

    // All retries exhausted
    throw new ThinPluginClientError(
      `Event report failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`,
      ThinPluginClientErrorCode.RETRY_EXHAUSTED,
      undefined,
      { lastError: lastError?.message }
    );
  }

  /**
   * Bind a session ID to a spawn intent ID (first-contact binding)
   *
   * This implements the first-contact binding strategy where Daemon
   * pre-generates a spawnIntentId and registers a pending record,
   * then Thin Plugin/Adapter binds the real sessionId on first event arrival.
   *
   * @param request - Session bind request
   * @returns Promise resolving to session bind result
   */
  async bindSession(request: ThinPluginSessionBindRequest): Promise<SessionBindResult> {
    const endpoint = `${this.baseUrl}/v1/session/bind`;
    
    let lastError: ThinPluginClientError | undefined;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      attempt++;

      try {
        const response = await this.executeWithTimeout(
          this.fetchFn(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'OpenCodeAdapter/1.0.0',
            },
            body: JSON.stringify({
              spawn_intent_id: request.spawnIntentId,
              session_id: request.sessionId,
              agent_role: request.agentRole,
              metadata: request.metadata,
            }),
          }),
          this.timeout
        );

        if (!response.ok) {
          const errorBody = await this.safeReadBody(response);
          
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw new ThinPluginClientError(
              `Session bind failed: ${response.status} ${response.statusText}`,
              ThinPluginClientErrorCode.SERVER_ERROR,
              response.status,
              { body: errorBody }
            );
          }

          throw new ThinPluginClientError(
            `Session bind failed (retryable): ${response.status} ${response.statusText}`,
            ThinPluginClientErrorCode.SERVER_ERROR,
            response.status,
            { body: errorBody, retryable: true }
          );
        }

        const result = await this.safeJsonParse<ThinPluginSessionBindResponse>(response);
        
        return {
          success: true,
          spawnIntentId: request.spawnIntentId,
          sessionId: request.sessionId,
          bound: result.bound ?? true,
        };
      } catch (error) {
        lastError = this.normalizeError(error);

        if (!this.isRetryableError(lastError)) {
          throw lastError;
        }

        if (attempt <= this.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          await this.sleep(delay);
          continue;
        }
      }
    }

    throw new ThinPluginClientError(
      `Session bind failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`,
      ThinPluginClientErrorCode.RETRY_EXHAUSTED,
      undefined,
      { lastError: lastError?.message }
    );
  }

  /**
   * Send a command to OpenCode via Thin Plugin
   *
   * @param request - Command request
   * @returns Promise resolving to command result
   */
  async sendCommand(request: ThinPluginCommandRequest): Promise<CommandResult> {
    const endpoint = `${this.baseUrl}/v1/command`;
    
    let lastError: ThinPluginClientError | undefined;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      attempt++;

      try {
        const response = await this.executeWithTimeout(
          this.fetchFn(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'OpenCodeAdapter/1.0.0',
            },
            body: JSON.stringify({
              command: request.command,
              session_id: request.sessionId,
              params: request.params,
              timeout: request.timeout,
            }),
          }),
          request.timeout ?? this.timeout
        );

        if (!response.ok) {
          const errorBody = await this.safeReadBody(response);
          
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw new ThinPluginClientError(
              `Command failed: ${response.status} ${response.statusText}`,
              ThinPluginClientErrorCode.SERVER_ERROR,
              response.status,
              { body: errorBody }
            );
          }

          throw new ThinPluginClientError(
            `Command failed (retryable): ${response.status} ${response.statusText}`,
            ThinPluginClientErrorCode.SERVER_ERROR,
            response.status,
            { body: errorBody, retryable: true }
          );
        }

        const result = await this.safeJsonParse<ThinPluginCommandResponse>(response);
        
        return {
          success: true,
          command: request.command,
          sessionId: request.sessionId,
          result: result.result,
          output: result.output,
        };
      } catch (error) {
        lastError = this.normalizeError(error);

        if (!this.isRetryableError(lastError)) {
          throw lastError;
        }

        if (attempt <= this.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          await this.sleep(delay);
          continue;
        }
      }
    }

    throw new ThinPluginClientError(
      `Command failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`,
      ThinPluginClientErrorCode.RETRY_EXHAUSTED,
      undefined,
      { lastError: lastError?.message }
    );
  }

  /**
   * Check health of the Thin Plugin endpoint
   *
   * @returns Promise resolving to health check result
   */
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();
    const endpoint = `${this.baseUrl}/health`;

    try {
      const response = await this.executeWithTimeout(
        this.fetchFn(endpoint, {
          method: 'GET',
          headers: {
            'User-Agent': 'OpenCodeAdapter/1.0.0',
          },
        }),
        this.timeout
      );

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          healthy: false,
          latency,
          error: `Health check failed: ${response.status} ${response.statusText}`,
        };
      }

      const result = await this.safeJsonParse<ThinPluginHealthCheckResponse>(response);
      
      return {
        healthy: result.status === 'ok' || result.healthy === true,
        latency,
        error: result.error,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const normalizedError = this.normalizeError(error);
      
      return {
        healthy: false,
        latency,
        error: normalizedError.message,
      };
    }
  }

  // ============================================================
  // Private helper methods
  // ============================================================

  /**
   * Execute a promise with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new ThinPluginClientError(
          `Request timeout after ${timeoutMs}ms`,
          ThinPluginClientErrorCode.TIMEOUT
        ));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  /**
   * Calculate retry delay using exponential backoff with jitter
   */
  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: baseDelay * (multiplier ^ (attempt - 1))
    const exponentialDelay = this.baseRetryDelay * Math.pow(this.retryMultiplier, attempt - 1);
    
    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.maxRetryDelay);
    
    // Add jitter (0-25% of delay)
    const jitter = cappedDelay * (Math.random() * 0.25);
    
    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: ThinPluginClientError): boolean {
    // Network errors are retryable
    if (error.code === ThinPluginClientErrorCode.NETWORK_ERROR) {
      return true;
    }

    // Timeout errors are retryable
    if (error.code === ThinPluginClientErrorCode.TIMEOUT) {
      return true;
    }

    // Server errors (5xx) are retryable
    if (error.code === ThinPluginClientErrorCode.SERVER_ERROR && error.statusCode) {
      return error.statusCode >= 500 || error.statusCode === 429;
    }

    // Retry exhausted is not retryable
    if (error.code === ThinPluginClientErrorCode.RETRY_EXHAUSTED) {
      return false;
    }

    // Config errors and invalid response are not retryable
    return false;
  }

  /**
   * Normalize error to ThinPluginClientError
   */
  private normalizeError(error: unknown): ThinPluginClientError {
    if (error instanceof ThinPluginClientError) {
      return error;
    }

    if (error instanceof Error) {
      // Check for specific error types
      if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
        return new ThinPluginClientError(
          error.message,
          ThinPluginClientErrorCode.TIMEOUT,
          undefined,
          { originalError: error.name }
        );
      }

      if (error.message.includes('fetch') || error.message.includes('network')) {
        return new ThinPluginClientError(
          error.message,
          ThinPluginClientErrorCode.NETWORK_ERROR,
          undefined,
          { originalError: error.name }
        );
      }

      // Generic error
      return new ThinPluginClientError(
        error.message,
        ThinPluginClientErrorCode.NETWORK_ERROR,
        undefined,
        { originalError: error.name }
      );
    }

    // Unknown error
    return new ThinPluginClientError(
      String(error),
      ThinPluginClientErrorCode.NETWORK_ERROR
    );
  }

  /**
   * Safely parse JSON response
   */
  private async safeJsonParse<T>(response: Response): Promise<T> {
    try {
      return await response.json() as T;
    } catch {
      throw new ThinPluginClientError(
        'Invalid JSON response',
        ThinPluginClientErrorCode.INVALID_RESPONSE,
        response.status
      );
    }
  }

  /**
   * Safely read response body as text
   */
  private async safeReadBody(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '(Unable to read response body)';
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}