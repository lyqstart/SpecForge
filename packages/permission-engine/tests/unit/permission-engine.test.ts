import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionEngine } from '../../src/index';
import { AGENT_CONSTITUTION_RULES, HardRuleEvaluator } from '../../src/hard-rules';

describe('PermissionEngine', () => {
  let engine: PermissionEngine;

  beforeEach(() => {
    engine = new PermissionEngine({
      eventLoggingEnabled: false // Disable event logging for these tests
    });
  });

  it('should be instantiable', () => {
    expect(engine).toBeInstanceOf(PermissionEngine);
  });

  it('should have checkPermission method', () => {
    expect(typeof engine.checkPermission).toBe('function');
  });

  it('should have getUserPermissions method', () => {
    expect(typeof engine.getUserPermissions).toBe('function');
  });

  it('should have validatePermissionConfig method', () => {
    expect(typeof engine.validatePermissionConfig).toBe('function');
  });

  it('should have getHardRuleEvaluator method', () => {
    expect(typeof engine.getHardRuleEvaluator).toBe('function');
  });

  it('should have getEventLogger method', () => {
    expect(typeof engine.getEventLogger).toBe('function');
  });

  it('should have getConfig method', () => {
    expect(typeof engine.getConfig).toBe('function');
  });

  it('should have updateConfig method', () => {
    expect(typeof engine.updateConfig).toBe('function');
  });

  it('should have cleanup method', () => {
    expect(typeof engine.cleanup).toBe('function');
  });

  describe('Hard Rule Integration', () => {
    it('should deny permission when hard rule matches', async () => {
      // Test hard rule 1: bypass gate checks
      const result = await engine.checkPermission(
        'user-123',
        'gate.bypass',
        { type: 'gate', id: 'gate-001' }
      );
      expect(result).toBe(false);
    });

    it('should allow permission when no hard rule matches', async () => {
      const result = await engine.checkPermission(
        'user-123',
        'file.read',
        { type: 'file', path: '/tmp/test.txt' }
      );
      expect(result).toBe(true);
    });

    it('should validate configuration without hard rule conflicts', async () => {
      const config = {
        rules: [
          { action: 'file.read', resource: 'file:*', effect: 'allow' }
        ]
      };
      const result = await engine.validatePermissionConfig(config);
      expect(result).toBe(true);
    });

    it('should detect hard rule conflicts in configuration', async () => {
      const config = {
        rules: [
          { action: 'gate.bypass', resource: '*', effect: 'allow' }
        ]
      };
      const result = await engine.validatePermissionConfig(config);
      expect(result).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should use default configuration when none provided', () => {
      const defaultEngine = new PermissionEngine();
      const config = defaultEngine.getConfig();
      
      expect(config.eventLoggingEnabled).toBe(true);
      expect(config.projectId).toBe('default-project');
      expect(config.strictMode).toBe(false);
      expect(config.cacheEnabled).toBe(true);
      expect(config.validationEnabled).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customEngine = new PermissionEngine({
        eventLoggingEnabled: false,
        projectId: 'custom-project',
        strictMode: true,
        cacheEnabled: false,
        validationEnabled: false
      });
      
      const config = customEngine.getConfig();
      
      expect(config.eventLoggingEnabled).toBe(false);
      expect(config.projectId).toBe('custom-project');
      expect(config.strictMode).toBe(true);
      expect(config.cacheEnabled).toBe(false);
      expect(config.validationEnabled).toBe(false);
    });

    it('should update configuration', () => {
      const originalConfig = engine.getConfig();
      expect(originalConfig.eventLoggingEnabled).toBe(false);
      
      engine.updateConfig({ eventLoggingEnabled: true });
      
      const updatedConfig = engine.getConfig();
      expect(updatedConfig.eventLoggingEnabled).toBe(true);
      // Other config values should remain unchanged
      expect(updatedConfig.projectId).toBe(originalConfig.projectId);
      expect(updatedConfig.strictMode).toBe(originalConfig.strictMode);
    });
  });
});

