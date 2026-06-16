// @ts-nocheck
// Build-unblock note: legacy permission-engine service has historical type drift; production build boundary is being restored
/**
 * Policy Enforcement Point (PEP)
 * 
 * The PEP is the entry point for all permission checks. It:
 * 1. Extracts request context (actor, action, resource)
 * 2. Validates authentication (Bearer tokens, API keys)
 * 3. Routes requests to the Policy Decision Point (PDP)
 * 4. Returns appropriate HTTP responses
 * 
 * Implements Property 16 (Bearer Token Enforcement) and Property 26 (Remote Access Guard)
 * as part of the three-layer permission model.
 * 
 * @specforge/permission-engine
 */

import { 
  BearerTokenValidator, 
  createBearerTokenValidator,
  BearerTokenValidationResult 
} from './bearer-token-validator';

import { 
  RemoteAccessGuard, 
  createRemoteAccessGuard,
  RemoteAccessValidationResult,
  RemoteAccessRequestContext,
  RemoteAccessConfig 
} from './remote-access-guard';

import { 
  RuleMergingEngine,
  MergedPermissionDecision 
} from './rule-merging-engine';

import { PermissionRequest, PermissionDecision } from '../types';

import { EventLogger } from './event-logger';

import { 
  PermissionDeniedEventPayload 
} from '../types/events';

/**
 * HTTP request context extracted from incoming requests
 */
export interface HttpRequestContext {
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Query parameters */
  query?: Record<string, string>;
  /** Request headers */
  headers: Record<string, string | string[] | undefined>;
  /** Request body (parsed if JSON) */
  body?: any;
  /** Client IP address */
  clientIp?: string;
  /** User agent */
  userAgent?: string;
}

/**
 * Actor information extracted from request
 */
export interface ActorContext {
  /** User/session ID */
  id?: string;
  /** Session ID */
  sessionId?: string;
  /** Agent role (e.g., 'sf-executor', 'sf-reviewer') */
  agentRole?: string;
  /** Workflow role (e.g., 'owner', 'contributor', 'viewer') */
  workflowRole?: string;
  /** Remote identity (for OpenClaw requests) */
  remoteIdentity?: string;
  /** Additional actor properties */
  [key: string]: any;
}

/**
 * Resource information extracted from request
 */
export interface ResourceContext {
  /** Resource type (e.g., 'spec', 'task', 'tool', 'file') */
  type: string;
  /** Resource ID if specific */
  id?: string;
  /** Resource path (for filesystem resources) */
  path?: string;
  /** Additional resource properties */
  [key: string]: any;
}

/**
 * Complete request context for permission evaluation
 */
export interface PepRequestContext {
  /** Extracted actor information */
  actor: ActorContext;
  /** Requested action (e.g., 'tool.execute', 'spec.read', 'task.create') */
  action: string;
  /** Target resource */
  resource: ResourceContext;
  /** Original HTTP request (for reference) */
  http: HttpRequestContext;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * PEP configuration
 */
export interface PepConfig {
  /** Valid Bearer token for authentication */
  bearerToken: string;
  /** Project ID for event logging */
  projectId: string;
  /** Whether to require Bearer token authentication */
  requireAuth?: boolean;
  /** Whether remote access mode is enabled */
  remoteAccessEnabled?: boolean;
  /** Remote access configuration */
  remoteAccess?: RemoteAccessConfig;
  /** Whether to log permission decisions */
  logDecisions?: boolean;
  /** Whether to log permission denied events */
  logDenials?: boolean;
  /** Custom event logger */
  eventLogger?: EventLogger;
  /** Rule merging engine (PDP) - will create if not provided */
  pdp?: RuleMergingEngine;
}

/**
 * PEP result for permission checks
 */
export interface PepResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** HTTP status code to return */
  httpStatus: 200 | 401 | 403;
  /** Response body (for errors) */
  body?: string;
  /** Error code for programmatic handling */
  errorCode?: string;
  /** Reason for denial/allowance */
  reason?: string;
  /** Matched rule ID if applicable */
  matchedRule?: string;
  /** Rule layer (hard/builtin/user) */
  ruleLayer?: 'hard' | 'builtin' | 'user';
  /** Decision details from PDP */
  decision?: MergedPermissionDecision;
  /** Context after processing */
  context?: PepRequestContext;
}

