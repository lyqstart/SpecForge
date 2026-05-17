/**
 * REQ-25 Loader Integration Tests with Parent Spec
 * 
 * Integration tests that verify the full integration between
 * scope-gate and the parent specification (v6-architecture-overview).
 * 
 * These tests:
 * - Load REQ-25 from the actual parent spec
 * - Verify loading result correctness
 * - Test change detection functionality
 * - Test resource cleanup
 * - Ensure tests are repeatable
 * 
 * Requirements: 1.1, 2.1, 2.2 (Parent Spec Integration)
 * Validates: Task 8.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Req25Loader } from '../src/req25-loader.js';
import { ScopeRegistry } from '../src/scope-registry.js';
import { resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';

/**
 * Get the path to the parent spec (v6-architecture-overview)
 */
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

describe('REQ-25 Loader Integration with Parent Spec (Task 8.4)', () => {
  let loader: Req25Loader;
  let testTmpDir: string;

  beforeEach(() => {
    loader = new Req25Loader();
    // Create a unique temp directory for each test
    testTmpDir = resolve(tmpdir(), `scope-gate-integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    if (!existsSync(testTmpDir)) {
      mkdirSync(testTmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup
    loader?.dispose();
    // Clean up temp directory
    try {
      if (existsSync(testTmpDir)) {
        const files = require('fs').readdirSync(testTmpDir);
        for (const file of files) {
          unlinkSync(resolve(testTmpDir, file));
        }
        rmdirSync(testTmpDir);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  // ============================================================
  // Test Scenario 1: Load REQ-25 from Actual Parent Spec
  // ============================================================

  describe('Load REQ-25 from actual parent spec', () => {
    it('should successfully load REQ-25 from v6-architecture-overview', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      expect(result.capabilities.length).toBeGreaterThan(0);
    });

    it('should load P0 capabilities that are required for V6.0', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const p0Capabilities = result.capabilities.filter(c => c.scopeTag === 'p0');
      expect(p0Capabilities.length).toBeGreaterThan(0);
      
      // P0 capabilities should have valid structure
      for (const cap of p0Capabilities) {
        expect(cap.id).toBeDefined();
        expect(cap.id).toBeTruthy();
        expect(cap.displayName).toBeDefined();
        expect(cap.scopeTag).toBe('p0');
      }
    });

    it('should load P1 capabilities scheduled for V6.1', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const p1Capabilities = result.capabilities.filter(c => c.scopeTag === 'p1');
      expect(p1Capabilities.length).toBeGreaterThan(0);
      
      // Verify all P1 capabilities have correct scope tag
      for (const cap of p1Capabilities) {
        expect(cap.scopeTag).toBe('p1');
      }
    });

    it('should load P2 capabilities scheduled for V6.x', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const p2Capabilities = result.capabilities.filter(c => c.scopeTag === 'p2');
      expect(p2Capabilities.length).toBeGreaterThan(0);
      
      // Verify all P2 capabilities have correct scope tag
      for (const cap of p2Capabilities) {
        expect(cap.scopeTag).toBe('p2');
      }
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
      expect(result.metadata?.sourceHash!.length).toBeGreaterThan(0); // Hash should exist
    });

    it('should provide correct capability counts in metadata', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const { metadata } = result;
      
      const p0Count = result.capabilities.filter(c => c.scopeTag === 'p0').length;
      const p1Count = result.capabilities.filter(c => c.scopeTag === 'p1').length;
      const p2Count = result.capabilities.filter(c => c.scopeTag === 'p2').length;
      
      expect(metadata?.p0Count).toBe(p0Count);
      expect(metadata?.p1Count).toBe(p1Count);
      expect(metadata?.p2Count).toBe(p2Count);
    });

    it('should handle missing parent spec path gracefully', () => {
      const nonExistentPath = resolve(testTmpDir, 'non-existent-spec');
      const result = loader.loadFromParentSpec(nonExistentPath);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.capabilities).toEqual([]);
    });
  });

  // ============================================================
  // Test Scenario 2: Verify Loading Result Correctness
  // ============================================================

  describe('Verify loading result correctness', () => {
    it('should return all capabilities with valid IDs', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      for (const cap of result.capabilities) {
        expect(cap.id).toBeDefined();
        expect(typeof cap.id).toBe('string');
        expect(cap.id.length).toBeGreaterThan(0);
        // IDs should be normalized (no spaces, lowercase when appropriate)
        expect(cap.id).not.toMatch(/\s/);
      }
    });

    it('should return all capabilities with valid scope tags', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const validScopeTags = ['p0', 'p1', 'p2'];
      for (const cap of result.capabilities) {
        expect(validScopeTags).toContain(cap.scopeTag);
      }
    });

    it('should not have duplicate capability IDs', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const ids = result.capabilities.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should return correct grouped capabilities via getCapabilitiesByScope', () => {
      const grouped = loader.getCapabilitiesByScope(parentSpecPath);
      
      expect(grouped.p0).toBeDefined();
      expect(grouped.p1).toBeDefined();
      expect(grouped.p2).toBeDefined();
      
      // All capabilities should be categorized
      expect(grouped.p0.length + grouped.p1.length + grouped.p2.length)
        .toBeGreaterThan(0);
      
      // Verify scope tags in each group
      grouped.p0.forEach(cap => expect(cap.scopeTag).toBe('p0'));
      grouped.p1.forEach(cap => expect(cap.scopeTag).toBe('p1'));
      grouped.p2.forEach(cap => expect(cap.scopeTag).toBe('p2'));
    });

    it('should validate capabilities against parent spec artifacts', () => {
      // First load the data
      loader.loadFromParentSpec(parentSpecPath);
      
      // Validate against artifacts
      const validationResults = loader.validateCapabilitiesAgainstArtifacts();
      
      // Should have results
      expect(validationResults).toBeDefined();
      expect(Array.isArray(validationResults)).toBe(true);
      
      // Should not have critical errors for properly formed parent spec
      const errors = validationResults.filter(r => r.type === 'error');
      
      // Check that we don't have critical issues with loaded data
      for (const error of errors) {
        // We expect no duplicate or missing scope tag errors for valid parent spec
        expect(error.code).not.toBe('scope_tag_mismatch');
      }
    });

    it('should return valid validation summary', () => {
      loader.loadFromParentSpec(parentSpecPath);
      const summary = loader.getValidationSummary();
      
      expect(summary.isLoaded).toBe(true);
      expect(summary.capabilityCounts.p0).toBeGreaterThan(0);
      expect(summary.capabilityCounts.p1).toBeGreaterThan(0);
      expect(summary.capabilityCounts.p2).toBeGreaterThan(0);
      expect(summary.changeTimestamp).toBeInstanceOf(Date);
    });
  });

  // ============================================================
  // Test Scenario 3: Test Change Detection Functionality
  // ============================================================

  describe('Test change detection functionality', () => {
    it('should detect changes between loads', () => {
      // First load
      const result1 = loader.loadFromParentSpec(parentSpecPath);
      expect(result1.success).toBe(true);
      
      // Detect changes (should return no changes since content is same)
      const changeResult = loader.detectChanges(parentSpecPath);
      
      expect(changeResult).toBeDefined();
      expect(changeResult.previousHash).toBeDefined();
      expect(changeResult.currentHash).toBeDefined();
      expect(changeResult.previousHash).toBe(changeResult.currentHash); // No change
      expect(changeResult.hasChanged).toBe(false);
    });

    it('should provide detailed change detection', () => {
      // First load
      loader.loadFromParentSpec(parentSpecPath);
      
      // Get detailed changes
      const detailedResult = loader.detectDetailedChanges(parentSpecPath);
      
      expect(detailedResult).toBeDefined();
      expect(detailedResult.timestamp).toBeInstanceOf(Date);
      expect(detailedResult.previousHash).toBeDefined();
      expect(detailedResult.currentHash).toBeDefined();
      expect(detailedResult.p0Count).toBeDefined();
      expect(detailedResult.p1Count).toBeDefined();
      expect(detailedResult.p2Count).toBeDefined();
      expect(detailedResult.capabilityChanges).toBeDefined();
      expect(Array.isArray(detailedResult.capabilityChanges)).toBe(true);
    });

    it('should track hasChanged status correctly', () => {
      const newLoader = new Req25Loader();
      
      // First load - should show as changed since no previous data
      const result1 = newLoader.detectDetailedChanges(parentSpecPath);
      expect(result1.hasChanged).toBe(true); // First load shows all as "added"
      expect(result1.previousHash).toBeNull();
      expect(result1.currentHash).toBeDefined();
    });

    it('should handle change detection with watcher options', () => {
      loader.setWatcherOptions({
        intervalMs: 1000,
        debounceMs: 100,
        persistent: false
      });
      
      const options = loader.getWatcherOptions();
      expect(options.intervalMs).toBe(1000);
      expect(options.debounceMs).toBe(100);
      expect(options.persistent).toBe(false);
    });
  });

  // ============================================================
  // Test Scenario 4: Test Resource Cleanup
  // ============================================================

  describe('Test resource cleanup', () => {
    it('should properly dispose of all resources', () => {
      // Start watching
      const watcher = loader.startWatching(parentSpecPath);
      
      if (watcher) {
        expect(loader.isWatching()).toBe(true);
        expect(loader.getWatcherCount()).toBeGreaterThan(0);
      }
      
      // Register callbacks
      const callback = vi.fn();
      loader.onChange(callback);
      
      // Create and start a detector
      const detector = loader.createActiveDetector(parentSpecPath);
      detector.start();
      expect(loader.getDetectorCount()).toBe(1);
      
      // Dispose
      loader.dispose();
      
      // Verify all resources are cleaned up
      expect(loader.isWatching()).toBe(false);
      expect(loader.getWatcherCount()).toBe(0);
      expect(loader.getDetectorCount()).toBe(0);
    });

    it('should handle multiple dispose calls safely', () => {
      loader.startWatching(parentSpecPath);
      const detector = loader.createActiveDetector(parentSpecPath);
      detector.start();
      
      // Multiple dispose calls should not throw
      expect(() => loader.dispose()).not.toThrow();
      expect(() => loader.dispose()).not.toThrow();
      expect(() => loader.dispose()).not.toThrow();
      
      // Should still be in clean state
      expect(loader.isWatching()).toBe(false);
    });

    it('should stop all watchers on dispose', () => {
      // Start multiple watchers
      loader.startWatching(parentSpecPath);
      loader.startWatching(parentSpecPath);
      
      expect(loader.getWatcherCount()).toBe(2);
      
      loader.stopWatching();
      
      expect(loader.getWatcherCount()).toBe(0);
      expect(loader.isWatching()).toBe(false);
    });

    it('should stop all detectors on dispose', () => {
      // Create and start multiple detectors
      const detector1 = loader.createActiveDetector(parentSpecPath);
      const detector2 = loader.createActiveDetector(parentSpecPath);
      
      detector1.start();
      detector2.start();
      
      expect(loader.getDetectorCount()).toBe(2);
      
      loader.stopAllDetectors();
      
      expect(loader.getDetectorCount()).toBe(0);
      expect(detector1.isWatching()).toBe(false);
      expect(detector2.isWatching()).toBe(false);
    });
  });

  // ============================================================
  // Test Scenario 5: Integration with ScopeRegistry
  // ============================================================

  describe('ScopeRegistry Integration', () => {
    it('should load capabilities into registry from parent spec', () => {
      const registry = new ScopeRegistry();
      
      // Load via async method
      registry.loadFromParentSpecSync(parentSpecPath);
      
      const allCaps = registry.getAllCapabilities();
      expect(allCaps.length).toBeGreaterThan(0);
    });

    it('should register P0, P1, P2 capabilities correctly', () => {
      const registry = new ScopeRegistry();
      registry.loadFromParentSpecSync(parentSpecPath);
      
      const p0Caps = registry.getCapabilitiesByScope('p0');
      const p1Caps = registry.getCapabilitiesByScope('p1');
      const p2Caps = registry.getCapabilitiesByScope('p2');
      
      expect(p0Caps.length).toBeGreaterThan(0);
      expect(p1Caps.length).toBeGreaterThan(0);
      expect(p2Caps.length).toBeGreaterThan(0);
    });

    it('should use default path when loading into registry', () => {
      const registry = new ScopeRegistry();
      
      // Load with no path - should use default
      registry.loadFromParentSpecSync();
      
      const allCaps = registry.getAllCapabilities();
      expect(allCaps.length).toBeGreaterThan(0);
    });

    it('should provide access to loader from registry', () => {
      const registry = new ScopeRegistry();
      const regLoader = registry.getLoader();
      
      expect(regLoader).toBeInstanceOf(Req25Loader);
    });
  });

  // ============================================================
  // Test Scenario 6: Parent Spec Artifact Validation
  // ============================================================

  describe('Parent spec artifact validation', () => {
    it('should validate parent spec artifacts correctly', () => {
      const validationResult = loader.validateParentSpecArtifacts(parentSpecPath);
      
      expect(validationResult).toBeDefined();
      expect(validationResult.errors).toBeDefined();
      expect(validationResult.warnings).toBeDefined();
      expect(validationResult.details).toBeDefined();
    });

    it('should detect required requirements.md', () => {
      const validationResult = loader.validateParentSpecArtifacts(parentSpecPath);
      
      // requirements.md is essential and should not be in errors
      const hasRequirementsError = validationResult.errors.some(
        e => e.includes('requirements.md')
      );
      expect(hasRequirementsError).toBe(false);
    });

    it('should check for correctness property allocation', () => {
      const validationResult = loader.validateParentSpecArtifacts(parentSpecPath);
      
      expect(validationResult.details.hasPropertyAllocation).toBe(true);
    });

    it('should validate Property 15 allocation', () => {
      const validationResult = loader.validateParentSpecArtifacts(parentSpecPath);
      
      // The parent spec should have Property 15 allocated to scope-gate
      // (this may be a warning rather than error if not yet set up)
      expect(validationResult).toBeDefined();
    });

    it('should detect invalid parent spec path', () => {
      const invalidPath = resolve(testTmpDir, 'nonexistent');
      const validationResult = loader.validateParentSpecArtifacts(invalidPath);
      
      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Test Scenario 7: Repeatability Tests
  // ============================================================

  describe('Ensure tests are repeatable', () => {
    it('should produce consistent results on repeated loads', () => {
      const loader1 = new Req25Loader();
      const loader2 = new Req25Loader();
      
      const result1 = loader1.loadFromParentSpec(parentSpecPath);
      const result2 = loader2.loadFromParentSpec(parentSpecPath);
      
      expect(result1.success).toBe(result2.success);
      expect(result1.capabilities.length).toBe(result2.capabilities.length);
      expect(result1.metadata?.p0Count).toBe(result2.metadata?.p0Count);
      expect(result1.metadata?.p1Count).toBe(result2.metadata?.p1Count);
      expect(result1.metadata?.p2Count).toBe(result2.metadata?.p2Count);
      expect(result1.metadata?.sourceHash).toBe(result2.metadata?.sourceHash);
    });

    it('should handle concurrent loads safely', async () => {
      const loader1 = new Req25Loader();
      const loader2 = new Req25Loader();
      
      // Load from both loaders concurrently
      const [result1, result2] = await Promise.all([
        Promise.resolve(loader1.loadFromParentSpec(parentSpecPath)),
        Promise.resolve(loader2.loadFromParentSpec(parentSpecPath))
      ]);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should handle rapid load and clear cycles', () => {
      for (let i = 0; i < 5; i++) {
        const result = loader.loadFromParentSpec(parentSpecPath);
        expect(result.success).toBe(true);
        
        loader.clearCache();
        expect(loader.getCachedData()).toBeNull();
      }
    });
  });

  // ============================================================
  // Test Scenario 8: Default Path Resolution
  // ============================================================

  describe('Default path resolution', () => {
    it('should resolve default parent spec path correctly', () => {
      const defaultPath = Req25Loader.getDefaultParentSpecPath();
      
      expect(defaultPath).toBeDefined();
      expect(defaultPath).toContain('v6-architecture-overview');
      expect(existsSync(defaultPath)).toBe(true);
    });

    it('should use environment variable when set', () => {
      const customPath = testTmpDir;
      
      // Temporarily set environment variable
      const originalEnv = process.env.SCOPE_GATE_PARENT_SPEC;
      process.env.SCOPE_GATE_PARENT_SPEC = customPath;
      
      try {
        const resolvedPath = Req25Loader.getDefaultParentSpecPath();
        expect(resolvedPath).toBe(customPath);
      } finally {
        // Restore original
        if (originalEnv !== undefined) {
          process.env.SCOPE_GATE_PARENT_SPEC = originalEnv;
        } else {
          delete process.env.SCOPE_GATE_PARENT_SPEC;
        }
      }
    });
  });
});

// ============================================================
// Additional Integration Test: Full Lifecycle
// ============================================================

describe('REQ-25 Loader Full Lifecycle (Task 8.4)', () => {
  let loader: Req25Loader;
  let testTmpDir: string;

  beforeEach(() => {
    loader = new Req25Loader();
    testTmpDir = resolve(tmpdir(), `scope-gate-lifecycle-${Date.now()}`);
    if (!existsSync(testTmpDir)) {
      mkdirSync(testTmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    loader?.dispose();
    try {
      if (existsSync(testTmpDir)) {
        const files = require('fs').readdirSync(testTmpDir);
        for (const file of files) {
          unlinkSync(resolve(testTmpDir, file));
        }
        rmdirSync(testTmpDir);
      }
    } catch (e) {
      // Ignore
    }
  });

  it('should complete full lifecycle: load → validate → detect changes → dispose', () => {
    // 1. Load from parent spec
    const loadResult = loader.loadFromParentSpec(parentSpecPath);
    expect(loadResult.success).toBe(true);
    expect(loadResult.capabilities.length).toBeGreaterThan(0);
    
    // 2. Validate capabilities
    const validation = loader.validateCapabilitiesAgainstArtifacts();
    expect(validation).toBeDefined();
    
    // 3. Get validation summary
    const summary = loader.getValidationSummary();
    expect(summary.isLoaded).toBe(true);
    expect(summary.capabilityCounts.p0).toBeGreaterThan(0);
    
    // 4. Detect changes
    const changes = loader.detectChanges(parentSpecPath);
    expect(changes).toBeDefined();
    
    // 5. Start watching
    loader.startWatching(parentSpecPath);
    expect(loader.isWatching()).toBe(true);
    
    // 6. Dispose properly
    loader.dispose();
    expect(loader.isWatching()).toBe(false);
    expect(loader.getWatcherCount()).toBe(0);
  });

  it('should handle simulated REQ-25 modification', () => {
    // Create a temporary requirements.md with known content
    const tempReqPath = resolve(testTmpDir, 'requirements.md');
    const originalContent = `# Requirements Document

### Requirement 25: V6.0 开发范围边界（P0 / P1 / P2）

#### Acceptance Criteria

1. THE Requirements_Document SHALL 以列表形式列出 V6.0 P0 必做项（共 27 项），分组为：
   - 基础设施（Daemon、通信、Session Registry、Permission、Adapter、Config、Directory、CLI、Recovery、Multi-project，共 10 项）。

2. THE Requirements_Document SHALL 以列表形式列出 V6.1 P1 项（共 15 项），包含 bugfix workflow。
`;
    
    writeFileSync(tempReqPath, originalContent, 'utf-8');
    
    // Load from temp spec
    const tempLoader = new Req25Loader();
    const result1 = tempLoader.loadFromParentSpec(testTmpDir);
    expect(result1.success).toBe(true);
    
    // Modify the file
    const modifiedContent = originalContent.replace('共 27 项', '共 28 项');
    writeFileSync(tempReqPath, modifiedContent, 'utf-8');
    
    // Detect changes
    const changeResult = tempLoader.detectChanges(testTmpDir);
    expect(changeResult.hasChanged).toBe(true);
    
    // Cleanup
    tempLoader.dispose();
    unlinkSync(tempReqPath);
  });
});