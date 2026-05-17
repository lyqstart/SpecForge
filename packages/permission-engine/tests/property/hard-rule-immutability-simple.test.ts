/**
 * Simplified Property-Based Test: Hard Rule Immutability (Property 3)
 * 
 * Validates: Property 3, Requirements 30.3, 7.5, 7.6, 7.7, 7.8
 * 
 * Property: For all configuration layers L ∈ {builtin, user, project, runtime} 
 * and any rule R, if R attempts to relax any of the 9 Agent Constitution hard rules, 
 * THEN Permission Engine must reject loading R and report conflict in startup logs. 
 * No configuration combination can bypass hard rules.
 */

import { describe, it, expect } from 'vitest';
import { HardRuleEvaluator } from '../../src/hard-rules';

describe('Property 3: Hard Rule Immutability (Simplified)', () => {
  const evaluator = new HardRuleEvaluator();
  
  // Test configurations that should conflict with hard rules
  const conflictingConfigs = [
    // Hard rule 1 conflicts - simple exact matches
    { rules: [{ action: 'gate.bypass', resource: '*', effect: 'allow' }] },
    { rules: [{ action: 'gate.bypass', resource: 'gate:*', effect: 'allow' }] },
    
    // Hard rule 2 conflicts
    { rules: [{ action: 'verification.forge', resource: '*', effect: 'allow' }] },
    
    // Hard rule 5 conflicts
    { rules: [{ action: 'code.execute', resource: '*', effect: 'allow' }] },
    
    // Hard rule 8 conflicts
    { rules: [{ action: 'system.shutdown', resource: '*', effect: 'allow' }] },
    
    // Hard rule 9 conflicts
    { rules: [{ action: 'data.corrupt', resource: '*', effect: 'allow' }] },
    
    // Multiple rule conflicts
    { 
      rules: [
        { action: 'gate.bypass', resource: '*', effect: 'allow' },
        { action: 'verification.forge', resource: '*', effect: 'allow' }
      ] 
    },
  ];
  
  // Test configurations that should NOT conflict with hard rules
  const nonConflictingConfigs = [
    { rules: [{ action: 'file.read', resource: 'file:/tmp/*', effect: 'allow' }] },
    { rules: [{ action: 'task.execute', resource: 'task:*', effect: 'allow' }] },
    { rules: [{ action: 'workflow.create', resource: 'workflow:*', effect: 'allow' }] },
    { rules: [{ action: 'spec.view', resource: 'spec:*', effect: 'allow' }] },
    { rules: [{ action: 'user.profile.read', resource: 'user:*', effect: 'allow' }] },
    { rules: [{ action: 'log.view', resource: 'log:*', effect: 'deny' }] },
    { rules: [{ action: 'config.read.safe', resource: 'config:public/*', effect: 'allow' }] },
    { 
      rules: [
        { action: 'file.read', resource: 'file:*', effect: 'allow' },
        { action: 'file.write', resource: 'file:/home/user/*', effect: 'allow' },
        { action: 'task.*', resource: 'task:*', effect: 'deny' }
      ] 
    },
  ];
  
  // Test all configuration layers
  const configLayers = ['builtin', 'user', 'project', 'runtime'];
  
  describe('3.1: No configuration can override hard rules', () => {
    it('should reject any configuration that attempts to relax hard rules', () => {
      for (const config of conflictingConfigs) {
        for (const layer of configLayers) {
          const layeredConfig = { ...config, layer };
          const conflicts = evaluator.detectConflicts(layeredConfig);
          
          // At least one conflict should be detected
          expect(conflicts.length, `Config ${JSON.stringify(layeredConfig)} should have conflicts`).toBeGreaterThan(0);
          
          // All conflicts should involve hard rules
          for (const conflict of conflicts) {
            expect(conflict.rule.layer, `Conflict should be with hard rule`).toBe('hard');
            expect(conflict.conflict, `Conflict message should mention hard rule`).toContain('override hard rule');
          }
        }
      }
    });
  });
  
  describe('3.2: Non-conflicting configurations should be accepted', () => {
    it('should accept configurations that do not conflict with hard rules', () => {
      for (const config of nonConflictingConfigs) {
        for (const layer of configLayers) {
          const layeredConfig = { ...config, layer };
          const conflicts = evaluator.detectConflicts(layeredConfig);
          
          // No conflicts should be detected for non-conflicting rules
          expect(conflicts, `Config ${JSON.stringify(layeredConfig)} should not have conflicts`).toHaveLength(0);
        }
      }
    });
  });
  
  describe('3.3: Hard rules remain unchanged after configuration attempts', () => {
    it('should preserve hard rules after detecting conflicts', () => {
      const initialRules = evaluator.getAllRules();
      const initialRuleCount = initialRules.length;
      const initialRuleIds = initialRules.map(r => r.id).sort();
      const initialDescriptions = initialRules.map(r => r.description).sort();
      
      // Test with multiple conflicting configurations
      for (const config of conflictingConfigs.slice(0, 5)) {
        // Detect conflicts (result not used in this test)
        evaluator.detectConflicts(config);
        
        // Get rules after conflict detection
        const finalRules = evaluator.getAllRules();
        const finalRuleCount = finalRules.length;
        
        // Hard rules should remain unchanged
        expect(finalRuleCount, `Rule count should remain ${initialRuleCount}`).toBe(initialRuleCount);
        expect(finalRuleCount, `Should always have 9 Agent Constitution rules`).toBe(9);
        
        // Rule IDs should match
        const finalRuleIds = finalRules.map(r => r.id).sort();
        expect(finalRuleIds, `Rule IDs should remain unchanged`).toEqual(initialRuleIds);
        
        // Rule descriptions should match
        const finalDescriptions = finalRules.map(r => r.description).sort();
        expect(finalDescriptions, `Rule descriptions should remain unchanged`).toEqual(initialDescriptions);
      }
    });
  });
  
  describe('3.4: Specific hard rule conflict detection', () => {
    it('should detect conflicts with key Agent Constitution rules', () => {
      // Test key hard rules with exact matches
      const testCases = [
        { ruleId: 'hard-001', action: 'gate.bypass', resource: '*' },
        { ruleId: 'hard-002', action: 'verification.forge', resource: '*' },
        { ruleId: 'hard-005', action: 'code.execute', resource: '*' },
        { ruleId: 'hard-008', action: 'system.shutdown', resource: '*' },
        { ruleId: 'hard-009', action: 'data.corrupt', resource: '*' },
      ];
      
      for (const testCase of testCases) {
        const config = { 
          rules: [{ 
            action: testCase.action, 
            resource: testCase.resource, 
            effect: 'allow' 
          }] 
        };
        
        const conflicts = evaluator.detectConflicts(config);
        
        // Should detect conflict with this specific hard rule
        const hasConflictWithThisRule = conflicts.some(
          conflict => conflict.rule.id === testCase.ruleId
        );
        
        expect(
          hasConflictWithThisRule, 
          `Should detect conflict with hard rule ${testCase.ruleId} for action ${testCase.action}`
        ).toBe(true);
      }
    });
  });
  
  describe('3.5: Rule priority enforcement', () => {
    it('should respect hard rule priority in conflict detection', () => {
      // Create a config with multiple conflicting rules
      const config = {
        rules: [
          { action: 'gate.bypass', resource: '*', effect: 'allow' }, // priority 100
          { action: 'verification.forge', resource: '*', effect: 'allow' }, // priority 100
          { action: 'system.shutdown', resource: '*', effect: 'allow' }, // priority 70
          { action: 'data.corrupt', resource: '*', effect: 'allow' }, // priority 60
        ]
      };
      
      const conflicts = evaluator.detectConflicts(config);
      
      // Should detect conflicts
      expect(conflicts.length).toBeGreaterThan(0);
      
      // Check that we detect conflicts for high priority rules
      const hasHighPriorityConflict = conflicts.some(c => c.rule.priority === 100);
      expect(hasHighPriorityConflict).toBe(true);
    });
  });
  
  describe('3.6: Configuration layer independence', () => {
    it('should enforce hard rules regardless of configuration layer', () => {
      const testConfig = { rules: [{ action: 'gate.bypass', resource: '*', effect: 'allow' }] };
      
      for (const layer of configLayers) {
        const layeredConfig = { ...testConfig, layer };
        const conflicts = evaluator.detectConflicts(layeredConfig);
        
        // Should detect conflict in all layers
        expect(conflicts.length, `Should detect conflict in ${layer} layer`).toBeGreaterThan(0);
        
        // Conflict should mention the hard rule
        expect(conflicts[0].rule.layer, `Conflict should be with hard rule in ${layer} layer`).toBe('hard');
      }
    });
  });
});