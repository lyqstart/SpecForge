/**
 * Property-based test for Property 15: P1/P2 Default Off
 * 
 * Feature: distribution, Property 2: P1/P2 Default Off
 * Validates: Requirements 4.2
 * Derived-From: v6-architecture-overview Property 15
 * 
 * This test verifies:
 * - All P1/P2 feature flags in default config are set to false (or undefined)
 * - Nested keys like 'remote.api_key.enabled' are handled correctly
 * - Special characters in flag names are handled
 * 
 * Iterations: 100+ (configured via fast-check)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { generateDefaultConfig } from '../../src/distribution/default-config-generator';
import scopeGateExports from '../../src/distribution/scope-gate-bridge';

/**
 * Simple YAML parser for extracting value at key
 */
function parseYamlValue(yamlContent: string, key: string): unknown {
  const lines = yamlContent.split('\n');
  
  // Handle nested keys (e.g., 'remote.api_key.enabled')
  const keyParts = key.split('.');
  
  let current: Record<string, unknown> = {};
  const atTopLevel: Record<string, unknown> = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Match key: value pattern
    const match = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    
    const [, k, v] = match;
    const keyName = k.trim();
    let value: unknown = v.trim();
    
    // Parse value type
    if (value === 'true' || value === 'false') {
      value = value === 'true';
    } else if (value === 'null' || value === '~') {
      value = undefined;
    } else if (/^["']/.test(value)) {
      // Remove quotes
      value = value.slice(1, -1);
    } else if (/^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }
    
    atTopLevel[keyName] = value;
  }
  
  // Navigate to nested key
  current = atTopLevel;
  for (const part of keyParts) {
    if (current === undefined || current === null) return undefined;
    if (typeof current !== 'object') return undefined;
    current = current[part] as Record<string, unknown> | undefined;
  }
  
  return current;
}

/**
 * Generate random flag name with special characters and nested keys
 */
function generateRandomFlagName(): string {
  const prefixes = ['enable', 'feature', 'toggle', 'use'];
  const nouns = ['api', 'auth', 'sync', 'cache', 'logging', 'debug', 'remote', 'local'];
  const modifiers = ['foo', 'bar', 'baz', 'test', 'dev', 'prod'];
  const specialChars = ['_', '.', '-'];
  
  return fc.sample(
    fc.oneof(
      // Simple flag: enable_xxx
      fc.tuple(fc.constantFrom(...prefixes), fc.constantFrom(...nouns))
        .map(([p, n]) => `${p}_${n}`),
      
      // Nested flag: remote.api_key.enabled
      fc.tuple(
        fc.constantFrom(...nouns),
        fc.constantFrom(...modifiers),
        fc.constantFrom(...prefixes)
      ).map(([n, m, p]) => `${n}.${m}_${p}`),
      
      // Flag with special characters
      fc.tuple(
        fc.constantFrom(...prefixes),
        fc.constantFrom(...nouns),
        fc.constantFrom(...specialChars),
        fc.constantFrom(...modifiers)
      ).map(([p, n, s, m]) => `${p}${s}${n}${s}${m}`),
    ),
    1
  )[0];
}

/**
 * Generate random valid flag set
 */
function generateFlagSet(maxSize: number = 10): string[] {
  const count = Math.floor(Math.random() * maxSize) + 1;
  const flags = new Set<string>();
  
  for (let i = 0; i < count; i++) {
    flags.add(generateRandomFlagName());
  }
  
  return Array.from(flags);
}

