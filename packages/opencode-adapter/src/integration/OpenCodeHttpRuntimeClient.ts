/**
 * Production HTTP boundary for an independently managed `opencode serve`.
 *
 * This client never starts or stops either OpenCode or the SpecForge Daemon.
 */
export interface OpenCodeRuntimeSession {
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OpenCodeRuntimePrompt {
  content: string;
  messageId?: string;
  agent?: string;
  system?: string;
  model?: string;
  noReply?: boolean;
}

export interface OpenCodeRuntimeClient {
  getVersion(): Promise<string>;
  createSession(input: { title: string; directory?: string }): Promise<OpenCodeRuntimeSession>;
  getSession(sessionId: string, directory?: string): Promise<OpenCodeRuntimeSession | null>;
  abortSession(sessionId: string, directory?: string): Promise<void>;
  sendPrompt(sessionId: string, prompt: OpenCodeRuntimePrompt, directory?: string): Promise<void>;
}

export interface OpenCodeHttpRuntimeClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class OpenCodeRuntimeError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'OpenCodeRuntimeError';
  }
}

export class OpenCodeHttpRuntimeClient implements OpenCodeRuntimeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: OpenCodeHttpRuntimeClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:4096').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getVersion(): Promise<string> {
    const body = await this.requestJson('GET', '/global/health');
    const value = this.unwrap(body);
    if (!this.isRecord(value) || value['healthy'] !== true || typeof value['version'] !== 'string') {
      throw new OpenCodeRuntimeError('OpenCode health response is missing healthy/version fields');
    }
    return value['version'];
  }

  async createSession(input: { title: string; directory?: string }): Promise<OpenCodeRuntimeSession> {
    const body = await this.requestJson('POST', this.withDirectory('/session', input.directory), {
      title: input.title,
    });
    return this.parseSession(this.unwrap(body), 'create session');
  }

  async getSession(sessionId: string, directory?: string): Promise<OpenCodeRuntimeSession | null> {
    try {
      const body = await this.requestJson(
        'GET',
        this.withDirectory(`/session/${encodeURIComponent(sessionId)}`, directory),
      );
      return this.parseSession(this.unwrap(body), 'get session');
    } catch (error) {
      if (error instanceof OpenCodeRuntimeError && error.statusCode === 404) return null;
      throw error;
    }
  }

  async abortSession(sessionId: string, directory?: string): Promise<void> {
    await this.requestJson(
      'POST',
      this.withDirectory(`/session/${encodeURIComponent(sessionId)}/abort`, directory),
    );
  }

  async sendPrompt(
    sessionId: string,
    prompt: OpenCodeRuntimePrompt,
    directory?: string,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      parts: [{ type: 'text', text: prompt.content }],
    };
    if (prompt.messageId) body['messageID'] = prompt.messageId;
    if (prompt.agent) body['agent'] = prompt.agent;
    if (prompt.system) body['system'] = prompt.system;
    if (prompt.noReply !== undefined) body['noReply'] = prompt.noReply;
    const model = this.parseModel(prompt.model);
    if (model) body['model'] = model;

    await this.requestJson(
      'POST',
      this.withDirectory(`/session/${encodeURIComponent(sessionId)}/message`, directory),
      body,
    );
  }

  private async requestJson(method: string, pathname: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(`${this.baseUrl}${pathname}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new OpenCodeRuntimeError(
          `OpenCode ${method} ${pathname} failed with HTTP ${response.status}`,
          response.status,
          text,
        );
      }
      if (!text.trim()) return undefined;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new OpenCodeRuntimeError(`OpenCode ${method} ${pathname} returned invalid JSON`);
      }
    } catch (error) {
      if (error instanceof OpenCodeRuntimeError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OpenCodeRuntimeError(
          `OpenCode ${method} ${pathname} timed out after ${this.timeoutMs}ms`,
        );
      }
      throw new OpenCodeRuntimeError(
        `OpenCode ${method} ${pathname} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private withDirectory(pathname: string, directory?: string): string {
    if (!directory) return pathname;
    const query = new URLSearchParams({ directory });
    return `${pathname}?${query.toString()}`;
  }

  private parseSession(value: unknown, operation: string): OpenCodeRuntimeSession {
    if (!this.isRecord(value) || typeof value['id'] !== 'string' || value['id'].length === 0) {
      throw new OpenCodeRuntimeError(`OpenCode ${operation} response is missing session id`);
    }
    const time = this.isRecord(value['time']) ? value['time'] : undefined;
    const created = typeof time?.['created'] === 'number' ? new Date(time['created']) : undefined;
    const updated = typeof time?.['updated'] === 'number' ? new Date(time['updated']) : undefined;
    return {
      id: value['id'],
      ...(created ? { createdAt: created } : {}),
      ...(updated ? { updatedAt: updated } : {}),
    };
  }

  private parseModel(model?: string): { providerID: string; modelID: string } | undefined {
    if (!model) return undefined;
    const separator = model.indexOf('/');
    if (separator <= 0 || separator === model.length - 1) return undefined;
    return {
      providerID: model.slice(0, separator),
      modelID: model.slice(separator + 1),
    };
  }

  private unwrap(value: unknown): unknown {
    return this.isRecord(value) && 'data' in value ? value['data'] : value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
