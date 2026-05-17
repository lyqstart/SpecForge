/**
 * OpenCode Adapter - Main implementation
 *
 * Implements the LLMKernelAdapter interface for OpenCode,
 * providing isolation between OpenCode implementation details and Daemon core.
 *
 * Requirements: 1.1, 1.2, 2.1
 */

import {
  LLMKernelAdapter,
  SpawnAgentParams,
  SpawnAgentResult,
  SessionInfo,
  UserMessage,
  KernelEvent,
  ModelCapabilities,
  AdapterConfig,
  DEFAULT_ADAPTER_CONFIG,
  SessionStatus,
  OpenCodeEvent,
  OpenCodeModelCapabilities,
} from './types';

import type { CapabilityDiscoveryResult } from './translators/CapabilityTranslator';
import { VersionChecker } from './version/VersionChecker';
import { EventTranslator } from './translators/EventTranslator';
import { CapabilityTranslator } from './translators/CapabilityTranslator';
import { SessionRegistry } from './integration/SessionRegistry';
import { DaemonStartupManager } from './integration/DaemonStartupManager';
import { DiagnosticsLogger, type DiagnosticsConfig } from './diagnostics';
import { EventLogger } from './event-logger/EventLogger';

/**
 * Internal session record
 */
interface SessionRecord {
  sessionId: string;
  spawnIntentId: string;
  status: SessionStatus;
  createdAt: Date;
  lastActivityAt: Date;
  agentRole: string;
  systemPrompt?: string;
  cwd?: string;
  model?: string;
  capabilities?: ModelCapabilities;
}

/**
 * Internal OpenCode prompt message format
 * This type is used internally for communication with OpenCode
 * but is NEVER exposed outside the adapter (concept isolation)
 */
interface OpenCodePromptMessage {
  /** Message role */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Internal metadata (never exposed to Daemon) */
  _meta: {
    sessionId: string;
    spawnIntentId: string;
    origin: 'daemon';
    messageId: string;
  };
}

/**
 * Session initialization error
 */
export class SessionInitializationError extends Error {
  constructor(
    message: string,
    public readonly code: 'VERSION_MISMATCH' | 'SESSION_INIT_FAILED' | 'TIMEOUT' | 'INVALID_PARAMS',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'SessionInitializationError';
  }
}

/**
 * Prompt delivery error
 * Thrown when a prompt cannot be delivered to the session
 */
export class PromptDeliveryError extends Error {
  constructor(
    message: string,
    public readonly code: 'SESSION_NOT_FOUND' | 'SESSION_NOT_ACTIVE' | 'TRANSLATION_FAILED' | 'DELIVERY_FAILED' | 'INVALID_MESSAGE',
    public readonly sessionId?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'PromptDeliveryError';
  }
}

/**
 * OpenCode Adapter class
 *
 * Implements the LLMKernelAdapter interface for OpenCode.
 * Provides translation layer between OpenCode and Daemon protocols.
 */
/* eslint-disable @typescript-eslint/require-await */
export class OpenCodeAdapter implements LLMKernelAdapter {
  readonly version: string = '1.0.0';
  readonly compatibleKernelRange: string;

  private config: AdapterConfig;
  private versionChecker: VersionChecker;
  private sessions: Map<string, SessionRecord> = new Map();
  private eventTranslator: EventTranslator;
  private capabilityTranslator: CapabilityTranslator;
  
  // Session binding registry (first-contact binding strategy)
  private sessionRegistry: SessionRegistry;
  
  // Daemon startup manager (on-demand startup support - Requirement 4.3)
  private daemonStartupManager?: DaemonStartupManager;
  
  // Event logger for logging adapter events (Task 7.2: Event logging)
  private eventLogger: EventLogger;
  
  private _autoStartDaemon: boolean;
  
  // Event streaming infrastructure
  private eventControllers: Map<string, AbortController> = new Map();
  private eventQueues: Map<string, KernelEvent[]> = new Map();
  private eventListeners: Map<string, Set<(event: KernelEvent) => void>> = new Map();
  // 事件通知器：生产者调用 notify() 唤醒等待中的消费者（替代轮询）
  private eventNotifiers: Map<string, () => void> = new Map();
  
  // Diagnostics logger for translation logs, performance metrics, and compatibility warnings
  private diagnosticsLogger: DiagnosticsLogger;
  
  // Reconnection state - used in production for event stream reconnection
  private reconnectAttempts: Map<string, number> = new Map();
  private _maxReconnectAttempts = 3;
  private _reconnectDelayMs = 1000;

  /**
   * 返回当前活跃订阅数量（用于测试断言资源已清理）
   * 规则 X2：副作用必须可检测
   */
  getActiveSubscriptionCount(): number {
    return this.eventControllers.size;
  }

  /**
   * Get the maximum number of reconnection attempts
   * @returns Maximum reconnect attempts
   */
  getMaxReconnectAttempts(): number {
    return this._maxReconnectAttempts;
  }

  /**
   * Get the reconnection delay in milliseconds
   * @returns Reconnect delay in ms
   */
  getReconnectDelayMs(): number {
    return this._reconnectDelayMs;
  }

