import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ScopeRegistry 
} from '../src/scope-registry.js';
import { 
  RuntimeScopeChecker 
} from '../src/runtime-checker.js';
import type { CapabilityDefinition, ScopeContext } from '../src/types.js';
import {
  ScopeError,
  ScopeBoundaryViolationError,
  CapabilityUnavailableError,
  DependencyError,
  ConfigurationError
} from '../src/types.js';

describe('RuntimeScopeChecker', () => {
  let registry: ScopeRegistry;
  let checker: RuntimeScopeChecker;

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
    // Register test capabilities
    registry.registerCapability(createCapability('daemon', 'p0'));
    registry.registerCapability(createCapability('cli', 'p0'));
    registry.registerCapability(createCapability('bugfix-workflow', 'p1'));
    registry.registerCapability(createCapability('knowledge-graph', 'p1'));
    registry.registerCapability(createCapability('web-ui', 'p2'));
    
    checker = new RuntimeScopeChecker(registry, createContext('v6.0', 'production'));
  });

  describe('constructor (Task 4.1)', () => {
    it('should initialize with registry and initial context', () => {
      const context = createContext('v6.0', 'development');
      const checker = new RuntimeScopeChecker(registry, context);
      
      const currentContext = checker.getCurrentContext();
      expect(currentContext.releaseBranch).toBe('v6.0');
      expect(currentContext.environment).toBe('development');
    });
  });

  describe('getCurrentContext (Task 4.2)', () => {
    it('should return a copy of current context', () => {
      const context = checker.getCurrentContext();
      
      expect(context).toEqual({
        releaseBranch: 'v6.0',
        environment: 'production',
        featureFlags: new Set()
      });
    });

    it('should not expose internal Set reference', () => {
      const context = checker.getCurrentContext();
      
      // Modifying the returned Set should not affect internal state
      context.featureFlags.add('test-flag');
      
      const secondContext = checker.getCurrentContext();
      expect(secondContext.featureFlags.has('test-flag')).toBe(false);
    });
  });

  describe('checkCapability (Task 4.2)', () => {
    it('should not throw for available P0 capability', () => {
      expect(() => {
        checker.checkCapability('daemon', createContext('v6.0'));
      }).not.toThrow();
    });

    it('should throw ScopeBoundaryViolationError for P1 in V6.0 without flag', () => {
      expect(() => {
        checker.checkCapability('bugfix-workflow', createContext('v6.0'));
      }).toThrow(ScopeBoundaryViolationError);
    });

    it('should throw ScopeBoundaryViolationError for P2 in V6.0 without flag', () => {
      expect(() => {
        checker.checkCapability('web-ui', createContext('v6.0'));
      }).toThrow(ScopeBoundaryViolationError);
    });

    it('should not throw for P1 when feature flag is enabled', () => {
      const context = createContext('v6.0', 'production', ['enable_bugfix-workflow']);
      
      expect(() => {
        checker.checkCapability('bugfix-workflow', context);
      }).not.toThrow();
    });

    it('should not throw for P1 in non-V6.0 branch', () => {
      expect(() => {
        checker.checkCapability('bugfix-workflow', createContext('v6.1'));
      }).not.toThrow();
    });

    it('should not throw for P1 in development branch', () => {
      expect(() => {
        checker.checkCapability('bugfix-workflow', createContext('development'));
      }).not.toThrow();
    });

    it('should throw CapabilityUnavailableError for unregistered capability', () => {
      expect(() => {
        checker.checkCapability('nonexistent', createContext('v6.0'));
      }).toThrow(CapabilityUnavailableError);
    });
  });

  describe('checkCapabilities (Task 4.2)', () => {
    it('should return available=true for all available capabilities', () => {
      const results = checker.checkCapabilities(['daemon', 'cli'], createContext('v6.0'));
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.available)).toBe(true);
    });

    it('should return available=false with error for unavailable capabilities', () => {
      const results = checker.checkCapabilities(
        ['daemon', 'bugfix-workflow'],
        createContext('v6.0')
      );
      
      expect(results[0].available).toBe(true);
      expect(results[1].available).toBe(false);
      expect(results[1].error).toBeInstanceOf(ScopeError);
    });

    it('should include capabilityId in each result', () => {
      const results = checker.checkCapabilities(['daemon', 'cli'], createContext('v6.0'));
      
      expect(results[0].capabilityId).toBe('daemon');
      expect(results[1].capabilityId).toBe('cli');
    });

    it('should handle empty array', () => {
      const results = checker.checkCapabilities([], createContext('v6.0'));
      
      expect(results).toEqual([]);
    });

    it('should preserve order of input capabilityIds', () => {
      const results = checker.checkCapabilities(
        ['cli', 'daemon', 'bugfix-workflow'],
        createContext('v6.0')
      );
      
      expect(results[0].capabilityId).toBe('cli');
      expect(results[1].capabilityId).toBe('daemon');
      expect(results[2].capabilityId).toBe('bugfix-workflow');
    });
  });

  describe('checkAll (Task 4.2)', () => {
    it('should check all registered capabilities', () => {
      const results = checker.checkAll(createContext('v6.0'));
      
      // 5 capabilities registered: daemon, cli, bugfix-workflow, knowledge-graph, web-ui
      expect(results).toHaveLength(5);
    });

    it('should return unavailable results for P1/P2 in V6.0', () => {
      const results = checker.checkAll(createContext('v6.0'));
      
      const p1Results = results.filter(r => r.capabilityId === 'bugfix-workflow' || r.capabilityId === 'knowledge-graph');
      const p2Results = results.filter(r => r.capabilityId === 'web-ui');
      
      expect(p1Results.every(r => !r.available)).toBe(true);
      expect(p2Results.every(r => !r.available)).toBe(true);
    });

    it('should return all available when feature flag enables P1/P2', () => {
      const results = checker.checkAll(createContext('v6.0', 'production', ['enable_all_p1p2']));
      
      expect(results.every(r => r.available)).toBe(true);
    });
  });

  describe('guardCapability decorator (Task 4.1)', () => {
    it('should return a MethodDecorator function', () => {
      const decorator = checker.guardCapability('test-capability');
      
      expect(typeof decorator).toBe('function');
      expect(decorator.length).toBe(3); // target, propertyKey, descriptor
    });

    it('should wrap original method with scope check', async () => {
      // Set up checker on global for the decorator to find
      (globalThis as any).scopeChecker = checker;
      
      let originalCalled = false;
      
      // Create a plain object with the method to avoid class decorator issues in test
      const target = {
        testMethod() {
          originalCalled = true;
          return 'result';
        }
      };
      
      const descriptor: PropertyDescriptor = {
        value: function(...args: unknown[]) {
          return (target as any).testMethod(...args);
        }
      };
      const decorator = checker.guardCapability('daemon');
      const newDescriptor = decorator(target, 'testMethod', descriptor);
      
      // Call the wrapped method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (newDescriptor as any).value.call(target);
      
      expect(result).toBe('result');
      expect(originalCalled).toBe(true);
      
      // Cleanup
      delete (globalThis as any).scopeChecker;
    });

    it('should throw when capability is not available', () => {
      (globalThis as any).scopeChecker = checker;
      
      const target = {
        testMethod() {
          return 'should not reach here';
        }
      };
      
      const descriptor: PropertyDescriptor = {
        value: function(...args: unknown[]) {
          return (target as any).testMethod(...args);
        }
      };
      const decorator = checker.guardCapability('bugfix-workflow');
      const newDescriptor = decorator(target, 'testMethod', descriptor);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => (newDescriptor as any).value.call(target)).toThrow(ScopeBoundaryViolationError);
      
      // Cleanup
      delete (globalThis as any).scopeChecker;
    });

    it('should allow setting checker on instance', () => {
      (globalThis as any).scopeChecker = undefined;
      
      const target: any = {};
      target.scopeChecker = checker;
      
      const descriptor: PropertyDescriptor = {
        value: function() {
          return 'test';
        }
      };
      
      const decorator = checker.guardCapability('bugfix-workflow');
      const newDescriptor = decorator(target, 'testMethod', descriptor);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => (newDescriptor as any).value.call(target)).toThrow(ScopeBoundaryViolationError);
    });
  });

  describe('updateContext (Task 4.2)', () => {
    it('should update context partially', () => {
      checker.updateContext({ environment: 'development' });
      
      const context = checker.getCurrentContext();
      expect(context.environment).toBe('development');
      expect(context.releaseBranch).toBe('v6.0'); // unchanged
    });

    it('should add feature flags via context update', () => {
      checker.updateContext({ 
        featureFlags: new Set(['enable_test']) 
      });
      
      const context = checker.getCurrentContext();
      expect(context.featureFlags.has('enable_test')).toBe(true);
    });
  });

  describe('enableFeatureFlag / disableFeatureFlag (Task 4.2)', () => {
    it('should enable feature flag', () => {
      checker.enableFeatureFlag('test-flag');
      
      expect(checker.isFeatureFlagEnabled('test-flag')).toBe(true);
    });

    it('should disable feature flag', () => {
      checker.enableFeatureFlag('test-flag');
      checker.disableFeatureFlag('test-flag');
      
      expect(checker.isFeatureFlagEnabled('test-flag')).toBe(false);
    });

    it('should work with checkCapability', () => {
      checker.enableFeatureFlag('enable_bugfix-workflow');
      
      // Should not throw now
      expect(() => {
        checker.checkCapability('bugfix-workflow', checker.getCurrentContext());
      }).not.toThrow();
    });
  });

  describe('isFeatureFlagEnabled (Task 4.2)', () => {
    it('should return false for non-existent flag', () => {
      expect(checker.isFeatureFlagEnabled('nonexistent')).toBe(false);
    });

    it('should return true for enabled flag', () => {
      checker.enableFeatureFlag('my-flag');
      expect(checker.isFeatureFlagEnabled('my-flag')).toBe(true);
    });
  });
});