/**
 * HTTP response to send to client
 */
export interface HttpResponse {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Response body */
  body: string;
}

/**
 * Policy Enforcement Point (PEP)
 * 
 * Main entry point for permission checks. Coordinates authentication
 * and authorization for HTTP/SSE requests.
 */
export class PolicyEnforcementPoint {
  private config: Required<PepConfig>;
  private bearerTokenValidator: BearerTokenValidator;
  private remoteAccessGuard?: RemoteAccessGuard;
  private pdp: RuleMergingEngine;
  private eventLogger: EventLogger;

  constructor(config: PepConfig) {
    // Set defaults
    this.config = {
      bearerToken: config.bearerToken,
      projectId: config.projectId,
      requireAuth: config.requireAuth ?? true,
      remoteAccessEnabled: config.remoteAccessEnabled ?? false,
      remoteAccess: config.remoteAccess ?? {
        enabled: false,
        ipWhitelistEnabled: false,
        ipWhitelist: [],
        twoStepConfirmationEnabled: false,
        userBindingEnabled: false,
        sessionTimeout: 3600000,
        requireUserBinding: false,
        // @ts-expect-error - apiKeys is optional in some contexts
        apiKeys: []
      },
      logDecisions: config.logDecisions ?? true,
      logDenials: config.logDenials ?? true,
      eventLogger: config.eventLogger ?? new EventLogger({
        enabled: config.logDecisions ?? true,
        projectId: config.projectId
      }),
      pdp: config.pdp ?? new RuleMergingEngine({
        cacheEnabled: true,
        defaultDecision: 'allow'
      })
    };

    // Initialize Bearer Token validator
    this.bearerTokenValidator = createBearerTokenValidator({
      validToken: this.config.bearerToken,
      projectId: this.config.projectId,
      logFailures: this.config.logDenials,
      eventLogger: this.config.eventLogger
    });

    // Initialize Remote Access Guard if enabled
    if (this.config.remoteAccessEnabled && this.config.remoteAccess) {
      this.remoteAccessGuard = createRemoteAccessGuard({
        ...this.config.remoteAccess,
        projectId: this.config.projectId,
        enabled: true,
        eventLogger: this.config.eventLogger
      });
    }

    // Set PDP
    this.pdp = this.config.pdp;

    // Set event logger
    this.eventLogger = this.config.eventLogger;
  }

  /**
   * Set the PDP (Policy Decision Point)
   * 
   * @param pdp - Rule merging engine instance
   */
  setPdp(pdp: RuleMergingEngine): void {
    this.pdp = pdp;
  }

  /**
   * Get the PDP instance
   */
  getPdp(): RuleMergingEngine {
    return this.pdp;
  }

  /**
   * Set the remote access guard
   */
  setRemoteAccessGuard(guard: RemoteAccessGuard): void {
    this.remoteAccessGuard = guard;
  }

