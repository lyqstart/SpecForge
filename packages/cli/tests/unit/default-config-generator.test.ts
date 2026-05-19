/**
 * Unit tests for default-config-generator
 * 
 * Tests the generation of default config.yaml with:
 * - schema_version at the top
 * - All P1/P2 flags set to false
 * - Valid YAML format
 */

import { describe, it, expect } from 'vitest';
import { generateDefaultConfig, validateGeneratedYaml } from '../../src/distribution/default-config-generator';
import scopeGateExports from '../../src/distribution/scope-gate-bridge';

describe('default-config-generator', () => {
  describe('generateDefaultConfig', () => {
    it('should generate valid YAML string', () => {
      const yaml = generateDefaultConfig();
      
      expect(yaml).toBeTruthy();
      expect(typeof yaml).toBe('string');
      expect(yaml.length).toBeGreaterThan(0);
    });
    
    it('should have schema_version as first line', () => {
      const yaml = generateDefaultConfig();
      const lines = yaml.split('\n').filter(line => line.trim().length > 0);
      
      expect(lines[0]).toMatch(/^schema_version:\s*"?1\.0"?/);
    });
    
    it('should set all P1/P2 flags to false', () => {
      const yaml = generateDefaultConfig();
      const p1p2FlagKeys = scopeGateExports.p1p2FlagKeys;
      
      for (const flagKey of p1p2FlagKeys) {
        // Check that the flag exists and is set to false
        const flagPattern = new RegExp(`${flagKey}:\\s*false`, 'm');
        expect(yaml).toMatch(flagPattern);
      }
    });
    
    it('should include default configuration values', () => {
      const yaml = generateDefaultConfig();
      
      // Check for some expected default config keys
      expect(yaml).toContain('logLevel:');
      expect(yaml).toContain('cacheEnabled:');
      expect(yaml).toContain('timeoutMs:');
    });
    
    it('should end with newline', () => {
      const yaml = generateDefaultConfig();
      
      expect(yaml.endsWith('\n')).toBe(true);
    });
  });
  
  describe('validateGeneratedYaml', () => {
    it('should validate correct YAML', () => {
      const yaml = generateDefaultConfig();
      const result = validateGeneratedYaml(yaml);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should detect missing schema_version at top', () => {
      const yaml = 'logLevel: "info"\nschema_version: "1.0"\n';
      const result = validateGeneratedYaml(yaml);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('First line'))).toBe(true);
    });
    
    it('should detect wrong schema_version value', () => {
      const yaml = 'schema_version: "2.0"\nlogLevel: "info"\n';
      const result = validateGeneratedYaml(yaml);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('schema_version must be'))).toBe(true);
    });
    
    it('should detect missing P1/P2 flags', () => {
      const yaml = 'schema_version: "1.0"\nlogLevel: "info"\n';
      const result = validateGeneratedYaml(yaml);
      const p1p2FlagKeys = scopeGateExports.p1p2FlagKeys;
      
      if (p1p2FlagKeys.length > 0) {
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('P1/P2 flag'))).toBe(true);
      }
    });
  });
});