describe('Error Classes (Task 4.3)', () => {
  describe('ScopeBoundaryViolationError', () => {
    it('should have correct code and name', () => {
      const error = new ScopeBoundaryViolationError('test-cap', 'p1', 'enable_test-cap');
      
      expect(error.code).toBe('SCOPE_BOUNDARY_VIOLATION');
      expect(error.name).toBe('ScopeBoundaryViolationError');
      expect(error.capabilityId).toBe('test-cap');
      expect(error.scopeTag).toBe('p1');
      expect(error.requiredFlag).toBe('enable_test-cap');
    });

    it('should include message about P1', () => {
      const error = new ScopeBoundaryViolationError('test-cap', 'p1');
      expect(error.message).toContain('P1');
    });

    it('should include message about P2', () => {
      const error = new ScopeBoundaryViolationError('test-cap', 'p2');
      expect(error.message).toContain('P2');
    });

    it('should include feature flag hint when provided', () => {
      const error = new ScopeBoundaryViolationError('test-cap', 'p1', 'enable_test-cap');
      expect(error.message).toContain('enable_test-cap');
    });
  });

  describe('CapabilityUnavailableError', () => {
    it('should have correct code and name', () => {
      const error = new CapabilityUnavailableError('test-cap', 'p1', 'enable_test-cap');
      
      expect(error.code).toBe('CAPABILITY_UNAVAILABLE');
      expect(error.name).toBe('CapabilityUnavailableError');
      expect(error.capabilityId).toBe('test-cap');
      expect(error.requiredFlag).toBe('enable_test-cap');
    });

    it('should include default message when no flag provided', () => {
      const error = new CapabilityUnavailableError('test-cap', 'p1');
      expect(error.message).toContain('Contact your administrator');
    });

    it('should include feature flag hint when provided', () => {
      const error = new CapabilityUnavailableError('test-cap', 'p1', 'enable_test-cap');
      expect(error.message).toContain('enable_test-cap');
    });
  });

  describe('DependencyError', () => {
    it('should include dependency information', () => {
      const error = new DependencyError('main-cap', 'dep-cap', 'p1');
      
      expect(error.name).toBe('DependencyError');
      expect(error.capabilityId).toBe('main-cap');
      expect(error.dependencyId).toBe('dep-cap');
      expect(error.scopeTag).toBe('p1');
    });

    it('should mention dependency in message', () => {
      const error = new DependencyError('main-cap', 'dep-cap', 'p1');
      expect(error.message).toContain('main-cap');
      expect(error.message).toContain('dep-cap');
    });
  });

  describe('ConfigurationError', () => {
    it('should include config key information', () => {
      const error = new ConfigurationError('Invalid config', 'test-cap', 'myConfigKey');
      
      expect(error.name).toBe('ConfigurationError');
      expect(error.configKey).toBe('myConfigKey');
      expect(error.message).toContain('Invalid config');
    });

    it('should default to p0 scopeTag for config errors', () => {
      const error = new ConfigurationError('Config error', 'test-cap');
      expect(error.scopeTag).toBe('p0');
    });
  });

  describe('ScopeError base class', () => {
    it('should be the base class for all specialized errors', () => {
      const boundaryError = new ScopeBoundaryViolationError('cap', 'p1');
      const capabilityError = new CapabilityUnavailableError('cap', 'p1');
      const depError = new DependencyError('cap', 'dep', 'p1');
      const configError = new ConfigurationError('msg', 'cap');
      
      expect(boundaryError).toBeInstanceOf(ScopeError);
      expect(capabilityError).toBeInstanceOf(ScopeError);
      expect(depError).toBeInstanceOf(ScopeError);
      expect(configError).toBeInstanceOf(ScopeError);
    });
  });
});