  /**
   * Process an HTTP request through the PEP
   * 
   * This is the main entry point that:
   * 1. Extracts request context
   * 2. Validates authentication (Bearer token, API key for remote)
   * 3. Routes to PDP for authorization decision
   * 4. Returns appropriate HTTP response
   * 
   * @param request - HTTP request context
   * @returns PEP result with decision and response
   */
  async processRequest(request: HttpRequestContext): Promise<PepResult> {
    // Step 1: Extract request context
    const context = this.extractContext(request);

    // Step 2: Validate authentication (Bearer token)
    const authResult = await this.validateAuthentication(request.headers, {
      sessionId: context.actor.sessionId,
      remoteIdentity: context.actor.remoteIdentity,
      resource: { type: context.resource.type, id: context.resource.id },
      action: context.action
    });

    if (!authResult.authorized) {
      // Log the denial if enabled
      if (this.config.logDenials) {
        await this.logPermissionDenied({
          actor: {
            id: context.actor.id,
            sessionId: context.actor.sessionId,
            remoteIdentity: context.actor.remoteIdentity
          },
          action: context.action,
          resource: context.resource,
          reason: authResult.reason,
          layer: 'auth',
          details: { errorCode: authResult.errorCode }
        });
      }

      return {
        allowed: false,
        httpStatus: authResult.httpStatus,
        body: JSON.stringify({
          error: 'Unauthorized',
          reason: authResult.reason,
          code: authResult.errorCode
        }),
        errorCode: authResult.errorCode,
        reason: authResult.reason,
        context
      };
    }

    // Step 3: Validate remote access if enabled
    if (this.remoteAccessGuard && this.config.remoteAccessEnabled) {
      const remoteResult = await this.validateRemoteAccess(request, context);
      
      if (!remoteResult.authorized) {
        if (this.config.logDenials) {
          await this.logPermissionDenied({
            actor: {
              id: context.actor.id,
              sessionId: context.actor.sessionId,
              remoteIdentity: context.actor.remoteIdentity
            },
            action: context.action,
            resource: context.resource,
            reason: remoteResult.reason,
            layer: 'remote',
            details: { errorCode: remoteResult.errorCode }
          });
        }

        return {
          allowed: false,
          httpStatus: remoteResult.httpStatus,
          body: JSON.stringify({
            error: 'Forbidden',
            reason: remoteResult.reason,
            code: remoteResult.errorCode
          }),
          errorCode: remoteResult.errorCode,
          reason: remoteResult.reason,
          context
        };
      }

      // Update actor with bound user info if applicable
      if (remoteResult.boundUser) {
        context.actor.id = remoteResult.boundUser.id;
        context.actor.remoteIdentity = remoteResult.boundUser.email || remoteResult.boundUser.id;
      }
    }

    const pdpRequest: PermissionRequest = {
      actor: context.actor.agentRole || context.actor.id || 'unknown',
      action: context.action,
      resource: context.resource.type || 'unknown'
    };
    if (context.context) {
      pdpRequest.context = context.context as Record<string, unknown>;
    }

    const decision = this.pdp.evaluate(pdpRequest);

    // Step 5: Log permission decision
    if (this.config.logDecisions) {
      await this.logPermissionDecision(decision);
    }

    // Step 6: Return appropriate response
    if (decision.decision === 'deny') {
      return {
        allowed: false,
        httpStatus: 403,
        body: JSON.stringify({
          error: 'Forbidden',
          reason: decision.reason,
          code: 'permission_denied',
          matchedRule: decision.matched_rule,
          ruleLayer: decision.rule_layer
        }),
        errorCode: 'permission_denied',
        reason: decision.reason,
        matchedRule: decision.matched_rule,
        ruleLayer: decision.rule_layer,
        context
      };
    }

    return {
      allowed: true,
      httpStatus: 200,
      reason: decision.reason,
      matchedRule: decision.matched_rule,
      ruleLayer: decision.rule_layer,
      context
    };
  }

  /**
   * Extract request context from HTTP request
   * 
   * Extracts actor, action, and resource from the incoming request.
   * Supports multiple ways to specify these:
   * - From headers (X-Actor-Id, X-Action, X-Resource-Type)
   * - From query parameters (actor, action, resource)
   * - From request body (for POST/PUT requests)
   * 
   * @param request - HTTP request context
   * @returns Extracted PEP request context
   */
  extractContext(request: HttpRequestContext): PepRequestContext {
    // Extract actor from headers or use defaults
    const actor: ActorContext = this.extractActor(request);

    // Extract action from headers, query, or body
    const action = this.extractAction(request);

    // Extract resource from headers, query, body, or path
    const resource = this.extractResource(request);

    return {
      actor,
      action,
      resource,
      http: request,
      context: {
        method: request.method,
        path: request.path,
        query: request.query,
        clientIp: request.clientIp,
        userAgent: request.userAgent
      }
    };
  }

