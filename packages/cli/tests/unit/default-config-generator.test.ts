/**
 * Unit tests for default-config-generator
 * 
 * Tests the generation of default config.yaml with:
 * - schema_version at the top
 * - No runtime feature flags for capabilities outside the release boundary
 * - Valid YAML format
 */

import { describe, it, expect } from 'vitest';
import { generateDefaultConfig, validateGeneratedYaml } from '../../src/distribution/default-config-generator';

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
    
    it('should not expose runtime feature flags for out-of-release capabilities', () => {
      const yaml = generateDefaultConfig();

      expect(yaml).not.toMatch(/^enable_[^:]+\s*:/m);
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
    
    it('should reject runtime feature flags outside the current release boundary', () => {
      const yaml = 'schema_version: "1.0"\nenable_legacy_capability: false\n';
      const result = validateGeneratedYaml(yaml);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Runtime feature flag'))).toBe(true);
    });
  });
});