  constructor(config: Partial<AdapterConfig> & { diagnostics?: Partial<DiagnosticsConfig> } = {}) {
    this.config = { ...DEFAULT_ADAPTER_CONFIG, ...config };
    this.compatibleKernelRange = this.config.compatibleKernelRange;
    this.versionChecker = new VersionChecker(this.config.compatibleKernelRange);
    this.eventTranslator = new EventTranslator();
    this.capabilityTranslator = new CapabilityTranslator();
    this.sessionRegistry = new SessionRegistry();
    this._autoStartDaemon = this.config.autoStartDaemon ?? true;
    
    // Initialize diagnostics logger
    const diagnosticsConfig: DiagnosticsConfig = {
      logLevel: this.config.verboseLogging ? 'debug' : 'info',
      translationLogging: this.config.verboseLogging,
      performanceMetrics: this.config.verboseLogging,
      compatibilityWarnings: true,
      debugInfo: this.config.verboseLogging,
      maxLogEntries: 1000,
      maxPerformanceMetrics: 500,
    };
    this.diagnosticsLogger = new DiagnosticsLogger({
      ...diagnosticsConfig,
      ...config.diagnostics,
    });
    
    // Initialize event logger for Task 7.2: Event logging
    this.eventLogger = new EventLogger({
      projectId: 'opencode-adapter',
      schemaVersion: this.version,
      verboseLogging: this.config.verboseLogging,
    });
  }

  /**
   * Spawn a new agent session
   *
   * Validates OpenCode version compatibility, then starts an OpenCode session
   * with the injected prompt. Handles all initialization errors gracefully.
   *
   * @param params - Spawn parameters including agentRole, spawnIntentId, systemPrompt, etc.
   * @returns Promise resolving to SpawnAgentResult with sessionId
   * @throws SessionInitializationError if version is incompatible or initialization fails
   *
   * Requirements: 1.1, 1.4, 2.1
   */
  async spawnAgent(params: SpawnAgentParams): Promise<SpawnAgentResult> {
    const operation = 'spawnAgent';
    this.diagnosticsLogger.startOperation(operation);

    // Step 1: Validate required parameters
    this.validateSpawnParams(params);
    this.diagnosticsLogger.debug('spawnAgent', 'Validating spawn parameters', { spawnIntentId: params.spawnIntentId });

    // Step 2: Validate OpenCode version compatibility
    // We detect OpenCode version - in production this would come from the actual OpenCode runtime
    const openCodeVersion = await this.detectOpenCodeVersion();
    this.diagnosticsLogger.debug('spawnAgent', 'Detected OpenCode version', { version: openCodeVersion });

    const versionCheck = this.versionChecker.check(openCodeVersion);

    if (!versionCheck.compatible) {
      // Log compatibility warning
      this.diagnosticsLogger.addCompatibilityWarning(
        'version_mismatch',
        `OpenCode version ${openCodeVersion} is not compatible with adapter range ${this.compatibleKernelRange}`,
        'high',
        { detectedVersion: openCodeVersion, requiredRange: this.compatibleKernelRange }
      );

      // Task 7.2: Log adapter.version_mismatch event
      this.eventLogger.logVersionMismatch({
        detectedVersion: openCodeVersion,
        requiredRange: this.compatibleKernelRange,
        reason: versionCheck.error ?? `Version ${openCodeVersion} not in range ${this.compatibleKernelRange}`,
        suggestedAction: this.getVersionSuggestionAction(openCodeVersion),
      });

      this.diagnosticsLogger.endOperation(operation, false, { detectedVersion: openCodeVersion });
      throw new SessionInitializationError(
        `OpenCode version incompatibility: ${versionCheck.error}. ` +
        `Required range: ${this.compatibleKernelRange}, Detected: ${openCodeVersion}`,
        'VERSION_MISMATCH',
        {
          detectedVersion: openCodeVersion,
          requiredRange: this.compatibleKernelRange,
          suggestion: this.getVersionSuggestion(openCodeVersion),
        }
      );
    }

    // Step 3: Create session record
    const sessionId = this.generateSessionId(params.spawnIntentId);
    const now = new Date();

    const sessionRecord: SessionRecord = {
      sessionId,
      spawnIntentId: params.spawnIntentId,
      status: 'pending',
      createdAt: now,
      lastActivityAt: now,
      agentRole: params.agentRole,
      systemPrompt: params.systemPrompt,
      cwd: params.cwd,
      model: params.model,
    };

    // Store session
    this.sessions.set(sessionId, sessionRecord);

    // Register spawn intent in session registry (first-contact binding)
    this.sessionRegistry.registerPending({
      spawnIntentId: params.spawnIntentId,
      agentRole: params.agentRole,
      metadata: {
        sessionId,
        systemPrompt: params.systemPrompt,
        cwd: params.cwd,
        model: params.model,
      },
    });

    // Step 4: Start OpenCode session with injected prompt
    try {
      await this.startOpenCodeSession(sessionRecord);
    } catch (error) {
      // Clean up session on failure
      this.sessions.delete(sessionId);

      // Log the error
      this.diagnosticsLogger.error('spawnAgent',
        `Failed to initialize OpenCode session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { spawnIntentId: params.spawnIntentId, error }
      );
      this.diagnosticsLogger.endOperation(operation, false, { spawnIntentId: params.spawnIntentId, error });

      // Task 7.2: Log integration.error event
      this.eventLogger.logIntegrationError({
        sessionId,
        errorType: 'opencode_client',
        code: error instanceof Error ? error.name : 'SESSION_INIT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        recoverable: false,
      });

      if (error instanceof SessionInitializationError) {
        throw error;
      }

      throw new SessionInitializationError(
        `Failed to initialize OpenCode session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SESSION_INIT_FAILED',
        { originalError: error }
      );
    }

    // Step 5: Return successful result
    this.diagnosticsLogger.info('spawnAgent', `Session created successfully`, { sessionId, spawnIntentId: params.spawnIntentId });
    this.diagnosticsLogger.endOperation(operation, true, { sessionId, spawnIntentId: params.spawnIntentId });

    // Task 7.2: Log session.lifecycle "created" event
    this.eventLogger.logSessionLifecycle({
      sessionId,
      spawnIntentId: params.spawnIntentId,
      event: 'created',
    });

    return {
      sessionId,
    };
  }