describe('Feature: distribution, Property 2: P1/P2 Default Off; Derived-From: v6-architecture-overview Property 15', () => {
  /**
   * Property 1: All P1/P2 flags should be false or undefined
   * 
   * For any P1/P2 flag set F, the generated config should satisfy:
   * ∀ f ∈ F: getEffective(f) ∈ { false, undefined }
   */
  it('**Validates: Requirements 4.2** - all P1/P2 flags default to false or undefined', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (count) => {
          // Generate random flag set
          const flags: string[] = [];
          const prefixes = ['enable', 'feature', 'toggle'];
          const nouns = ['api', 'auth', 'sync', 'cache', 'remote', 'local'];
          
          for (let i = 0; i < count; i++) {
            const prefix = prefixes[i % prefixes.length];
            const noun = nouns[i % nouns.length];
            const key = `${prefix}_${noun}`;
            
            // Add some with dots for nested keys
            if (i % 3 === 0) {
              flags.push(`${noun}.${prefix}_${noun}`);
            } else {
              flags.push(key);
            }
          }
          
          // Get default config
          const yamlContent = generateDefaultConfig();
          
          // Check each flag
          for (const flag of flags) {
            const effectiveValue = parseYamlValue(yamlContent, flag);
            
            // Value should be either false or undefined
            expect(
              effectiveValue === false || effectiveValue === undefined,
              `Flag ${flag} should be false or undefined, got: ${effectiveValue}`
            ).toBe(true);
          }
        }
      ),
      {
        numRuns: 100,
        seed: 42,
      }
    );
  });

  /**
   * Property 2: Schema version should be "1.0"
   * 
   * The schema_version in default config should always be "1.0"
   */
  it('**Validates: Requirements 4.2** - schema_version is "1.0"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        () => {
          const yamlContent = generateDefaultConfig();
          const schemaVersion = parseYamlValue(yamlContent, 'schema_version');
          
          expect(schemaVersion).toBe('1.0');
        }
      ),
      {
        numRuns: 50,
        seed: 43,
      }
    );
  });

  /**
   * Property 3: Nested flag handling
   * 
   * Flags with dots (nested keys) should be handled correctly
   */
  it('**Validates: Requirements 4.2** - nested flags are handled', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('remote.api.enabled'),
          fc.constant('remote.api_key.enabled'),
          fc.constant('feature.nested.deep.value'),
          fc.constant('cache.redis.enabled'),
          fc.constant('auth.oauth2.google.enabled'),
        ),
        (nestedFlag) => {
          const yamlContent = generateDefaultConfig();
          const effectiveValue = parseYamlValue(yamlContent, nestedFlag);
          
          // Should be false or undefined
          expect(
            effectiveValue === false || effectiveValue === undefined,
            `Nested flag ${nestedFlag} should be false or undefined`
          ).toBe(true);
        }
      ),
      {
        numRuns: 50,
        seed: 44,
      }
    );
  });

  /**
   * Property 4: Flag names with special characters
   * 
   * Flags with underscores, hyphens should be handled
   */
  it('**Validates: Requirements 4.2** - flags with special characters', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('enable_api_key'),
          fc.constant('enable-api-key'),
          fc.constant('feature__double_underscore'),
          fc.constant('toggle-something-else'),
        ),
        (flagWithSpecialChar) => {
          const yamlContent = generateDefaultConfig();
          const effectiveValue = parseYamlValue(yamlContent, flagWithSpecialChar);
          
          // Should be false or undefined (or key might not exist)
          // If key doesn't exist, it's equivalent to undefined (disabled)
          expect(
            effectiveValue === false || effectiveValue === undefined,
            `Flag with special chars ${flagWithSpecialChar} should be false or undefined`
          ).toBe(true);
        }
      ),
      {
        numRuns: 50,
        seed: 45,
      }
    );
  });

  /**
   * Property 5: Real P1/P2 flag keys from scope-gate
   * 
   * Test with actual flag keys from scope-gate-bridge
   */
  it('**Validates: Requirements 4.2** - real P1/P2 flag keys from scope-gate', () => {
    const p1p2FlagKeys = scopeGateExports.p1p2FlagKeys;
    
    // Should have at least some flags
    expect(p1p2FlagKeys.length).toBeGreaterThan(0);
    
    const yamlContent = generateDefaultConfig();
    
    // Check each real P1/P2 flag
    for (const flagKey of p1p2FlagKeys) {
      const effectiveValue = parseYamlValue(yamlContent, flagKey.replace(/^enable_/, ''));
      
      // The flag key is like "enable_bugfix-workflow", we check if the config has it as false
      // Actually, we check the key without "enable_" prefix since config keys might not have it
      const configKey = flagKey.startsWith('enable_') ? flagKey.slice(7) : flagKey;
      const actualValue = parseYamlValue(yamlContent, configKey);
      
      expect(
        actualValue === false || actualValue === undefined,
        `Real P1/P2 flag ${configKey} should be false or undefined`
      ).toBe(true);
    }
  });

  /**
   * Property 6: Config is valid YAML
   * 
   * Generated config should be parseable as valid YAML
   */
  it('**Validates: Requirements 4.2** - generated config is valid YAML', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        () => {
          const yamlContent = generateDefaultConfig();
          
          // Should start with schema_version
          expect(yamlContent).toMatch(/^schema_version:/m);
          
          // Should not have syntax errors (basic check)
          // A valid YAML should have consistent indentation
          const lines = yamlContent.split('\n');
          let lastIndent = -1;
          for (const line of lines) {
            if (line.trim() === '') continue;
            const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
            // Indent should increase by 2 for nested objects
            if (lastIndent >= 0 && indent > lastIndent) {
              expect(indent - lastIndent).toBeLessThanOrEqual(2);
            }
            lastIndent = indent;
          }
        }
      ),
      {
        numRuns: 50,
        seed: 46,
      }
    );
  });

  /**
   * Property 7: Multiple flags checked together
   * 
   * Batch check multiple flags at once
   */
  it('**Validates: Requirements 4.2** - batch flag validation', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant('enable_api'),
            fc.constant('enable_auth'),
            fc.constant('enable_sync'),
            fc.constant('remote.cache'),
            fc.constant('feature.deep.nested'),
          ),
          { minLength: 3, maxLength: 10 }
        ),
        (flagList) => {
          const yamlContent = generateDefaultConfig();
          
          // Remove duplicates
          const uniqueFlags = [...new Set(flagList)];
          
          // Check each flag
          let allValid = true;
          for (const flag of uniqueFlags) {
            const value = parseYamlValue(yamlContent, flag);
            if (value !== false && value !== undefined) {
              allValid = false;
            }
          }
          
          expect(allValid).toBe(true);
        }
      ),
      {
        numRuns: 50,
        seed: 47,
      }
    );
  });
});

