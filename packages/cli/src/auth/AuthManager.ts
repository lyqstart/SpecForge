/**
 * Authentication Manager for SpecForge CLI.
 * 
 * Provides:
 * - Reading handshake file (`~/.specforge/runtime/daemon.sock.json`)
 * - Validating Bearer Token
 * - Generating Authorization headers
 * 
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

/**
 * Handshake file structure
 */
export interface DaemonHandshake {
  /** Daemon bind address */
  bound_to: string;
  /** Daemon port */
  port: number;
  /** Bearer token for authentication */
  token: string;
  /** Schema version */
  schema_version?: string;
  /** Timestamp of handshake */
  timestamp?: number;
}

/**
 * Auth configuration options
 */
export interface AuthManagerConfig {
  /** Custom handshake file path (defaults to ~/.specforge/runtime/daemon.sock.json) */
  handshakePath?: string;
  /** Skip file existence validation (for testing) */
  skipValidation?: boolean;
}

/**
 * Result of authentication validation
 */
export interface AuthValidationResult {
  /** Whether the token is valid */
  isValid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Token value (masked for logging) */
  tokenPreview?: string;
}

/**
 * Error thrown when authentication fails
 */
export class AuthError extends Error {
  readonly code: string;
  readonly isRetryable: boolean;

  constructor(params: {
    message: string;
    code: string;
    isRetryable?: boolean;
    cause?: Error;
  }) {
    super(params.message);
    if (params.cause) {
      (this as { cause?: Error }).cause = params.cause;
    }
    this.name = 'AuthError';
    this.code = params.code;
    this.isRetryable = params.isRetryable ?? false;
  }
}

/**
 * Error thrown when handshake file is not found
 */
export class HandshakeNotFoundError extends AuthError {
  readonly handshakePath: string;

  constructor(handshakePath: string, cause?: Error) {
    super({
      message: `找不到握手文件: ${handshakePath}`,
      code: 'HANDSHAKE_NOT_FOUND',
      isRetryable: false,
      cause,
    });
    this.name = 'HandshakeNotFoundError';
    this.handshakePath = handshakePath;
  }
}

/**
 * Error thrown when handshake file is invalid
 */
export class InvalidHandshakeError extends AuthError {
  constructor(message: string, cause?: Error) {
    super({
      message: `握手文件格式无效: ${message}`,
      code: 'INVALID_HANDSHAKE',
      isRetryable: false,
      cause,
    });
    this.name = 'InvalidHandshakeError';
  }
}

/**
 * Error thrown when token is invalid
 */
export class InvalidTokenError extends AuthError {
  constructor(message: string = 'Token 无效') {
    super({
      message,
      code: 'INVALID_TOKEN',
      isRetryable: false,
    });
    this.name = 'InvalidTokenError';
  }
}

/**
 * Error thrown when token has expired
 */
export class TokenExpiredError extends AuthError {
  constructor(message: string = 'Token 已过期') {
    super({
      message,
      code: 'TOKEN_EXPIRED',
      isRetryable: true,
    });
    this.name = 'TokenExpiredError';
  }
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HANDSHAKE_FILENAME = 'daemon.sock.json';

/**
 * Get the default handshake file path
 */
export function getDefaultHandshakePath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.specforge', 'runtime', DEFAULT_HANDSHAKE_FILENAME);
}

/**
 * Get the runtime directory path
 */
export function getRuntimeDirPath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.specforge', 'runtime');
}

// Token expiration time in milliseconds (24 hours by default)
const DEFAULT_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * AuthManager Class
 * 
 * Manages authentication for CLI to Daemon communication.
 * 
 * Reads the handshake file to obtain connection details and authentication token.
 * 
 * @example
 * ```typescript
 * const auth = new AuthManager();
 * 
 * // Read and validate handshake
 * await auth.readHandshake();
 * 
 * // Check if authenticated
 * if (auth.isAuthenticated) {
 *   const headers = auth.getAuthHeaders();
 *   console.log(headers); // { Authorization: 'Bearer <token>' }
 * }
 * ```
 */
export class AuthManager {
  private _handshake: DaemonHandshake | null = null;
  private _handshakePath: string;
  private _skipValidation: boolean;
  private _tokenValidated = false;
  private _tokenExpiryMs: number = DEFAULT_TOKEN_EXPIRY_MS;
  private _loadedAt: number | null = null;

