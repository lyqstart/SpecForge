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
    const cases = [
      { name: 'unknown actor', actor: { id: '' }, action: 'file.read', resource: { type: 'file', path: '/tmp/a' }, expected: 'hard-001' },
      { name: 'non-orchestrator state transition', actor: { id: 'sf-reviewer' }, action: 'sf_state_transition', resource: { type: 'workflow' }, expected: 'hard-002' },
      { name: 'sub-agent dispatch', actor: { id: 'sf-reviewer' }, action: 'agent.dispatch', resource: { type: 'agent' }, expected: 'hard-003' },
      { name: 'gate bypass', actor: { id: 'agent-004' }, action: 'gate.bypass', resource: { type: 'gate' }, expected: 'hard-004' },
      { name: 'verification forgery', actor: { id: 'agent-005' }, action: 'verification.forge', resource: { type: 'verification' }, expected: 'hard-005' },
      { name: 'unauthorized resource access', actor: { id: 'agent-006' }, action: 'config.read', resource: { type: 'system.config' }, expected: 'hard-006' },
      { name: 'core system file modification', actor: { id: 'agent-007' }, action: 'file.write', resource: { type: 'file', path: '/etc/hosts' }, expected: 'hard-007' },
      { name: 'sensitive information leak', actor: { id: 'agent-008' }, action: 'data.export', resource: { type: 'user.data' }, expected: 'hard-008' },
      { name: 'agent impersonation', actor: { id: 'agent-009' }, action: 'agent.impersonate', resource: { type: 'agent' }, expected: 'hard-009' },
    ] as const;

    for (const testCase of cases) {
      it(`should deny current hard-rule case: ${testCase.name}`, () => {
        const result = evaluator.evaluate(testCase.actor, testCase.action, testCase.resource);
        expect(result.allowed).toBe(false);
        expect(result.matchedRule?.id).toBe(testCase.expected);
      });
    }

    it('should allow an authenticated non-conflicting action', () => {
      const result = evaluator.evaluate({ id: 'agent-safe' }, 'file.read', { type: 'file', path: '/tmp/safe.txt' });
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
      const conflictIds = conflicts.map(conflict => conflict.rule.id);
      expect(conflictIds).toContain('hard-004');
      expect(conflictIds).toContain('hard-005');
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