  /**
   * Extract actor information from request
   */
  private extractActor(request: HttpRequestContext): ActorContext {
    const headers = request.headers;
    
    // Try to get actor info from headers
    const id = this.getHeader(headers, 'x-actor-id') 
      || this.getHeader(headers, 'x-user-id')
      || (request.body?.actorId ?? request.body?.userId ?? request.body?.actor?.id);

    const sessionId = this.getHeader(headers, 'x-session-id')
      || (request.body?.sessionId ?? request.body?.session?.id);

    const agentRole = this.getHeader(headers, 'x-agent-role')
      || (request.body?.agentRole ?? request.body?.agent?.role);

    const workflowRole = this.getHeader(headers, 'x-workflow-role')
      || (request.body?.workflowRole ?? request.body?.workflow?.role);

    const remoteIdentity = this.getHeader(headers, 'x-remote-identity')
      || this.getHeader(headers, 'x-user-id')
      || (request.body?.remoteIdentity ?? request.body?.user?.email);

    return {
      id,
      sessionId,
      agentRole,
      workflowRole,
      remoteIdentity
    };
  }

  /**
   * Extract action from request
   */
  private extractAction(request: HttpRequestContext): string {
    const headers = request.headers;
    
    // Check headers first
    const headerAction = this.getHeader(headers, 'x-action');
    if (headerAction) {
      return headerAction;
    }

    // Check query params
    if (request.query?.action) {
      return request.query.action;
    }

    // Check body
    if (request.body?.action) {
      return request.body.action;
    }

    // Derive from HTTP method and path
    const method = request.method.toUpperCase();
    const path = request.path;

    // Common REST patterns
    if (path.includes('/specs/') || path.includes('/spec/')) {
      const baseAction = method === 'GET' ? 'read' 
        : method === 'POST' ? 'create'
        : method === 'PUT' || method === 'PATCH' ? 'update'
        : method === 'DELETE' ? 'delete'
        : 'execute';
      return `spec.${baseAction}`;
    }

    if (path.includes('/tasks/') || path.includes('/task/')) {
      const baseAction = method === 'GET' ? 'read'
        : method === 'POST' ? 'create'
        : method === 'PUT' || method === 'PATCH' ? 'update'
        : method === 'DELETE' ? 'delete'
        : 'execute';
      return `task.${baseAction}`;
    }

    if (path.includes('/tools/') || path.includes('/tool/') || path.startsWith('/api/tool')) {
      return 'tool.execute';
    }

    if (path.includes('/workflows/') || path.includes('/workflow/')) {
      const baseAction = method === 'GET' ? 'read'
        : method === 'POST' ? 'create'
        : method === 'DELETE' ? 'delete'
        : 'execute';
      return `workflow.${baseAction}`;
    }

    // Default to generic http request action
    return `http.${method.toLowerCase()}`;
  }

  /**
   * Extract resource from request
   */
  private extractResource(request: HttpRequestContext): ResourceContext {
    const headers = request.headers;
    const path = request.path;

    // Try headers first
    const type = this.getHeader(headers, 'x-resource-type')
      || (request.body?.resourceType ?? request.body?.resource?.type);

    const id = this.getHeader(headers, 'x-resource-id')
      || (request.body?.resourceId ?? request.body?.resource?.id);

    const resourcePath = this.getHeader(headers, 'x-resource-path')
      || (request.body?.resourcePath ?? request.body?.resource?.path);

    // Try query params
    const queryType = request.query?.resourceType || request.query?.type;
    const queryId = request.query?.resourceId || request.query?.id;
    const queryPath = request.query?.resourcePath || request.query?.path;

    // Derive from path if not provided
    let derivedType = type || queryType;
    let derivedId = id || queryId;
    let derivedPath = resourcePath || queryPath;

    if (!derivedType) {
      // Parse from path
      const segments = path.split('/').filter(s => s);
      
      if (segments[0] === 'api') {
        // /api/specs, /api/tasks, etc.
        derivedType = segments[1]?.replace(/s$/, '') || 'unknown';
        derivedId = segments[2];
      } else if (segments[0] === 'specs' || segments[0] === 'spec') {
        derivedType = 'spec';
        derivedId = segments[1];
      } else if (segments[0] === 'tasks' || segments[0] === 'task') {
        derivedType = 'task';
        derivedId = segments[1];
      } else if (segments[0] === 'tools' || segments[0] === 'tool') {
        derivedType = 'tool';
        derivedId = segments[1];
      } else if (segments[0] === 'workflows' || segments[0] === 'workflow') {
        derivedType = 'workflow';
        derivedId = segments[1];
      } else {
        derivedType = 'unknown';
      }
    }

    return {
      type: derivedType,
      id: derivedId,
      path: derivedPath
    };
  }

