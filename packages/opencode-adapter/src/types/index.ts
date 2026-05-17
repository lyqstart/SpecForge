/**
 * Type definitions for OpenCode Adapter
 *
 * This module contains the LLMKernelAdapter interface and OpenCode-specific types.
 * Internal types (not for export) are defined in internal-types.ts
 *
 * Requirements: 1.1, 1.2
 */

import { z } from 'zod';

/**
 * User message structure for sending prompts
 */
export interface UserMessage {
  /** Message role */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** Optional message ID */
  messageId?: string;
  /** Optional timestamp */
  timestamp?: Date;
}

/**
 * Kernel event structure
 * This is the Daemon-neutral event format exposed to the public API
 */
export interface KernelEvent {
  /** Event type */
  type: string;
  /** Event payload */
  payload: unknown;
  /** Session ID */
  sessionId: string;
  /** Timestamp */
  timestamp: Date;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * LLMKernelAdapter interface - required by SpecForge V6 architecture
 *
 * This interface defines the contract that all LLM kernel adapters must implement.
 * Each adapter is responsible for translating between the kernel's specific
 * communication protocol and Daemon's neutral protocol.
 *
 * Requirements: 1.1, 1.2
 */
export interface LLMKernelAdapter {
  /** Version string of the adapter - aligned with OpenCode major version */
  readonly version: string;

  /** Compatible kernel version range (e.g., "opencode ^1.14") */
  readonly compatibleKernelRange: string;

  /**
   * Spawn a new agent session
   * @param params - Spawn parameters
   */
  spawnAgent(params: SpawnAgentParams): Promise<SpawnAgentResult>;

  /**
   * Get session information
   * @param sessionId - The session to query
   */
  getSession(sessionId: string): Promise<SessionInfo | null>;

  /**
   * Cancel/terminate a session
   * @param sessionId - The session to cancel
   * @param reason - Reason for cancellation
   */
  cancelSession(sessionId: string, reason: string): Promise<void>;

  /**
   * Send a prompt to a session
   * @param sessionId - Target session
   * @param message - Message to send
   */
  sendPrompt(sessionId: string, message: UserMessage): Promise<void>;

  /**
   * Subscribe to session events
   * @param sessionId - Target session
   * @returns Async iterable of kernel events
   */
  subscribeEvents(sessionId: string): AsyncIterable<KernelEvent>;