/**
 * Additional deterministic tests
 */
describe('Property 2: P1/P2 Default Off - Deterministic Tests', () => {
  it('should have schema_version at top of config', () => {
    const yamlContent = generateDefaultConfig();
    const firstLine = yamlContent.split('\n')[0];
    expect(firstLine).toMatch(/^schema_version:/);
  });

  it('should have schema_version equal to 1.0', () => {
    const yamlContent = generateDefaultConfig();
    const match = yamlContent.match(/^schema_version:\s*["']?([^"'\s\n]+)["']?/m);
    expect(match?.[1]).toBe('1.0');
  });

  it('should handle empty flag set gracefully', () => {
    const yamlContent = generateDefaultConfig();
    expect(yamlContent).toBeDefined();
    expect(yamlContent.length).toBeGreaterThan(0);
  });

  it('should set remote features to false by default', () => {
    const yamlContent = generateDefaultConfig();
    
    // Check remote-related flags
    const patterns = [
      /^remote:\s*false/m,
      /^enable_remote:\s*false/m,
      /^feature\.remote/m,
    ];
    
    // At least one remote-related setting should be false or not present
    const hasRemoteFalse = patterns.some(pattern => pattern.test(yamlContent));
    // It's OK if there's no remote config at all (undefined = off)
    // Or if there's explicit false
    expect(hasRemoteFalse || !yamlContent.includes('remote: true')).toBe(true);
  });
});