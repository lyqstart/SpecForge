/**
 * Provider-neutral contract between the Daemon and an LLM kernel adapter.
 *
 * Provider-specific request, response, session and event shapes must stay on
 * the adapter side of this boundary.
 */
export interface LLMKernelAdapter {
  readonly version: string;
  readonly compatibleKernelRange: string;
  spawnAgent(params: SpawnAgentParams): Promise<SpawnAgentResult>;
  getSession(sessionId: string): Promise<SessionInfo | null>;
  cancelSession(sessionId: string, reason: string): Promise<void>;
  sendPrompt(sessionId: string, message: UserMessage): Promise<void>;
  subscribeEvents(sessionId: string): AsyncIterable<KernelEvent>;
  getCapabilities(model: string): Promise<ModelCapabilities>;
}

export interface UserMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageId?: string;
  timestamp?: Date;
}

export interface KernelEvent {
  type: string;
  payload: unknown;
  sessionId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface SpawnAgentParams {
  agentRole: string;
  spawnIntentId: string;
  systemPrompt?: string;
  cwd?: string;
  model?: string;
  options?: SessionSpawnOptions;
}

export interface SessionSpawnOptions {
  timeout?: number;
  env?: Record<string, string>;
  verbose?: boolean;
}

export interface SpawnAgentResult {
  sessionId: string;
}

export interface SessionInfo {
  sessionId: string;
  status: SessionStatus;
  createdAt: Date;
  lastActivityAt: Date;
  model?: string;
}

export type SessionStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'error';

export interface ModelCapabilities {
  streaming: boolean;
  maxContextLength: number;
  tools: boolean;
  vision: boolean;
  functionCalling: boolean;
  outputFormats: OutputFormat[];
}

export type OutputFormat = 'text' | 'json' | 'markdown';
