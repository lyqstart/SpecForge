/**
 * HTTP Client for Daemon communication.
 * 
 * Provides:
 * - HTTP/1.1 client for Daemon communication
 * - SSE support for event streaming
 * - Error handling for network issues
 * - Bearer Token authentication
 * - Timeout and retry logic
 * - Automatic blob handling for large content (Property 17)
 * 
 * @packageDocumentation
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { BlobHandler, createBlobHandler, BlobReference, BLOB_THRESHOLD_BYTES } from '../blob/BlobHandler';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for the HTTP client
 */
export interface DaemonClientConfig {
  /** Daemon host (e.g., '127.0.0.1' or 'localhost') */
  host: string;
  /** Daemon port */
  port: number;
  /** Bearer token for authentication */
  token?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  retryDelay?: number;
  /** Enable automatic blob handling for large content (default: true) */
  enableBlobHandling?: boolean;
  /** Blob threshold in bytes (default: 64 KiB) */
  blobThreshold?: number;
  /** Resolve blobs in interactive mode (default: true) */
  resolveBlobsInInteractive?: boolean;
}

/**
 * HTTP method types supported by the client
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Request options for HTTP calls
 */
export interface RequestOptions {
  /** HTTP method */
  method: HttpMethod;
  /** Request path (appended to base URL) */
  path: string;
  /** Request body (for POST/PUT) */
  body?: unknown;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Request timeout override (ms) */
  timeout?: number;
  /** Enable retry on failure (default: true) */
  retry?: boolean;
}

/**
 * SSE event data
 */
export interface SSEEvent {
  /** Event type */
  type: string;
  /** Event data */
  data: unknown;
  /** Event ID (if provided) */
  id?: string;
}

/**
 * SSE connection handle
 */
export interface SSEConnection {
  /** Unique connection ID */
  id: string;
  /** Close the SSE connection */
  close: () => void;
}

/**
 * Error types for DaemonClient
 */
export class DaemonClientError extends Error {
  /** Error code for machine consumption */
  readonly code: string;
  /** HTTP status code if available */
  readonly statusCode?: number;
  /** Whether this is a network error */
  readonly isNetworkError: boolean;
  /** Whether this error is retryable */
  readonly isRetryable: boolean;

  constructor(params: {
    message: string;
    code: string;
    statusCode?: number;
    isNetworkError?: boolean;
    isRetryable?: boolean;
    cause?: Error;
  }) {
    super(params.message);
    if (params.cause) {
      (this as { cause?: Error }).cause = params.cause;
    }
    this.name = 'DaemonClientError';
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.isNetworkError = params.isNetworkError ?? false;
    this.isRetryable = params.isRetryable ?? false;
  }
}

/**
 * Timeout-specific error
 */
export class DaemonTimeoutError extends DaemonClientError {
  readonly operation: string;
  readonly timeoutMs: number;
  readonly attempts: number;

  constructor(params: {
    operation: string;
    timeoutMs: number;
    attempts: number;
    lastError?: Error;
  }) {
    super({
      message: `操作超时（${params.timeoutMs}ms）: ${params.operation}，已重试 ${params.attempts} 次`,
      code: 'TIMEOUT',
      isNetworkError: false,
      isRetryable: false,
      cause: params.lastError,
    });
    this.name = 'DaemonTimeoutError';
    this.operation = params.operation;
    this.timeoutMs = params.timeoutMs;
    this.attempts = params.attempts;
  }
}

/**
 * Network unavailable error
 */
export class DaemonUnreachableError extends DaemonClientError {
  readonly suggestion: string;

  constructor(cause?: Error) {
    super({
      message: '无法连接到 Daemon，请确认 Daemon 已启动',
      code: 'DAEMON_UNREACHABLE',
      isNetworkError: true,
      isRetryable: true,
      cause,
    });
    this.name = 'DaemonUnreachableError';
    this.suggestion = '请运行 "specforge daemon start" 启动 Daemon';
  }
}

/**
 * Authentication error
 */
export class DaemonAuthError extends DaemonClientError {
  constructor(message: string = '认证失败，请检查 Token 是否有效') {
    super({
      message,
      code: 'AUTH_FAILED',
      statusCode: 401,
      isNetworkError: false,
      isRetryable: false,
    });
    this.name = 'DaemonAuthError';
  }
}

