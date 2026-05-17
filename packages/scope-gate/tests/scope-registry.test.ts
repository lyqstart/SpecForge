import { describe, it, expect, beforeEach } from 'vitest';
import { ScopeRegistry } from '../src/scope-registry.js';
import type { CapabilityDefinition, ScopeContext } from '../src/types.js';

describe('ScopeRegistry', () => {
  let registry: ScopeRegistry;

  // Helper to create a capability definition
  function createCapability(
    id: string,
    scopeTag: 'p0' | 'p1' | 'p2',
    dependencies: string[] = []
  ): CapabilityDefinition {
    return {
      id,
      displayName: `Capability ${id}`,
      scopeTag,
      entryPoints: [],
      dependencies,
      description: `Description for ${id}`
    };
  }

  // Helper to create scope context
  function createContext(
    releaseBranch: ScopeContext['releaseBranch'] = 'v6.0',
    environment: ScopeContext['environment'] = 'production',
    featureFlags: string[] = []
  ): ScopeContext {
    return {
      releaseBranch,
      featureFlags: new Set(featureFlags),
      environment
    };
  }

  beforeEach(() => {
    registry = new ScopeRegistry();
  });

  describe('registerCapability (Task 3.1)', () => {
    it('should register a P0 capability', () => {
      const capability = createCapability('daemon', 'p0');
      
      registry.registerCapability(capability);
      
      expect(registry.hasCapability('daemon')).toBe(true);
      expect(registry.getCapability('daemon')).toEqual(capability);
    });

    it('should register a P1 capability', () => {
      const capability = createCapability('bugfix-workflow', 'p1');
      
      registry.registerCapability(capability);
      
      expect(registry.hasCapability('bugfix-workflow')).toBe(true);
    });

    it('should register a P2 capability', () => {
      const capability = createCapability('web-ui', 'p2');
      
      registry.registerCapability(capability);
      
      expect(registry.hasCapability('web-ui')).toBe(true);
    });

    it('should categorize capabilities by scope tag', () => {
      registry.registerCapability(createCapability('daemon', 'p0'));
      registry.registerCapability(createCapability('cli', 'p0'));
      registry.registerCapability(createCapability('bugfix-workflow', 'p1'));
      registry.registerCapability(createCapability('knowledge-graph', 'p1'));
      registry.registerCapability(createCapability('web-ui', 'p2'));
      
      const p0Caps = registry.getCapabilitiesByScope('p0');
      const p1Caps = registry.getCapabilitiesByScope('p1');
      const p2Caps = registry.getCapabilitiesByScope('p2');
      
      expect(p0Caps).toHaveLength(2);
      expect(p1Caps).toHaveLength(2);
      expect(p2Caps).toHaveLength(1);
    });

    it('should allow updating an existing capability', () => {
      const cap1 = createCapability('test-cap', 'p0');
      const cap2 = createCapability('test-cap', 'p1'); // Same ID, different scope
      
      registry.registerCapability(cap1);
      registry.registerCapability(cap2);
      
      const retrieved = registry.getCapability('test-cap');
      expect(retrieved?.scopeTag).toBe('p1'); // Last registration wins
    });

    it('should get all registered capabilities', () => {
      registry.registerCapability(createCapability('cap1', 'p0'));
      registry.registerCapability(createCapability('cap2', 'p1'));
      registry.registerCapability(createCapability('cap3', 'p2'));
      
      const all = registry.getAllCapabilities();
      
      expect(all).toHaveLength(3);
    });
  });

  describe('isAvailable (Task 3.2)', () => {
    beforeEach(() => {
      // Register some test capabilities
      registry.registerCapability(createCapability('daemon', 'p0'));
      registry.registerCapability(createCapability('cli', 'p0'));
      registry.registerCapability(createCapability('bugfix-workflow', 'p1'));
      registry.registerCapability(createCapability('knowledge-graph', 'p1', ['daemon']));
      registry.registerCapability(createCapability('web-ui', 'p2'));
    });

    it('should return available for P0 capability in V6.0', () => {
      const result = registry.isAvailable('daemon', createContext('v6.0'));
      
      expect(result.available).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return unavailable for P1 capability in V6.0 without flag', () => {
      const result = registry.isAvailable('bugfix-workflow', createContext('v6.0'));
      
      expect(result.available).toBe(false);
      expect(result.reason).toContain('P1 capability');
      expect(result.reason).toContain('disabled in V6.0');
      expect(result.requiredFlag).toBe('enable_bugfix-workflow');
    });

    it('should return unavailable for P2 capability in V6.0 without flag', () => {
      const result = registry.isAvailable('web-ui', createContext('v6.0'));
      
      expect(result.available).toBe(false);
      expect(result.reason).toContain('P2 capability');
      expect(result.reason).toContain('disabled in V6.0');
      expect(result.requiredFlag).toBe('enable_web-ui');
    });

    it('should return available for P1 capability with feature flag', () => {
      const result = registry.isAvailable(
        'bugfix-workflow',
        createContext('v6.0', 'production', ['enable_bugfix-workflow'])
      );
      
      expect(result.available).toBe(true);
    });

    it('should return available for P1 capability with enable_all_p1p2 flag', () => {
      const result = registry.isAvailable(
        'bugfix-workflow',
        createContext('v6.0', 'production', ['enable_all_p1p2'])
      );
      
      expect(result.available).toBe(true);
    });

    it('should return available for P1 capability in non-V6.0 branch', () => {
      const result = registry.isAvailable('bugfix-workflow', createContext('v6.1'));
      
      expect(result.available).toBe(true);
    });

    it('should return available for P1 capability in development branch', () => {
      const result = registry.isAvailable('bugfix-workflow', createContext('development'));
      
      expect(result.available).toBe(true);
    });

    it('should return unavailable for unregistered capability', () => {
      const result = registry.isAvailable('nonexistent', createContext('v6.0'));
      
      expect(result.available).toBe(false);
      expect(result.reason).toContain('not registered');
    });

    it('should work in test environment with P1 disabled by default', () => {
      const result = registry.isAvailable('bugfix-workflow', createContext('v6.0', 'test'));
      
      expect(result.available).toBe(false);
      expect(result.reason).toContain('P1');
    });

    it('should work in staging environment', () => {
      const result = registry.isAvailable('bugfix-workflow', createContext('v6.0', 'staging'));
      
      expect(result.available).toBe(false); // Still disabled in V6.0
    });

    it('should handle multiple feature flags', () => {
      registry.registerCapability(createCapability('multi-flag-cap', 'p1'));
      
      const result = registry.isAvailable(
        'multi-flag-cap',
        createContext('v6.0', 'production', ['some-other-flag', 'enable_multi-flag-cap'])
      );
      
      expect(result.available).toBe(true);
    });
  });

  describe('validateDependencies (Task 3.3)', () => {
    it('should return no errors when P0 has no dependencies', () => {
      registry.registerCapability(createCapability('p0-cap', 'p0', []));
      
      const results = registry.validateDependencies();
      
      expect(results).toHaveLength(0);
    });

    it('should return no errors when P0 depends on P0', () => {
      registry.registerCapability(createCapability('base', 'p0'));
      registry.registerCapability(createCapability('p0-cap', 'p0', ['base']));
      
      const results = registry.validateDependencies();
      
      expect(results).toHaveLength(0);
    });

    it('should return error when P0 depends on P1', () => {
      registry.registerCapability(createCapability('p1-cap', 'p1'));
      registry.registerCapability(createCapability('p0-cap', 'p0', ['p1-cap']));
      
      const results = registry.validateDependencies();
      
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('error');
      expect(results[0].code).toBe('p0_depends_on_p1');
      expect(results[0].message).toContain('p0-cap');
      expect(results[0].message).toContain('p1-cap');
    });

    it('should return error when P0 depends on P2', () => {
      registry.registerCapability(createCapability('p2-cap', 'p2'));
      registry.registerCapability(createCapability('p0-cap', 'p0', ['p2-cap']));
      
      const results = registry.validateDependencies();
      
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('error');
      expect(results[0].code).toBe('p0_depends_on_p2');
      expect(results[0].message).toContain('p0-cap');
      expect(results[0].message).toContain('p2-cap');
    });

    it('should return multiple errors for multiple violations', () => {
      registry.registerCapability(createCapability('p1-a', 'p1'));
      registry.registerCapability(createCapability('p1-b', 'p1'));
      registry.registerCapability(createCapability('p0-a', 'p0', ['p1-a']));
      registry.registerCapability(createCapability('p0-b', 'p0', ['p1-b']));
      
      const results = registry.validateDependencies();
      
      expect(results).toHaveLength(2);
    });

    it('should return no errors for P1 depending on P2', () => {
      registry.registerCapability(createCapability('p2-cap', 'p2'));
      registry.registerCapability(createCapability('p1-cap', 'p1', ['p2-cap']));
      
      const results = registry.validateDependencies();
      
      // P1 can depend on P2 (not the other way around)
      expect(results).toHaveLength(0);
    });

    it('should return no errors for P1 depending on P1', () => {
      registry.registerCapability(createCapability('p1-a', 'p1'));
      registry.registerCapability(createCapability('p1-b', 'p1', ['p1-a']));
      
      const results = registry.validateDependencies();
      
      expect(results).toHaveLength(0);
    });

    it('should handle transitive dependencies', () => {
      // P0 -> P1 -> P2 is a violation because P0 ultimately depends on P1
      registry.registerCapability(createCapability('p2-cap', 'p2'));
      registry.registerCapability(createCapability('p1-cap', 'p1', ['p2-cap']));
      registry.registerCapability(createCapability('p0-cap', 'p0', ['p1-cap']));
      
      const results = registry.validateDependencies();
      
      // Direct dependency from P0 to P1 is caught
      expect(results).toHaveLength(1);
      expect(results[0].code).toBe('p0_depends_on_p1');
    });

    it('should include context in validation result', () => {
      registry.registerCapability(createCapability('p1-cap', 'p1'));
      registry.registerCapability(createCapability('p0-cap', 'p0', ['p1-cap']));
      
      const results = registry.validateDependencies();
      
      expect(results[0].context).toBeDefined();
      expect(results[0].context?.capabilityId).toBe('p0-cap');
      expect(results[0].context?.dependencyId).toBe('p1-cap');
    });

    it('should skip validation for unknown dependencies', () => {
      registry.registerCapability(createCapability('p0-cap', 'p0', ['unknown-cap']));
      
      const results = registry.validateDependencies();
      
      // Unknown dependency is not an error (it might be an external capability)
      expect(results).toHaveLength(0);
    });
  });

  describe('getCapabilitiesByScope', () => {
    it('should return empty array for unknown scope', () => {
      const results = registry.getCapabilitiesByScope('p0');
      
      expect(results).toEqual([]);
    });

    it('should return capabilities sorted by registration order', () => {
      registry.registerCapability(createCapability('first', 'p0'));
      registry.registerCapability(createCapability('second', 'p0'));
      registry.registerCapability(createCapability('third', 'p0'));
      
      const results = registry.getCapabilitiesByScope('p0');
      
      expect(results.map(c => c.id)).toEqual(['first', 'second', 'third']);
    });
  });

  describe('getCapability', () => {
    it('should return undefined for non-existent capability', () => {
      const result = registry.getCapability('nonexistent');
      
      expect(result).toBeUndefined();
    });
  });

  describe('hasCapability', () => {
    it('should return false for non-existent capability', () => {
      expect(registry.hasCapability('nonexistent')).toBe(false);
    });
  });

  describe('getAllCapabilities', () => {
    it('should return empty array when no capabilities registered', () => {
      const results = registry.getAllCapabilities();
      
      expect(results).toEqual([]);
    });
  });
});