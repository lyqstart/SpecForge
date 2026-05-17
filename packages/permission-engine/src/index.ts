/**
 * @specforge/permission-engine
 * 
 * Permission Engine module for SpecForge V6 architecture.
 * Provides fine-grained access control and authorization capabilities.
 */

export * from './types';
export * from './models';
export * from './services';
export * from './utils';

// Re-export Plugin Loader Integration for convenience
export {
  PluginLoaderIntegration,
  createRestrictivePluginLoaderIntegration,
  createStandardPluginLoaderIntegration,
  createPermissivePluginLoaderIntegration,
  type PluginSourceFile,
  type RejectionReason,
  type PluginLoadValidationResult,
  type PluginLoaderIntegrationConfig
} from './services/plugin-loader-integration';
// Note: HardRule is already exported from './types', so we don't re-export it from './hard-rules'
// to avoid duplicate exports. We export specific items from hard-rules instead.
export { HardRuleEvaluator, defaultHardRuleEvaluator, AGENT_CONSTITUTION_RULES } from './hard-rules';

import { HardRuleEvaluator } from './hard-rules';
import { EventLogger } from './services/event-logger';
import { RuleMergingEngine, PermissionRequest } from './services/rule-merging-engine';
import { BuiltinPolicyLoader } from './services/builtin-policy-loader';
import { UserPolicyLoader } from './services/user-policy-loader';
import { 
  PermissionEngineConfig,
  PermissionDecisionEventPayload,
  PermissionDeniedEventPayload,
  HardRuleConflictEventPayload
} from './types';

// Main permission engine class
export class PermissionEngine {
  private hardRuleEvaluator: HardRuleEvaluator;
  private eventLogger: EventLogger;
  private ruleMergingEngine: RuleMergingEngine;
  private builtinPolicyLoader?: BuiltinPolicyLoader;
  private userPolicyLoader?: UserPolicyLoader;
  private config: PermissionEngineConfig;
  
  constructor(config: PermissionEngineConfig = {}) {
    this.config = {
      strictMode: false,
      cacheEnabled: true,
      cacheTTL: 300000, // 5 minutes
      validationEnabled: true,
      eventLoggingEnabled: true,
      projectId: 'default-project', // Default project ID
      ...config
    };

    // Initialize permission engine with hard rule evaluator
    this.hardRuleEvaluator = new HardRuleEvaluator();
    
    // Initialize rule merging engine
    this.ruleMergingEngine = new RuleMergingEngine({
      hardRuleEvaluator: this.hardRuleEvaluator,
      cacheEnabled: this.config.cacheEnabled,
      defaultDecision: 'allow'
    });
    
    // Initialize event logger
    const eventLoggerConfig: any = {
      enabled: this.config.eventLoggingEnabled === true,
      projectId: this.config.projectId || 'default-project',
      fsyncEnabled: true
    };
    
    // Only add eventsFilePath if event logging is enabled
    if (this.config.eventLoggingEnabled) {
      eventLoggerConfig.eventsFilePath = `./.specforge/observability/events.jsonl`;
    }
    
    this.eventLogger = new EventLogger(eventLoggerConfig);

    // Initialize event logger asynchronously
    this.initializeEventLogger();
  }

  /**
   * Set the built-in policy loader
   */
  async setBuiltinPolicyLoader(loader: BuiltinPolicyLoader): Promise<void> {
    this.builtinPolicyLoader = loader;
    await this.ruleMergingEngine.initialize(loader, this.userPolicyLoader!);
  }

  /**
   * Set the user policy loader
   */
  async setUserPolicyLoader(loader: UserPolicyLoader): Promise<void> {
    this.userPolicyLoader = loader;
    await this.ruleMergingEngine.initialize(this.builtinPolicyLoader!, loader);
  }

  /**
   * Initialize event logger asynchronously
   */
  private async initializeEventLogger(): Promise<void> {
    try {
      await this.eventLogger.initialize();
    } catch (error) {
      console.warn('Failed to initialize event logger, continuing without event logging:', error);
    }
  }

  /**
   * Check if a user has permission to perform an action on a resource
   * Uses the rule merging engine with three-layer precedence
   * Logs permission decision event as required by Property 10: Permission Decision Traceability
   */
  async checkPermission(
    userId: string,
    action: string,
    resource: string | any,
    context?: Record<string, any>
  ): Promise<boolean> {
    const actor = { id: userId, ...context?.actor };
    const resourceObj = typeof resource === 'string' ? { type: resource } : resource;
    
    // Build permission request
    const request: PermissionRequest = {
      actor,
      action,
      resource: resourceObj,
      context
    };
    
    // Use the rule merging engine to evaluate with three-layer precedence
    const decision = this.ruleMergingEngine.evaluate(request);
    
    // Log the permission decision event
    if (this.config.eventLoggingEnabled) {
      const eventPayload = this.ruleMergingEngine.createEventPayload(request, {
        allowed: decision.allowed,
        matchedRule: decision.matchedRule,
        ruleLayer: decision.ruleLayer,
        reason: decision.reason,
        specificity: decision.specificity,
        evaluationDetails: decision.evaluationDetails
      });
      
      await this.logPermissionDecision({
        actor,
        action,
        resource: resourceObj,
        decision: decision.allowed ? 'allow' as const : 'deny' as const,
        matched_rule: decision.matchedRule,
        rule_layer: decision.ruleLayer,
        reason: decision.reason,
        context
      });
    }
    
    return decision.allowed;
  }