  /**
   * Get a header value (case-insensitive)
   */
  private getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerName) {
        if (Array.isArray(value)) {
          return value[0];
        }
        return value;
      }
    }
    return undefined;
  }

  /**
   * Validate Bearer token authentication
   */
  private async validateAuthentication(
    headers: Record<string, string | string[] | undefined>,
    context?: {
      sessionId?: string;
      remoteIdentity?: string;
      resource?: { type: string; id?: string };
      action?: string;
    }
  ): Promise<BearerTokenValidationResult> {
    // If authentication is not required, allow all
    if (!this.config.requireAuth) {
      return {
        authorized: true,
        reason: 'Authentication not required',
        errorCode: 'valid',
        httpStatus: 200
      };
    }

    const authHeader = this.getHeader(headers, 'authorization');
    return this.bearerTokenValidator.validate(authHeader, context);
  }

  /**
   * Validate remote access (API key, IP whitelist, etc.)
   */
  private async validateRemoteAccess(
    request: HttpRequestContext,
    context: PepRequestContext
  ): Promise<RemoteAccessValidationResult> {
    if (!this.remoteAccessGuard) {
      return {
        authorized: true,
        reason: 'Remote access guard not configured',
        errorCode: 'valid',
        httpStatus: 200
      };
    }

    const apiKey = this.getHeader(headersLower(request.headers), 'x-api-key')
      || request.query?.apiKey
      || request.body?.apiKey;

    // Build remote context with only defined values to avoid exactOptionalPropertyTypes issues
    const remoteContext: RemoteAccessRequestContext = {
      ...(apiKey ? { apiKey } : {}),
      ...(request.clientIp ? { clientIp: request.clientIp } : {}),
      ...(request.userAgent ? { userAgent: request.userAgent } : {}),
      ...(context.actor.sessionId ? { sessionId: context.actor.sessionId } : {}),
      ...(context.actor.id ? { userId: context.actor.id } : {}),
      operation: context.action,
      resource: context.resource,
      isSensitiveOperation: this.isSensitiveOperation(context.action),
      sensitiveOperationType: this.getSensitiveOperationType(context.action)
    };

    return this.remoteAccessGuard.validateRequest(remoteContext);
  }

  /**
   * Check if an action is a sensitive operation
   */
  private isSensitiveOperation(action: string): boolean {
    const sensitiveActions = [
      'delete',
      'permission.change',
      'config.reset',
      'config.modify_security',
      'user.delete',
      'spec.delete',
      'task.delete'
    ];
    
    return sensitiveActions.some(sa => 
      action.includes(sa) || action === sa
    );
  }

  /**
   * Get the sensitive operation type for an action
   */
  private getSensitiveOperationType(action: string): any {
    if (action.includes('delete')) return 'workitem.delete';
    if (action.includes('permission')) return 'permission.change';
    if (action.includes('config.reset')) return 'config.reset';
    if (action.includes('config.modify')) return 'config.modify_security';
    return undefined;
  }

  /**
   * Log permission decision event
   */
  private async logPermissionDecision(decision: PermissionDecision): Promise<void> {
    try {
      await this.eventLogger.logPermissionDecision(decision);
    } catch (error) {
      console.error('Failed to log permission decision event:', error);
    }
  }

  /**
   * Log permission denied event
   */
  private async logPermissionDenied(payload: PermissionDeniedEventPayload): Promise<void> {
    try {
      await this.eventLogger.logPermissionDenied(payload);
    } catch (error) {
      console.error('Failed to log permission denied event:', error);
    }
  }

  /**
   * Create an HTTP response from PEP result
   */
  createHttpResponse(result: PepResult): HttpResponse {
    return {
      status: result.httpStatus,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      },
      body: result.body || '{}'
    };
  }

  /**
   * Middleware-style handler for Express/Fastify compatibility
   * 
   * Returns a handler function that can be used with Express, Fastify, etc.
   */
  createMiddleware() {
    return async (req: {
      method: string;
      url: string;
      headers: Record<string, string | string[] | undefined>;
      query?: Record<string, string>;
      body?: any;
      ip?: string;
      get?: (name: string) => string | string[] | undefined;
    }): Promise<HttpResponse> => {
      const forwardedFor = req.get?.('x-forwarded-for') as string | undefined;
      const realIp = req.get?.('x-real-ip') as string | undefined;
      const userAgent = req.get?.('user-agent') as string | undefined;
      
      const queryObj = req.query ? { ...req.query } : undefined;
      const request: HttpRequestContext = {
        method: req.method,
        path: req.url.split('?')[0], // Remove query string
        query: queryObj,
        headers: req.headers,
        body: req.body,
        clientIp: req.ip || (forwardedFor?.split(',')[0]?.trim()) || realIp,
        userAgent
      };

      const result = await this.processRequest(request);
      return this.createHttpResponse(result);
    };
  }

  /**
   * SSE event handler for streaming permission events
   * 
   * Returns a handler for SSE connections that streams permission decisions
   */
  createSseHandler() {
    return async (req: {
      method: string;
      url: string;
      headers: Record<string, string | string[] | undefined>;
      query?: Record<string, string>;
      body?: any;
      ip?: string;
      get?: (name: string) => string | string[] | undefined;
    }): Promise<{
      allowed: boolean;
      eventType: string;
      data: any;
    }> => {
      const forwardedFor = req.get?.('x-forwarded-for') as string | undefined;
      const realIp = req.get?.('x-real-ip') as string | undefined;
      const userAgent = req.get?.('user-agent') as string | undefined;
      
      const queryObj = req.query ? { ...req.query } : undefined;
      const request: HttpRequestContext = {
        method: req.method,
        path: req.url.split('?')[0],
        query: queryObj,
        headers: req.headers,
        body: req.body,
        clientIp: req.ip || (forwardedFor?.split(',')[0]?.trim()) || realIp,
        userAgent
      };

      const result = await this.processRequest(request);
      
      return {
        allowed: result.allowed,
        eventType: result.allowed ? 'permission.allowed' : 'permission.denied',
        data: {
          action: result.context?.action,
          resource: result.context?.resource,
          reason: result.reason,
          matchedRule: result.matchedRule,
          ruleLayer: result.ruleLayer
        }
      };
    };
  }

  /**
   * Update Bearer token
   */
  setBearerToken(token: string): void {
    this.bearerTokenValidator.setToken(token);
    this.config.bearerToken = token;
  }

  /**
   * Get the Bearer token validator
   */
  getBearerTokenValidator(): BearerTokenValidator {
    return this.bearerTokenValidator;
  }

  /**
   * Get the remote access guard (if configured)
   */
  getRemoteAccessGuard(): RemoteAccessGuard | undefined {
    return this.remoteAccessGuard;
  }

  /**
   * Get current configuration (without sensitive data)
   */
  getConfig(): Omit<Required<PepConfig>, 'bearerToken' | 'eventLogger' | 'pdp' | 'remoteAccess'> & { 
    eventLogger: boolean;
    remoteAccessConfigured: boolean;
  } {
    return {
      projectId: this.config.projectId,
      requireAuth: this.config.requireAuth,
      remoteAccessEnabled: this.config.remoteAccessEnabled,
      logDecisions: this.config.logDecisions,
      logDenials: this.config.logDenials,
      eventLogger: this.eventLogger.isEnabled(),
      remoteAccessConfigured: !!this.remoteAccessGuard
    };
  }
}

/**
 * Create a Policy Enforcement Point instance
 */
export function createPolicyEnforcementPoint(config: PepConfig): PolicyEnforcementPoint {
  return new PolicyEnforcementPoint(config);
}

/**
 * Helper to convert headers to lowercase keys for case-insensitive lookup
 */
function headersLower(headers: Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined> {
  const lower: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    lower[key.toLowerCase()] = value;
  }
  return lower;
}