  /**
   * Get model capabilities
   * @param model - Model identifier
   */
  getCapabilities(model: string): Promise<ModelCapabilities>;
}

/**
 * Parameters for spawning an agent
 */
export interface SpawnAgentParams {
  /** Agent role/identifier */
  agentRole: string;
  /** Unique spawn intent ID */
  spawnIntentId: string;
  /** System prompt to inject */
  systemPrompt?: string;
  /** Working directory */
  cwd?: string;
  /** Additional model configuration */
  model?: string;
  /** Additional options */
  options?: SessionSpawnOptions;
}

/**
 * Session spawn options
 */
export interface SessionSpawnOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Environment variables */
  env?: Record<string, string>;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Result of spawnAgent
 */
export interface SpawnAgentResult {
  /** Unique session identifier */
  sessionId: string;
}

/**
 * Session configuration options
 */
export interface SessionOptions {
  /** Model to use */
  model?: string;
  /** Session timeout in ms */
  timeout?: number;
  /** Custom environment variables */
  env?: Record<string, string>;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Result of spawnAgent
 */
export interface SpawnResult {
  /** Unique session identifier */
  sessionId: string;
  /** Whether the session started successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Session information
 */
export interface SessionInfo {
  /** Session ID */
  sessionId: string;
  /** Current status */
  status: SessionStatus;
  /** When the session was created */
  createdAt: Date;
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** Model being used */
  model?: string;
}

/**
 * Session status enum
 */
export type SessionStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'error';

/**
 * Result of cancelSession
 */
export interface CancelResult {
  /** Whether cancellation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of sendPrompt
 */
export interface SendResult {
  /** Whether the prompt was sent successfully */
  success: boolean;
  /** Message ID if successful */
  messageId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Event callback type
 */
export type EventCallback = (event: DaemonEvent) => void;

/**
 * Unsubscribe function type
 */
export type UnsubscribeFn = () => void;

/**
 * Daemon event structure
 */
export interface DaemonEvent {
  /** Event type */
  type: string;
  /** Event payload */
  payload: unknown;
  /** Session ID */
  sessionId: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Model capabilities
 */
export interface ModelCapabilities {
  /** Supports streaming */
  streaming: boolean;
  /** Maximum context length */
  maxContextLength: number;
  /** Supported tools */
  tools: boolean;
  /** Supports vision/multimodal */
  vision: boolean;
  /** Supports function calling */
  functionCalling: boolean;
  /** Supported output formats */
  outputFormats: OutputFormat[];
}

/**
 * Output format enum
 */
export type OutputFormat = 'text' | 'json' | 'markdown';

/**
 * Version compatibility result
 */
export interface VersionCompatibilityResult {
  /** Whether the version is compatible */
  compatible: boolean;
  /** The checked version */
  version: string;
  /** Required version range */
  requiredRange: string;
  /** Error message if incompatible */
  error?: string;
}

/**
 * OpenCode-specific context (internal only - not exported)
 * This type is used internally but never exposed outside the adapter
 */
export const OpenCodeContextSchema = z.object({
  /** OpenCode session ID */
  oc_sid: z.string(),
  /** OpenCode user ID */
  oc_uid: z.string().optional(),
  /** Workspace path */
  workspace: z.string(),
  /** OpenCode version */
  oc_version: z.string(),
  /** Model configuration */
  model: z
    .object({
      provider: z.string(),
      name: z.string(),
    })
    .optional(),
  /** Environment variables */
  env: z.record(z.string(), z.string()).optional(),
});

export type OpenCodeContext = z.infer<typeof OpenCodeContextSchema>;

/**
 * OpenCode event schema (internal only)
 */
export const OpenCodeEventSchema = z.object({
  /** Event type in OpenCode format */
  event_type: z.string(),
  /** Event payload */
  data: z.unknown(),
  /** Session ID */
  sid: z.string(),
  /** Timestamp */
  ts: z.number(),
});

export type OpenCodeEvent = z.infer<typeof OpenCodeEventSchema>;

/**
 * OpenCode tool call (internal only)
 */
export const OpenCodeToolCallSchema = z.object({
  /** Tool name */
  name: z.string(),
  /** Tool arguments */
  arguments: z.record(z.string(), z.unknown()),
  /** Call ID */
  id: z.string().optional(),
});

export type OpenCodeToolCall = z.infer<typeof OpenCodeToolCallSchema>;

/**
 * OpenCode tool result (internal only)
 */
export const OpenCodeToolResultSchema = z.object({
  /** Tool call ID */
  call_id: z.string(),
  /** Result data */
  result: z.unknown(),
  /** Error if any */
  error: z.string().optional(),
});

export type OpenCodeToolResult = z.infer<typeof OpenCodeToolResultSchema>;

/**
 * Translation result type
 * Used to indicate translation success or "unsupported" fallback
 */
export type TranslationResult<T> =
  | { success: true; data: T }
  | { success: false; unsupported: true; reason: string };

/**
 * Configuration for the OpenCode Adapter
 */
export interface AdapterConfig {
  /** Compatible kernel version range (SemVer) */
  compatibleKernelRange: string;
  /** Translation strictness level */
  translationStrictness: 'strict' | 'lenient';
  /** Timeout for kernel communication (ms) */
  communicationTimeout: number;
  /** Enable detailed logging */
  verboseLogging: boolean;
  /** Thin Plugin endpoint */
  thinPluginEndpoint?: string;
  /** Auto-start daemon if not running */
  autoStartDaemon: boolean;
}

/**
 * Default adapter configuration
 */
export const DEFAULT_ADAPTER_CONFIG: AdapterConfig = {
  compatibleKernelRange: '>=1.0.0 <2.0.0',
  translationStrictness: 'lenient',
  communicationTimeout: 30000,
  verboseLogging: false,
  autoStartDaemon: true,
};

// ============================================================
// Translation Layer Interfaces
// ============================================================

/**
 * Generic translator interface
 * All translators follow this pattern for consistency
 */
export interface Translator<TFrom, TTo> {
  /**
   * Check if this translator can handle the given input
   */
  canTranslate(input: TFrom): boolean;
  /**
   * Translate the input to the target format
   */
  translate(input: TFrom): TranslationResult<TTo>;
  /**
   * Get reasons why certain inputs are unsupported
   */
  getUnsupportedReasons(input: TFrom): string[];
}

/**
 * Context translator interface
 * Converts OpenCode context to Daemon-neutral session context
 */
export interface IContextTranslator {
  translate(ocContext: OpenCodeContext): TranslationResult<DaemonSessionContext>;
  isFieldSupported(fieldName: string): boolean;
}

/**
 * Daemon-neutral session context
 * This is the output format exposed to Daemon core
 */
export interface DaemonSessionContext {
  /** Session identifier */
  sessionId: string;
  /** User identifier */
  userId?: string;
  /** Workspace path */
  workspace: string;
  /** Kernel version */
  kernelVersion: string;
  /** Model information */
  model?: {
    provider: string;
    name: string;
  };
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Event translator interface
 * Maps OpenCode event schemas to Daemon event schemas
 */
export interface IEventTranslator {
  translate(ocEvent: OpenCodeEvent): TranslationResult<KernelEvent>;
  isEventTypeSupported(eventType: string): boolean;
  mapEventType(ocEventType: string): string;
}

/**
 * Tool translator interface
 * Converts tool call parameters between OpenCode and Daemon formats
 */
export interface IToolTranslator {
  translateToolCall(ocToolCall: OpenCodeToolCall, sessionId?: string): TranslationResult<DaemonToolCall>;
  translateToolResult(ocToolResult: OpenCodeToolResult, sessionId?: string): TranslationResult<DaemonToolResult>;
  isToolSupported(toolName: string): boolean;
}

/**
 * Daemon tool call format
 */
export interface DaemonToolCall {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Call ID */
  callId: string;
  /** Session ID */
  sessionId?: string;
}

/**
 * Daemon tool result format
 */
export interface DaemonToolResult {
  /** Call ID */
  callId: string;
  /** Result data */
  result: unknown;
  /** Error if any */
  error?: string;
  /** Session ID */
  sessionId?: string;
}

/**
 * Capability translator interface
 * Maps OpenCode model capabilities to Daemon ModelCapabilities
 */
export interface ICapabilityTranslator {
  translate(ocCapabilities: OpenCodeModelCapabilities): ModelCapabilities;
  getDefaultCapabilities(): ModelCapabilities;
  hasCapability(capability: keyof ModelCapabilities, capabilities: ModelCapabilities): boolean;
}

/**
 * OpenCode model capabilities (internal)
 */
export interface OpenCodeModelCapabilities {
  /** Provider name */
  provider: string;
  /** Model name */
  model: string;
  /** Supported features */
  features: {
    streaming?: boolean;
    vision?: boolean;
    function_calling?: boolean;
    json_output?: boolean;
  };
  /** Context window size */
  context_window?: number;
  /** Supported tools */
  tools?: string[];
}
