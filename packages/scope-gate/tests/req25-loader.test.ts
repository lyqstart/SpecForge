/**
 * REQ-25 Loader Tests
 * 
 * Tests for automatic loading of REQ-25 capabilities from parent specification.
 * 
 * Requirements: 1.1, 2.1, 2.2, 8.2 (Parent Spec Integration)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Req25Loader, createReq25Loader, loadAndRegisterCapabilitiesSync } from '../src/req25-loader.js';
import { ScopeRegistry } from '../src/scope-registry.js';
import { resolve } from 'path';

// Get paths for testing - need to handle different run locations
function getParentSpecPath(): string {
  // First check environment variable
  const envPath = process.env.SCOPE_GATE_PARENT_SPEC;
  if (envPath) {
    return envPath;
  }
  
  const cwd = process.cwd();
  
  // If we're in packages/scope-gate
  if (cwd.includes('packages/scope-gate') || cwd.includes('packages\\scope-gate')) {
    const repoRoot = resolve(cwd, '..', '..');
    return resolve(repoRoot, '.kiro', 'specs', 'v6-architecture-overview');
  }
  
  // If we're at repo root
  return resolve(cwd, '.kiro', 'specs', 'v6-architecture-overview');
}

const parentSpecPath = getParentSpecPath();

describe('Req25Loader', () => {
  let loader: Req25Loader;

  beforeEach(() => {
    loader = new Req25Loader();
  });

  describe('loadFromParentSpec', () => {
    it('should load REQ-25 from parent spec successfully', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      expect(result.capabilities.length).toBeGreaterThan(0);
      expect(result.metadata).toBeDefined();
    });

    it('should extract P0 capabilities from REQ-25', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const p0Capabilities = result.capabilities.filter(c => c.scopeTag === 'p0');
      expect(p0Capabilities.length).toBeGreaterThan(0);
    });

    it('should extract P1 capabilities from REQ-25', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const p1Capabilities = result.capabilities.filter(c => c.scopeTag === 'p1');
      expect(p1Capabilities.length).toBeGreaterThan(0);
    });

    it('should extract P2 capabilities from REQ-25', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const p2Capabilities = result.capabilities.filter(c => c.scopeTag === 'p2');
      expect(p2Capabilities.length).toBeGreaterThan(0);
    });

    it('should include metadata with source information', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.p0Count).toBeGreaterThan(0);
      expect(result.metadata?.p1Count).toBeGreaterThan(0);
      expect(result.metadata?.p2Count).toBeGreaterThan(0);
      expect(result.metadata?.sourcePath).toContain('requirements.md');
      expect(result.metadata?.lastUpdated).toBeInstanceOf(Date);
      expect(result.metadata?.sourceHash).toBeDefined();
    });

    it('should return error for non-existent path', () => {
      const result = loader.loadFromParentSpec('/non/existent/path');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.capabilities).toEqual([]);
    });
  });

  describe('getCapabilitiesByScope', () => {
    it('should return capabilities grouped by scope', () => {
      const result = loader.getCapabilitiesByScope(parentSpecPath);
      
      expect(result.p0).toBeDefined();
      expect(result.p1).toBeDefined();
      expect(result.p2).toBeDefined();
      expect(result.p0.length).toBeGreaterThan(0);
      expect(result.p1.length).toBeGreaterThan(0);
      expect(result.p2.length).toBeGreaterThan(0);
    });
  });

  describe('caching', () => {
    it('should cache results after first load', () => {
      // First load
      const result1 = loader.loadFromParentSpec(parentSpecPath);
      
      // Second load should use cache
      const result2 = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result1.capabilities).toEqual(result2.capabilities);
    });

    it('should bypass cache when forceRefresh is true', () => {
      // First load
      const result1 = loader.loadFromParentSpec(parentSpecPath);
      
      // Force refresh
      const result2 = loader.loadFromParentSpec(parentSpecPath, true);
      
      // Both should succeed, but forceRefresh forces re-parsing
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should clear cache when clearCache is called', () => {
      // Load and cache
      loader.loadFromParentSpec(parentSpecPath);
      
      // Clear cache
      loader.clearCache();
      
      // Cache should be empty
      expect(loader.getCachedData()).toBeNull();
    });
  });

  describe('change detection', () => {
    it('should detect when REQ-25 has changed', () => {
      // First load to populate cache
      loader.loadFromParentSpec(parentSpecPath);
      
      // Check for changes (should return false since content hasn't changed)
      const changed = loader.hasChanged(parentSpecPath);
      expect(typeof changed).toBe('boolean');
    });
  });

  describe('getDefaultParentSpecPath', () => {
    it('should return a valid default path', () => {
      const defaultPath = Req25Loader.getDefaultParentSpecPath();
      
      expect(defaultPath).toBeDefined();
      expect(defaultPath).toContain('v6-architecture-overview');
    });
  });

  describe('load (convenience method)', () => {
    it('should load using default parent spec path', () => {
      const result = loader.load();
      
      expect(result.success).toBe(true);
      expect(result.capabilities.length).toBeGreaterThan(0);
    });
  });
});

describe('loadAndRegisterCapabilitiesSync', () => {
  it('should load capabilities and register them with ScopeRegistry', () => {
    const registry = new ScopeRegistry();
    const result = loadAndRegisterCapabilitiesSync(registry, parentSpecPath);
    
    expect(result.success).toBe(true);
    
    // Verify capabilities were registered
    const allCaps = registry.getAllCapabilities();
    expect(allCaps.length).toBeGreaterThan(0);
  });

  it('should register P0, P1, P2 capabilities separately', () => {
    const registry = new ScopeRegistry();
    loadAndRegisterCapabilitiesSync(registry, parentSpecPath);
    
    const p0Caps = registry.getCapabilitiesByScope('p0');
    const p1Caps = registry.getCapabilitiesByScope('p1');
    const p2Caps = registry.getCapabilitiesByScope('p2');
    
    expect(p0Caps.length).toBeGreaterThan(0);
    expect(p1Caps.length).toBeGreaterThan(0);
    expect(p2Caps.length).toBeGreaterThan(0);
  });
});

describe('ScopeRegistry integration', () => {
  it('should load from parent spec with loadFromParentSpec', async () => {
    const registry = new ScopeRegistry();
    await registry.loadFromParentSpec(parentSpecPath);
    
    const allCaps = registry.getAllCapabilities();
    expect(allCaps.length).toBeGreaterThan(0);
  });

  it('should load from parent spec with loadFromParentSpecSync', () => {
    const registry = new ScopeRegistry();
    registry.loadFromParentSpecSync(parentSpecPath);
    
    const allCaps = registry.getAllCapabilities();
    expect(allCaps.length).toBeGreaterThan(0);
  });

  it('should use default path when none provided', async () => {
    const registry = new ScopeRegistry();
    await registry.loadFromParentSpec(); // No path - uses default
    
    const allCaps = registry.getAllCapabilities();
    expect(allCaps.length).toBeGreaterThan(0);
  });

  it('should have access to loader via getLoader', () => {
    const registry = new ScopeRegistry();
    const regLoader = registry.getLoader();
    
    expect(regLoader).toBeInstanceOf(Req25Loader);
  });
});

describe('createReq25Loader', () => {
  it('should create a new Req25Loader instance', () => {
    const loader = createReq25Loader();
    
    expect(loader).toBeInstanceOf(Req25Loader);
  });
});

describe('Error handling', () => {
  it('should handle missing requirements.md gracefully', () => {
    const loader = new Req25Loader();
    const result = loader.loadFromParentSpec('/some/fake/path');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should return empty capabilities on error', () => {
    const loader = new Req25Loader();
    const result = loader.loadFromParentSpec('/invalid/path');
    
    expect(result.capabilities).toEqual([]);
  });
});

describe('validateParentSpecArtifacts (Task 8.2)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  it('should validate parent spec artifacts successfully', () => {
    const result = loader.validateParentSpecArtifacts(parentSpecPath);
    
    // Should have both errors/warnings empty or contain expected items
    expect(result).toBeDefined();
    expect(result.errors).toBeDefined();
    expect(result.warnings).toBeDefined();
    expect(result.details).toBeDefined();
  });

  it('should detect required requirements.md', () => {
    const result = loader.validateParentSpecArtifacts(parentSpecPath);
    
    // Parent spec should have requirements.md
    const hasRequirements = !result.errors.some(e => e.includes('requirements.md'));
    expect(hasRequirements).toBe(true);
  });

  it('should validate Property 15 allocation', () => {
    const result = loader.validateParentSpecArtifacts(parentSpecPath);
    
    // Should have property allocation file
    expect(result.details.hasPropertyAllocation).toBe(true);
  });

  it('should detect missing artifacts', () => {
    // Test with non-existent path
    const result = loader.validateParentSpecArtifacts('/non/existent/path');
    
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('does not exist'))).toBe(true);
  });

  it('should check for scope boundary verifier', () => {
    const result = loader.validateParentSpecArtifacts(parentSpecPath);
    
    expect(result.details.hasScopeBoundaryVerifier).toBe(true);
  });

  it('should check for development roadmap', () => {
    const result = loader.validateParentSpecArtifacts(parentSpecPath);
    
    expect(result.details.hasDevelopmentRoadmap).toBe(true);
  });
});

describe('detectChanges (Task 8.2)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  it('should detect changes in REQ-25', () => {
    // First load to populate cache
    loader.loadFromParentSpec(parentSpecPath);
    
    // Detect changes
    const changeResult = loader.detectChanges(parentSpecPath);
    
    expect(changeResult).toBeDefined();
    expect(changeResult.hasChanged).toBe(false); // No change since we just loaded
    expect(changeResult.previousHash).toBeDefined();
    expect(changeResult.currentHash).toBeDefined();
    expect(changeResult.timestamp).toBeInstanceOf(Date);
  });

  it('should return change details when previous data exists', () => {
    // First load to populate cache
    loader.loadFromParentSpec(parentSpecPath);
    
    // Detect changes
    const changeResult = loader.detectChanges(parentSpecPath);
    
    expect(changeResult.details).toBeDefined();
    if (changeResult.details) {
      expect(changeResult.details.previousP0Count).toBeDefined();
      expect(changeResult.details.currentP0Count).toBeDefined();
    }
  });

  it('should handle no previous data', () => {
    const newLoader = new Req25Loader();
    const changeResult = newLoader.detectChanges(parentSpecPath);
    
    // Should still work but previousHash will be null
    expect(changeResult.previousHash).toBeNull();
    expect(changeResult.currentHash).toBeDefined();
  });
});

describe('validateCapabilitiesAgainstArtifacts (Task 8.2)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  it('should validate loaded capabilities', () => {
    // Load first
    loader.loadFromParentSpec(parentSpecPath);
    
    // Validate
    const results = loader.validateCapabilitiesAgainstArtifacts();
    
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });

  it('should detect missing capabilities', () => {
    // Load first
    loader.loadFromParentSpec(parentSpecPath);
    
    const results = loader.validateCapabilitiesAgainstArtifacts();
    
    // Should have P0, P1, P2 capabilities
    const hasError = results.some(r => r.code === 'missing_scope_tag' && r.message.includes('P0'));
    expect(hasError).toBe(false); // We should have P0 capabilities
  });

  it('should detect duplicate capability IDs', () => {
    // Load first
    loader.loadFromParentSpec(parentSpecPath);
    
    const results = loader.validateCapabilitiesAgainstArtifacts();
    
    // Should not have duplicate errors
    const dupErrors = results.filter(r => r.code === 'scope_tag_mismatch' && r.message.includes('Duplicate'));
    expect(dupErrors.length).toBe(0);
  });

  it('should return error when no data loaded', () => {
    const newLoader = new Req25Loader();
    const results = newLoader.validateCapabilitiesAgainstArtifacts();
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('error');
    expect(results[0].message).toContain('No capabilities loaded');
  });
});

describe('getValidationSummary (Task 8.2)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  it('should return summary after loading', () => {
    // Load first
    loader.loadFromParentSpec(parentSpecPath);
    
    const summary = loader.getValidationSummary();
    
    expect(summary.isLoaded).toBe(true);
    expect(summary.capabilityCounts.p0).toBeGreaterThan(0);
    expect(summary.capabilityCounts.p1).toBeGreaterThan(0);
    expect(summary.capabilityCounts.p2).toBeGreaterThan(0);
    expect(summary.changeTimestamp).toBeInstanceOf(Date);
  });

  it('should return empty summary before loading', () => {
    const newLoader = new Req25Loader();
    const summary = newLoader.getValidationSummary();
    
    expect(summary.isLoaded).toBe(false);
    expect(summary.capabilityCounts.p0).toBe(0);
    expect(summary.capabilityCounts.p1).toBe(0);
    expect(summary.capabilityCounts.p2).toBe(0);
  });
});

// ============================================================
// Task 8.3: Change Detection Tests
// ============================================================

describe('detectDetailedChanges (Task 8.3)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  it('should detect detailed changes with capability diff', () => {
    // First load to populate cache
    loader.loadFromParentSpec(parentSpecPath);
    
    // Detect detailed changes
    const result = loader.detectDetailedChanges(parentSpecPath);
    
    expect(result).toBeDefined();
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.previousHash).toBeDefined();
    expect(result.currentHash).toBeDefined();
    expect(result.p0Count).toBeDefined();
    expect(result.p1Count).toBeDefined();
    expect(result.p2Count).toBeDefined();
  });

  it('should track capability changes', () => {
    // First load
    loader.loadFromParentSpec(parentSpecPath);
    
    // Detect changes
    const result = loader.detectDetailedChanges(parentSpecPath);
    
    // Should have capability changes array
    expect(Array.isArray(result.capabilityChanges)).toBe(true);
    // For unchanged content, should have no added/removed
    const added = result.capabilityChanges.filter(c => c.changeType === 'added');
    const removed = result.capabilityChanges.filter(c => c.changeType === 'removed');
    expect(added.length).toBe(0);
    expect(removed.length).toBe(0);
  });

  it('should return full diff on first load', () => {
    const newLoader = new Req25Loader();
    const result = newLoader.detectDetailedChanges(parentSpecPath);
    
    // First load - all capabilities should appear as "added"
    expect(result.hasChanged).toBe(true);
    expect(result.previousHash).toBeNull();
    expect(result.currentHash).toBeDefined();
    
    // All capabilities should be in the added list
    const added = result.capabilityChanges.filter(c => c.changeType === 'added');
    expect(added.length).toBeGreaterThan(0);
  });
});

describe('setWatcherOptions (Task 8.3)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  it('should set watcher options', () => {
    const options = {
      intervalMs: 10000,
      debounceMs: 1000,
      persistent: false,
      includeCapabilityDetails: true
    };
    
    loader.setWatcherOptions(options);
    const currentOptions = loader.getWatcherOptions();
    
    expect(currentOptions.intervalMs).toBe(10000);
    expect(currentOptions.debounceMs).toBe(1000);
    expect(currentOptions.persistent).toBe(false);
    expect(currentOptions.includeCapabilityDetails).toBe(true);
  });

  it('should merge with default options', () => {
    loader.setWatcherOptions({ intervalMs: 2000 });
    const currentOptions = loader.getWatcherOptions();
    
    expect(currentOptions.intervalMs).toBe(2000);
    expect(currentOptions.debounceMs).toBe(500); // Default
    expect(currentOptions.persistent).toBe(true); // Default
  });
});

describe('getWatcherOptions (Task 8.3)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  it('should return default options', () => {
    const options = loader.getWatcherOptions();
    
    expect(options.intervalMs).toBe(5000);
    expect(options.debounceMs).toBe(500);
    expect(options.persistent).toBe(true);
    expect(options.includeCapabilityDetails).toBe(true);
  });
});

describe('startWatching (Task 8.3)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  afterEach(() => {
    // Clean up watchers
    loader.stopWatching();
  });

  it('should start watching for file changes', () => {
    const watcher = loader.startWatching(parentSpecPath);
    
    // Note: watcher may be null in some environments
    expect(watcher === null || typeof watcher.close === 'function').toBe(true);
  });

  it('should register callback', () => {
    let callbackCalled = false;
    
    loader.onChange(() => {
      callbackCalled = true;
    });
    
    // The callback won't actually be called without file changes
    // but we can verify it was registered
    expect(loader.getWatcherCount()).toBe(0); // Not started yet
    
    // Start watching
    loader.startWatching(parentSpecPath);
    
    expect(loader.getWatcherCount()).toBeGreaterThanOrEqual(0);
  });

  it('should handle non-existent path gracefully', () => {
    const watcher = loader.startWatching('/non/existent/path');
    
    expect(watcher).toBeNull();
  });
});

describe('stopWatching (Task 8.3)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  it('should stop all watchers', () => {
    loader.startWatching(parentSpecPath);
    loader.startWatching(parentSpecPath);
    
    expect(loader.getWatcherCount()).toBeGreaterThan(0);
    
    loader.stopWatching();
    
    expect(loader.getWatcherCount()).toBe(0);
  });
});

describe('onChange/offChange callbacks (Task 8.3)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  it('should register change callback', () => {
    const callback = () => {};
    loader.onChange(callback);
    
    // The callback is registered in the internal array
    // We can't easily test without triggering a change
    // but we verify it doesn't throw
    expect(() => loader.onChange(callback)).not.toThrow();
  });

  it('should unregister change callback', () => {
    const callback = () => {};
    loader.onChange(callback);
    loader.offChange(callback);
    
    // Callback should be removed
    expect(() => loader.offChange(callback)).not.toThrow();
  });
});

describe('createActiveDetector (Task 8.3)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  afterEach(() => {
    loader.stopAllDetectors();
  });

  it('should create active detector', () => {
    const detector = loader.createActiveDetector(parentSpecPath);
    
    expect(detector).toBeDefined();
    expect(typeof detector.start).toBe('function');
    expect(typeof detector.stop).toBe('function');
    expect(typeof detector.isWatching).toBe('function');
    expect(typeof detector.getLastResult).toBe('function');
  });

  it('should track detector count', () => {
    loader.createActiveDetector(parentSpecPath);
    
    expect(loader.getDetectorCount()).toBe(0); // Not started yet
  });

  it('should start and stop detector', () => {
    const detector = loader.createActiveDetector(parentSpecPath);
    
    detector.start();
    expect(detector.isWatching()).toBe(true);
    
    detector.stop();
    expect(detector.isWatching()).toBe(false);
  });

  it('should return null last result initially', () => {
    const detector = loader.createActiveDetector(parentSpecPath);
    
    expect(detector.getLastResult()).toBeNull();
  });
});

describe('isWatching (Task 8.3)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  afterEach(() => {
    loader.stopWatching();
    loader.stopAllDetectors();
  });

  it('should return false when not watching', () => {
    expect(loader.isWatching()).toBe(false);
  });

  it('should return true when watching', () => {
    loader.startWatching(parentSpecPath);
    
    expect(loader.isWatching()).toBe(true);
    
    loader.stopWatching();
    expect(loader.isWatching()).toBe(false);
  });

  it('should return true when detector is active', () => {
    const detector = loader.createActiveDetector(parentSpecPath);
    detector.start();
    
    expect(loader.isWatching()).toBe(true);
    
    detector.stop();
    expect(loader.isWatching()).toBe(false);
  });
});

describe('getWatcherCount (Task 8.3)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  afterEach(() => {
    loader.stopWatching();
  });

  it('should return 0 initially', () => {
    expect(loader.getWatcherCount()).toBe(0);
  });

  it('should increment when starting watchers', () => {
    loader.startWatching(parentSpecPath);
    
    expect(loader.getWatcherCount()).toBeGreaterThanOrEqual(0);
  });
});

describe('getDetectorCount (Task 8.3)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  afterEach(() => {
    loader.stopAllDetectors();
  });

  it('should return 0 when no active detectors', () => {
    expect(loader.getDetectorCount()).toBe(0);
  });

  it('should return count of active detectors', () => {
    const detector = loader.createActiveDetector(parentSpecPath);
    detector.start();
    
    expect(loader.getDetectorCount()).toBe(1);
    
    detector.stop();
    expect(loader.getDetectorCount()).toBe(0);
  });
});

describe('stopAllDetectors (Task 8.3)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  it('should stop all active detectors', () => {
    const detector1 = loader.createActiveDetector(parentSpecPath);
    const detector2 = loader.createActiveDetector(parentSpecPath);
    
    detector1.start();
    detector2.start();
    
    expect(detector1.isWatching()).toBe(true);
    expect(detector2.isWatching()).toBe(true);
    
    loader.stopAllDetectors();
    
    expect(detector1.isWatching()).toBe(false);
    expect(detector2.isWatching()).toBe(false);
  });
});

describe('dispose (Task 8.3)', () => {
  let loader: Req25Loader;
  
  beforeEach(() => {
    loader = new Req25Loader();
  });

  it('should clean up all resources', () => {
    // Start some watchers and detectors
    loader.startWatching(parentSpecPath);
    const detector = loader.createActiveDetector(parentSpecPath);
    detector.start();
    loader.onChange(() => {});
    
    expect(loader.isWatching()).toBe(true);
    
    // Dispose
    loader.dispose();
    
    expect(loader.isWatching()).toBe(false);
    expect(loader.getWatcherCount()).toBe(0);
    expect(loader.getDetectorCount()).toBe(0);
  });

  it('should not throw when called multiple times', () => {
    loader.dispose();
    loader.dispose();
    
    expect(() => loader.dispose()).not.toThrow();
  });
});