/**
 * HTTP client for communicating with the SpecForge Daemon.
 * 
 * @example
 * ```typescript
 * const client = new DaemonClient({
 *   host: '127.0.0.1',
 *   port: 3847,
 *   token: 'your-bearer-token',
 * });
 * 
 * // Simple GET request
 * const status = await client.get('/health');
 * 
 * // POST with body
 * const result = await client.post('/workflows/start', { spec: 'my-spec' });
 * 
 * // SSE streaming
 * const conn = await client.subscribeSSE('/events', {
 *   onEvent: (event) => console.log(event),
 *   onError: (err) => console.error(err),
 * });
 * ```
 */
export class DaemonClient {
  private readonly client: AxiosInstance;
  private readonly config: Required<DaemonClientConfig>;
  private connectionCounter = 0;
  private readonly blobHandler: BlobHandler;
  private readonly enableBlobHandling: boolean;
  private readonly resolveBlobsInInteractive: boolean;

  /**
   * Create a new DaemonClient instance.
   * 
   * @param config - Client configuration
   */
  constructor(config: DaemonClientConfig) {
    this.config = {
      host: config.host,
      port: config.port,
      timeout: config.timeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      token: config.token ?? '',
      enableBlobHandling: config.enableBlobHandling ?? true,
      blobThreshold: config.blobThreshold ?? BLOB_THRESHOLD_BYTES,
      resolveBlobsInInteractive: config.resolveBlobsInInteractive ?? true,
    };

    const baseURL = `http://${this.config.host}:${this.config.port}`;

    this.client = axios.create({
      baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Initialize blob handler
    this.enableBlobHandling = this.config.enableBlobHandling;
    this.resolveBlobsInInteractive = this.config.resolveBlobsInInteractive;
    this.blobHandler = createBlobHandler({
      threshold: this.config.blobThreshold,
      resolveInJsonMode: false,
    });

    // Add request interceptor for auth
    this.client.interceptors.request.use((config) => {
      if (this.config.token) {
        config.headers['Authorization'] = `Bearer ${this.config.token}`;
      }
      return config;
    });

    // Add response interceptor for error transformation
    this.client.interceptors.response.use(
      (response) => response,
      (error) => Promise.reject(this.transformError(error))
    );
  }

  /**
   * Get the base URL for the Daemon.
   */
  get baseURL(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  /**
   * Check if the client has a valid token configured.
   */
  get hasToken(): boolean {
    return !!this.config.token;
  }

  /**
   * Update the authentication token.
   * 
   * @param token - New Bearer token
   */
  setToken(token: string): void {
    (this.config as { token: string }).token = token;
  }

  /**
   * Clear the authentication token.
   */
  clearToken(): void {
    (this.config as { token: string }).token = '';
  }

  // ============================================================================
  // Blob Handling
  // ============================================================================

  /**
   * Check if blob handling is enabled.
   */
  get isBlobHandlingEnabled(): boolean {
    return this.enableBlobHandling;
  }

  /**
   * Get the blob threshold in bytes.
   */
  get blobThreshold(): number {
    return this.blobHandler.getThreshold();
  }

  /**
   * Convert content to blob reference if it exceeds threshold.
   * 
   * @param content - Content to convert
   * @returns Original content or blob reference
   */
  convertToBlob(content: unknown): unknown {
    return this.blobHandler.convertToBlob(content);
  }

  /**
   * Process content, converting large items to blob references.
   * 
   * @param content - Content to process
   * @returns Processed content with blob references
   */
  processContent(content: unknown): unknown {
    return this.blobHandler.processContent(content);
  }

  /**
   * Resolve blob references in content.
   * 
   * @param content - Content with blob references
   * @param interactive - Whether to resolve (true for interactive mode)
   * @returns Content with resolved blobs or original references
   */
  resolveContent(content: unknown, interactive: boolean): unknown {
    return this.blobHandler.resolveContent(content, interactive);
  }

  /**
   * Check if a string is a valid blob reference.
   * 
   * @param value - Value to check
   * @returns True if value is a blob reference
   */
  isBlobReference(value: unknown): value is BlobReference {
    return this.blobHandler.isBlobReference(value);
  }

  /**
   * Clear the blob store (for testing).
   */
  clearBlobs(): void {
    this.blobHandler.clear();
  }

  // ============================================================================
  // HTTP Methods
  // ============================================================================

  /**
   * Perform an HTTP request with retry logic and blob handling.
   * 
   * @param options - Request options
   * @returns Response data
   */
  async request<T = unknown>(options: RequestOptions): Promise<T> {
    const { method, path, body, headers, timeout, retry = true } = options;
    
    // Apply blob conversion to request body if enabled
    let processedBody = body;
    if (this.enableBlobHandling && body !== undefined) {
      processedBody = this.blobHandler.processContent(body);
    }

    const attemptConfig: AxiosRequestConfig = {
      method: method.toLowerCase(),
      url: path,
      data: processedBody,
      headers: {
        ...headers,
      },
      timeout: timeout ?? this.config.timeout,
    };

    if (!retry) {
      return this.executeRequest<T>(attemptConfig);
    }

    let lastError: Error | undefined;
    const maxAttempts = this.config.maxRetries;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.executeRequest<T>(attemptConfig);
      } catch (error) {
        lastError = error as Error;

        // Don't retry if not retryable
        if (error instanceof DaemonClientError && !error.isRetryable) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === maxAttempts) {
          break;
        }

        // Exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Execute a single HTTP request and process response with blob resolution.
   */
  private async executeRequest<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.request(config);
      
      // Apply blob resolution to response if enabled
      if (this.enableBlobHandling && response.data !== undefined) {
        // For JSON responses, resolve blobs in interactive mode
        // In JSON mode, keep blob references unchanged
        const resolvedData = this.blobHandler.resolveContent(response.data, this.resolveBlobsInInteractive);
        return resolvedData as T;
      }
      
      return response.data;
    } catch (error) {
      throw this.transformError(error);
    }
  }

  /**
   * Perform a GET request.
   * 
   * @param path - Request path
   * @param options - Additional request options
   * @returns Response data
   */
  async get<T = unknown>(path: string, options?: Partial<RequestOptions>): Promise<T> {
    return this.request<T>({
      method: 'GET',
      path,
      ...options,
    });
  }

  /**
   * Perform a POST request.
   * 
   * @param path - Request path
   * @param body - Request body
   * @param options - Additional request options
   * @returns Response data
   */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: Partial<RequestOptions>
  ): Promise<T> {
    return this.request<T>({
      method: 'POST',
      path,
      body,
      ...options,
    });
  }

