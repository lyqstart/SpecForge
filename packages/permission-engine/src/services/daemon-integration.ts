/**
 * Daemon Core Integration
 * 
 * Integrates the Permission Engine with Daemon Core components:
 * - HTTP/SSE Server for request authentication
 * - Session Registry for actor identity
 * - Event Bus for event logging
 * 
 * This module provides the glue layer between permission-engine and daemon-core.
 * 
 * @specforge/permission-engine
 */

import { EventLogger } from './event-logger';
import { BearerTokenValidator, createBearerTokenValidator, parseAuthorizationHeader } from './bearer-token-validator';
import { PermissionEngine } from '../index';
import {
  PermissionDecisionEventPayload,
  PermissionDeniedEventPayload,
  HardRuleConflictEventPayload
} from '../types/events';

// Import types from daemon-core as type-only imports to avoid implementation coupling
import type { Event, Subscription } from '../../../daemon-core/src/types';
import type { EventBus } from '../../../daemon-core/src/event-bus/EventBus';
import type { SessionRegistry } from '../../../daemon-core/src/session/SessionRegistry';
import type { AgentIdentity } from '../../../daemon-core/src/session/AgentIdentity';

/**
 * Daemon Integration Configuration
 */
export interface DaemonIntegrationConfig {
  /** Project ID for event logging */
  projectId: string;
  /** Path to events.jsonl file */
  eventsFilePath?: string;
  /** Whether to enable fsync for WAL semantics */
  fsyncEnabled?: boolean;
  /** Session timeout in milliseconds */
  sessionTimeout?: number;
  /** Enable/disable event logging */
  eventLoggingEnabled?: boolean;
}

/**
 * Actor context from Session Registry
 */
export interface ActorContext {
  /** Session ID */
  sessionId: string;
  /** Agent role (e.g., 'sf-orchestrator', 'sf-reviewer') */
  agentRole: string;
  /** Workflow role (e.g., 'requirements-phase-executor') */
  workflowRole: string;
  /** Work item ID being worked on */
  workItemId: string;
  /** Parent session ID for session tree */
  parentSessionId: string | null;
  /** Session status */
  status: 'pending' | 'active' | 'history';
  /** Remote identity (for OpenClaw requests) */
  remoteIdentity?: string;
}

/**
 * HTTP Request context for permission checks
 */
export interface HttpRequestContext {
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Request headers */
  headers: Record<string, string | string[] | undefined>;
  /** Client IP address */
  clientIp: string;
  /** Authorization header value */
  authorization?: string;
  /** Request body (if available) */
  body?: Buffer;
  /** Query parameters */
  query?: Record<string, string>;
}

/**
 * Integration result for permission checks
 */
export interface IntegrationResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: string;
  /** Actor context if session found */
  actor?: ActorContext;
  /** Matched rule ID */
  matchedRule?: string;
  /** Rule layer (hard/builtin/user) */
  ruleLayer?: 'hard' | 'builtin' | 'user';
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Daemon Core Integration Manager
 * 
 * Provides integration between Permission Engine and Daemon Core:
 * - Validates Bearer Tokens against handshake file
 * - Looks up session information from Session Registry
 * - Coordinates event logging with Event Bus
 * - Enforces permission checks on incoming requests
 */
export class DaemonIntegration {
  private eventBus: EventBus | null = null;
  private sessionRegistry: SessionRegistry | null = null;
  private permissionEngine: PermissionEngine | null = null;
  private bearerTokenValidator: BearerTokenValidator | null = null;
  private eventLogger: EventLogger | null = null;
  private config: DaemonIntegrationConfig;
  private eventSubscription: Subscription | null = null;
  private initialized: boolean = false;

  constructor(config: DaemonIntegrationConfig) {
    this.config = {
      sessionTimeout: 300000, // 5 minutes default
      fsyncEnabled: true,
      eventLoggingEnabled: true,
      ...config
    };

    if (!this.config.projectId) {
      throw new Error('Project ID is required for Daemon Integration');
    }
  }

  /**
   * Initialize the integration with daemon-core components
   */
  async initialize(
    eventBus: EventBus,
    sessionRegistry: SessionRegistry,
    handshakeToken: string
  ): Promise<void> {
    if (this.initialized) {
      console.warn('[DaemonIntegration] Already initialized');
      return;
    }

    this.eventBus = eventBus;
    this.sessionRegistry = sessionRegistry;

    // Initialize Bearer Token validator with handshake token
    this.bearerTokenValidator = createBearerTokenValidator({
      expectedToken: handshakeToken,
      validateFormat: true
    });

    // Initialize event logger
    if (this.config.eventLoggingEnabled) {
      this.eventLogger = new EventLogger({
        enabled: true,
        projectId: this.config.projectId,
        eventsFilePath: this.config.eventsFilePath,
        fsyncEnabled: this.config.fsyncEnabled
      });
      await this.eventLogger.initialize();
    }

    // Subscribe to permission-related events from Event Bus
    this.subscribeToEvents();

    this.initialized = true;
    console.log('[DaemonIntegration] Initialized successfully');
  }

