import { HardRuleEvaluator } from '../hard-rules';
import { BuiltinPolicyLoader } from './builtin-policy-loader';
import { UserPolicyLoader } from './user-policy-loader';
import { PermissionRequest, PermissionDecision, PermissionDecisionEventPayload, RuleLayer } from '../types';

export type { PermissionRequest } from '../types';
export { PermissionDecision } from '../types';

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

export interface RuleMergingEngineConfig {
  builtinPolicyLoader?: BuiltinPolicyLoader;
  userPolicyLoader?: UserPolicyLoader;
  hardRuleEvaluator?: HardRuleEvaluator;
  cacheEnabled?: boolean;
  defaultDecision?: 'allow' | 'deny';
}

export class RuleMergingEngine {
  private builtinPolicyLoader: BuiltinPolicyLoader | undefined;
  private userPolicyLoader: UserPolicyLoader | undefined;
  private hardRuleEvaluator: HardRuleEvaluator;
  private cacheEnabled: boolean;
  private defaultDecision: 'allow' | 'deny';
  private cache: Map<string, PermissionDecision>;

  constructor(config: RuleMergingEngineConfig = {}) {
    this.hardRuleEvaluator = config.hardRuleEvaluator || new HardRuleEvaluator();
    this.builtinPolicyLoader = config.builtinPolicyLoader;
    this.userPolicyLoader = config.userPolicyLoader;
    this.cacheEnabled = config.cacheEnabled ?? true;
    this.defaultDecision = config.defaultDecision ?? 'deny';
    this.cache = new Map();
  }

  async initialize(
    builtinPolicyLoader: BuiltinPolicyLoader,
    userPolicyLoader: UserPolicyLoader
  ): Promise<void> {
    this.builtinPolicyLoader = builtinPolicyLoader;
    this.userPolicyLoader = userPolicyLoader;
  }

  evaluate(request: PermissionRequest): PermissionDecision {
    const actorForEvaluation = request.actorContext ?? request.actor;
    const resourceForEvaluation = request.resourceContext ?? request.resource;
    const cacheKey = `${JSON.stringify(actorForEvaluation)}:${request.action}:${JSON.stringify(resourceForEvaluation)}:${JSON.stringify(request.context || {})}`;

    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const hardResult = this.hardRuleEvaluator.evaluate(
      actorForEvaluation, request.action, resourceForEvaluation, request.context
    );
    if (!hardResult.allowed && hardResult.matchedRule) {
      const decision: PermissionDecision = {
        actor: request.actor,
        action: request.action,
        resource: request.resource,
        decision: "deny",
        matched_rule: hardResult.matchedRule.id,
        rule_layer: "hard",
        reason: hardResult.reason || hardResult.matchedRule.description,
        actorContext: request.actorContext,
        resourceContext: request.resourceContext,
        context: request.context
      };
      this.setCache(cacheKey, decision);
      return decision;
    }

    if (this.builtinPolicyLoader) {
      try {
        const builtinResult = (request.actorContext || request.resourceContext)
          ? this.builtinPolicyLoader.evaluate(actorForEvaluation, request.action, resourceForEvaluation, request.context)
          : this.builtinPolicyLoader.evaluateSimple(request.actor, request.action, request.resource, request.context);
        if (builtinResult.matchedPolicy) {
          const decision: PermissionDecision = {
            actor: request.actor,
            action: request.action,
            resource: request.resource,
            decision: builtinResult.allowed ? "allow" : "deny",
            matched_rule: builtinResult.matchedPolicy.id,
            rule_layer: "builtin",
            reason: builtinResult.reason || builtinResult.matchedPolicy.description,
            actorContext: request.actorContext,
            resourceContext: request.resourceContext,
            context: request.context
          };
          this.setCache(cacheKey, decision);
          return decision;
        }
      } catch {
        // fallthrough to next layer
      }
    }

    if (this.userPolicyLoader) {
      try {
        const userResult = (request.actorContext || request.resourceContext)
          ? this.userPolicyLoader.evaluate(actorForEvaluation, request.action, resourceForEvaluation, request.context)
          : this.userPolicyLoader.evaluateSimple(request.actor, request.action, request.resource, request.context);
        if (userResult.matchedPolicy) {
          const decision: PermissionDecision = {
            actor: request.actor,
            action: request.action,
            resource: request.resource,
            decision: userResult.allowed ? "allow" : "deny",
            matched_rule: userResult.matchedPolicy.id,
            rule_layer: "user",
            reason: userResult.reason || userResult.matchedPolicy.description,
            actorContext: request.actorContext,
            resourceContext: request.resourceContext,
            context: request.context
          };
          this.setCache(cacheKey, decision);
          return decision;
        }
      } catch {
        // fallthrough to default
      }
    }

    const decision: PermissionDecision = {
      actor: request.actor,
      action: request.action,
      resource: request.resource,
      decision: this.defaultDecision,
      matched_rule: "default",
      rule_layer: "builtin",
      reason: "No matching rule found, using default decision",
      actorContext: request.actorContext,
      resourceContext: request.resourceContext,
      context: request.context
    };
    this.setCache(cacheKey, decision);
    return decision;
  }

  private setCache(key: string, decision: PermissionDecision): void {
    if (!this.cacheEnabled) return;
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, decision);
  }

  clearCache(): void {
    this.cache.clear();
  }

  getHardRuleEvaluator(): HardRuleEvaluator {
    return this.hardRuleEvaluator;
  }

  getBuiltinPolicyLoader(): BuiltinPolicyLoader | undefined {
    return this.builtinPolicyLoader;
  }

  getUserPolicyLoader(): UserPolicyLoader | undefined {
    return this.userPolicyLoader;
  }

  createEventPayload(
    request: PermissionRequest,
    decision: PermissionDecision
  ): PermissionDecisionEventPayload {
    const actorContext = decision.actorContext ?? request.actorContext ?? { id: decision.actor };
    const resourceContext = decision.resourceContext ?? request.resourceContext ?? { type: decision.resource };
    return {
      actor: {
        id: String(actorContext.id ?? decision.actor),
        sessionId: actorContext.sessionId as string | undefined,
        agentRole: actorContext.agentRole as string | undefined,
        workflowRole: actorContext.workflowRole as string | undefined,
        remoteIdentity: actorContext.remoteIdentity as string | undefined
      },
      action: decision.action,
      resource: {
        type: String(resourceContext.type ?? decision.resource),
        id: resourceContext.id as string | undefined,
        path: resourceContext.path as string | undefined
      },
      decision: decision.decision,
      matched_rule: decision.matched_rule,
      rule_layer: decision.rule_layer,
      reason: decision.reason,
      context: decision.context ?? request.context
    };
  }

  static createDefault(): RuleMergingEngine {
    return new RuleMergingEngine({
      hardRuleEvaluator: new HardRuleEvaluator(),
      cacheEnabled: true,
      defaultDecision: 'deny'
    });
  }
}