  /**
   * Perform a PUT request.
   * 
   * @param path - Request path
   * @param body - Request body
   * @param options - Additional request options
   * @returns Response data
   */
  async put<T = unknown>(
    path: string,
    body?: unknown,
    options?: Partial<RequestOptions>
  ): Promise<T> {
    return this.request<T>({
      method: 'PUT',
      path,
      body,
      ...options,
    });
  }

  /**
   * Perform a DELETE request.
   * 
   * @param path - Request path
   * @param options - Additional request options
   * @returns Response data
   */
  async delete<T = unknown>(path: string, options?: Partial<RequestOptions>): Promise<T> {
    return this.request<T>({
      method: 'DELETE',
      path,
      ...options,
    });
  }

  // ============================================================================
  // SSE Support
  // ============================================================================

  /**
   * Subscribe to Server-Sent Events (SSE) from the Daemon.
   * 
   * @param path - SSE endpoint path
   * @param handlers - Event handlers
   * @returns SSEConnection handle
   */
  async subscribeSSE(
    path: string,
    handlers: {
      /** Called when an event is received */
      onEvent: (event: SSEEvent) => void;
      /** Called when an error occurs */
      onError: (error: Error) => void;
      /** Called when connection opens */
      onOpen?: () => void;
    }
  ): Promise<SSEConnection> {
    const connectionId = `sse-${++this.connectionCounter}`;
    const url = `${this.baseURL}${path}`;

    const headers: Record<string, string> = {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    };

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }

    let abortController: AbortController | null = null;
    let isClosed = false;

    try {
      abortController = new AbortController();

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new DaemonClientError({
          message: `SSE 连接失败: HTTP ${response.status}`,
          code: 'SSE_ERROR',
          statusCode: response.status,
          isRetryable: response.status >= 500,
        });
      }

      if (!response.body) {
        throw new DaemonClientError({
          message: 'SSE 响应没有内容',
          code: 'SSE_ERROR',
          isRetryable: false,
        });
      }

