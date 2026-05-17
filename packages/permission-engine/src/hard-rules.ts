/**
 * Agent Constitution Hard Rules
 * 
 * These are the 9 bottom-line rules that cannot be overridden by any configuration.
 * Hardcoded in TypeScript constants to prevent accidental modification.
 * 
 * @specforge/permission-engine
 */

/**
 * Hard Rule Definition
 */
export interface HardRule {
  id: string;
  description: string;
  condition: (actor: any, action: string, resource: any, context?: Record<string, unknown>) => boolean;
  effect: 'deny' | 'allow';
  priority: number; // Higher number = higher priority
  layer: 'hard';
}

/**
 * Agent Constitution 9 Bottom-Line Rules
 * 
 * Based on V6 Architecture Specification:
 * 1. Must not bypass Gate checks
 * 2. Must not forge verification
 * 3. Must not access unauthorized resources
 * 4. Must not modify core system files
 * 5. Must not execute arbitrary code
 * 6. Must not leak sensitive information
 * 7. Must not impersonate other agents
 * 8. Must not disrupt system operations
 * 9. Must not violate data integrity
 */
export const AGENT_CONSTITUTION_RULES: readonly HardRule[] = [
  {
    id: 'hard-001',
    description: 'Agent must not bypass Gate checks',
    condition: (_actor, action, resource, _context) => {
      // Check if action attempts to bypass gate validation
      const bypassActions = [
        'gate.bypass',
        'validation.skip',
        'check.override',
        'permission.override'
      ];
      
      // Check if resource is a gate or validation component
      const gateResources = [
        'gate',
        'validation',
        'verification',
        'approval'
      ];
      
      const actionLower = action.toLowerCase();
      const resourceType = resource?.type?.toLowerCase() || '';
      
      return bypassActions.some(a => actionLower.includes(a)) ||
             gateResources.some(r => resourceType.includes(r) && actionLower.includes('bypass'));
    },
    effect: 'deny',
    priority: 100,
    layer: 'hard'
  },
  {
    id: 'hard-002',
    description: 'Agent must not forge verification',
    condition: (_actor, action, _resource, _context) => {
      // Check if action attempts to forge or falsify verification
      const forgeActions = [
        'verification.forge',
        'validation.fake',
        'signature.falsify',
        'approval.fabricate',
        'result.manipulate'
      ];
      
      const actionLower = action.toLowerCase();
      return forgeActions.some(a => actionLower.includes(a));
    },
    effect: 'deny',
    priority: 100,
    layer: 'hard'
  },
  {
    id: 'hard-003',
    description: 'Agent must not access unauthorized resources',
    condition: (_actor, _action, resource, _context) => {
      // Check if resource is marked as unauthorized
      const unauthorizedResources = [
        'system.config',
        'security.credentials',
        'user.password',
        'api.key',
        'token.secret'
      ];
      
      const resourcePath = resource?.path?.toLowerCase() || '';
      const resourceType = resource?.type?.toLowerCase() || '';
      
      return unauthorizedResources.some(r => 
        resourcePath.includes(r) || resourceType.includes(r)
      );
    },
    effect: 'deny',
    priority: 90,
    layer: 'hard'
  },
  {
    id: 'hard-004',
    description: 'Agent must not modify core system files',
    condition: (_actor, action, resource, _context) => {
      // Check if action modifies core system files
      const modifyActions = ['write', 'update', 'delete', 'modify'];
      const coreSystemFiles = [
        '/etc/',
        '/usr/bin/',
        '/usr/lib/',
        '/var/lib/',
        'node_modules/',
        '.specforge/',
        '.kiro/'
      ];
      
      const actionLower = action.toLowerCase();
      const resourcePath = resource?.path?.toLowerCase() || '';
      
      const isModifyAction = modifyActions.some(a => actionLower.includes(a));
      const isCoreFile = coreSystemFiles.some(f => resourcePath.startsWith(f));
      
      return isModifyAction && isCoreFile;
    },
    effect: 'deny',
    priority: 90,
    layer: 'hard'
  },
  {
    id: 'hard-005',
    description: 'Agent must not execute arbitrary code',
    condition: (_actor, action, _resource, _context) => {
      // Check if action attempts to execute arbitrary code
      const executeActions = [
        'code.execute',
        'script.run',
        'command.exec',
        'process.spawn',
        'eval'
      ];
      
      const actionLower = action.toLowerCase();
      return executeActions.some(a => actionLower.includes(a));
    },
    effect: 'deny',
    priority: 80,
    layer: 'hard'
  },
  {
    id: 'hard-006',
    description: 'Agent must not leak sensitive information',
    condition: (_actor, action, resource, _context) => {
      // Check if action leaks sensitive information
      const leakActions = [
        'data.export',
        'information.share',
        'log.dump',
        'config.reveal',
        'secret.expose'
      ];
      
      const sensitiveResources = [
        'user.data',
        'system.log',
        'config.file',
        'credential.store'
      ];
      
      const actionLower = action.toLowerCase();
      const resourceType = resource?.type?.toLowerCase() || '';
      
      const isLeakAction = leakActions.some(a => actionLower.includes(a));
      const isSensitiveResource = sensitiveResources.some(r => resourceType.includes(r));
      
      return isLeakAction && isSensitiveResource;
    },
    effect: 'deny',
    priority: 80,
    layer: 'hard'
  },
  {
    id: 'hard-007',
    description: 'Agent must not impersonate other agents',
    condition: (actor, action, _resource, context): boolean => {
      // Check if actor is impersonating another agent
      const actorId = actor?.id || '';
      
      // Check for impersonation indicators
      const hasImpersonatedAgent = context?.impersonatedAgent && context.impersonatedAgent !== actorId;
      const hasOriginalActor = context?.originalActor && context.originalActor !== actorId;
      const hasImpersonationAction = action.includes('impersonate') || action.includes('masquerade');
      
      return !!(hasImpersonatedAgent || hasOriginalActor || hasImpersonationAction);
    },
    effect: 'deny',
    priority: 70,
    layer: 'hard'
  },
  {
    id: 'hard-008',
    description: 'Agent must not disrupt system operations',
    condition: (_actor, action, resource, _context) => {
      // Check if action disrupts system operations
      const disruptiveActions = [
        'system.shutdown',
        'service.stop',
        'process.kill',
        'network.block',
        'resource.exhaust'
      ];
      
      const systemResources = [
        'system',
        'service',
        'daemon',
        'process',
        'network'
      ];
      
      const actionLower = action.toLowerCase();
      const resourceType = resource?.type?.toLowerCase() || '';
      
      const isDisruptiveAction = disruptiveActions.some(a => actionLower.includes(a));
      const isSystemResource = systemResources.some(r => resourceType.includes(r));
      
      return isDisruptiveAction && isSystemResource;
    },
    effect: 'deny',
    priority: 70,
    layer: 'hard'
  },
  {
    id: 'hard-009',
    description: 'Agent must not violate data integrity',
    condition: (_actor, action, resource, _context) => {
      // Check if action violates data integrity
      const integrityViolationActions = [
        'data.corrupt',
        'record.tamper',
        'database.alter',
        'file.modify.unauthorized',
        'checksum.override'
      ];
      
      const dataResources = [
        'database',
        'file.data',
        'record',
        'storage'
      ];
      
      const actionLower = action.toLowerCase();
      const resourceType = resource?.type?.toLowerCase() || '';
      
      const isIntegrityViolation = integrityViolationActions.some(a => actionLower.includes(a));
      const isDataResource = dataResources.some(r => resourceType.includes(r));
      
      return isIntegrityViolation && isDataResource;
    },
    effect: 'deny',
    priority: 60,
    layer: 'hard'
  }
] as const;

