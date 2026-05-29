/**
 * Agent Constitution Hard Rules
 * 
 * These are the 9 bottom-line rules that cannot be overridden by any configuration.
 * Hardcoded in TypeScript constants to prevent accidental modification.
 * 
 * @specforge/permission-engine
 */

import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

export interface HardRule {
  id: string;
  description: string;
  condition: (actor: any, action: string, resource: any, context?: Record<string, unknown>) => boolean;
  effect: 'deny' | 'allow';
  priority: number;
  layer: 'hard';
}

function extractActorId(actor: any): string {
  if (typeof actor === 'string') return actor;
  return actor?.agentRole || actor?.id || '';
}

function extractResourceType(resource: any): string {
  if (typeof resource === 'string') return resource;
  return resource?.type || '';
}

function extractResourcePath(resource: any): string {
  if (typeof resource === 'string') return resource;
  return resource?.path || '';
}

export const AGENT_CONSTITUTION_RULES: readonly HardRule[] = [
  {
    id: 'hard-001',
    description: 'Unknown/unauthenticated agent is always denied',
    condition: (actor, _action, _resource, _context) => {
      const actorId = extractActorId(actor);
      return !actorId || actorId === 'unknown' || actorId === '' || actorId === 'anonymous';
    },
    effect: 'deny',
    priority: 100,
    layer: 'hard'
  },
  {
    id: 'hard-002',
    description: 'Only orchestrator may call sf_state_transition',
    condition: (actor, action, _resource, _context) => {
      const actorId = extractActorId(actor);
      const actionLower = action.toLowerCase();
      return actorId !== 'sf-orchestrator' && actionLower.includes('sf_state_transition');
    },
    effect: 'deny',
    priority: 100,
    layer: 'hard'
  },
  {
    id: 'hard-003',
    description: 'Sub-agents cannot dispatch other agents',
    condition: (actor, action, _resource, _context) => {
      const actorId = extractActorId(actor);
      const isSubAgent = actorId !== 'sf-orchestrator' && actorId.startsWith('sf-');
      const dispatchActions = ['agent.dispatch', 'agent.spawn', 'subagent.launch'];
      return isSubAgent && dispatchActions.some(d => action.toLowerCase().includes(d));
    },
    effect: 'deny',
    priority: 95,
    layer: 'hard'
  },
  {
    id: 'hard-004',
    description: 'Agent must not bypass Gate checks',
    condition: (_actor, action, resource, _context) => {
      const bypassActions = ['gate.bypass', 'validation.skip', 'check.override', 'permission.override'];
      const gateResources = ['gate', 'validation', 'verification', 'approval'];
      const actionLower = action.toLowerCase();
      const resourceType = extractResourceType(resource).toLowerCase();
      return bypassActions.some(a => actionLower.includes(a)) ||
             gateResources.some(r => resourceType.includes(r) && actionLower.includes('bypass'));
    },
    effect: 'deny',
    priority: 90,
    layer: 'hard'
  },
  {
    id: 'hard-005',
    description: 'Agent must not forge verification',
    condition: (_actor, action, _resource, _context) => {
      const forgeActions = ['verification.forge', 'validation.fake', 'signature.falsify', 'approval.fabricate', 'result.manipulate'];
      return forgeActions.some(a => action.toLowerCase().includes(a));
    },
    effect: 'deny',
    priority: 90,
    layer: 'hard'
  },
  {
    id: 'hard-006',
    description: 'Agent must not access unauthorized resources',
    condition: (_actor, _action, resource, _context) => {
      const unauthorizedResources = ['system.config', 'security.credentials', 'user.password', 'api.key', 'token.secret'];
      const resourcePath = extractResourcePath(resource).toLowerCase();
      const resourceType = extractResourceType(resource).toLowerCase();
      return unauthorizedResources.some(r =>
        resourcePath.includes(r) || resourceType.includes(r)
      );
    },
    effect: 'deny',
    priority: 85,
    layer: 'hard'
  },
  {
    id: 'hard-007',
    description: 'Agent must not modify core system files',
    condition: (_actor, action, resource, _context) => {
      const modifyActions = ['write', 'update', 'delete', 'modify'];
      const coreSystemFiles = ['/etc/', '/usr/bin/', '/usr/lib/', '/var/lib/', 'node_modules/', SPEC_DIR_NAME + '/', '.kiro/'];
      const actionLower = action.toLowerCase();
      const resourcePath = extractResourcePath(resource).toLowerCase();
      return modifyActions.some(a => actionLower.includes(a)) &&
             coreSystemFiles.some(f => resourcePath.startsWith(f));
    },
    effect: 'deny',
    priority: 85,
    layer: 'hard'
  },
  {
    id: 'hard-008',
    description: 'Agent must not leak sensitive information',
    condition: (_actor, action, resource, _context) => {
      const leakActions = ['data.export', 'information.share', 'log.dump', 'config.reveal', 'secret.expose'];
      const sensitiveResources = ['user.data', 'system.log', 'config.file', 'credential.store'];
      const actionLower = action.toLowerCase();
      const resourceType = extractResourceType(resource).toLowerCase();
      return leakActions.some(a => actionLower.includes(a)) &&
             sensitiveResources.some(r => resourceType.includes(r));
    },
    effect: 'deny',
    priority: 80,
    layer: 'hard'
  },
  {
    id: 'hard-009',
    description: 'Agent must not impersonate other agents',
    condition: (actor, action, _resource, context) => {
      const actorId = extractActorId(actor);
      const hasImpersonatedAgent = context?.impersonatedAgent && context.impersonatedAgent !== actorId;
      const hasOriginalActor = context?.originalActor && context.originalActor !== actorId;
      const hasImpersonationAction = action.includes('impersonate') || action.includes('masquerade');
      return !!(hasImpersonatedAgent || hasOriginalActor || hasImpersonationAction);
    },
    effect: 'deny',
    priority: 75,
    layer: 'hard'
  }
] as const;