  /**
   * Validate spawn parameters
   * @param params - Parameters to validate
   * @throws SessionInitializationError if parameters are invalid
   */
  private validateSpawnParams(params: SpawnAgentParams): void {
    if (!params.agentRole || params.agentRole.trim().length === 0) {
      throw new SessionInitializationError(
        'Invalid agent role: must be a non-empty string',
        'INVALID_PARAMS',
        { agentRole: params.agentRole }
      );
    }

    if (!params.spawnIntentId || params.spawnIntentId.trim().length === 0) {
      throw new SessionInitializationError(
        'Invalid spawn intent ID: must be a non-empty string',
        'INVALID_PARAMS',
        { spawnIntentId: params.spawnIntentId }
      );
    }
  }

  /**
   * Detect OpenCode version
   * In production, this would query the actual OpenCode runtime
   * For now, returns a default version for testing
   */
  private async detectOpenCodeVersion(): Promise<string> {
    // In production, this would be:
    // 1. Query OpenCode via Thin Plugin
    // 2. Read from OpenCode's package.json or runtime API
    // For testing/development, return a mock version
    return '1.14.0';
  }

  /**
   * Generate a unique session ID
   * @param spawnIntentId - The spawn intent ID
   */
  private generateSessionId(spawnIntentId: string): string {
    return `oc-${spawnIntentId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Start OpenCode session with injected prompt
   * In production, this would communicate with OpenCode via the Thin Plugin
   * @param sessionRecord - Session configuration
   */
  private async startOpenCodeSession(sessionRecord: SessionRecord): Promise<void> {
    // In production, this would:
    // 1. Send request to OpenCode via Thin Plugin
    // 2. Include the system prompt injection
    // 3. Wait for session to be ready
    // 4. Update session status to 'active'

    // Simulate session initialization (in production, this would be an HTTP call to Thin Plugin)
    const initTimeout = this.config.communicationTimeout;

    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          startupTimer = setTimeout(() => {
            const session = this.sessions.get(sessionRecord.sessionId);
            if (session) {
              session.status = 'active';
              session.lastActivityAt = new Date();
              this.sessions.set(sessionRecord.sessionId, session);
              
              // Task 7.2: Log session.lifecycle "activated" event
              this.eventLogger.logSessionLifecycle({
                sessionId: sessionRecord.sessionId,
                spawnIntentId: sessionRecord.spawnIntentId,
                event: 'activated',
              });
            }
            resolve();
          }, 50);
        }),
        new Promise<void>((_, reject) => {
          timeoutTimer = setTimeout(() => {
            reject(new SessionInitializationError(
              `Session initialization timed out after ${initTimeout}ms. ` +
              `Operation: startOpenCodeSession. ` +
              `Suggestion: Check if OpenCode is running and accessible via Thin Plugin.`,
              'TIMEOUT',
              { timeoutMs: initTimeout }
            ));
          }, initTimeout);
        }),
      ]);
    } finally {
      // 规则 C1：无论胜负，清理所有 timer，防止进程无法退出
      clearTimeout(startupTimer);
      clearTimeout(timeoutTimer);
    }
  }

  /**
   * Get version upgrade/downgrade suggestion
   * @param detectedVersion - The detected OpenCode version
   */
  private getVersionSuggestion(detectedVersion: string): string {
    const parsed = this.versionChecker.parseVersion(detectedVersion);
    const range = this.versionChecker.getRangeString();

    // Check if version is too low or too high
    if (range.includes('>=') && range.includes('<')) {
      // Extract the minimum version from range
      const minMatch = range.match(/>=(\d+\.\d+\.\d+)/);
      const maxMatch = range.match(/<(\d+\.\d+\.\d+)/);

      if (minMatch && minMatch[1] && parsed.major < this.versionChecker.parseVersion(minMatch[1]).major) {
        return `Please upgrade OpenCode to version ${minMatch[1]} or later, or downgrade the adapter.`;
      }
      if (maxMatch && maxMatch[1] && parsed.major >= this.versionChecker.parseVersion(maxMatch[1]).major) {
        return `Please downgrade OpenCode to version less than ${maxMatch[1]}, or upgrade the adapter.`;
      }
    }

    return 'Please ensure OpenCode version is within the compatible range.';
  }

  /**
   * Get version suggestion action type
   * @param detectedVersion - The detected OpenCode version
   * @returns Suggested action for remediation
   */
  private getVersionSuggestionAction(detectedVersion: string): 'upgrade_adapter' | 'downgrade_kernel' | 'check_versions' {
    const parsed = this.versionChecker.parseVersion(detectedVersion);
    const range = this.versionChecker.getRangeString();

    if (range.includes('>=') && range.includes('<')) {
      const minMatch = range.match(/>=(\d+\.\d+\.\d+)/);
      const maxMatch = range.match(/<(\d+\.\d+\.\d+)/);

      if (minMatch && minMatch[1] && parsed.major < this.versionChecker.parseVersion(minMatch[1]).major) {
        return 'upgrade_adapter';
      }
      if (maxMatch && maxMatch[1] && parsed.major >= this.versionChecker.parseVersion(maxMatch[1]).major) {
        return 'downgrade_kernel';
      }
    }

    return 'check_versions';
  }

  /**
   * Get session information
   * @param sessionId - The session to query
   */
  async getSession(sessionId: string): Promise<SessionInfo | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      status: session.status,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      model: session.model,
    };
  }

  /**
   * Cancel/terminate a session
   * @param sessionId - The session to cancel
   * @param reason - Reason for cancellation
   */
  async cancelSession(sessionId: string, _reason: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      // Silently return for non-existent sessions
      return;
    }

    session.status = 'cancelled';
    session.lastActivityAt = new Date();
    this.sessions.set(sessionId, session);
    
    // Task 7.2: Log session.lifecycle "cancelled" event
    this.eventLogger.logSessionLifecycle({
      sessionId,
      spawnIntentId: session.spawnIntentId,
      event: 'cancelled',
      reason: _reason,
    });
  }

  /**
   * Send a prompt to an active session
   *
   * Validates the session exists and is active, then translates the UserMessage
   * to OpenCode format and delivers it to the session.
   *
   * @param sessionId - Target session ID
   * @param message - User message to send
   * @throws PromptDeliveryError if session not found, not active, or delivery fails
   *
   * Requirements: 1.1, 3.1
   */
  async sendPrompt(sessionId: string, message: UserMessage): Promise<void> {
    const operation = 'sendPrompt';
    this.diagnosticsLogger.startOperation(operation);

    // Step 1: Validate message
    this.validateMessage(message);
    this.diagnosticsLogger.debug('sendPrompt', 'Validating message', { sessionId, role: message.role });

    // Step 2: Get and validate session
    const session = this.sessions.get(sessionId);

    if (!session) {
      this.diagnosticsLogger.error('sendPrompt', `Session not found: ${sessionId}`, { sessionId });
      this.diagnosticsLogger.endOperation(operation, false, { sessionId });
      throw new PromptDeliveryError(
        `Session not found: ${sessionId}`,
        'SESSION_NOT_FOUND',
        sessionId
      );
    }

    if (session.status !== 'active') {
      this.diagnosticsLogger.error('sendPrompt', `Session is not active`, { sessionId, currentStatus: session.status });
      this.diagnosticsLogger.endOperation(operation, false, { sessionId });
      throw new PromptDeliveryError(
        `Session is not active. Current status: ${session.status}`,
        'SESSION_NOT_ACTIVE',
        sessionId,
        { currentStatus: session.status, expectedStatus: 'active' }
      );
    }

    // Step 3: Translate UserMessage to OpenCode format
    const translateStart = Date.now();
    const openCodeMessage = this.translateToOpenCodeFormat(message, session);
    this.diagnosticsLogger.logTranslation(
      'context',
      'UserMessage',
      'OpenCodePromptMessage',
      { success: true, data: openCodeMessage },
      Date.now() - translateStart
    );

    // Step 4: Deliver the prompt to OpenCode session
    try {
      await this.deliverPromptToSession(session, openCodeMessage);
    } catch (error) {
      this.diagnosticsLogger.error('sendPrompt',
        `Failed to deliver prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { sessionId, error }
      );
      this.diagnosticsLogger.endOperation(operation, false, { sessionId });

