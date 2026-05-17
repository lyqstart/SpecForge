/**
 * Parent Spec Loading and Validation Integration Tests
 * 
 * Integration tests that verify scope-gate correctly integrates with
 * the parent specification (v6-architecture-overview).
 * 
 * Tests:
 * - Auto-loading of REQ-25 from parent spec
 * - Verification that capability list loads correctly
 * - Verification of scope tag consistency
 * 
 * Requirements: REQ-25 (Parent Spec Integration)
 * Validates: Task 15.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Req25Loader } from '../../src/req25-loader.js';
import { ScopeRegistry } from '../../src/scope-registry.js';
import { resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from 'fs';
import { tmpdir } from 'os';

/**
 * Get the path to the parent spec (v6-architecture-overview)
 */
function getParentSpecPath(): string {
  const envPath = process.env.SCOPE_GATE_PARENT_SPEC;
  if (envPath) {
    return envPath;
  }
  
  const cwd = process.cwd();
  
  if (cwd.includes('packages/scope-gate') || cwd.includes('packages\\scope-gate')) {
    const repoRoot = resolve(cwd, '..', '..');
    return resolve(repoRoot, '.kiro', 'specs', 'v6-architecture-overview');
  }
  
  return resolve(cwd, '.kiro', 'specs', 'v6-architecture-overview');
}

const parentSpecPath = getParentSpecPath();