  /**
   * Check permission with full decision details
   * Returns the complete merged decision with layer information
   */
  async checkPermissionWithDetails(
    userId: string,
    action: string,
    resource: string | any,
    context?: Record<string, any>
  ): Promise<{
    allowed: boolean;
    matchedRule: string;
    ruleLayer: 'hard' | 'builtin' | 'user';
    reason: string;
    specificity: number;
  }> {
    const actor = { id: userId, ...context?.actor };
    const resourceObj = typeof resource === 'string' ? { type: resource } : resource;
    
    const request: PermissionRequest = {
      actor,
      action,
      resource: resourceObj,
      context
    };
    
    return this.ruleMergingEngine.evaluate(request);
  }

  /**
   * Log a permission decision event with all required fields
   * Implements Property 10: Permission Decision Traceability
   */
  private async logPermissionDecision(payload: Omit<PermissionDecisionEventPayload, 'actor'> & { actor: any }): Promise<void> {
    try {
      // Ensure actor has required id field
      const actorWithId = {
        id: payload.actor.id || 'unknown',
        sessionId: payload.actor.sessionId,
        agentRole: payload.actor.agentRole,
        workflowRole: payload.actor.workflowRole,
        remoteIdentity: payload.actor.remoteIdentity
      };

      // Ensure resource has required type field
      const resourceWithType = {
        type: payload.resource.type || 'unknown',
        id: payload.resource.id,
        path: payload.resource.path
      };

      const eventPayload: PermissionDecisionEventPayload = {
        actor: actorWithId,
        action: payload.action,
        resource: resourceWithType,
        decision: payload.decision,
        matched_rule: payload.matched_rule,
        rule_layer: payload.rule_layer,
        reason: payload.reason,
        context: payload.context
      };

      await this.eventLogger.logPermissionDecision(eventPayload);
    } catch (error) {
      console.error('Failed to log permission decision event:', error);
      // Don't throw - event logging failures shouldn't break permission checks
    }
  }

  /**
   * Log a permission denied event (for authentication/authorization failures)
   * Implements Property 16: Bearer Token Enforcement
   */
  async logPermissionDenied(payload: PermissionDeniedEventPayload): Promise<void> {
    try {
      await this.eventLogger.logPermissionDenied(payload);
    } catch (error) {
      console.error('Failed to log permission denied event:', error);
    }
  }

  /**
   * Validate permission configuration and log hard rule conflicts
   */
  async validatePermissionConfig(config: any): Promise<boolean> {
    // Check for hard rule conflicts
    const conflicts = this.hardRuleEvaluator.detectConflicts(config);
    
    if (conflicts.length > 0) {
      // Log each conflict
      for (const conflict of conflicts) {
        await this.logHardRuleConflict({
          rule: {
            id: conflict.rule.id,
            description: conflict.rule.description
          },
          conflict: conflict.conflict,
          config: config,
          detectedAt: new Date().toISOString()
        });
      }
      
      // Also log to console for visibility
      console.warn('Hard rule conflicts detected:', conflicts);
      return false;
    }
    
    return true;
  }

  /**
   * Log a hard rule conflict event
   */
  private async logHardRuleConflict(payload: HardRuleConflictEventPayload): Promise<void> {
    try {
      await this.eventLogger.logHardRuleConflict(payload);
    } catch (error) {
      console.error('Failed to log hard rule conflict event:', error);
    }
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(_userId: string): Promise<string[]> {
    // TODO: Implement user permissions retrieval
    return [];
  }
  
  /**
   * Get hard rule evaluator (for testing and inspection)
   */
  getHardRuleEvaluator(): HardRuleEvaluator {
    return this.hardRuleEvaluator;
  }

  /**
   * Get event logger (for testing and inspection)
   */
  getEventLogger(): EventLogger {
    return this.eventLogger;
  }

  /**
   * Get rule merging engine (for testing and inspection)
   */
  getRuleMergingEngine(): RuleMergingEngine {
    return this.ruleMergingEngine;
  }

  /**
   * Get built-in policy loader
   */
  getBuiltinPolicyLoader(): BuiltinPolicyLoader | undefined {
    return this.builtinPolicyLoader;
  }

  /**
   * Get user policy loader
   */
  getUserPolicyLoader(): UserPolicyLoader | undefined {
    return this.userPolicyLoader;
  }

  /**
   * Get current configuration
   */
  getConfig(): PermissionEngineConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PermissionEngineConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update event logger configuration if relevant settings changed
    if (newConfig.eventLoggingEnabled !== undefined || newConfig.projectId !== undefined) {
      const eventLoggerConfig: any = {
        enabled: this.config.eventLoggingEnabled === true,
        projectId: this.config.projectId || 'default-project',
        fsyncEnabled: true
      };
      
      // Only add eventsFilePath if event logging is enabled
      if (this.config.eventLoggingEnabled) {
        eventLoggerConfig.eventsFilePath = `./.specforge/observability/events.jsonl`;
      }
      
      this.eventLogger = new EventLogger(eventLoggerConfig);
      
      // Reinitialize event logger
      this.initializeEventLogger();
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.eventLogger.cleanup();
  }
}