  /**
   * Create a new AuthManager instance.
   * 
   * @param config - Configuration options
   */
  constructor(config?: AuthManagerConfig) {
    this._handshakePath = config?.handshakePath ?? getDefaultHandshakePath();
    this._skipValidation = config?.skipValidation ?? false;
  }

  /**
   * Get the handshake file path.
   */
  get handshakePath(): string {
    return this._handshakePath;
  }

  /**
   * Check if a handshake has been loaded.
   */
  get hasHandshake(): boolean {
    return this._handshake !== null;
  }

  /**
   * Check if the manager has a valid token.
   */
  get hasToken(): boolean {
    return !!this._handshake?.token;
  }

  /**
   * Get the current handshake data.
   */
  get handshake(): DaemonHandshake | null {
    return this._handshake;
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Read and parse the handshake file.
   * 
   * @returns Parsed handshake data
   * @throws {HandshakeNotFoundError} If handshake file doesn't exist
   * @throws {InvalidHandshakeError} If handshake file is invalid
   */
  async readHandshake(): Promise<DaemonHandshake> {
    // Check if file exists
    if (!this._skipValidation) {
      try {
        await fs.promises.access(this._handshakePath, fs.constants.R_OK);
      } catch {
        throw new HandshakeNotFoundError(this._handshakePath);
      }
    }

    // Read file content
    let content: string;
    try {
      content = await fs.promises.readFile(this._handshakePath, 'utf-8');
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new HandshakeNotFoundError(this._handshakePath, error as Error);
    }

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new InvalidHandshakeError('JSON 解析失败', error as Error);
    }

    // Validate structure
    if (!this._skipValidation) {
      this.validateHandshake(parsed);
    }

    this._handshake = parsed as DaemonHandshake;
    this._loadedAt = Date.now();
    return this._handshake;
  }

  /**
   * Validate the Bearer Token.
   * 
   * @returns Validation result
   */
  validateToken(): AuthValidationResult {
    if (!this._handshake?.token) {
      return {
        isValid: false,
        error: 'No token available',
      };
    }

    const token = this._handshake.token;

    // Basic validation rules:
    // 1. Token must be a non-empty string
    // 2. Token must be at least 16 characters (reasonable minimum for secure tokens)
    // 3. Token should only contain valid base64url characters
    
    if (typeof token !== 'string' || token.length === 0) {
      return {
        isValid: false,
        error: 'Token must be a non-empty string',
      };
    }

    if (token.length < 16) {
      return {
        isValid: false,
        error: 'Token too short (minimum 16 characters)',
        tokenPreview: token.slice(0, 8) + '...',
      };
    }

    // Check for valid base64url characters
    const base64urlRegex = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;
    if (!base64urlRegex.test(token)) {
      return {
        isValid: false,
        error: 'Token contains invalid characters',
        tokenPreview: token.slice(0, 8) + '...',
      };
    }

    this._tokenValidated = true;

    return {
      isValid: true,
      tokenPreview: token.slice(0, 8) + '...',
    };
  }

  /**
   * Validate token and throw if invalid.
   * 
   * @throws {InvalidTokenError} If token is invalid
   */
  validateTokenOrThrow(): void {
    const result = this.validateToken();
    if (!result.isValid) {
      throw new InvalidTokenError(result.error);
    }
  }

  /**
   * Generate Authorization header.
   * 
   * @returns Authorization header object
   * @throws {InvalidTokenError} If token is not available or invalid
   */
  getAuthHeaders(): Record<string, string> {
    if (!this.hasToken) {
      throw new InvalidTokenError('No token available - handshake not loaded');
    }

    if (!this._tokenValidated) {
      this.validateTokenOrThrow();
    }

    return {
      Authorization: `Bearer ${this._handshake!.token}`,
    };
  }

  /**
   * Get authorization header value directly.
   * 
   * @returns Authorization header value
   * @throws {InvalidTokenError} If token is not available or invalid
   */
  getAuthorizationHeader(): string {
    if (!this.hasToken) {
      throw new InvalidTokenError('No token available - handshake not loaded');
    }

    if (!this._tokenValidated) {
      this.validateTokenOrThrow();
    }

    return `Bearer ${this._handshake!.token}`;
  }

  /**
   * Get the Daemon connection details.
   * 
   * @returns Connection details or null if not loaded
   */
  getConnectionDetails(): { host: string; port: number } | null {
    if (!this._handshake) {
      return null;
    }

    // Convert 0.0.0.0 to localhost for local connections
    const host = this._handshake.bound_to === '0.0.0.0' ? '127.0.0.1' : this._handshake.bound_to;

    return {
      host,
      port: this._handshake.port,
    };
  }

