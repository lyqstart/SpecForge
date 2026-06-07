/**
 * HTTP/SSE Server implementation
 * 
 * Handles HTTP/1.1 requests with Bearer Token authentication
 * and Server-Sent Events (SSE) for real-time updates.
 * 
 * Features:
 * - Route registration with exact and prefix matching
 * - /health endpoint with uptime tracking
 * - SSE long-connection with heartbeat and EventBus integration
 * - Global error handling with DaemonError
 * - CORS support for OPTIONS preflight
 * - Request body JSON parsing (400 on invalid JSON)
 */

import * as http from 'http';
import { DaemonConfig } from '../daemon/DaemonConfig';
import { EventBus } from '../event-bus/EventBus';
import {
  Event, DaemonError,
  StateReadRequest, StateTransitionRequest,
  EventLogRequest, EventQueryRequest,
} from '../types';
import { ToolInvokeRequest as DispatcherRequest } from '../tools';
import { ContentAddressableStorage, CASBlobReference } from '../cas';
import { StateManager } from '../state/StateManager';
import { WAL } from '../wal/WAL';
import { ToolDispatcher } from '../tools';
import { WALWriteError } from '../session/SessionRegistry';
import { ensureProjectInit } from '../tools/lib/sf_project_init_core';
import { JsonlAppender } from '../logs/JsonlAppender';
import { resolveProjectPath } from '@specforge/types/directory-layout';

function isWALWriteError(err: unknown): err is WALWriteError {
  return err instanceof WALWriteError || (err instanceof Error && err.name === 'WALWriteError');
}

/**
 * Build a tool call record for JSONL logging.
 *
 * Fields align with ToolCallRecord from sf_continuity_core for consumer compatibility.
 */
function buildToolCallRecord(
  sessionId: string,
  data: unknown,
  ts: number,
): Record<string, unknown> {
  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    timestamp: ts ? new Date(ts).toISOString() : new Date().toISOString(),
    tool: payload.tool ?? '',
    arguments: (payload.arguments ?? payload.args ?? {}) as Record<string, unknown>,
    exit_code: payload.exit_code as number | undefined,
    status: payload.status as string | undefined,
    result: payload.result,
    session_id: sessionId,
    call_id: payload.call_id as string | undefined,
  };
}

/**
 * Build a conversation record for JSONL logging.
 *
 * Fields align with ConversationMessage from sf_continuity_core for consumer compatibility.
 */
function buildConversationRecord(
  eventType: string,
  sessionId: string,
  data: unknown,
  ts: number,
): Record<string, unknown> {
  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    type: eventType,
    timestamp: ts ? new Date(ts).toISOString() : new Date().toISOString(),
    session_id: sessionId,
    role: payload.role as string | undefined,
    content: (payload.content ?? (typeof payload === 'object' ? JSON.stringify(payload) : undefined)) as string | undefined,
    tool_name: payload.tool_name as string | undefined,
    status: payload.status as string | undefined,
  };
}

/**
 * 将超大请求体中的 data 字段替换为 CAS blob 引用。
 * 纯函数，无副作用，便于单元测试。
 */
export function replaceDataWithCasRef(
  bodyJson: Record<string, unknown>,
  casRef: CASBlobReference,
): string {
  return JSON.stringify({ ...bodyJson, data: casRef });
}

export interface HTTPServerDeps {
  config: DaemonConfig;
  eventBus: EventBus;
  stateManager: StateManager;
  wal: WAL;
  projectManager?: any;
  permissionEngine?: any;
  workflowEngine?: any;
  eventLogger?: any;
  sessionRegistry?: any;
  recoverySubsystem?: any;
  toolDispatcher?: ToolDispatcher;
  toolCallsLogger?: JsonlAppender;
  conversationsLogger?: JsonlAppender;
}

// ── Route Types ──

export interface RouteMatch {
  pathname: string;
  params: Record<string, string>;
}

export interface RouteHandler {
  (req: http.IncomingMessage, res: http.ServerResponse, body: string, match: RouteMatch): void | Promise<void>;
}

interface RouteEntry {
  method: string;
  handler: RouteHandler;
}

interface PrefixRouteEntry {
  prefix: string;
  method: string;
  handler: RouteHandler;
}

// ── HTTPServer ──

export class HTTPServer {
  private server: http.Server | null = null;
  private port: number | null = null;
  private eventBus: EventBus | null = null;
  private token: string | null = null;
  private cas: ContentAddressableStorage;
  private config: DaemonConfig;
  private startTime: number = 0;
  private deps: Partial<HTTPServerDeps>;

  // Per-project JsonlAppender maps (lazy-created)
  private toolCallsAppenders: Map<string, JsonlAppender> = new Map();
  private conversationsAppenders: Map<string, JsonlAppender> = new Map();

  // Route tables
  private exactRoutes: Map<string, RouteEntry[]> = new Map();
  private prefixRoutes: PrefixRouteEntry[] = [];

  // SSE
  private sseClients: Map<string, http.ServerResponse> = new Map();
  private sseSubscription: { topic: string; handler: (event: Event) => void; unsubscribe: () => void } | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly SSE_HEARTBEAT_INTERVAL = 30_000;
  private boundUncaughtHandler: ((err: Error) => void) | null = null;
  private boundUnhandledRejectionHandler: ((reason: unknown) => void) | null = null;

  constructor(configOrDeps: DaemonConfig | HTTPServerDeps, eventBus?: EventBus) {
    if ('config' in configOrDeps && typeof configOrDeps.config === 'object') {
      this.deps = configOrDeps;
      this.config = configOrDeps.config;
      this.eventBus = configOrDeps.eventBus || null;
    } else {
      this.deps = {};
      this.config = configOrDeps as DaemonConfig;
      this.eventBus = eventBus || null;
    }
    this.cas = new ContentAddressableStorage();
    this.registerDefaultRoutes();
  }