export class HardRuleEvaluator {
  private rules: readonly HardRule[];
  
  constructor(rules: readonly HardRule[] = AGENT_CONSTITUTION_RULES) {
    this.rules = rules;
  }
  
  evaluate(
    actor: any,
    action: string,
    resource: any,
    context?: Record<string, unknown>
  ): { allowed: boolean; matchedRule?: HardRule; reason?: string } {
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);
    
    for (const rule of sortedRules) {
      if (rule.condition(actor, action, resource, context)) {
        return {
          allowed: rule.effect === 'allow',
          matchedRule: rule,
          reason: rule.description
        };
      }
    }
    
    return { allowed: true };
  }
  
  detectConflicts(config: any): Array<{ rule: HardRule; conflict: string }> {
    const conflicts: Array<{ rule: HardRule; conflict: string }> = [];
    
    if (config?.rules) {
      for (const configRule of config.rules) {
        for (const hardRule of this.rules) {
          if (this.doesConfigOverrideHardRule(configRule, hardRule)) {
            conflicts.push({
              rule: hardRule,
              conflict: `Configuration attempts to override hard rule: ${hardRule.description}`
            });
          }
        }
      }
    }
    
    return conflicts;
  }
  
  private doesConfigOverrideHardRule(configRule: any, hardRule: HardRule): boolean {
    const configEffect = configRule.effect?.toLowerCase();
    const hardRuleEffect = hardRule.effect;
    
    if (configEffect !== 'allow' || hardRuleEffect !== 'deny') {
      return false;
    }
    
    const configAction = configRule.action?.toLowerCase() || '';
    const configResource = configRule.resource?.toLowerCase() || '';
    
    return this.doesConfigMatchHardRulePattern(configAction, configResource, hardRule);
  }
  
  private doesConfigMatchHardRulePattern(
    configAction: string,
    configResource: string,
    hardRule: HardRule
  ): boolean {
    const hardRulePatterns = this.getHardRulePatterns(hardRule);
    
    for (const pattern of hardRulePatterns) {
      const actionMatches = this.matchesPattern(pattern.actionPattern, configAction);
      const resourceMatches = this.matchesPattern(pattern.resourcePattern, configResource);
      
      if (actionMatches && resourceMatches) {
        return true;
      }
    }
    
    return false;
  }
  
  private getHardRulePatterns(hardRule: HardRule): Array<{
    actionPattern: string;
    resourcePattern: string;
  }> {
    switch (hardRule.id) {
      case 'hard-001':
        return [{ actionPattern: '*', resourcePattern: '*' }];
      case 'hard-002':
        return [{ actionPattern: '*sf_state_transition*', resourcePattern: '*' }];
      case 'hard-003':
        return [
          { actionPattern: '*agent.dispatch*', resourcePattern: '*' },
          { actionPattern: '*agent.spawn*', resourcePattern: '*' },
          { actionPattern: '*subagent.launch*', resourcePattern: '*' },
        ];
      case 'hard-004':
        return [
          { actionPattern: 'gate.bypass', resourcePattern: '*' },
          { actionPattern: 'validation.skip', resourcePattern: '*' },
          { actionPattern: 'check.override', resourcePattern: '*' },
        ];
      case 'hard-005':
        return [
          { actionPattern: 'verification.forge', resourcePattern: '*' },
          { actionPattern: 'signature.falsify', resourcePattern: '*' },
          { actionPattern: 'approval.fabricate', resourcePattern: '*' },
        ];
      case 'hard-006':
        return [
          { actionPattern: '*', resourcePattern: 'system.config:*' },
          { actionPattern: '*', resourcePattern: 'security.credentials:*' },
          { actionPattern: '*', resourcePattern: 'user.password:*' },
          { actionPattern: '*', resourcePattern: 'api.key:*' },
          { actionPattern: '*', resourcePattern: 'token.secret:*' },
        ];
      case 'hard-007':
        return [
          { actionPattern: 'write', resourcePattern: 'file:/etc/*' },
          { actionPattern: 'delete', resourcePattern: 'file:/usr/bin/*' },
          { actionPattern: '*write*', resourcePattern: 'file:node_modules/*' },
          { actionPattern: '*delete*', resourcePattern: `file:${SPEC_DIR_NAME}/*` },
        ];
      case 'hard-008':
        return [
          { actionPattern: 'data.export', resourcePattern: 'user.data:*' },
          { actionPattern: 'log.dump', resourcePattern: 'config.file:*' },
        ];
      case 'hard-009':
        return [
          { actionPattern: 'agent.impersonate', resourcePattern: '*' },
          { actionPattern: 'identity.masquerade', resourcePattern: '*' },
        ];
      default:
        return [];
    }
  }
  
  private matchesPattern(pattern: string, value: string): boolean {
    if (pattern === '*') return true;
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    try {
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(value);
    } catch {
      return false;
    }
  }
  
  getAllRules(): readonly HardRule[] {
    return this.rules;
  }
  
  getRuleById(id: string): HardRule | undefined {
    return this.rules.find(rule => rule.id === id);
  }
}

export const defaultHardRuleEvaluator = new HardRuleEvaluator();