      if (error instanceof PromptDeliveryError) {
        throw error;
      }

      throw new PromptDeliveryError(
        `Failed to deliver prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELIVERY_FAILED',
        sessionId,
        { originalError: error }
      );
    }

    // Step 5: Update session last activity time
    session.lastActivityAt = new Date();
    this.sessions.set(sessionId, session);

    this.diagnosticsLogger.debug('sendPrompt', 'Prompt delivered successfully', { sessionId });
    this.diagnosticsLogger.endOperation(operation, true, { sessionId });
  }

  /**
   * Validate user message
   * @param message - Message to validate
   * @throws PromptDeliveryError if message is invalid
   */
  private validateMessage(message: UserMessage): void {
    if (!message) {
      throw new PromptDeliveryError(
        'Message is required',
        'INVALID_MESSAGE'
      );
    }

    if (!message.content || message.content.trim().length === 0) {
      throw new PromptDeliveryError(
        'Message content is required and cannot be empty',
        'INVALID_MESSAGE'
      );
    }

    const validRoles = ['user', 'assistant', 'system'];
    if (message.role && !validRoles.includes(message.role)) {
      throw new PromptDeliveryError(
        `Invalid message role: ${message.role}. Valid roles are: ${validRoles.join(', ')}`,
        'INVALID_MESSAGE',
        undefined,
        { providedRole: message.role, validRoles }
      );
    }
  }

  /**
   * Translate UserMessage to OpenCode format
   * This maintains concept isolation - OpenCode-specific format is internal only
   *
   * @param message - Daemon-neutral UserMessage
   * @param session - Target session record
   * @returns OpenCode-formatted message (internal only)
   */
  private translateToOpenCodeFormat(message: UserMessage, session: SessionRecord): OpenCodePromptMessage {
    // Create the OpenCode-specific format (internal only, not exposed to Daemon)
    return {
      // OpenCode expects 'role' field
      role: message.role,
      // OpenCode expects 'content' field
      content: message.content,
      // OpenCode uses 'timestamp' as Unix timestamp in milliseconds
      timestamp: message.timestamp?.getTime() ?? Date.now(),
      // OpenCode-specific metadata (never exposed to Daemon)
      _meta: {
        // Internal session tracking
        sessionId: session.sessionId,
        spawnIntentId: session.spawnIntentId,
        // Message origin tracking (never leaks OpenCode concepts)
        origin: 'daemon',
        // Message ID for tracking
        messageId: message.messageId ?? this.generateMessageId(),
      },
    };
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Deliver prompt to OpenCode session
   * In production, this would communicate via Thin Plugin
   *
   * @param session - Target session record
   * @param message - OpenCode-formatted message
   */
  private async deliverPromptToSession(
    session: SessionRecord,
    message: OpenCodePromptMessage
  ): Promise<void> {
    // In production, this would:
    // 1. Send the message to OpenCode via Thin Plugin HTTP endpoint
    // 2. Wait for acknowledgment
    // 3. Handle any errors from OpenCode

    // Simulate async delivery (in production, this would be an HTTP call)
    let deliveryTimer: ReturnType<typeof setTimeout> | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          deliveryTimer = setTimeout(() => {
            if (this.config.verboseLogging) {
              console.log(`[OpenCodeAdapter] Delivered prompt to session ${session.sessionId}`, {
                role: message.role,
                contentLength: message.content.length,
                timestamp: message.timestamp,
              });
            }
            resolve();
          }, 10);
        }),
        new Promise<void>((_, reject) => {
          timeoutTimer = setTimeout(() => {
            reject(new PromptDeliveryError(
              `Prompt delivery timed out after ${this.config.communicationTimeout}ms. ` +
              `Operation: deliverPromptToSession(${session.sessionId}). ` +
              `Suggestion: Check Thin Plugin connectivity or increase communicationTimeout.`,
              'DELIVERY_FAILED',
              session.sessionId,
              { timeoutMs: this.config.communicationTimeout }
            ));
          }, this.config.communicationTimeout);
        }),
      ]);
    } finally {
      // 规则 C1：无论胜负，清理所有 timer，防止进程无法退出
      clearTimeout(deliveryTimer);
      clearTimeout(timeoutTimer);
    }
  }

  /**
   * Subscribe to session events
   *
   * Creates an async iterable that streams events from the OpenCode session.
   * Events are translated from OpenCode format to Daemon-neutral format.
   * Handles event stream errors and implements reconnection logic.
   *
   * @param sessionId - The session to subscribe to
   * @returns AsyncIterable of kernel events
   *
   * Requirements: 1.1, 3.1
   */
  subscribeEvents(sessionId: string): AsyncIterable<KernelEvent> {
    // Validate session exists
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Return an async iterable that immediately completes with an error event
      return this.createErrorEventStream(sessionId, 'Session not found');
    }

    // Check if session is in a valid state for receiving events
    if (session.status === 'cancelled' || session.status === 'completed') {
      return this.createErrorEventStream(sessionId, `Session is ${session.status}`);
    }

    // Create event queue for this subscription
    const eventQueue: KernelEvent[] = [];
    this.eventQueues.set(sessionId, eventQueue);

    // Create abort controller for cancellation
    const controller = new AbortController();
    this.eventControllers.set(sessionId, controller);

    // Initialize reconnect state
    this.reconnectAttempts.set(sessionId, 0);

    // Return async iterable that streams events
    return this.createEventStream(sessionId, eventQueue, controller.signal);
  }

  /**
   * Create an event stream for a session
   * 规则 C2：用事件通知替代轮询，加超时兜底，终止条件通过 AbortSignal 保证可达
   */
  private createEventStream(
    sessionId: string,
    eventQueue: KernelEvent[],
    signal: AbortSignal
  ): AsyncIterable<KernelEvent> {
    let index = 0;
    let wakeupResolver: (() => void) | null = null;

    // 注册通知器：enqueueEvent 调用此函数唤醒等待中的消费者
    const notify = () => {
      if (wakeupResolver) {
        const r = wakeupResolver;
        wakeupResolver = null;
        r();
      }
    };
    this.eventNotifiers.set(sessionId, notify);

    // abort 时也唤醒，让循环立即退出
    signal.addEventListener('abort', notify, { once: true });

    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<KernelEvent>> {
            if (signal.aborted) {
              return { done: true, value: undefined };
            }

            // 被动等待新事件（不轮询），加 30s 超时兜底（规则 C2）
            while (index >= eventQueue.length) {
              if (signal.aborted) {
                return { done: true, value: undefined };
              }

              let timeoutId: ReturnType<typeof setTimeout> | undefined;
              try {
                await Promise.race([
                  new Promise<void>(resolve => { wakeupResolver = resolve; }),
                  new Promise<void>((_, reject) => {
                    timeoutId = setTimeout(
                      () => reject(new Error('Event stream idle timeout (30s): no events received')),
                      30_000
                    );
                  }),
                ]);
              } catch {
                // 超时兜底触发：退出循环，返回 done
                return { done: true, value: undefined };
              } finally {
                clearTimeout(timeoutId); // 规则 C1：清理败者 timer
              }
            }

            const event = eventQueue[index] as KernelEvent;
            index++;
            return { done: false, value: event };
          },
        };
      },
    };
  }

  /**
   * Create an error event stream for invalid sessions
   */
  private createErrorEventStream(sessionId: string, errorMessage: string): AsyncIterable<KernelEvent> {
    const errorEvent: KernelEvent = {
      type: 'adapter.error',
      payload: { error: errorMessage },
      sessionId,
      timestamp: new Date(),
      metadata: { error: true },
    };

    let delivered = false;

    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<KernelEvent>> {
            if (delivered) {
              return { done: true, value: undefined };
            }
            delivered = true;
            return { done: false, value: errorEvent };
          },
        };
      },
    };
  }

  /**
   * Push an event to a session's event queue
   * Used internally to inject events from OpenCode/Thin Plugin
   *
   * @param sessionId - Target session
   * @param rawEvent - Raw OpenCode event
   */
  async pushEvent(sessionId: string, rawEvent: OpenCodeEvent): Promise<void> {
    // First-contact binding: check if this event carries spawnIntentId
    // and bind it to the actual sessionId if not already bound
    const spawnIntentId = (rawEvent as any).spawn_intent_id;
    if (spawnIntentId) {
      const existingBinding = this.sessionRegistry.findBySpawnIntentId(spawnIntentId);
      if (!existingBinding || existingBinding.state !== 'bound') {
        // First contact - bind spawn intent to session
        this.sessionRegistry.bind(spawnIntentId, sessionId);
      }
    }

    // Translate OpenCode event to Daemon format
    const translation = this.eventTranslator.translate(rawEvent);

    if (!translation.success) {
      // Task 7.2: Log translation.failure event
      this.eventLogger.logTranslationFailure({
        sessionId,
        translationType: 'event',
        inputType: rawEvent.event_type,
        reason: translation.reason,
        unsupported: true,
      });
      
      // Event couldn't be translated - emit unsupported event
      const unsupportedEvent: KernelEvent = {
        type: 'adapter.error',
        payload: {
          originalType: rawEvent.event_type,
          reason: translation.reason,
        },
        sessionId,
        timestamp: new Date(),
        metadata: { unsupported: true },
      };
      this.enqueueEvent(sessionId, unsupportedEvent);
      return;
    }

    // Enqueue the translated event
    this.enqueueEvent(sessionId, translation.data);
  }

  /**
   * Enqueue an event to a session's queue
   * 规则 C2：入队后通知等待中的消费者（推模式，替代轮询）
   */
  private enqueueEvent(sessionId: string, event: KernelEvent): void {
    const queue = this.eventQueues.get(sessionId);
    if (queue) {
      queue.push(event);
      // 唤醒等待中的消费者
      const notify = this.eventNotifiers.get(sessionId);
      if (notify) notify();
    }
  }

  /**
   * Unsubscribe from session events
   * Cleans up resources associated with the event stream
   * 规则 C4：提供对应的清理方法，规则 A4：创建者负责销毁
   */
  unsubscribeEvents(sessionId: string): void {
    // Abort the controller if exists（触发 signal.abort，唤醒 while 循环退出）
    const controller = this.eventControllers.get(sessionId);
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }

    // Clean up all resources
    this.eventControllers.delete(sessionId);
    this.eventQueues.delete(sessionId);
    this.eventListeners.delete(sessionId);
    this.eventNotifiers.delete(sessionId); // 清理通知器
    this.reconnectAttempts.delete(sessionId);
  }

  /**
   * Simulate incoming events for testing
   * In production, this would be called by the Thin Plugin client
   */
  async simulateEvent(sessionId: string, eventType: string, payload: unknown): Promise<void> {
    const openCodeEvent: OpenCodeEvent = {
      event_type: eventType,
      data: payload,
      sid: sessionId,
      ts: Date.now(),
    };

    await this.pushEvent(sessionId, openCodeEvent);
  }

  /**
   * Get model capabilities
   *
   * Queries the OpenCode model capabilities and translates them to
   * Daemon ModelCapabilities format. Results are cached for performance.
   *
   * @param model - Model identifier (e.g., "gpt-4", "claude-3")
   * @returns Promise resolving to ModelCapabilities
   *
   * Requirements: 1.1, 3.1
   */
  async getCapabilities(model: string): Promise<ModelCapabilities> {
    // Validate model parameter
    if (!model || model.trim().length === 0) {
      // Return default capabilities for empty/undefined model
      return this.capabilityTranslator.getDefaultCapabilities();
    }

    // Try to discover capabilities from OpenCode
    // In production, this would query OpenCode for actual capabilities
    const discoveryResult = await this.discoverModelCapabilities(model);

    if (discoveryResult.success && discoveryResult.capabilities) {
      return discoveryResult.capabilities;
    }

    // Fall back to default capabilities if discovery fails
    return this.capabilityTranslator.getDefaultCapabilities();
  }

  /**
   * Discover model capabilities from OpenCode
   * In production, this would query OpenCode via Thin Plugin
   *
   * @param model - Model identifier
   * @returns Capability discovery result
   */
  private async discoverModelCapabilities(model: string): Promise<CapabilityDiscoveryResult> {
    // In production, this would:
    // 1. Query OpenCode via Thin Plugin API
    // 2. Get model capabilities from OpenCode
    // 3. Translate using capabilityTranslator.translate()

    // For now, simulate capability discovery based on model name
    // This can be replaced with actual OpenCode API calls in production
    
    // Check if there's cached data from the session
    const session = this.findSessionByModel(model);
    if (session && session.capabilities) {
      return {
        success: true,
        capabilities: session.capabilities,
      };
    }

    // Generate mock capabilities based on model family
    const mockCapabilities = this.generateMockCapabilities(model);
    
    return this.capabilityTranslator.discoverCapabilities(model, mockCapabilities);
  }

  /**
   * Find a session by model name
   */
  private findSessionByModel(model: string): SessionRecord | undefined {
    for (const session of this.sessions.values()) {
      if (session.model === model) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Generate mock capabilities for a model (for testing/development)
   * In production, this would be replaced with actual OpenCode API calls
   *
   * @param model - Model identifier
   * @returns OpenCode model capabilities
   */
  private generateMockCapabilities(model: string): OpenCodeModelCapabilities {
    const lowerModel = model.toLowerCase();
    
    // Default capabilities
    const baseCapabilities: OpenCodeModelCapabilities = {
      provider: this.detectProvider(model),
      model: model,
      features: {
        streaming: true,
        vision: lowerModel.includes('vision') || lowerModel.includes('4v') || lowerModel.includes('claude'),
        function_calling: true,
        json_output: true,
      },
      context_window: 128000,
      tools: ['read_file', 'fs_write', 'execute_pwsh', 'grep_search', 'list_directory'],
    };

    // Adjust based on model family
    if (lowerModel.includes('gpt-4') || lowerModel.includes('gpt4')) {
      baseCapabilities.context_window = 128000;
      baseCapabilities.features.vision = lowerModel.includes('vision') || lowerModel.includes('4v');
    } else if (lowerModel.includes('gpt-3.5') || lowerModel.includes('gpt3.5')) {
      baseCapabilities.context_window = 16385;
      baseCapabilities.features.vision = false;
    } else if (lowerModel.includes('claude')) {
      baseCapabilities.context_window = 200000;
      baseCapabilities.features.vision = true;
    } else if (lowerModel.includes('gemini')) {
      baseCapabilities.context_window = 1000000;
      baseCapabilities.features.vision = true;
    }

    return baseCapabilities;
  }

  /**
   * Detect provider from model name
   */
  private detectProvider(model: string): string {
    const lowerModel = model.toLowerCase();
    if (lowerModel.includes('gpt')) return 'openai';
    if (lowerModel.includes('claude')) return 'anthropic';
    if (lowerModel.includes('gemini')) return 'google';
    if (lowerModel.includes('mistral')) return 'mistral';
    if (lowerModel.includes('llama')) return 'meta';
    return 'unknown';
  }

  /**
   * Clear the capabilities cache
   * Useful when model capabilities change or for testing
   */
  clearCapabilitiesCache(model?: string): void {
    this.capabilityTranslator.clearCache(model);
  }

  /**
   * Check version compatibility
   * @param kernelVersion - Version string to check
   */
  checkVersionCompatibility(kernelVersion: string) {
    return this.versionChecker.check(kernelVersion);
  }

  /**
   * Update adapter configuration
   */
  updateConfig(config: Partial<AdapterConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.compatibleKernelRange) {
      this.versionChecker = new VersionChecker(config.compatibleKernelRange);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AdapterConfig {
    return { ...this.config };
  }

  // ============================================================
  // Session Binding API (Requirements: 4.2)
  // ============================================================

  /**
   * Register a pending spawn intent
   *
   * Called before starting OpenCode session to enable first-contact binding.
   *
   * @param spawnIntentId - Pre-generated spawn intent ID from Daemon
   * @param agentRole - Agent role for the session
   * @param metadata - Optional metadata
   * @returns Registration result
   */
  registerSpawnIntent(
    spawnIntentId: string,
    agentRole: string,
    metadata?: Record<string, unknown>
  ): { success: boolean; error?: string } {
    return this.sessionRegistry.registerPending({
      spawnIntentId,
      agentRole,
      metadata,
    });
  }

  /**
   * Bind spawn intent to session ID
   *
   * Implements first-contact binding strategy.
   * Typically called when first event arrives from OpenCode.
   *
   * @param spawnIntentId - The pre-registered spawn intent ID
   * @param sessionId - The actual session ID from OpenCode
   * @returns Binding result
   */
  bindSession(spawnIntentId: string, sessionId: string): { success: boolean; error?: string } {
    return this.sessionRegistry.bind(spawnIntentId, sessionId);
  }

  /**
   * Find session by spawn intent ID
   *
   * @param spawnIntentId - Spawn intent ID to find
   * @returns Session ID if found
   */
  findSessionBySpawnIntent(spawnIntentId: string): string | undefined {
    const binding = this.sessionRegistry.findBySpawnIntentId(spawnIntentId);
    return binding?.state === 'bound' ? binding.sessionId : undefined;
  }

  /**
   * Get session binding statistics
   *
   * @returns Statistics about session bindings
   */
  getSessionBindingStats(): {
    total: number;
    pending: number;
    bound: number;
    released: number;
  } {
    return this.sessionRegistry.getStats();
  }

  /**
   * Release a session binding
   *
   * @param sessionId - Session ID to release
   * @returns Whether release succeeded
   */
  releaseSessionBinding(sessionId: string): boolean {
    return this.sessionRegistry.release(sessionId);
  }

  // ============================================================
  // On-Demand Daemon Startup API (Requirements: 4.3)
  // ============================================================

  /**
   * Initialize the Daemon startup manager
   *
   * Creates the startup manager with optional custom configuration.
   * This is called lazily when first needed.
   *
   * @param config - Optional startup manager configuration
   */
  initializeDaemonStartup(config?: {
    daemonCommand?: string;
    daemonArgs?: string[];
    startupTimeout?: number;
    healthCheckUrl?: string;
  }): void {
    if (!this.daemonStartupManager) {
      this.daemonStartupManager = new DaemonStartupManager({
        daemonCommand: config?.daemonCommand ?? 'bun',
        daemonArgs: config?.daemonArgs ?? ['run', 'daemon-core/src/index.ts'],
        startupTimeout: config?.startupTimeout ?? 30000,
        healthCheckUrl: config?.healthCheckUrl ?? 'http://localhost:3000/health',
        maxRetries: 3,
        retryDelay: 2000,
      });
    }
  }

  /**
   * Check if Daemon needs to be started
   *
   * Detects whether Daemon is running and needs startup.
   * Uses health check endpoint to determine availability.
   *
   * @returns Promise resolving to true if Daemon needs to be started
   */
  async daemonNeedsStartup(): Promise<boolean> {
    // Initialize if not already done
    this.initializeDaemonStartup();
    
    return this.daemonStartupManager!.needsStartup();
  }

  /**
   * Start the Daemon process
   *
   * Implements on-demand startup with:
   * - Process detection
   * - Startup with retries
   * - Health check verification
   * - Failure handling
   *
   * @returns Promise resolving to startup result
   */
  async startDaemon(): Promise<{
    success: boolean;
    error?: string;
    pid?: number;
    attempts?: number;
    alreadyRunning?: boolean;
  }> {
    // Initialize if not already done
    this.initializeDaemonStartup();
    
    try {
      const result = await this.daemonStartupManager!.startDaemon();
      
      // Log the result if verbose logging is enabled
      if (this.config.verboseLogging) {
        if (result.success) {
          console.log(`[OpenCodeAdapter] Daemon started successfully`, {
            pid: result.pid,
            attempts: result.attempts,
          });
        } else {
          console.error(`[OpenCodeAdapter] Daemon startup failed`, {
            error: result.error,
            attempts: result.attempts,
          });
        }
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (this.config.verboseLogging) {
        console.error(`[OpenCodeAdapter] Daemon startup error`, { error: errorMessage });
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Ensure Daemon is running
   *
   * Checks if Daemon is running, and if not, starts it.
   * This is the main entry point for on-demand startup.
   *
   * @returns Promise resolving to true if Daemon is running or was started successfully
   */
  async ensureDaemonRunning(): Promise<boolean> {
    // First check if already running
    if (await this.isDaemonRunning()) {
      return true;
    }

    // Try to start
    const result = await this.startDaemon();
    return result.success;
  }

  /**
   * Check if Daemon is running
   *
   * @returns Promise resolving to true if Daemon is running
   */
  async isDaemonRunning(): Promise<boolean> {
    // Initialize if not already done
    this.initializeDaemonStartup();
    
    return this.daemonStartupManager!.isRunning();
  }

  /**
   * Get Daemon status
   *
   * @returns Current Daemon status
   */
  async getDaemonStatus(): Promise<{
    state: 'stopped' | 'starting' | 'running' | 'error';
    running: boolean;
    uptime?: number;
    pid?: number;
  }> {
    // Initialize if not already done
    this.initializeDaemonStartup();
    
    return this.daemonStartupManager!.getStatus();
  }

  /**
   * Stop the Daemon process
   *
   * @param force - Force kill if graceful shutdown fails
   */
  async stopDaemon(force: boolean = false): Promise<void> {
    if (this.daemonStartupManager) {
      await this.daemonStartupManager.stopDaemon(force);
    }
  }

  /**
   * Check Daemon health
   *
   * @returns Health check result
   */
  async checkDaemonHealth(): Promise<{
    healthy: boolean;
    statusCode?: number;
    latency?: number;
    error?: string;
  }> {
    // Initialize if not already done
    this.initializeDaemonStartup();
    
    return this.daemonStartupManager!.checkHealth();
  }

  /**
   * Set auto-start Daemon flag
   *
   * @param autoStart - Whether to automatically start Daemon when needed
   */
  setAutoStartDaemon(autoStart: boolean): void {
    this._autoStartDaemon = autoStart;
  }

  /**
   * Get auto-start Daemon setting
   *
   * @returns Current auto-start setting
   */
  getAutoStartDaemon(): boolean {
    return this._autoStartDaemon;
  }
}
/* eslint-enable @typescript-eslint/require-await */