describe('Parent Spec Loading and Validation (Task 15.3)', () => {
  let loader: Req25Loader;
  let testTmpDir: string;

  beforeEach(() => {
    loader = new Req25Loader();
    testTmpDir = resolve(tmpdir(), `scope-gate-parent-spec-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
      // Ignore cleanup errors
    }
  });

  // ============================================================
  // Test 1: Auto-load REQ-25 from parent spec
  // ============================================================

  describe('Auto-load REQ-25', () => {
    it('should automatically load REQ-25 from parent spec path', () => {
      // Auto-load by calling loadFromParentSpec without explicit path in registry
      const registry = new ScopeRegistry();
      registry.loadFromParentSpecSync();
      
      const allCapabilities = registry.getAllCapabilities();
      expect(allCapabilities.length).toBeGreaterThan(0);
    });

    it('should load REQ-25 with correct path resolution', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      expect(result.capabilities.length).toBeGreaterThan(0);
      expect(existsSync(parentSpecPath)).toBe(true);
    });

    it('should auto-detect default parent spec path', () => {
      const defaultPath = Req25Loader.getDefaultParentSpecPath();
      
      expect(defaultPath).toBeDefined();
      expect(defaultPath).toContain('v6-architecture-overview');
    });

    it('should handle parent spec path from environment variable', () => {
      const customPath = testTmpDir;
      
      const originalEnv = process.env.SCOPE_GATE_PARENT_SPEC;
      process.env.SCOPE_GATE_PARENT_SPEC = customPath;
      
      try {
        const resolvedPath = Req25Loader.getDefaultParentSpecPath();
        expect(resolvedPath).toBe(customPath);
      } finally {
        if (originalEnv !== undefined) {
          process.env.SCOPE_GATE_PARENT_SPEC = originalEnv;
        } else {
          delete process.env.SCOPE_GATE_PARENT_SPEC;
        }
      }
    });
  });

  // ============================================================
  // Test 2: Verify capability list loads correctly
  // ============================================================

  describe('Verify capability list loads correctly', () => {
    it('should load all P0 capabilities', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const p0Capabilities = result.capabilities.filter(c => c.scopeTag === 'p0');
      expect(p0Capabilities.length).toBeGreaterThan(0);
    });

    it('should load all P1 capabilities', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const p1Capabilities = result.capabilities.filter(c => c.scopeTag === 'p1');
      expect(p1Capabilities.length).toBeGreaterThan(0);
    });

    it('should load all P2 capabilities', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const p2Capabilities = result.capabilities.filter(c => c.scopeTag === 'p2');
      expect(p2Capabilities.length).toBeGreaterThan(0);
    });

    it('should have valid capability structure for all items', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      for (const cap of result.capabilities) {
        expect(cap.id).toBeDefined();
        expect(cap.displayName).toBeDefined();
        expect(cap.scopeTag).toBeDefined();
        expect(['p0', 'p1', 'p2']).toContain(cap.scopeTag);
      }
    });

    it('should not have duplicate capability IDs', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const ids = result.capabilities.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should provide correct metadata counts', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      
      const p0Count = result.capabilities.filter(c => c.scopeTag === 'p0').length;
      const p1Count = result.capabilities.filter(c => c.scopeTag === 'p1').length;
      const p2Count = result.capabilities.filter(c => c.scopeTag === 'p2').length;
      
      expect(result.metadata?.p0Count).toBe(p0Count);
      expect(result.metadata?.p1Count).toBe(p1Count);
      expect(result.metadata?.p2Count).toBe(p2Count);
    });

    it('should load capabilities via ScopeRegistry', () => {
      const registry = new ScopeRegistry();
      registry.loadFromParentSpecSync(parentSpecPath);
      
      const p0Caps = registry.getCapabilitiesByScope('p0');
      const p1Caps = registry.getCapabilitiesByScope('p1');
      const p2Caps = registry.getCapabilitiesByScope('p2');
      
      expect(p0Caps.length).toBeGreaterThan(0);
      expect(p1Caps.length).toBeGreaterThan(0);
      expect(p2Caps.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Test 3: Verify scope tag consistency
  // ============================================================

  describe('Verify scope tag consistency', () => {
    it('should have consistent scope tags in loader result', () => {
      const result = loader.loadFromParentSpec(parentSpecPath);
      
      expect(result.success).toBe(true);
      const validScopeTags = ['p0', 'p1', 'p2'];
      
      for (const cap of result.capabilities) {
        expect(validScopeTags).toContain(cap.scopeTag);
      }
    });

    it('should have consistent scope tags in registry', () => {
      const registry = new ScopeRegistry();
      registry.loadFromParentSpecSync(parentSpecPath);
      
      const allCaps = registry.getAllCapabilities();
      const validScopeTags = ['p0', 'p1', 'p2'];
      
      for (const cap of allCaps) {
        expect(validScopeTags).toContain(cap.scopeTag);
      }
    });

    it('should return correct grouped capabilities via getCapabilitiesByScope', () => {
      const grouped = loader.getCapabilitiesByScope(parentSpecPath);
      
      expect(grouped.p0).toBeDefined();
      expect(grouped.p1).toBeDefined();
      expect(grouped.p2).toBeDefined();
      
      // Verify scope tags in each group
      grouped.p0.forEach(cap => expect(cap.scopeTag).toBe('p0'));
      grouped.p1.forEach(cap => expect(cap.scopeTag).toBe('p1'));
      grouped.p2.forEach(cap => expect(cap.scopeTag).toBe('p2'));
    });

    it('should have consistent scope tags across multiple loads', () => {
      const loader1 = new Req25Loader();
      const loader2 = new Req25Loader();
      
      const result1 = loader1.loadFromParentSpec(parentSpecPath);
      const result2 = loader2.loadFromParentSpec(parentSpecPath);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      // Compare scope tag distribution
      const p0Count1 = result1.capabilities.filter(c => c.scopeTag === 'p0').length;
      const p0Count2 = result2.capabilities.filter(c => c.scopeTag === 'p0').length;
      expect(p0Count1).toBe(p0Count2);
      
      const p1Count1 = result1.capabilities.filter(c => c.scopeTag === 'p1').length;
      const p1Count2 = result2.capabilities.filter(c => c.scopeTag === 'p1').length;
      expect(p1Count1).toBe(p1Count2);
      
      const p2Count1 = result1.capabilities.filter(c => c.scopeTag === 'p2').length;
      const p2Count2 = result2.capabilities.filter(c => c.scopeTag === 'p2').length;
      expect(p2Count1).toBe(p2Count2);
    });
  });

  // ============================================================
  // Test 4: Parent spec validation
  // ============================================================

  describe('Parent spec validation', () => {
    it('should validate parent spec artifacts correctly', () => {
      const validationResult = loader.validateParentSpecArtifacts(parentSpecPath);
      
      expect(validationResult).toBeDefined();
      expect(validationResult.errors).toBeDefined();
      expect(validationResult.warnings).toBeDefined();
    });

    it('should detect valid parent spec path', () => {
      const validationResult = loader.validateParentSpecArtifacts(parentSpecPath);
      
      expect(validationResult.isValid).toBe(true);
    });

    it('should detect invalid parent spec path', () => {
      const invalidPath = resolve(testTmpDir, 'nonexistent');
      const validationResult = loader.validateParentSpecArtifacts(invalidPath);
      
      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
    });

    it('should provide validation summary', () => {
      loader.loadFromParentSpec(parentSpecPath);
      const summary = loader.getValidationSummary();
      
      expect(summary.isLoaded).toBe(true);
      expect(summary.capabilityCounts.p0).toBeGreaterThan(0);
      expect(summary.capabilityCounts.p1).toBeGreaterThan(0);
      expect(summary.capabilityCounts.p2).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Test 5: Integration with ScopeRegistry
  // ============================================================

  describe('ScopeRegistry integration', () => {
    it('should integrate loader with registry seamlessly', () => {
      const registry = new ScopeRegistry();
      
      // Get loader from registry
      const regLoader = registry.getLoader();
      expect(regLoader).toBeInstanceOf(Req25Loader);
      
      // Load via registry
      registry.loadFromParentSpecSync(parentSpecPath);
      
      // Verify loaded
      const allCaps = registry.getAllCapabilities();
      expect(allCaps.length).toBeGreaterThan(0);
    });

    it('should maintain consistency between loader and registry', () => {
      const registry = new ScopeRegistry();
      registry.loadFromParentSpecSync(parentSpecPath);
      
      // Get capabilities from both
      const regCapabilities = registry.getAllCapabilities();
      const loaderResult = loader.loadFromParentSpec(parentSpecPath);
      
      // Should have same counts
      expect(regCapabilities.length).toBe(loaderResult.capabilities.length);
      
      // P0 should match
      const regP0 = registry.getCapabilitiesByScope('p0').length;
      const loaderP0 = loaderResult.capabilities.filter(c => c.scopeTag === 'p0').length;
      expect(regP0).toBe(loaderP0);
    });
  });
});