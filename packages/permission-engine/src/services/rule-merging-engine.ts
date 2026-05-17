/**
 * Rule Merging Engine
 * 
 * Implements the three-layer permission model merging logic:
 * - Layer 1: Hard rules (Agent Constitution 9 bottom lines) - immutable
 * - Layer 2: Built-in policies (default agent role permissions)
 * - Layer 3: User policies (custom rules)
 * 
 * Rule precedence:
 * 1. Hard rules always override any configuration
 * 2. More specific rules override more general rules
 * 3. At same specificity, deny overrides allow
 * 
 * @specforge/permission-engine
 */

import { HardRule, HardRuleEvaluator } from '../hard-rules';
import { 
  BuiltinPolicy, 
  BuiltinPolicyLoader 
} from './builtin-policy-loader';
import { 
  UserPolicy, 
  UserPolicyLoader 
} from './user-policy-loader';
import { 
  PermissionDecisionEventPayload,
  RuleLayer 
} from '../types';

/**
 * Permission request context
 */
export interface PermissionRequest {
  actor: {
    id?: string;
    sessionId?: string;
    agentRole?: string;
    workflowRole?: string;
    remoteIdentity?: string;
    [key: string]: any;
  };
  action: string;
  resource: {
    type: string;
    id?: string;
    path?: string;
    [key: string]: any;
  };
  context?: Record<string, unknown>;
}

/**
 * Merged permission decision result
 */
export interface MergedPermissionDecision {
  allowed: boolean;
  matchedRule: string;
  ruleLayer: RuleLayer;
  reason: string;
  specificity: number;
  evaluationDetails: {
    hardRuleMatched?: boolean;
    hardRuleResult?: any;
    builtinPolicyMatched?: boolean;
    builtinPolicyResult?: any;
    userPolicyMatched?: boolean;
    userPolicyResult?: any;
  };
}

/**
 * Rule merging engine configuration
 */
export interface RuleMergingEngineConfig {
  builtinPolicyLoader?: BuiltinPolicyLoader;
  userPolicyLoader?: UserPolicyLoader;
  hardRuleEvaluator?: HardRuleEvaluator;
  cacheEnabled?: boolean;
  defaultDecision?: 'allow' | 'deny';
}

/**
 * Rule specificity calculator
 * 
 * Specificity is calculated based on how specific a rule's patterns are:
 * - Exact match (no wildcards): highest specificity
 * - Prefix match: medium specificity  
 * - Wildcard match: lowest specificity
 */
export class SpecificityCalculator {
  /**
   * Calculate specificity score for a pattern
   * Higher score = more specific
   */
  static calculatePatternSpecificity(pattern: string): number {
    if (!pattern || pattern === '*') {
      return 0;
    }

    let specificity = 10; // Base score

    // Check for exact patterns (no wildcards)
    if (!pattern.includes('*') && !pattern.includes('^') && !pattern.includes('$')) {
      specificity += 50;
    }

    // Check for anchored patterns (^ or $)
    if (pattern.includes('^') || pattern.includes('$')) {
      specificity += 15;
    }

    // Add points for each character (longer = more specific)
    specificity += Math.min(pattern.length, 30);

    // Add points for each specific segment separated by dots or slashes
    const segments = pattern.split(/[./]/).filter(s => s.length > 0);
    specificity += segments.length * 5;

    return specificity;
  }

  /**
   * Calculate total specificity for a rule based on its patterns
   */
  static calculateRuleSpecificity(
    actorPattern: string,
    actionPattern: string,
    resourcePattern: string
  ): number {
    const actorSpec = this.calculatePatternSpecificity(actorPattern.replace(/^(actor|agentRole|userId|workflowRole):/, ''));
    const actionSpec = this.calculatePatternSpecificity(actionPattern.replace(/^action:/, ''));
    const resourceSpec = this.calculatePatternSpecificity(resourcePattern.replace(/^resource(?:Type|Path|ID):/, ''));

    // Weighted sum - resource is most important, then action, then actor
    return (resourceSpec * 0.5) + (actionSpec * 0.3) + (actorSpec * 0.2);
  }
}

/**
 * Rule Merging Engine
 * 
 * Merges rules from three layers with proper precedence:
 * 1. Hard rules always win (cannot be overridden)
 * 2. More specific rules win over general rules
 * 3. At same specificity, deny wins over allow
 */