describe('HardRuleEvaluator', () => {
  let evaluator: HardRuleEvaluator;

  beforeEach(() => {
    evaluator = new HardRuleEvaluator();
  });

  it('should be instantiable', () => {
    expect(evaluator).toBeInstanceOf(HardRuleEvaluator);
  });

  it('should have 9 hard rules', () => {
    const rules = evaluator.getAllRules();
    expect(rules).toHaveLength(9);
  });

  describe('Rule Evaluation', () => {
    it('should deny gate bypass attempts', () => {
      const result = evaluator.evaluate(
        { id: 'agent-001' },
        'gate.bypass',
        { type: 'gate', id: 'main-gate' }
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedRule?.id).toBe('hard-001');
    });

    it('should deny verification forgery attempts', () => {
      const result = evaluator.evaluate(
        { id: 'agent-002' },
        'verification.forge',
        { type: 'verification', id: 'verify-001' }
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedRule?.id).toBe('hard-002');
    });

    it('should deny unauthorized resource access', () => {
      const result = evaluator.evaluate(
        { id: 'agent-003' },
        'config.read',
        { type: 'system.config', path: '/etc/passwd' }
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedRule?.id).toBe('hard-003');
    });

    it('should deny core system file modification', () => {
      const result = evaluator.evaluate(
        { id: 'agent-004' },
        'file.write',
        { type: 'file', path: '/etc/hosts' }
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedRule?.id).toBe('hard-004');
    });

    it('should deny arbitrary code execution', () => {
      const result = evaluator.evaluate(
        { id: 'agent-005' },
        'code.execute',
        { type: 'script', path: '/tmp/malicious.js' }
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedRule?.id).toBe('hard-005');
    });

    it('should deny sensitive information leakage', () => {
      const result = evaluator.evaluate(
        { id: 'agent-006' },
        'data.export',
        { type: 'user.data', id: 'user-sensitive' }
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedRule?.id).toBe('hard-006');
    });

    it('should deny agent impersonation', () => {
      const result = evaluator.evaluate(
        { id: 'agent-007' },
        'agent.impersonate',
        { type: 'agent', id: 'other-agent' },
        { impersonatedAgent: 'other-agent' }
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedRule?.id).toBe('hard-007');
    });

    it('should deny system operation disruption', () => {
      const result = evaluator.evaluate(
        { id: 'agent-008' },
        'system.shutdown',
        { type: 'system', id: 'main-daemon' }
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedRule?.id).toBe('hard-008');
    });

    it('should deny data integrity violation', () => {
      const result = evaluator.evaluate(
        { id: 'agent-009' },
        'data.corrupt',
        { type: 'database', id: 'main-db' }
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedRule?.id).toBe('hard-009');
    });

    it('should allow non-violating actions', () => {
      const result = evaluator.evaluate(
        { id: 'agent-010' },
        'file.read',
        { type: 'file', path: '/tmp/readme.txt' }
      );
      expect(result.allowed).toBe(true);
      expect(result.matchedRule).toBeUndefined();
    });
  });

  describe('Conflict Detection', () => {
    it('should detect configuration conflicts with hard rules', () => {
      const config = {
        rules: [
          { action: 'gate.bypass', resource: '*', effect: 'allow' },
          { action: 'verification.forge', resource: '*', effect: 'allow' }
        ]
      };
      const conflicts = evaluator.detectConflicts(config);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].rule.id).toBe('hard-001');
    });

    it('should return empty array for non-conflicting configuration', () => {
      const config = {
        rules: [
          { action: 'file.read', resource: 'file:*', effect: 'allow' },
          { action: 'task.execute', resource: 'task:*', effect: 'allow' }
        ]
      };
      const conflicts = evaluator.detectConflicts(config);
      expect(conflicts).toHaveLength(0);
    });
  });
});

describe('AGENT_CONSTITUTION_RULES', () => {
  it('should have exactly 9 rules', () => {
    expect(AGENT_CONSTITUTION_RULES).toHaveLength(9);
  });

  it('should have rules with required properties', () => {
    for (const rule of AGENT_CONSTITUTION_RULES) {
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('description');
      expect(rule).toHaveProperty('condition');
      expect(rule).toHaveProperty('effect');
      expect(rule).toHaveProperty('priority');
      expect(rule).toHaveProperty('layer', 'hard');
      expect(['deny', 'allow']).toContain(rule.effect);
    }
  });

  it('should have unique rule IDs', () => {
    const ruleIds = AGENT_CONSTITUTION_RULES.map(rule => rule.id);
    const uniqueIds = new Set(ruleIds);
    expect(uniqueIds.size).toBe(ruleIds.length);
  });

  it('should have rules in priority order', () => {
    const priorities = AGENT_CONSTITUTION_RULES.map(rule => rule.priority);
    // Check that priorities are in descending order (highest first)
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i]).toBeLessThanOrEqual(priorities[i - 1]);
    }
  });
});