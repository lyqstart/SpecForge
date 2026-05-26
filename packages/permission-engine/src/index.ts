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
import { RuleMergingEngine } from './services/rule-merging-engine';
import { BuiltinPolicyLoader } from './services/builtin-policy-loader';
import { UserPolicyLoader } from './services/user-policy-loader';
import { 
  PermissionEngineConfig,
  PermissionDeniedEventPayload,
  HardRuleConflictEventPayload,
  PermissionRequest,
  PermissionDecision
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
      cacheEnabled: this.config.cacheEnabled ?? true,
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
      eventLoggerConfig.eventsFilePath = `./specforge/observability/events.jsonl`;
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
    _context?: Record<string, any>
  ): Promise<boolean> {
    const resourceStr = typeof resource === 'string' ? resource : (resource?.type || 'unknown');
    
    const request: PermissionRequest = {
      actor: userId,
      action,
      resource: resourceStr
    };
    
    const decision = this.ruleMergingEngine.evaluate(request);
    
    if (this.config.eventLoggingEnabled) {
      await this.logPermissionDecision(decision);
    }
    
    return decision.decision === 'allow';
  }

  /**
   * Check permission with full decision details
   * Returns the complete merged decision with layer information
   */
  async checkPermissionWithDetails(
    userId: string,
    action: string,
    resource: string | any,
    _context?: Record<string, any>
  ): Promise<{
    allowed: boolean;
    matchedRule: string;
    ruleLayer: 'hard' | 'builtin' | 'user';
    reason: string;
  }> {
    const resourceStr = typeof resource === 'string' ? resource : (resource?.type || 'unknown');
    
    const request: PermissionRequest = {
      actor: userId,
      action,
      resource: resourceStr
    };
    
    const decision = this.ruleMergingEngine.evaluate(request);
    return {
      allowed: decision.decision === 'allow',
      matchedRule: decision.matched_rule,
      ruleLayer: decision.rule_layer,
      reason: decision.reason
    };
  }

  /**
   * Log a permission decision event with all required fields
   * Implements Property 10: Permission Decision Traceability
   */
  private async logPermissionDecision(decision: PermissionDecision): Promise<void> {
    try {
      await this.eventLogger.logPermissionDecision(decision);
    } catch (error) {
      console.error('Failed to log permission decision event:', error);
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
        eventLoggerConfig.eventsFilePath = `./specforge/observability/events.jsonl`;
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