export class RuleMergingEngine {
  private builtinPolicyLoader: BuiltinPolicyLoader;
  private userPolicyLoader: UserPolicyLoader;
  private hardRuleEvaluator: HardRuleEvaluator;
  private config: Required<RuleMergingEngineConfig>;
  private cache: Map<string, MergedPermissionDecision>;

  constructor(config: RuleMergingEngineConfig = {}) {
    this.config = {
      builtinPolicyLoader: config.builtinPolicyLoader!,
      userPolicyLoader: config.userPolicyLoader!,
      hardRuleEvaluator: config.hardRuleEvaluator || new HardRuleEvaluator(),
      cacheEnabled: config.cacheEnabled ?? true,
      defaultDecision: config.defaultDecision ?? 'allow'
    };

    // Use provided loaders or create mock ones
    this.builtinPolicyLoader = this.config.builtinPolicyLoader;
    this.userPolicyLoader = this.config.userPolicyLoader;
    this.hardRuleEvaluator = this.config.hardRuleEvaluator;

    this.cache = new Map();
  }

  /**
   * Initialize the engine with loaders
   */
  async initialize(
    builtinPolicyLoader: BuiltinPolicyLoader,
    userPolicyLoader: UserPolicyLoader
  ): Promise<void> {
    this.builtinPolicyLoader = builtinPolicyLoader;
    this.userPolicyLoader = userPolicyLoader;
  }