  /**
   * Get the Bearer token.
   * 
   * @returns Bearer token string
   * @throws {InvalidTokenError} If token is not available
   */
  getToken(): string {
    if (!this._handshake?.token) {
      throw new InvalidTokenError('No token available - handshake not loaded');
    }
    return this._handshake.token;
  }

  /**
   * Get the Daemon HTTP endpoint URL.
   * 
   * @returns Full URL to Daemon (e.g., http://127.0.0.1:3847)
   * @throws {InvalidHandshakeError} If handshake is not loaded
   */
  getDaemonUrl(): string {
    const details = this.getConnectionDetails();
    if (!details) {
      throw new InvalidHandshakeError('Handshake not loaded - call readHandshake() first');
    }
    return `http://${details.host}:${details.port}`;
  }

  /**
   * Check if the token is expired.
   * 
   * @returns True if token has expired, false otherwise
   */
  isTokenExpired(): boolean {
    if (!this._loadedAt || !this._handshake?.timestamp) {
      // If no timestamp, check if token was loaded and we have expiry info
      // Default to not expired if no timestamp is available (backwards compatibility)
      return false;
    }

    const age = Date.now() - this._loadedAt;
    const tokenTimestamp = this._handshake.timestamp;
    const configuredExpiry = this._tokenExpiryMs;

    // If handshake has explicit expiration, use it
    if (this._handshake.timestamp) {
      // Check if current time exceeds the timestamp + configured expiry
      return Date.now() > (tokenTimestamp + configuredExpiry);
    }

    // Fallback: check age of loaded data
    return age > configuredExpiry;
  }

  /**
   * Check if authenticated (has handshake with valid non-expired token).
   * 
   * @returns True if authenticated and token is not expired
   */
  get isAuthenticated(): boolean {
    // Check basic authentication state
    if (!this.hasHandshake || !this.hasToken || !this._tokenValidated) {
      return false;
    }
    // Check token expiration
    return !this.isTokenExpired();
  }

  /**
   * Refresh by re-reading the handshake file.
   * 
   * @returns Promise that resolves when refresh is complete
   * @throws {HandshakeNotFoundError} If handshake file doesn't exist
   * @throws {InvalidHandshakeError} If handshake file is invalid
   */
  async refresh(): Promise<void> {
    this.clear();
    await this.readHandshake();
    this.validateTokenOrThrow();
  }

  /**
   * Clear the loaded handshake data.
   */
  clear(): void {
    this._handshake = null;
    this._tokenValidated = false;
    this._loadedAt = null;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Validate handshake file structure.
   */
  private validateHandshake(data: unknown): void {
    if (typeof data !== 'object' || data === null) {
      throw new InvalidHandshakeError('根对象必须是 JSON 对象');
    }

    const handshake = data as Record<string, unknown>;

    // Required fields
    if (!handshake.bound_to) {
      throw new InvalidHandshakeError('缺少 required 字段: bound_to');
    }

    if (typeof handshake.bound_to !== 'string') {
      throw new InvalidHandshakeError('bound_to 必须是字符串');
    }

    if (!handshake.port) {
      throw new InvalidHandshakeError('缺少 required 字段: port');
    }

    if (typeof handshake.port !== 'number' || !Number.isInteger(handshake.port)) {
      throw new InvalidHandshakeError('port 必须是整数');
    }

    if (handshake.port < 1 || handshake.port > 65535) {
      throw new InvalidHandshakeError('port 必须在 1-65535 范围内');
    }

    if (!handshake.token) {
      throw new InvalidHandshakeError('缺少 required 字段: token');
    }

    if (typeof handshake.token !== 'string') {
      throw new InvalidHandshakeError('token 必须是字符串');
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an AuthManager with default configuration.
 */
export function createAuthManager(config?: AuthManagerConfig): AuthManager {
  return new AuthManager(config);
}

/**
 * Create an AuthManager and immediately load the handshake.
 * 
 * @param config - AuthManager configuration
 * @returns AuthManager with loaded handshake
 */
export async function createAuthenticatedClient(
  config?: AuthManagerConfig
): Promise<AuthManager> {
  const auth = new AuthManager(config);
  await auth.readHandshake();
  auth.validateTokenOrThrow();
  return auth;
}