  /**
   * Set the Permission Engine instance
   */
  setPermissionEngine(engine: PermissionEngine): void {
    this.permissionEngine = engine;
  }

  /**
   * Subscribe to relevant events from Event Bus
   */
  private subscribeToEvents(): void {
    if (!this.eventBus) {
      return;
    }

    // Subscribe to session events
    this.eventSubscription = this.eventBus.subscribe('session.*', (event: Event) => {
      this.handleSessionEvent(event);
    });
  }

  /**
   * Handle session events from Event Bus
   */
  private handleSessionEvent(event: Event): void {
    console.log('[DaemonIntegration] Received session event:', event.action);
    
    // Could add additional handling here if needed
    // For now, the SessionRegistry handles session lifecycle
  }

  /**
   * Validate HTTP request authentication
   * 
   * Validates Bearer Token and returns actor context from Session Registry
   */
  async validateRequest(request: HttpRequestContext): Promise<IntegrationResult> {
    // Extract authorization header
    const authHeader = request.authorization || request.headers.authorization as string;
    
    if (!authHeader) {
      await this.logPermissionDenied({
        method: request.method,
        path: request.path,
        reason: 'Missing Authorization header',
        clientIp: request.clientIp,
        layer: 'auth'
      });
      
      return {
        allowed: false,
        reason: 'Missing Authorization header'
      };
    }

    // Parse Bearer token
    const tokenResult = parseAuthorizationHeader(authHeader);
    if (!tokenResult || tokenResult.scheme !== 'Bearer' || !tokenResult.token) {
      await this.logPermissionDenied({
        method: request.method,
        path: request.path,
        reason: 'Invalid Authorization header format',
        clientIp: request.clientIp,
        layer: 'auth'
      });
      
      return {
        allowed: false,
        reason: 'Invalid Authorization header format'
      };
    }

    // Validate Bearer token against expected token
    if (!this.bearerTokenValidator) {
      return {
        allowed: false,
        reason: 'Bearer Token validator not initialized'
      };
    }

    const validationResult = this.bearerTokenValidator.validate(tokenResult.token);
    if (!validationResult.valid) {
      await this.logPermissionDenied({
        method: request.method,
        path: request.path,
        reason: validationResult.reason || 'Invalid token',
        clientIp: request.clientIp,
        layer: 'auth'
      });
      
      return {
        allowed: false,
        reason: validationResult.reason || 'Invalid token'
      };
    }

    // Token is valid, but we need session context for permission checks
    // In daemon-core flow, session is established after handshake
    // For now, return success with basic context
    return {
      allowed: true,
      reason: 'Authentication successful',
      actor: undefined // Session context will be set when session is activated
    };
  }

  /**
   * Check permission for a request with full context
   * 
   * @param request HTTP request context
   * @param action The action being performed (e.g., 'tool.execute', 'workflow.create')
   * @param resource The resource being accessed
   */
  async checkPermission(
    request: HttpRequestContext,
    action: string,
    resource: { type: string; id?: string; path?: string }
  ): Promise<IntegrationResult> {
    // First validate authentication
    const authResult = await this.validateRequest(request);
    if (!authResult.allowed) {
      return authResult;
    }

    // If we have a Permission Engine, use it for authorization
    if (this.permissionEngine) {
      try {
        // Get actor context from session if available
        let actorId = 'system';
        let actorContext: Record<string, unknown> = {};

        if (authResult.actor) {
          actorId = authResult.actor.sessionId;
          actorContext = {
            agentRole: authResult.actor.agentRole,
            workflowRole: authResult.actor.workflowRole,
            workItemId: authResult.actor.workItemId
          };
        }

        // Check permission using the Permission Engine
        const decision = await this.permissionEngine.checkPermissionWithDetails(
          actorId,
          action,
          resource,
          { actor: actorContext }
        );

        // Log the permission decision
        await this.logPermissionDecision({
          actor: {
            id: actorId,
            sessionId: authResult.actor?.sessionId,
            agentRole: authResult.actor?.agentRole,
            workflowRole: authResult.actor?.workflowRole
          },
          action,
          resource,
          decision: decision.allowed ? 'allow' : 'deny',
          matched_rule: decision.matchedRule,
          rule_layer: decision.ruleLayer,
          reason: decision.reason,
          context: { clientIp: request.clientIp }
        });

        return {
          allowed: decision.allowed,
          reason: decision.reason,
          actor: authResult.actor,
          matchedRule: decision.matchedRule,
          ruleLayer: decision.ruleLayer,
          context: { clientIp: request.clientIp }
        };
      } catch (error) {
        console.error('[DaemonIntegration] Permission check failed:', error);
        return {
          allowed: false,
          reason: 'Permission check failed'
        };
      }
    }

    // No Permission Engine, just return auth success
    return authResult;
  }

  /**
   * Get actor context from Session Registry
   */
  getActorContext(sessionId: string): ActorContext | null {
    if (!this.sessionRegistry) {
      return null;
    }

    const identity = this.sessionRegistry.lookupBySessionId(sessionId);
    if (!identity) {
      return null;
    }

    return this.mapIdentityToContext(identity);
  }