  /**
   * Evaluate a permission request using the three-layer model
   * 
   * @param request The permission request
   * @returns Merged permission decision
   */
  evaluate(request: PermissionRequest): MergedPermissionDecision {
    const cacheKey = this.generateCacheKey(request);
    
    // Check cache first
    if (this.config.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Layer 1: Evaluate hard rules first (highest precedence)
    const hardRuleResult = this.evaluateHardRules(request);
    
    if (!hardRuleResult.allowed) {
      const decision: MergedPermissionDecision = {
        allowed: false,
        matchedRule: hardRuleResult.matchedRule?.id || 'unknown-hard-rule',
        ruleLayer: 'hard',
        reason: hardRuleResult.reason || 'Hard rule violation',
        specificity: 100, // Hard rules have highest specificity
        evaluationDetails: {
          hardRuleMatched: true,
          hardRuleResult
        }
      };
      
      this.cacheDecision(cacheKey, decision);
      return decision;
    }

    // Layer 2: Evaluate built-in policies
    const builtinResult = this.evaluateBuiltinPolicies(request);
    
    // Layer 3: Evaluate user policies
    const userResult = this.evaluateUserPolicies(request);

    // Merge results using specificity-based resolution
    const decision = this.mergeResults(hardRuleResult, builtinResult, userResult, request);
    
    this.cacheDecision(cacheKey, decision);
    return decision;
  }

  /**
   * Evaluate hard rules (Layer 1)
   */
  private evaluateHardRules(request: PermissionRequest): {
    allowed: boolean;
    matchedRule?: HardRule;
    reason?: string;
    specificity?: number;
  } {
    const result = this.hardRuleEvaluator.evaluate(
      request.actor,
      request.action,
      request.resource,
      request.context
    );

    return {
      allowed: result.allowed,
      matchedRule: result.matchedRule,
      reason: result.reason,
      specificity: result.allowed ? 0 : 100 // Hard rule denies are highest priority
    };
  }

  /**
   * Evaluate built-in policies (Layer 2)
   */
  private evaluateBuiltinPolicies(request: PermissionRequest): {
    allowed: boolean;
    matchedPolicy?: BuiltinPolicy;
    reason?: string;
    specificity?: number;
  } {
    if (!this.builtinPolicyLoader) {
      return { allowed: true, specificity: 0 };
    }

    try {
      const result = this.builtinPolicyLoader.evaluate(
        request.actor,
        request.action,
        request.resource,
        request.context
      );

      if (result.matchedPolicy) {
        return {
          allowed: result.allowed,
          matchedPolicy: result.matchedPolicy,
          reason: result.reason,
          specificity: SpecificityCalculator.calculateRuleSpecificity(
            result.matchedPolicy.actorPattern,
            result.matchedPolicy.actionPattern,
            result.matchedPolicy.resourcePattern
          )
        };
      }

      return { allowed: true, specificity: 0 };
    } catch (error) {
      console.error('Error evaluating built-in policies:', error);
      return { allowed: true, specificity: 0 };
    }
  }

  /**
   * Evaluate user policies (Layer 3)
   */
  private evaluateUserPolicies(request: PermissionRequest): {
    allowed: boolean;
    matchedPolicy?: UserPolicy;
    reason?: string;
    specificity?: number;
  } {
    if (!this.userPolicyLoader) {
      return { allowed: true, specificity: 0 };
    }

    try {
      const result = this.userPolicyLoader.evaluate(
        request.actor,
        request.action,
        request.resource,
        request.context
      );

      if (result.matchedPolicy) {
        return {
          allowed: result.allowed,
          matchedPolicy: result.matchedPolicy,
          reason: result.reason,
          specificity: SpecificityCalculator.calculateRuleSpecificity(
            result.matchedPolicy.actorPattern,
            result.matchedPolicy.actionPattern,
            result.matchedPolicy.resourcePattern
          )
        };
      }

      return { allowed: true, specificity: 0 };
    } catch (error) {
      console.error('Error evaluating user policies:', error);
      return { allowed: true, specificity: 0 };
    }
  }

  /**
   * Merge results from all three layers
   * 
   * Precedence rules:
   * 1. Hard rules always win (cannot be overridden)
   * 2. More specific rules override less specific
   * 3. At same specificity, deny overrides allow
   */
  private mergeResults(
    hardRuleResult: { allowed: boolean; matchedRule?: HardRule; reason?: string; specificity?: number },
    builtinResult: { allowed: boolean; matchedPolicy?: BuiltinPolicy; reason?: string; specificity?: number },
    userResult: { allowed: boolean; matchedPolicy?: UserPolicy; reason?: string; specificity?: number },
    request: PermissionRequest
  ): MergedPermissionDecision {
    // Step 1: If hard rule denies, it always wins
    if (!hardRuleResult.allowed) {
      return {
        allowed: false,
        matchedRule: hardRuleResult.matchedRule?.id || 'hard-rule-deny',
        ruleLayer: 'hard',
        reason: hardRuleResult.reason || 'Hard rule violation',
        specificity: 100,
        evaluationDetails: {
          hardRuleMatched: true,
          hardRuleResult
        }
      };
    }

    // Step 2: Compare specificity of matching policies from each layer
    const builtinSpec = builtinResult.specificity || 0;
    const userSpec = userResult.specificity || 0;

    // If only built-in policy matches
    if (builtinSpec > 0 && userSpec === 0) {
      return {
        allowed: builtinResult.allowed,
        matchedRule: builtinResult.matchedPolicy?.id || 'builtin-policy',
        ruleLayer: 'builtin',
        reason: builtinResult.reason || 'Matched built-in policy',
        specificity: builtinSpec,
        evaluationDetails: {
          hardRuleMatched: false,
          builtinPolicyMatched: true,
          builtinPolicyResult: builtinResult
        }
      };
    }

    // If only user policy matches
    if (userSpec > 0 && builtinSpec === 0) {
      return {
        allowed: userResult.allowed,
        matchedRule: userResult.matchedPolicy?.id || 'user-policy',
        ruleLayer: 'user',
        reason: userResult.reason || 'Matched user policy',
        specificity: userSpec,
        evaluationDetails: {
          hardRuleMatched: false,
          userPolicyMatched: true,
          userPolicyResult: userResult
        }
      };
    }

    // Both built-in and user policies match - use specificity-based resolution
    if (builtinSpec > 0 && userSpec > 0) {
      // At same specificity, deny wins over allow
      if (builtinSpec === userSpec) {
        if (!builtinResult.allowed) {
          return {
            allowed: false,
            matchedRule: builtinResult.matchedPolicy?.id || 'builtin-policy',
            ruleLayer: 'builtin',
            reason: builtinResult.reason || 'Built-in policy denies (same specificity, deny wins)',
            specificity: builtinSpec,
            evaluationDetails: {
              hardRuleMatched: false,
              builtinPolicyMatched: true,
              builtinPolicyResult: builtinResult,
              userPolicyMatched: true,
              userPolicyResult: userResult
            }
          };
        }
        
        if (!userResult.allowed) {
          return {
            allowed: false,
            matchedRule: userResult.matchedPolicy?.id || 'user-policy',
            ruleLayer: 'user',
            reason: userResult.reason || 'User policy denies (same specificity, deny wins)',
            specificity: userSpec,
            evaluationDetails: {
              hardRuleMatched: false,
              builtinPolicyMatched: true,
              builtinPolicyResult: builtinResult,
              userPolicyMatched: true,
              userPolicyResult: userResult
            }
          };
        }

        // Both allow - built-in wins (lower layer number)
        return {
          allowed: true,
          matchedRule: builtinResult.matchedPolicy?.id || 'builtin-policy',
          ruleLayer: 'builtin',
          reason: 'Both policies allow, built-in takes precedence',
          specificity: builtinSpec,
          evaluationDetails: {
            hardRuleMatched: false,
            builtinPolicyMatched: true,
            builtinPolicyResult: builtinResult,
            userPolicyMatched: true,
            userPolicyResult: userResult
          }
        };
      }

      // Different specificity - more specific wins
      if (builtinSpec > userSpec) {
        return {
          allowed: builtinResult.allowed,
          matchedRule: builtinResult.matchedPolicy?.id || 'builtin-policy',
          ruleLayer: 'builtin',
          reason: builtinResult.reason || 'Built-in policy more specific',
          specificity: builtinSpec,
          evaluationDetails: {
            hardRuleMatched: false,
            builtinPolicyMatched: true,
            builtinPolicyResult: builtinResult,
            userPolicyMatched: true,
            userPolicyResult: userResult
          }
        };
      } else {
        return {
          allowed: userResult.allowed,
          matchedRule: userResult.matchedPolicy?.id || 'user-policy',
          ruleLayer: 'user',
          reason: userResult.reason || 'User policy more specific',
          specificity: userSpec,
          evaluationDetails: {
            hardRuleMatched: false,
            builtinPolicyMatched: true,
            builtinPolicyResult: builtinResult,
            userPolicyMatched: true,
            userPolicyResult: userResult
          }
        };
      }
    }

    // No policies match - return default decision
    return {
      allowed: this.config.defaultDecision === 'allow',
      matchedRule: 'default-allow',
      ruleLayer: 'builtin',
      reason: 'No rules matched, using default decision',
      specificity: 0,
      evaluationDetails: {
        hardRuleMatched: false
      }
    };
  }

  /**
   * Generate cache key for a request
   */
  private generateCacheKey(request: PermissionRequest): string {
    const actorKey = JSON.stringify(request.actor);
    const resourceKey = JSON.stringify(request.resource);
    const contextKey = request.context ? JSON.stringify(request.context) : '';
    
    return `${actorKey}:${request.action}:${resourceKey}:${contextKey}`;
  }

  /**
   * Cache a decision
   */
  private cacheDecision(cacheKey: string, decision: MergedPermissionDecision): void {
    if (this.config.cacheEnabled) {
      // Limit cache size
      if (this.cache.size > 1000) {
        // Remove oldest entry
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          this.cache.delete(firstKey);
        }
      }
      this.cache.set(cacheKey, decision);
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get the hard rule evaluator
   */
  getHardRuleEvaluator(): HardRuleEvaluator {
    return this.hardRuleEvaluator;
  }

  /**
   * Get the built-in policy loader
   */
  getBuiltinPolicyLoader(): BuiltinPolicyLoader | undefined {
    return this.builtinPolicyLoader;
  }

  /**
   * Get the user policy loader
   */
  getUserPolicyLoader(): UserPolicyLoader | undefined {
    return this.userPolicyLoader;
  }

  /**
   * Create a merged permission decision event payload
   */
  createEventPayload(
    request: PermissionRequest,
    decision: MergedPermissionDecision
  ): PermissionDecisionEventPayload {
    return {
      actor: {
        id: request.actor.id || 'unknown',
        sessionId: request.actor.sessionId,
        agentRole: request.actor.agentRole,
        workflowRole: request.actor.workflowRole,
        remoteIdentity: request.actor.remoteIdentity
      },
      action: request.action,
      resource: {
        type: request.resource.type,
        id: request.resource.id,
        path: request.resource.path
      },
      decision: decision.allowed ? 'allow' : 'deny',
      matched_rule: decision.matchedRule,
      rule_layer: decision.ruleLayer,
      reason: decision.reason,
      context: request.context
    };
  }

  /**
   * Static method to create rule merging engine with default configuration
   */
  static createDefault(): RuleMergingEngine {
    return new RuleMergingEngine({
      hardRuleEvaluator: new HardRuleEvaluator(),
      cacheEnabled: true,
      defaultDecision: 'allow'
    });
  }
}