/**
 * Hard Rule Evaluator
 */
export class HardRuleEvaluator {
  private rules: readonly HardRule[];
  
  constructor(rules: readonly HardRule[] = AGENT_CONSTITUTION_RULES) {
    this.rules = rules;
  }
  
  /**
   * Evaluate all hard rules against a permission request
   */
  evaluate(
    actor: any,
    action: string,
    resource: any,
    context?: Record<string, unknown>
  ): { allowed: boolean; matchedRule?: HardRule; reason?: string } {
    // Sort rules by priority (highest first)
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
    
    // No hard rule matched, allow evaluation to proceed to other layers
    return { allowed: true };
  }
  
  /**
   * Check if a configuration conflicts with any hard rule
   */
  detectConflicts(config: any): Array<{ rule: HardRule; conflict: string }> {
    const conflicts: Array<{ rule: HardRule; conflict: string }> = [];
    
    // Check for configuration that attempts to relax hard rules
    // This is a simplified check - actual implementation would parse config rules
    if (config?.rules) {
      for (const configRule of config.rules) {
        for (const hardRule of this.rules) {
          // Check if config rule attempts to override hard rule
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
  
  /**
   * Check if a configuration rule attempts to override a hard rule
   */
  private doesConfigOverrideHardRule(configRule: any, hardRule: HardRule): boolean {
    // Only check if config rule attempts to allow what hard rule denies
    const configEffect = configRule.effect?.toLowerCase();
    const hardRuleEffect = hardRule.effect;
    
    if (configEffect !== 'allow' || hardRuleEffect !== 'deny') {
      return false;
    }
    
    // For simplicity in this implementation, we'll check if the config rule
    // explicitly allows actions that match hard rule patterns
    const configAction = configRule.action?.toLowerCase() || '';
    const configResource = configRule.resource?.toLowerCase() || '';
    
    // Check if this config rule would allow something that the hard rule denies
    return this.doesConfigMatchHardRulePattern(configAction, configResource, hardRule);
  }
  
  /**
   * Check if a configuration rule matches a hard rule pattern
   */
  private doesConfigMatchHardRulePattern(
    configAction: string,
    configResource: string,
    hardRule: HardRule
  ): boolean {
    // Generate patterns that would trigger this hard rule
    const hardRulePatterns = this.getHardRulePatterns(hardRule);
    
    for (const pattern of hardRulePatterns) {
      const { actionPattern, resourcePattern } = pattern;
      
      // Check if config action matches hard rule action pattern
      const actionMatches = this.matchesPattern(actionPattern, configAction);
      
      // Check if config resource matches hard rule resource pattern
      const resourceMatches = this.matchesPattern(resourcePattern, configResource);
      
      if (actionMatches && resourceMatches) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get patterns that would trigger a hard rule
   */
  private getHardRulePatterns(hardRule: HardRule): Array<{
    actionPattern: string;
    resourcePattern: string;
  }> {
    switch (hardRule.id) {
      case 'hard-001':
        return [
          { actionPattern: 'gate.bypass', resourcePattern: '*' },
          { actionPattern: 'validation.skip', resourcePattern: '*' },
          { actionPattern: 'check.override', resourcePattern: '*' },
          { actionPattern: '*bypass*', resourcePattern: 'gate:*' },
          { actionPattern: '*skip*', resourcePattern: 'validation:*' },
        ];
      case 'hard-002':
        return [
          { actionPattern: 'verification.forge', resourcePattern: '*' },
          { actionPattern: 'signature.falsify', resourcePattern: '*' },
          { actionPattern: 'approval.fabricate', resourcePattern: '*' },
          { actionPattern: '*forge*', resourcePattern: 'verification:*' },
          { actionPattern: '*falsify*', resourcePattern: 'signature:*' },
        ];
      case 'hard-003':
        return [
          { actionPattern: '*', resourcePattern: 'system.config:*' },
          { actionPattern: '*', resourcePattern: 'security.credentials:*' },
          { actionPattern: '*', resourcePattern: 'user.password:*' },
          { actionPattern: '*', resourcePattern: 'api.key:*' },
          { actionPattern: '*', resourcePattern: 'token.secret:*' },
        ];
      case 'hard-004':
        return [
          { actionPattern: 'write', resourcePattern: 'file:/etc/*' },
          { actionPattern: 'delete', resourcePattern: 'file:/usr/bin/*' },
          { actionPattern: 'modify', resourcePattern: 'file:/var/lib/*' },
          { actionPattern: '*write*', resourcePattern: 'file:node_modules/*' },
          { actionPattern: '*delete*', resourcePattern: 'file:.specforge/*' },
        ];
      case 'hard-005':
        return [
          { actionPattern: 'code.execute', resourcePattern: '*' },
          { actionPattern: 'script.run', resourcePattern: '*' },
          { actionPattern: 'command.exec', resourcePattern: '*' },
          { actionPattern: 'process.spawn', resourcePattern: '*' },
          { actionPattern: '*execute*', resourcePattern: 'script:*' },
          { actionPattern: '*exec*', resourcePattern: 'command:*' },
        ];
      case 'hard-006':
        return [
          { actionPattern: 'data.export', resourcePattern: 'user.data:*' },
          { actionPattern: 'information.share', resourcePattern: 'system.log:*' },
          { actionPattern: 'log.dump', resourcePattern: 'config.file:*' },
          { actionPattern: '*export*', resourcePattern: '*sensitive*' },
          { actionPattern: '*share*', resourcePattern: '*secret*' },
        ];
      case 'hard-007':
        return [
          { actionPattern: 'agent.impersonate', resourcePattern: '*' },
          { actionPattern: 'identity.masquerade', resourcePattern: '*' },
          { actionPattern: '*impersonate*', resourcePattern: 'agent:*' },
          { actionPattern: '*masquerade*', resourcePattern: 'identity:*' },
        ];
      case 'hard-008':
        return [
          { actionPattern: 'system.shutdown', resourcePattern: '*' },
          { actionPattern: 'service.stop', resourcePattern: '*' },
          { actionPattern: 'process.kill', resourcePattern: '*' },
          { actionPattern: '*shutdown*', resourcePattern: 'system:*' },
          { actionPattern: '*stop*', resourcePattern: 'service:*' },
        ];
      case 'hard-009':
        return [
          { actionPattern: 'data.corrupt', resourcePattern: '*' },
          { actionPattern: 'record.tamper', resourcePattern: '*' },
          { actionPattern: 'database.alter', resourcePattern: '*' },
          { actionPattern: '*corrupt*', resourcePattern: 'database:*' },
          { actionPattern: '*tamper*', resourcePattern: 'record:*' },
        ];
      default:
        return [];
    }
  }
  
  /**
   * Check if a string matches a pattern (supports wildcard *)
   */
  private matchesPattern(pattern: string, value: string): boolean {
    if (pattern === '*') {
      return true;
    }
    
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }
  
  /**
   * Get all hard rules
   */
  getAllRules(): readonly HardRule[] {
    return this.rules;
  }
  
  /**
   * Get rule by ID
   */
  getRuleById(id: string): HardRule | undefined {
    return this.rules.find(rule => rule.id === id);
  }
}

/**
 * Default hard rule evaluator instance
 */
export const defaultHardRuleEvaluator = new HardRuleEvaluator();