  /**
   * Map AgentIdentity to ActorContext
   */
  private mapIdentityToContext(identity: AgentIdentity): ActorContext {
    return {
      sessionId: identity.sessionId,
      agentRole: identity.agentRole,
      workflowRole: identity.workflowRole,
      workItemId: identity.workItemId,
      parentSessionId: identity.parentSessionId,
      status: identity.status
    };
  }

  /**
   * Log permission decision event
   */
  private async logPermissionDecision(payload: {
    actor: {
      id: string;
      sessionId?: string;
      agentRole?: string;
      workflowRole?: string;
    };
    action: string;
    resource: { type: string; id?: string; path?: string };
    decision: 'allow' | 'deny';
    matched_rule?: string;
    rule_layer?: 'hard' | 'builtin' | 'user';
    reason: string;
    context?: Record<string, unknown>;
  }): Promise<void> {
    const eventPayload: PermissionDecisionEventPayload = {
      actor: payload.actor,
      action: payload.action,
      resource: payload.resource,
      decision: payload.decision,
      matched_rule: payload.matched_rule || 'unknown',
      rule_layer: payload.rule_layer || 'builtin',
      reason: payload.reason,
      context: payload.context
    };

    // Log to Event Logger
    if (this.eventLogger) {
      await this.eventLogger.logPermissionDecision(eventPayload);
    }

    // Also publish to Event Bus for cross-component communication
    if (this.eventBus) {
      const event: Event = {
        eventId: this.generateEventId(),
        ts: Date.now(),
        projectId: this.config.projectId,
        action: 'permission.evaluated',
        payload: eventPayload,
        metadata: {
          schemaVersion: '1.0',
          source: 'daemon'
        }
      };
      this.eventBus.publish(event);
    }
  }

  /**
   * Log permission denied event
   */
  private async logPermissionDenied(payload: {
    method: string;
    path: string;
    reason: string;
    clientIp: string;
    layer: 'auth' | 'remote' | 'plugin';
  }): Promise<void> {
    const eventPayload: PermissionDeniedEventPayload = {
      actor: {
        id: 'anonymous'
      },
      action: `${payload.method} ${payload.path}`,
      resource: {
        type: 'http'
      },
      reason: payload.reason,
      layer: payload.layer
    };

    // Log to Event Logger
    if (this.eventLogger) {
      await this.eventLogger.logPermissionDenied(eventPayload);
    }

    // Also publish to Event Bus
    if (this.eventBus) {
      const event: Event = {
        eventId: this.generateEventId(),
        ts: Date.now(),
        projectId: this.config.projectId,
        action: 'permission.denied',
        payload: eventPayload,
        metadata: {
          schemaVersion: '1.0',
          source: 'daemon'
        }
      };
      this.eventBus.publish(event);
    }
  }

  /**
   * Log hard rule conflict event
   */
  async logHardRuleConflict(payload: {
    rule: { id: string; description: string };
    conflict: string;
    config: unknown;
    detectedAt: string;
  }): Promise<void> {
    const eventPayload: HardRuleConflictEventPayload = {
      rule: payload.rule,
      conflict: payload.conflict,
      config: payload.config as Record<string, unknown>,
      detectedAt: payload.detectedAt
    };

    // Log to Event Logger
    if (this.eventLogger) {
      await this.eventLogger.logHardRuleConflict(eventPayload);
    }

    // Also publish to Event Bus
    if (this.eventBus) {
      const event: Event = {
        eventId: this.generateEventId(),
        ts: Date.now(),
        projectId: this.config.projectId,
        action: 'config.hard_rule_conflict',
        payload: eventPayload,
        metadata: {
          schemaVersion: '1.0',
          source: 'daemon'
        }
      };
      this.eventBus.publish(event);
    }
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp.toString(16)}-${random}`;
  }

  /**
   * Check if integration is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current configuration
   */
  getConfig(): DaemonIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Get the Event Bus instance
   */
  getEventBus(): EventBus | null {
    return this.eventBus;
  }

  /**
   * Get the Session Registry instance
   */
  getSessionRegistry(): SessionRegistry | null {
    return this.sessionRegistry;
  }

  /**
   * Get the Permission Engine instance
   */
  getPermissionEngine(): PermissionEngine | null {
    return this.permissionEngine;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Unsubscribe from Event Bus
    if (this.eventSubscription && this.eventBus) {
      this.eventBus.unsubscribe(this.eventSubscription);
      this.eventSubscription = null;
    }

    // Cleanup event logger
    if (this.eventLogger) {
      await this.eventLogger.cleanup();
      this.eventLogger = null;
    }

    this.initialized = false;
    console.log('[DaemonIntegration] Cleaned up');
  }
}

/**
 * Create a Daemon Integration instance
 */
export function createDaemonIntegration(config: DaemonIntegrationConfig): DaemonIntegration {
  return new DaemonIntegration(config);
}