      handlers.onOpen?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Process the stream
      const processStream = async (): Promise<void> => {
        try {
          while (!isClosed) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const event = this.parseSSELine(line);
              if (event) {
                handlers.onEvent(event);
              }
            }
          }
        } catch (error) {
          if (!isClosed) {
            handlers.onError(error instanceof Error ? error : new Error(String(error)));
          }
        }
      };

      // Start processing in background
      processStream().catch(() => {
        // Error already handled in processStream
      });

      return {
        id: connectionId,
        close: () => {
          isClosed = true;
          abortController?.abort();
          reader.cancel().catch(() => {
            // Ignore cancel errors
          });
        },
      };
    } catch (error) {
      if (abortController) {
        abortController.abort();
      }

      if (error instanceof DaemonClientError) {
        throw error;
      }

      throw this.transformError(error);
    }
  }

  /**
   * Parse a single SSE line.
   */
  private parseSSELine(line: string): SSEEvent | null {
    if (!line.trim() || line.startsWith(':')) {
      return null;
    }

    const colonIndex = line.indexOf(':');
    let field: string;
    let value: string;

    if (colonIndex === -1) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, colonIndex);
      // Skip the optional space after the colon
      value = line.slice(colonIndex + 1).replace(/^ /, '');
    }

    if (field === 'event') {
      return { type: 'event', data: value };
    }

    if (field === 'data') {
      // Try to parse as JSON, fall back to raw string
      try {
        return { type: 'message', data: JSON.parse(value) };
      } catch {
        return { type: 'message', data: value };
      }
    }

    if (field === 'id') {
      return { type: 'id', data: value, id: value };
    }

    return null;
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  /**
   * Transform axios error to DaemonClientError.
   */
  private transformError(error: unknown): DaemonClientError {
    if (error instanceof DaemonClientError) {
      return error;
    }

    // Check for common error codes even on plain Error objects
    if (error instanceof Error) {
      // Network errors (connection refused, not found, timeout)
      if (error.message?.includes('ECONNREFUSED') || 
          (error as { code?: string }).code === 'ECONNREFUSED' ||
          error.message?.includes('ENOTFOUND') ||
          (error as { code?: string }).code === 'ENOTFOUND') {
        return new DaemonUnreachableError(error);
      }

      if (error.message?.includes('ECONNABORTED') || 
          error.message?.includes('ETIMEDOUT') ||
          (error as { code?: string }).code === 'ECONNABORTED' ||
          (error as { code?: string }).code === 'ETIMEDOUT') {
        return new DaemonTimeoutError({
          operation: (error as { config?: { url?: string } }).config?.url ?? 'unknown',
          timeoutMs: (error as { config?: { timeout?: number } }).config?.timeout ?? this.config.timeout,
          attempts: this.config.maxRetries,
          lastError: error,
        });
      }
    }

    // Check if it's an axios error
    if ((error as { isAxiosError?: boolean }).isAxiosError) {
      const axiosError = error as { code?: string; response?: { status: number; data: unknown }; config?: { url?: string; timeout?: number } };
      
      // Network error (connection refused, timeout, etc.)
      if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND') {
        return new DaemonUnreachableError(error as Error);
      }

      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        return new DaemonTimeoutError({
          operation: axiosError.config?.url ?? 'unknown',
          timeoutMs: axiosError.config?.timeout ?? this.config.timeout,
          attempts: this.config.maxRetries,
          lastError: error as Error,
        });
      }

      // HTTP error responses
      if (axiosError.response) {
        const status = axiosError.response.status;

        if (status === 401 || status === 403) {
          return new DaemonAuthError(
            status === 401 ? '认证失败，请检查 Token 是否有效' : '无权限访问该资源'
          );
        }

        const message =
          (axiosError.response.data as { message?: string })?.message ??
          (error as Error).message ??
          '请求失败';

        return new DaemonClientError({
          message,
          code: `HTTP_${status}`,
          statusCode: status,
          isNetworkError: false,
          isRetryable: status >= 500,
          cause: error as Error,
        });
      }

      // Request was made but no response (network error)
      return new DaemonUnreachableError(error as Error);
    }

    // Unknown error
    if (error instanceof Error) {
      return new DaemonClientError({
        message: error.message,
        code: 'UNKNOWN',
        isNetworkError: false,
        isRetryable: false,
        cause: error,
      });
    }

    return new DaemonClientError({
      message: '未知错误',
      code: 'UNKNOWN',
      isNetworkError: false,
      isRetryable: false,
    });
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Close the client and release resources.
   */
  close(): void {
    // Axios client doesn't need explicit cleanup
    // but we clear the token for security
    this.clearToken();
  }
}

/**
 * Create a DaemonClient from a handshake file content.
 * 
 * @param handshake - Parsed handshake file content
 * @param config - Additional client config
 * @returns Configured DaemonClient
 */
export function createClientFromHandshake(
  handshake: {
    port: number;
    token: string;
    bound_to: string;
  },
  config?: Partial<Omit<DaemonClientConfig, 'host' | 'port' | 'token'>>
): DaemonClient {
  return new DaemonClient({
    host: handshake.bound_to === '0.0.0.0' ? '127.0.0.1' : handshake.bound_to,
    port: handshake.port,
    token: handshake.token,
    ...config,
  });
}