  getDependencies(): Partial<HTTPServerDeps> {
    return this.deps;
  }

  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
  }

  /**
   * Set the bearer token for authentication
   * 
   * @param token The token to validate against
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Get or create a JsonlAppender for the given project path.
   * If an external logger was injected via deps (backward compat), use it;
   * otherwise lazily create one per projectPath.
   */
  private getOrCreateAppender(
    map: Map<string, JsonlAppender>,
    projectPath: string,
    layoutKey: 'logsToolCalls' | 'logsConversations',
  ): JsonlAppender {
    // Backward compat: if external logger was injected via deps (e.g. tests), use it
    if (layoutKey === 'logsToolCalls' && this.deps.toolCallsLogger) {
      return this.deps.toolCallsLogger;
    }
    if (layoutKey === 'logsConversations' && this.deps.conversationsLogger) {
      return this.deps.conversationsLogger;
    }

    let appender = map.get(projectPath);
    if (!appender) {
      const filePath = resolveProjectPath(projectPath, layoutKey);
      appender = new JsonlAppender(filePath, { maxFileSize: 10 * 1024 * 1024, maxArchiveFiles: 3, fsync: false });
      appender.initialize().catch(e => console.warn(`[HTTPServer] Appender init failed for ${filePath}:`, e.message));
      map.set(projectPath, appender);
    }
    return appender;
  }

  async start(): Promise<{ port: number }> {
    return new Promise((resolve, reject) => {
      this.startTime = Date.now();

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
          this.installGlobalErrorHandlers();
          resolve({ port: this.port });
        } else {
          reject(new Error('Failed to get server port'));
        }
      });

      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    this.stopHeartbeat();
    this.cleanupSse();
    this.uninstallGlobalErrorHandlers();

    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.server = null;
            this.port = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  broadcastEvent(event: Event): void {
    if (this.eventBus) {
      this.eventBus.publish(event);
    }
  }

  // ── Route Registration ──

  private registerDefaultRoutes(): void {
    // Exact match routes
    this.addExactRoute('GET', '/health', this.handleHealth.bind(this));
    this.addExactRoute('GET', '/api/v1/healthz', this.handleHealthZ.bind(this));
    this.addExactRoute('GET', '/events', this.handleSSE.bind(this));
    this.addExactRoute('GET', '/', this.handleRoot.bind(this));

    // Exact API v1 routes
    this.addExactRoute('POST', '/api/v1/state/read', this.handleStateRead.bind(this));
    this.addExactRoute('POST', '/api/v1/state/transition', this.handleStateTransition.bind(this));
    this.addExactRoute('POST', '/api/v1/event/log', this.handleEventLog.bind(this));
    this.addExactRoute('POST', '/api/v1/event/query', this.handleEventQuery.bind(this));
    this.addExactRoute('POST', '/api/v1/cas/store', this.handleCasStore.bind(this));
    this.addExactRoute('GET', '/api/v1/cas/retrieve', this.handleCasRetrieve.bind(this));
    this.addExactRoute('GET', '/api/v1/session/list', this.handleSessionList.bind(this));
    this.addExactRoute('POST', '/api/v1/tool/invoke', this.handleToolInvoke.bind(this));
    this.addExactRoute('POST', '/api/v1/admin/stop', this.handleAdminStop.bind(this));
    this.addExactRoute('POST', '/api/v1/ingest/register', this.handleIngestRegister.bind(this));
    this.addExactRoute('POST', '/api/v1/ingest/event', this.handleIngestEvent.bind(this));

    // Project lifecycle
    this.addExactRoute('POST', '/api/v1/project/ensure', this.handleProjectEnsure.bind(this));

    // v1.1 API routes — Work Item lifecycle
    this.addExactRoute('POST', '/api/v1/v11/work-item/create', this.handleV11WorkItemCreate.bind(this));
    this.addExactRoute('POST', '/api/v1/v11/gate/run', this.handleV11GateRun.bind(this));
    this.addExactRoute('POST', '/api/v1/v11/merge', this.handleV11Merge.bind(this));
    this.addExactRoute('POST', '/api/v1/v11/decision', this.handleV11Decision.bind(this));
    this.addExactRoute('POST', '/api/v1/v11/code-permission', this.handleV11CodePermission.bind(this));
    this.addExactRoute('POST', '/api/v1/v11/spec-migration', this.handleV11SpecMigration.bind(this));
    this.addExactRoute('POST', '/api/v1/v11/rollback', this.handleV11Rollback.bind(this));
    this.addExactRoute('POST', '/api/v1/v11/handoff', this.handleV11Handoff.bind(this));
    this.addExactRoute('POST', '/api/v1/v11/extension', this.handleV11Extension.bind(this));
    this.addExactRoute('POST', '/api/v1/v11/verification', this.handleV11Verification.bind(this));

    // Prefix routes for API v1 (fallback)
    const prefixes = ['state', 'event', 'workflow', 'blob', 'tool', 'ingest', 'cas', 'session', 'admin', 'project', 'v11'];
    for (const segment of prefixes) {
      this.addPrefixRoute('GET', `/api/v1/${segment}/`, this.handleApiEndpoint.bind(this));
      this.addPrefixRoute('POST', `/api/v1/${segment}/`, this.handleApiEndpoint.bind(this));
    }
  }

  private addExactRoute(method: string, pathname: string, handler: RouteHandler): void {
    const entries = this.exactRoutes.get(pathname) ?? [];
    entries.push({ method, handler });
    this.exactRoutes.set(pathname, entries);
  }

  private addPrefixRoute(method: string, prefix: string, handler: RouteHandler): void {
    this.prefixRoutes.push({ prefix, method, handler });
  }

  private matchRoute(method: string, pathname: string): { handler: RouteHandler; match: RouteMatch } | null {
    // 1. Try exact match
    const entries = this.exactRoutes.get(pathname);
    if (entries) {
      for (const entry of entries) {
        if (entry.method === method || entry.method === '*') {
          return { handler: entry.handler, match: { pathname, params: {} } };
        }
      }
    }

    // 2. Try prefix match
    for (const entry of this.prefixRoutes) {
      if (pathname.startsWith(entry.prefix)) {
        if (entry.method === method || entry.method === '*') {
          const wildcard = pathname.substring(entry.prefix.length);
          return {
            handler: entry.handler,
            match: { pathname, params: { wildcard } },
          };
        }
      }
    }

    return null;
  }

  // ── Request Handling ──

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      try {
        await this.handleRequestWithBody(req, res, body);
      } catch (err) {
        this.handleHandlerError(res, err);
      }
    });

    req.on('error', () => {
      this.sendJsonResponse(res, 500, this.errorBody('INTERNAL_ERROR', 'Internal Server Error'));
    });
  }

  private async handleRequestWithBody(req: http.IncomingMessage, res: http.ServerResponse, rawBody: Buffer): Promise<void> {
    try {
      const method = req.method ?? 'GET';
      const pathname = this.safeGetPathname(req);

      // Check payload size
      const maxSize = this.config.getMaxPayloadSize();
      if (rawBody.length > maxSize) {
        try {
          rawBody = await this.storeAndReplaceDataField(rawBody, maxSize);
          console.log(`[PAYLOAD] CAS compression successful, body reduced to ${rawBody.length} bytes`);
          // 不 return — 继续正常流程（CORS / Auth / JSON parse / Route match / Handler）
        } catch (err) {
          console.warn(`[PAYLOAD] CAS compression failed: ${(err as Error).message}`);
          this.sendJsonResponse(res, 413, {
            error: 'Payload Too Large',
            reason: `Payload size exceeds limit and CAS compression failed: ${(err as Error).message}`,
          });
          return;
        }
      }

      // Handle CORS preflight (no auth needed)
      if (method === 'OPTIONS') {
        this.writeCorsPreflight(res);
        return;
      }

      // Auth check (skip for public endpoints)
      if (!this.isPublicEndpoint(pathname)) {
        const authResult = this.checkAuth(req);
        if (authResult) {
          this.sendJsonResponse(res, authResult.statusCode, this.errorBody(authResult.code, authResult.message));
          return;
        }
      }

      // Parse JSON body for methods that may carry a body
      const bodyString = rawBody.toString('utf-8');
      if (rawBody.length > 0 && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        const contentType = req.headers['content-type'] ?? '';
        if (contentType.includes('application/json')) {
          try {
            JSON.parse(bodyString); // validate JSON
          } catch {
            this.sendJsonResponse(res, 400, this.errorBody('INVALID_JSON', 'Invalid JSON in request body'));
            return;
          }
        }
      }

      // Route matching
      const matched = this.matchRoute(method, pathname);
      if (!matched) {
        this.sendJsonResponse(res, 404, this.errorBody('NOT_FOUND', `Route ${method} ${pathname} not found`));
        return;
      }

      // Execute handler
      const result = matched.handler(req, res, bodyString, matched.match);
      if (result instanceof Promise) {
        result.catch((err: unknown) => {
          this.handleHandlerError(res, err);
        });
      }
    } catch (err: unknown) {
      this.handleHandlerError(res, err);
    }
  }

  private safeGetPathname(req: http.IncomingMessage): string {
    try {
      return new URL(req.url ?? '/', `http://localhost:${this.port ?? 0}`).pathname;
    } catch {
      return '/';
    }
  }

  private isPublicEndpoint(pathname: string): boolean {
    // Public endpoints: /health, /api/v1/healthz
    return pathname === '/health' || pathname === '/api/v1/healthz';
  }

  // ── Auth ──

  private checkAuth(req: http.IncomingMessage): { statusCode: number; code: string; message: string } | null {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logPermissionDenied(req, 'Missing or invalid Authorization header');
      return { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' };
    }

    const token = authHeader.substring(7);

    if (!this.token) {
      this.logPermissionDenied(req, 'Handshake file not found - server not initialized');
      return { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' };
    }

    if (token !== this.token) {
      this.logPermissionDenied(req, 'Invalid token');
      return { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' };
    }

    return null;
  }

  private logPermissionDenied(req: http.IncomingMessage, reason: string): void {
    const event: Event = {
      eventId: this.generateEventId(),
      ts: Date.now(),
      projectId: '',
      action: 'permission.denied',
      payload: {
        method: req.method,
        path: req.url,
        reason,
        clientIp: req.socket.remoteAddress ?? 'unknown',
      },
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };

    if (this.eventBus) {
      this.eventBus.publish(event);
    }

    console.warn(`[AUTH] Permission denied: ${reason} - ${req.method} ${req.url}`);
  }

  // ── Payload Handling ──

  private async storeAndReplaceDataField(rawBody: Buffer, maxSize: number): Promise<Buffer> {
    const bodyString = rawBody.toString('utf-8');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(bodyString);
    } catch {
      throw new Error('Oversized payload is not valid JSON — cannot apply CAS compression');
    }

    if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) {
      throw new Error('Oversized payload has no "data" field — cannot apply CAS compression');
    }

    const casRef = await this.cas.store(rawBody);
    console.log(`[PAYLOAD] Stored oversized payload in CAS: ${casRef.reference} (${rawBody.length} bytes)`);

    const compressedBodyString = replaceDataWithCasRef(parsed, casRef);
    const compressedBuffer = Buffer.from(compressedBodyString, 'utf-8');

    if (compressedBuffer.length > maxSize) {
      throw new Error(
        `Compressed body (${compressedBuffer.length} bytes) still exceeds limit (${maxSize} bytes)`
      );
    }

    return compressedBuffer;
  }

  // ── Response Helpers ──

  private sendJsonResponse(res: http.ServerResponse, statusCode: number, data: unknown): void {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    };
    res.writeHead(statusCode, headers);
    res.end(JSON.stringify(data));
  }

  private writeCorsPreflight(res: http.ServerResponse): void {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
  }

  private errorBody(code: string, message: string, details?: unknown): Record<string, unknown> {
    const error: Record<string, unknown> = { code, message };
    if (details !== undefined) {
      error['details'] = details;
    }
    return {
      success: false,
      error,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };
  }

  private successBody<T>(data: T): Record<string, unknown> {
    return {
      success: true,
      data,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };
  }

  // ── Global Error Handling ──

  private installGlobalErrorHandlers(): void {
    this.boundUncaughtHandler = (err: Error) => {
      console.error('[FATAL] uncaughtException:', err);
      this.sendFatalErrorToSse(err);
    };
    this.boundUnhandledRejectionHandler = (reason: unknown) => {
      console.error('[FATAL] unhandledRejection:', reason);
      this.sendFatalErrorToSse(
        reason instanceof Error ? reason : new Error(String(reason)),
      );
    };
    process.on('uncaughtException', this.boundUncaughtHandler);
    process.on('unhandledRejection', this.boundUnhandledRejectionHandler);
  }

  private uninstallGlobalErrorHandlers(): void {
    if (this.boundUncaughtHandler) {
      process.removeListener('uncaughtException', this.boundUncaughtHandler);
      this.boundUncaughtHandler = null;
    }
    if (this.boundUnhandledRejectionHandler) {
      process.removeListener('unhandledRejection', this.boundUnhandledRejectionHandler);
      this.boundUnhandledRejectionHandler = null;
    }
  }

  private sendFatalErrorToSse(err: Error): void {
    const event: Event = {
      eventId: this.generateEventId(),
      ts: Date.now(),
      projectId: '',
      action: 'server.fatal_error',
      payload: {
        message: err.message,
        stack: err.stack,
      },
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };

    for (const [id, clientRes] of this.sseClients) {
      try {
        clientRes.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        this.sseClients.delete(id);
      }
    }
  }

  private handleHandlerError(res: http.ServerResponse, err: unknown): void {
    if (err instanceof DaemonError) {
      this.sendJsonResponse(res, err.statusCode, this.errorBody(err.code, err.message, err.details));
    } else if (err instanceof Error) {
      this.sendJsonResponse(res, 500, this.errorBody('INTERNAL_ERROR', err.message));
    } else {
      this.sendJsonResponse(res, 500, this.errorBody('INTERNAL_ERROR', 'Internal Server Error'));
    }
  }

  // ── SSE ──

  private handleSSE(req: http.IncomingMessage, res: http.ServerResponse): void {
    const clientId = this.generateEventId();

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial connected event
    res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

    // Add to client list
    this.sseClients.set(clientId, res);

    // Subscribe to EventBus if not already subscribed
    this.ensureSseSubscription();

    // Start heartbeat if not already running
    this.ensureHeartbeat();

    // Handle client disconnect
    req.on('close', () => {
      this.sseClients.delete(clientId);
      console.log(`[SSE] Client ${clientId} disconnected (${this.sseClients.size} remaining)`);

      if (this.sseClients.size === 0) {
        this.removeSseSubscription();
        this.stopHeartbeat();
      }
    });

    console.log(`[SSE] Client ${clientId} connected (${this.sseClients.size} total)`);
  }

  private ensureSseSubscription(): void {
    if (this.sseSubscription || !this.eventBus) {
      return;
    }

    const handler = (event: Event): void => {
      for (const [id, clientRes] of this.sseClients) {
        try {
          clientRes.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          // Client disconnected, remove from list
          this.sseClients.delete(id);
        }
      }
    };

    const subscription = this.eventBus.subscribe('*', handler);
    this.sseSubscription = {
      topic: '*',
      handler,
      unsubscribe: () => this.eventBus!.unsubscribe(subscription),
    };

    console.log('[SSE] Subscribed to EventBus');
  }

  private removeSseSubscription(): void {
    if (this.sseSubscription) {
      this.sseSubscription.unsubscribe();
      this.sseSubscription = null;
      console.log('[SSE] Unsubscribed from EventBus');
    }
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      for (const [id, clientRes] of this.sseClients) {
        try {
          clientRes.write(':heartbeat\n\n');
        } catch {
          this.sseClients.delete(id);
        }
      }
    }, this.SSE_HEARTBEAT_INTERVAL);

    // Allow Node to exit even if the heartbeat timer is still active
    if (this.heartbeatTimer && typeof this.heartbeatTimer === 'object') {
      this.heartbeatTimer.unref();
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private cleanupSse(): void {
    this.removeSseSubscription();
    this.stopHeartbeat();

    for (const [, clientRes] of this.sseClients) {
      try {
        clientRes.end();
      } catch {
        // ignore errors on cleanup
      }
    }
    this.sseClients.clear();
  }

  // ── Route Handlers ──

  private handleHealth(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    this.sendJsonResponse(res, 200, this.successBody({
      status: 'ok',
      service: 'daemon-core',
      version: '1.0.0',
      uptime: uptimeSeconds,
    }));
  }

  /**
   * Handle /api/v1/healthz endpoint
   * Returns detailed health check response for service management
   * Public endpoint (no auth required) - used by service managers for health monitoring
   */
  private handleHealthZ(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const now = Date.now();
    const uptimeSeconds = Math.floor((now - this.startTime) / 1000);
    
    // Get active client count from session registry if available
    let activeClients = 0;
    let pendingEvents = 0;
    let lastEventTs: number | null = null;
    
    if (this.deps.sessionRegistry) {
      try {
        activeClients = (this.deps.sessionRegistry as any).getActiveSessionCount?.() ?? 0;
      } catch {
        // Ignore errors
      }
    }
    
    if (this.eventBus) {
      try {
        const bufferedEvents = this.eventBus.getBufferedEvents();
        pendingEvents = bufferedEvents.length;
        if (bufferedEvents.length > 0) {
          lastEventTs = bufferedEvents[bufferedEvents.length - 1]!.ts;
        }
      } catch {
        // Ignore errors
      }
    }

    // Determine status based on current state
    let status: 'ok' | 'degraded' | 'shutting-down' = 'ok';
    // Note: isShuttingDown would need to be tracked by the daemon
    
    this.sendJsonResponse(res, 200, {
      schema_version: '1.0',
      status,
      pid: process.pid,
      version: '1.0.0',
      startedAt: this.startTime,
      uptimeSec: uptimeSeconds,
      activeClients,
      pendingEvents,
      lastEventTs,
    });
  }

  private handleRoot(_req: http.IncomingMessage, res: http.ServerResponse): void {
    this.sendJsonResponse(res, 200, this.successBody({
      status: 'ok',
      service: 'daemon-core',
    }));
  }

  private handleApiEndpoint(req: http.IncomingMessage, res: http.ServerResponse, body: string, match: RouteMatch): void {
    this.sendJsonResponse(res, 200, this.successBody({
      message: `API endpoint ${req.method} ${match.pathname} is registered`,
      path: match.pathname,
      params: match.params,
    }));
  }

  private async handleStateRead(_req: http.IncomingMessage, res: http.ServerResponse, body: string): Promise<void> {
    let request: Partial<StateReadRequest>;
    try {
      request = body ? JSON.parse(body) : {};
    } catch {
      this.sendJsonResponse(res, 400, this.errorBody('INVALID_JSON', 'Invalid JSON in request body'));
      return;
    }

    const wid = request.workItemId;

    if (!this.deps.stateManager) {
      this.sendJsonResponse(res, 200, this.successBody({ message: 'state/read (no stateManager)', workItemId: wid ?? null }));
      return;
    }

    try {
      if (wid === 'all') {
        const all = await (this.deps.stateManager as any).getAllStates();
        return this.sendJsonResponse(res, 200, this.successBody({ workItems: all }));
      }
      if (!wid) {
        return this.sendJsonResponse(res, 400, this.errorBody('MISSING_FIELDS', 'workItemId required'));
      }
      const state = await (this.deps.stateManager as any).getState(wid);
      if (!state) {
        return this.sendJsonResponse(res, 404, this.errorBody('NOT_FOUND', `${wid} not found`));
      }
      return this.sendJsonResponse(res, 200, this.successBody({ workItem: state }));
    } catch (err) {
      this.sendJsonResponse(res, 500, this.errorBody('INTERNAL_ERROR', (err as Error).message));
    }
  }

  private async handleStateTransition(_req: http.IncomingMessage, res: http.ServerResponse, body: string): Promise<void> {
    let request: Partial<StateTransitionRequest>;
    try {
      request = body ? JSON.parse(body) : {};
    } catch {
      this.sendJsonResponse(res, 400, this.errorBody('INVALID_JSON', 'Invalid JSON in request body'));
      return;
    }

    const workItemId = request.workItemId;
    const fromState = request.fromState;
    const toState = request.toState;
    if (!workItemId || fromState === undefined || !toState) {
      this.sendJsonResponse(res, 400, this.errorBody('MISSING_FIELDS', 'workItemId / fromState / toState required'));
      return;
    }

    if (!this.deps.workflowEngine) {
      this.sendJsonResponse(res, 200, this.successBody({
        message: 'state/transition (no workflowEngine)',
        workItemId, fromState, toState,
      }));
      return;
    }

    try {
      const result = await (this.deps.workflowEngine as any).transitionFull({
        workItemId,
        fromState,
        toState,
        evidence: (request as any).evidence ?? '',
        workflowType: request.workflowType,
        transitionContext: (request as any).transitionContext,
        actor: null,
      });
      this.sendJsonResponse(res, 200, this.successBody(result));
    } catch (err) {
      this.sendJsonResponse(res, 409, this.errorBody('TRANSITION_REJECTED', (err as Error).message));
    }
  }

  private async handleEventLog(_req: http.IncomingMessage, res: http.ServerResponse, body: string): Promise<void> {
    let request: Partial<EventLogRequest>;
    try {
      request = body ? JSON.parse(body) : {};
    } catch {
      this.sendJsonResponse(res, 400, this.errorBody('INVALID_JSON', 'Invalid JSON in request body'));
      return;
    }

    if (!request.projectId || !request.action || !request.category) {
      this.sendJsonResponse(res, 400, this.errorBody('MISSING_FIELDS', 'projectId, action, category required'));
      return;
    }

    if (!this.deps.eventLogger) {
      this.sendJsonResponse(res, 200, this.successBody({ message: 'event/log (no eventLogger)', eventId: this.generateEventId() }));
      return;
    }

    try {
      const event: Event = {
        schema_version: '1.0',
        eventId: this.generateEventId(),
        ts: Date.now() * 1_000_000,
        monotonicSeq: Date.now(),
        projectId: request.projectId,
        workItemId: (request as any).workItemId,
        actor: request.actor,
        category: request.category as any,
        action: request.action,
        payload: request.payload ?? {},
        metadata: {
          schemaVersion: '1.0',
          source: 'client',
        },
      };

      await (this.deps.eventLogger as any).append(event);

      if (this.eventBus) {
        await this.eventBus.publish(event);
      }

      this.sendJsonResponse(res, 200, this.successBody({ eventId: event.eventId }));
    } catch (err) {
      this.sendJsonResponse(res, 500, this.errorBody('INTERNAL_ERROR', (err as Error).message));
    }
  }

  private handleEventQuery(_req: http.IncomingMessage, res: http.ServerResponse, body: string): void {
    let request: Partial<EventQueryRequest>;
    try {
      request = body ? JSON.parse(body) : {};
    } catch {
      this.sendJsonResponse(res, 400, this.errorBody('INVALID_JSON', 'Invalid JSON in request body'));
      return;
    }
    console.log(`[API] event/query projectId=${request.projectId ?? '(all)'} action=${request.action ?? '(all)'}`);
    this.sendJsonResponse(res, 200, this.successBody({
      message: 'event/query placeholder',
      events: [],
    }));
  }

  private handleCasStore(_req: http.IncomingMessage, res: http.ServerResponse, body: string): void {
    console.log(`[API] cas/store bodyLength=${body.length}`);
    this.sendJsonResponse(res, 200, this.successBody({
      message: 'cas/store placeholder',
      contentSize: body.length,
    }));
  }

  private handleCasRetrieve(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://localhost:${this.port ?? 0}`);
    const hash = url.searchParams.get('hash') ?? '';
    console.log(`[API] cas/retrieve hash=${hash || '(not provided)'}`);
    this.sendJsonResponse(res, 200, this.successBody({
      message: 'cas/retrieve placeholder',
      hash,
    }));
  }

  private handleSessionList(_req: http.IncomingMessage, res: http.ServerResponse): void {
    console.log('[API] session/list');
    this.sendJsonResponse(res, 200, this.successBody({
      message: 'session/list placeholder',
      sessions: [],
    }));
  }

  private async handleToolInvoke(_req: http.IncomingMessage, res: http.ServerResponse, body: string): Promise<void> {
    let request: Partial<DispatcherRequest>;
    try {
      request = body ? JSON.parse(body) : {};
    } catch {
      this.sendJsonResponse(res, 400, this.errorBody('INVALID_JSON', 'Invalid JSON in request body'));
      return;
    }

    if (!request.tool) {
      this.sendJsonResponse(res, 400, this.errorBody('MISSING_TOOL', 'tool field required'));
      return;
    }

    // Try real dispatcher first
    if (this.deps.toolDispatcher) {
      try {
        const result = await this.deps.toolDispatcher.dispatch(request as DispatcherRequest);
        this.sendJsonResponse(res, 200, this.successBody(result));
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.startsWith('Unknown tool:')) {
          this.sendJsonResponse(res, 404, this.errorBody('UNKNOWN_TOOL', msg));
        } else if (msg.startsWith('Permission denied:')) {
          this.sendJsonResponse(res, 403, this.errorBody('PERMISSION_DENIED', msg));
        } else {
          this.sendJsonResponse(res, 500, this.errorBody('TOOL_ERROR', msg));
        }
      }
      return;
    }

    // Fallback placeholder
    this.sendJsonResponse(res, 501, this.errorBody('NOT_IMPLEMENTED', `Tool dispatch not available for ${request.tool}`));
  }

  private handleAdminStop(_req: http.IncomingMessage, res: http.ServerResponse): void {
    console.log('[API] admin/stop — initiating graceful shutdown');
    this.sendJsonResponse(res, 200, this.successBody({ message: 'shutdown initiated' }));
    this.stop().catch((err: unknown) => {
      console.error('[ADMIN] Error during admin stop:', err);
    });
  }

  private async handleIngestRegister(
    _req: http.IncomingMessage, res: http.ServerResponse, body: string
  ): Promise<void> {
    let request: { projectPath?: string };
    try {
      request = JSON.parse(body);
    } catch {
      return this.sendJsonResponse(res, 400, this.errorBody('INVALID_JSON', 'Invalid JSON'));
    }

    if (!request.projectPath) {
      return this.sendJsonResponse(res, 400, this.errorBody('MISSING_PROJECT_PATH', 'projectPath required'));
    }

    try {
      // P0: 确保项目已初始化（幂等）
      await ensureProjectInit(request.projectPath);

      const ctx = await (this.deps.projectManager as any).registerProject(request.projectPath);
      const identity = await (this.deps.sessionRegistry as any).registerPluginSession(ctx.projectId, request.projectPath);
      this.sendJsonResponse(res, 200, this.successBody({
        sessionId: identity.sessionId,
        projectId: ctx.projectId,
        mode: this.config.getMode(),
      }));
    } catch (err) {
      // B2: Handle PROJECT_NOT_INITIALIZED
      if ((err as Error).message === 'PROJECT_NOT_INITIALIZED') {
        this.sendJsonResponse(res, 409, {
          error: 'PROJECT_NOT_INITIALIZED',
          message: '项目未初始化。请先完成启动流程（步骤 1-4）再注册。',
          projectPath: request.projectPath,
        });
        return;
      }
      if (isWALWriteError(err)) {
        res.setHeader('Retry-After', '5');
        this.sendJsonResponse(res, 503, { error: 'WAL_WRITE_FAILED', message: 'WAL write failed — event not accepted. Please retry.' });
      } else {
        this.sendJsonResponse(res, 500, this.errorBody('REGISTER_FAILED', (err as Error).message));
      }
    }
  }

  /**
   * Handle POST /api/v1/project/ensure
   *
   * 供 sf-orchestrator 的 sf_project_init 工具调用。
   * 执行幂等初始化：遍历 LAYOUT，补齐缺失的目录和文件。
   */
  private async handleProjectEnsure(
    _req: http.IncomingMessage, res: http.ServerResponse, body: string
  ): Promise<void> {
    let request: { projectPath?: string; projectName?: string };
    try {
      request = JSON.parse(body || "{}");
    } catch {
      return this.sendJsonResponse(res, 400, this.errorBody('INVALID_JSON', 'Invalid JSON'));
    }

    const projectPath = request.projectPath || process.cwd();

    try {
      const result = await ensureProjectInit(projectPath, request.projectName);
      this.sendJsonResponse(res, 200, this.successBody(result));
    } catch (err) {
      this.sendJsonResponse(res, 500, this.errorBody('INIT_FAILED', (err as Error).message));
    }
  }

  // ── Ingest Event Handling ──

  /**
   * Handle POST /api/v1/ingest/event
   * 
   * Parses the event request, validates JSON, and routes to the appropriate
   * subsystem handler based on event type.  Satisfies CP-4: must return an
   * HTTP response within 15 s even when subsystems fail or time out.
   */
  private async handleIngestEvent(
    _req: http.IncomingMessage, res: http.ServerResponse, body: string
  ): Promise<void> {
    let request: { sessionId?: string; type?: string; data?: unknown; ts?: number };
    try {
      request = JSON.parse(body);
    } catch {
      return this.sendJsonResponse(res, 400, this.errorBody('INVALID_JSON', 'Invalid JSON'));
    }

    // Backward compatibility: accept events without sessionId
    if (!request.sessionId) {
      console.warn('[INGEST] Event received without sessionId — plugin may need upgrade');
    }

    // CP-4: 15 s overall timeout — only send one response
    let responded = false;
    const respond = (status: number, data: unknown) => {
      if (!responded) {
        responded = true;
        this.sendJsonResponse(res, status, data);
      }
    };

    const overallTimeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        respond(200, this.successBody({
          received: true,
          type: request.type ?? 'unknown',
          warning: 'Event processing timed out',
        }));
        resolve();
      }, 15_000);
    });

    const processing = (async () => {
      try {
        const extra = await this.routeIngestEvent(request);
        respond(200, this.successBody({
          received: true,
          type: request.type ?? 'unknown',
          ...(extra ?? {}),
        }));
    } catch (err) {
        if (isWALWriteError(err)) {
          res.setHeader('Retry-After', '5');
          respond(503, { error: 'WAL_WRITE_FAILED', message: 'WAL write failed — event not accepted. Please retry.' });
        } else {
          console.error(`[INGEST] Failed to process ${request.type}:`, err);
          respond(200, this.successBody({
            received: true,
            type: request.type ?? 'unknown',
            warning: `Event logged but processing failed: ${(err as Error).message}`,
          }));
        }
      }
    })();

    await Promise.race([processing, overallTimeout]);
  }

  /**
   * Route an ingest event to the appropriate subsystem handler.
   * 
   * Returns optional extra data to merge into the HTTP response.
   */
  private async routeIngestEvent(
    request: { sessionId?: string; type?: string; data?: unknown; ts?: number }
  ): Promise<Record<string, unknown> | undefined> {
    const sessionId = request.sessionId ?? '';
    const type = request.type ?? '';
    const data = request.data;
    const ts = request.ts ?? 0;

    // Defensive: guard against non-string type (e.g. object passed by buggy plugin)
    if (typeof type !== 'string') {
      console.warn(`[INGEST] Non-string event type received (typeof ${typeof type}), ignoring: ${JSON.stringify(type)}`);
      return undefined;
    }

    switch (type) {
      case 'tool.invoking':
        await this.handleToolInvoking(sessionId, data, ts);
        break;
      case 'tool.invoked':
        await this.handleToolInvoked(sessionId, data, ts);
        break;
      case 'opencode.event':
        await this.handleOpenCodeEvent(sessionId, data, ts);
        break;
      case 'session.compacting':
        await this.handleSessionCompacting(sessionId, data, ts);
        break;
      case 'chat.params':
        await this.handleChatParams(sessionId, data, ts);
        break;
      case 'chat.headers':
        await this.handleChatHeaders(sessionId, data, ts);
        break;
      case 'llm.context.prepared':
      case 'llm.messages':
        await this.handleLlmEvent(sessionId, type, data, ts);
        break;
      case 'shell.env':
        return { env: await this.handleShellEnv(sessionId, data) };
      default:
        console.warn(`[INGEST] Unknown event type: ${type}`);
    }
    return undefined;
  }

  // ── Event Type Handlers ──

  /**
   * Handle tool.invoking events — PermissionEngine evaluation + SessionRegistry touch.
   * Timeout: 5 s. On timeout → default allow (phase 1: only log, never intercept).
   */
  private async handleToolInvoking(
    sessionId: string, data: unknown, _ts: number
  ): Promise<void> {
    const payload = (data ?? {}) as { tool?: string; callID?: string; args?: Record<string, unknown> };

    // 1. Update session activity (non-critical)
    try {
      await this.deps.sessionRegistry?.touch?.(sessionId);
    } catch (err) {
      if (isWALWriteError(err)) {
        console.warn(`[INGEST] WAL write error during touch for session ${sessionId}: ${err.message}`);
      }
      // non-blocking
    }

    // 2. PermissionEngine evaluation (phase 1: log only, don't intercept)
    if (this.deps.permissionEngine && payload.tool) {
      try {
        const allowed = await this.withTimeout(
          this.deps.permissionEngine.checkPermission(
            sessionId,
            'tool.invoking',
            payload.tool,
            { args: payload.args ?? {}, callID: payload.callID },
          ),
          5_000,
          true,  // default allow on timeout
        );

        // Phase 1: log the evaluation result
        await this.deps.eventLogger?.append?.({
          eventId: this.generateEventId(),
          ts: Date.now(),
          projectId: this.deps.sessionRegistry?.getProjectPath?.(sessionId) ?? '',
          category: 'permission' as any,
          action: 'permission.evaluated',
          payload: {
            tool: payload.tool,
            decision: allowed ? 'allow' : 'deny',
            sessionId,
          },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        });
      } catch (err) {
        console.error(`[INGEST] PermissionEngine error for ${payload.tool}:`, err);
      }
    }
  }

  /**
   * Handle tool.invoked events — log via EventLogger.
   * Timeout: 3 s. On timeout → lose this log entry (non-critical path).
   */
  private async handleToolInvoked(
    sessionId: string, data: unknown, ts: number
  ): Promise<void> {
    const payload = (data ?? {}) as Record<string, unknown>;
    try {
      await this.withTimeout(
        (async () => {
          await this.deps.eventLogger?.append?.({
            eventId: this.generateEventId(),
            ts: ts || Date.now(),
            projectId: this.deps.sessionRegistry?.getProjectPath?.(sessionId) ?? '',
            category: 'tool' as any,
            action: 'tool.invoked',
            payload: { ...payload, sessionId },
            metadata: { schemaVersion: '1.0', source: 'client' },
          });
          const projectPath = this.deps.sessionRegistry?.getProjectPath?.(sessionId) ?? process.cwd();
          const appender = this.getOrCreateAppender(this.toolCallsAppenders, projectPath, 'logsToolCalls');
          await appender.append(buildToolCallRecord(sessionId, payload, ts));
        })(),
        3_000,
        undefined,
      );
    } catch {
      // Non-blocking: lose this log entry
    }
  }

  /**
   * Handle opencode.event — route to SessionRegistry.handleOpenCodeEvent.
   * Timeout: 2 s. On timeout → record WARNING.
   */
  private async handleOpenCodeEvent(
    sessionId: string, data: unknown, _ts: number
  ): Promise<void> {
    const payload = (data ?? {}) as { subType?: string; type?: string } & Record<string, unknown>;
    // OpenCode events use `type` field (e.g. "session.created"); support `subType` as fallback
    const subType = (payload as any).type ?? payload.subType ?? 'unknown';
    try {
      await this.deps.sessionRegistry?.handleOpenCodeEvent?.(
        subType,
        { ...payload, sessionId: payload.sessionId ?? sessionId },
      );
    } catch (err) {
      if (isWALWriteError(err)) {
        throw err; // propagate to handleIngestEvent for 503 response
      }
      console.warn(`[INGEST] SessionRegistry.handleOpenCodeEvent error for session ${sessionId}:`, err);
    }
  }

  /**
   * Handle session.compacting events — save checkpoint via RecoverySubsystem.
   * Timeout: 10 s. On timeout → record ERROR (do not block session compaction).
   */
  private async handleSessionCompacting(
    sessionId: string, data: unknown, _ts: number
  ): Promise<void> {
    try {
      await this.withTimeout(
        (async () => {
          await this.deps.recoverySubsystem?.saveCheckpoint?.(sessionId, data);
        })(),
        10_000,
        undefined,
      );
    } catch (err) {
      console.error(`[INGEST] RecoverySubsystem.saveCheckpoint error for session ${sessionId}:`, err);
    }
  }

  /**
   * Handle chat.params events — log via EventLogger.
   * Timeout: 3 s. On timeout → lose this log entry.
   */
  private async handleChatParams(
    sessionId: string, data: unknown, ts: number
  ): Promise<void> {
    try {
      await this.withTimeout(
        (async () => {
          await this.deps.eventLogger?.append?.({
            eventId: this.generateEventId(),
            ts: ts || Date.now(),
            projectId: this.deps.sessionRegistry?.getProjectPath?.(sessionId) ?? '',
            category: 'chat' as any,
            action: 'chat.params',
            payload: { params: data, sessionId },
            metadata: { schemaVersion: '1.0', source: 'client' },
          });
          const projectPath = this.deps.sessionRegistry?.getProjectPath?.(sessionId) ?? process.cwd();
          const appender = this.getOrCreateAppender(this.conversationsAppenders, projectPath, 'logsConversations');
          await appender.append(buildConversationRecord('chat.params', sessionId, data, ts));
        })(),
        3_000,
        undefined,
      );
    } catch {
      // Non-blocking: lose this log entry
    }
  }

  /**
   * Handle llm.* events (e.g. llm.context.prepared, llm.messages).
   *
   * Logs to EventLogger and optionally to conversationsLogger.
   * Timeout: 3 s. On timeout → lose this log entry.
   *
   * DD-3: llm.* events are no longer fallback to handleChatParams.
   * DD-4: record format is consumer-compatible with ToolCallRecord / ConversationMessage.
   */
  private async handleLlmEvent(
    sessionId: string, eventType: string, data: unknown, ts: number
  ): Promise<void> {
    try {
      await this.withTimeout(
        (async () => {
          const projectId = this.deps.sessionRegistry?.getProjectPath?.(sessionId) ?? '';

          // 1. Append to eventLogger
          await this.deps.eventLogger?.append?.({
            eventId: this.generateEventId(),
            ts: ts || Date.now(),
            projectId,
            category: 'llm' as any,
            action: eventType,
            payload: { ...((data ?? {}) as Record<string, unknown>), sessionId },
            metadata: { schemaVersion: '1.0', source: 'client' },
          });

          // 2. Append to conversationsLogger (per-project)
          const record = buildConversationRecord(eventType, sessionId, data, ts);
          const projectPath = projectId || process.cwd();
          const appender = this.getOrCreateAppender(this.conversationsAppenders, projectPath, 'logsConversations');
          await appender.append(record);
        })(),
        3_000,
        undefined,
      );
    } catch {
      // Non-blocking: lose this log entry
    }
  }

  /**
   * Handle chat.headers events — log via EventLogger.
   * Timeout: 3 s. On timeout → lose this log entry.
   */
  private async handleChatHeaders(
    sessionId: string, data: unknown, ts: number
  ): Promise<void> {
    try {
      await this.withTimeout(
        (async () => {
          await this.deps.eventLogger?.append?.({
            eventId: this.generateEventId(),
            ts: ts || Date.now(),
            projectId: this.deps.sessionRegistry?.getProjectPath?.(sessionId) ?? '',
            category: 'chat' as any,
            action: 'chat.headers',
            payload: { headers: data, sessionId },
            metadata: { schemaVersion: '1.0', source: 'client' },
          });
          const projectPath = this.deps.sessionRegistry?.getProjectPath?.(sessionId) ?? process.cwd();
          const appender = this.getOrCreateAppender(this.conversationsAppenders, projectPath, 'logsConversations');
          await appender.append(buildConversationRecord('chat.headers', sessionId, data, ts));
        })(),
        3_000,
        undefined,
      );
    } catch {
      // Non-blocking: lose this log entry
    }
  }

  /**
   * Handle shell.env events — return environment variable key-value pairs.
   * Timeout: 2 s. On timeout → return empty object {}.
   */
  private async handleShellEnv(
    sessionId: string, _data: unknown
  ): Promise<Record<string, string>> {
    try {
      return await this.withTimeout(
        Promise.resolve({
          SPECFORGE_DAEMON_PORT: String(this.port ?? 0),
          SPECFORGE_SESSION_ID: sessionId,
          SPECFORGE_MODE: this.config.getMode(),
        }),
        2_000,
        {} as Record<string, string>,
      );
    } catch {
      return {};
    }
  }

  // ── Timeout Utility ──

  /**
   * Race a promise against a timeout, returning a fallback value
   * if the promise rejects or the timeout fires first.
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    try {
      const result = await Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      return result;
    } catch {
      return fallback;
    }
  }

  private generateEventId(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }

  // ── v1.1 API Handlers ──

  /**
   * v1.1 POST /api/v1/v11/work-item/create
   */
  private async handleV11WorkItemCreate(
    req: http.IncomingMessage, res: http.ServerResponse, body: string,
  ): Promise<void> {
    const dispatcher = this.deps.toolDispatcher;
    if (!dispatcher) {
      this.sendJsonResponse(res, 503, { success: false, error: 'ToolDispatcher not available' });
      return;
    }
    try {
      const args = JSON.parse(body);
      const result = await dispatcher.dispatch({
        tool: 'sf_v11_work_item_create',
        args,
        context: { directory: this.getProjectPathFromRequest(req) },
      });
      this.sendJsonResponse(res, 200, result);
    } catch (err: any) {
      this.sendJsonResponse(res, 400, { success: false, error: err.message });
    }
  }

  /**
   * v1.1 POST /api/v1/v11/gate/run
   */
  private async handleV11GateRun(
    req: http.IncomingMessage, res: http.ServerResponse, body: string,
  ): Promise<void> {
    const dispatcher = this.deps.toolDispatcher;
    if (!dispatcher) {
      this.sendJsonResponse(res, 503, { success: false, error: 'ToolDispatcher not available' });
      return;
    }
    try {
      const args = JSON.parse(body);
      const result = await dispatcher.dispatch({
        tool: 'sf_v11_gate_run',
        args,
        context: { directory: this.getProjectPathFromRequest(req) },
      });
      this.sendJsonResponse(res, 200, result);
    } catch (err: any) {
      this.sendJsonResponse(res, 400, { success: false, error: err.message });
    }
  }

  /**
   * v1.1 POST /api/v1/v11/merge
   */
  private async handleV11Merge(
    req: http.IncomingMessage, res: http.ServerResponse, body: string,
  ): Promise<void> {
    const dispatcher = this.deps.toolDispatcher;
    if (!dispatcher) {
      this.sendJsonResponse(res, 503, { success: false, error: 'ToolDispatcher not available' });
      return;
    }
    try {
      const args = JSON.parse(body);
      const result = await dispatcher.dispatch({
        tool: 'sf_v11_merge',
        args,
        context: { directory: this.getProjectPathFromRequest(req) },
      });
      this.sendJsonResponse(res, 200, result);
    } catch (err: any) {
      this.sendJsonResponse(res, 400, { success: false, error: err.message });
    }
  }

  /**
   * v1.1 POST /api/v1/v11/decision
   */
  private async handleV11Decision(
    req: http.IncomingMessage, res: http.ServerResponse, body: string,
  ): Promise<void> {
    const dispatcher = this.deps.toolDispatcher;
    if (!dispatcher) {
      this.sendJsonResponse(res, 503, { success: false, error: 'ToolDispatcher not available' });
      return;
    }
    try {
      const args = JSON.parse(body);
      const result = await dispatcher.dispatch({
        tool: 'sf_v11_decision',
        args,
        context: { directory: this.getProjectPathFromRequest(req) },
      });
      this.sendJsonResponse(res, 200, result);
    } catch (err: any) {
      this.sendJsonResponse(res, 400, { success: false, error: err.message });
    }
  }

  /**
   * v1.1 POST /api/v1/v11/code-permission
   */
  private async handleV11CodePermission(
    req: http.IncomingMessage, res: http.ServerResponse, body: string,
  ): Promise<void> {
    const dispatcher = this.deps.toolDispatcher;
    if (!dispatcher) {
      this.sendJsonResponse(res, 503, { success: false, error: 'ToolDispatcher not available' });
      return;
    }
    try {
      const args = JSON.parse(body);
      const result = await dispatcher.dispatch({
        tool: 'sf_v11_code_permission',
        args,
        context: { directory: this.getProjectPathFromRequest(req) },
      });
      this.sendJsonResponse(res, 200, result);
    } catch (err: any) {
      this.sendJsonResponse(res, 400, { success: false, error: err.message });
    }
  }

  /**
   * Extract project path from request headers or fallback to cwd.
   */
  private getProjectPathFromRequest(_req: http.IncomingMessage): string {
    return process.cwd();
  }

  /**
   * v1.1 POST /api/v1/v11/spec-migration
   */
  private async handleV11SpecMigration(
    req: http.IncomingMessage, res: http.ServerResponse, body: string,
  ): Promise<void> {
    const dispatcher = this.deps.toolDispatcher;
    if (!dispatcher) {
      this.sendJsonResponse(res, 503, { success: false, error: 'ToolDispatcher not available' });
      return;
    }
    try {
      const args = JSON.parse(body);
      const result = await dispatcher.dispatch({
        tool: 'sf_v11_spec_migration',
        args,
        context: { directory: this.getProjectPathFromRequest(req) },
      });
      this.sendJsonResponse(res, 200, result);
    } catch (err: any) {
      this.sendJsonResponse(res, 400, { success: false, error: err.message });
    }
  }

  /**
   * v1.1 POST /api/v1/v11/rollback
   */
  private async handleV11Rollback(
    req: http.IncomingMessage, res: http.ServerResponse, body: string,
  ): Promise<void> {
    const dispatcher = this.deps.toolDispatcher;
    if (!dispatcher) {
      this.sendJsonResponse(res, 503, { success: false, error: 'ToolDispatcher not available' });
      return;
    }
    try {
      const args = JSON.parse(body);
      const result = await dispatcher.dispatch({
        tool: 'sf_v11_rollback', args,
        context: { directory: this.getProjectPathFromRequest(req) },
      });
      this.sendJsonResponse(res, 200, result);
    } catch (err: any) {
      this.sendJsonResponse(res, 400, { success: false, error: err.message });
    }
  }

  /**
   * v1.1 POST /api/v1/v11/handoff
   */
  private async handleV11Handoff(
    req: http.IncomingMessage, res: http.ServerResponse, body: string,
  ): Promise<void> {
    const dispatcher = this.deps.toolDispatcher;
    if (!dispatcher) {
      this.sendJsonResponse(res, 503, { success: false, error: 'ToolDispatcher not available' });
      return;
    }
    try {
      const args = JSON.parse(body);
      const result = await dispatcher.dispatch({
        tool: 'sf_v11_handoff', args,
        context: { directory: this.getProjectPathFromRequest(req) },
      });
      this.sendJsonResponse(res, 200, result);
    } catch (err: any) {
      this.sendJsonResponse(res, 400, { success: false, error: err.message });
    }
  }

  /**
   * v1.1 POST /api/v1/v11/extension
   */
  private async handleV11Extension(
    req: http.IncomingMessage, res: http.ServerResponse, body: string,
  ): Promise<void> {
    const dispatcher = this.deps.toolDispatcher;
    if (!dispatcher) {
      this.sendJsonResponse(res, 503, { success: false, error: 'ToolDispatcher not available' });
      return;
    }
    try {
      const args = JSON.parse(body);
      const result = await dispatcher.dispatch({
        tool: 'sf_v11_extension', args,
        context: { directory: this.getProjectPathFromRequest(req) },
      });
      this.sendJsonResponse(res, 200, result);
    } catch (err: any) {
      this.sendJsonResponse(res, 400, { success: false, error: err.message });
    }
  }

  /**
   * v1.1 POST /api/v1/v11/verification
   */
  private async handleV11Verification(
    req: http.IncomingMessage, res: http.ServerResponse, body: string,
  ): Promise<void> {
    const dispatcher = this.deps.toolDispatcher;
    if (!dispatcher) {
      this.sendJsonResponse(res, 503, { success: false, error: 'ToolDispatcher not available' });
      return;
    }
    try {
      const args = JSON.parse(body);
      const result = await dispatcher.dispatch({
        tool: 'sf_v11_verification', args,
        context: { directory: this.getProjectPathFromRequest(req) },
      });
      this.sendJsonResponse(res, 200, result);
    } catch (err: any) {
      this.sendJsonResponse(res, 400, { success: false, error: err.message });
    }
  }
}
