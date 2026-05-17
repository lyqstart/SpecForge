/**
 * Performance Benchmark Tests
 * 
 * Task 18.1: Profile and optimize hot code paths
 * 
 * This test suite measures performance of hot code paths and verifies
 * optimization targets are met:
 * - Scope check: < 100 microseconds
 * - Registry operations: < 1ms
 * - Feature flag checks: < 50 microseconds
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ScopeRegistry } from '../src/scope-registry.js';
import { RuntimeScopeChecker } from '../src/runtime-checker.js';
import { FeatureFlagManager } from '../src/feature-flag-manager.js';
import type { ScopeContext, CapabilityDefinition, ScopeTag } from '../src/types.js';

// Test performance thresholds (in microseconds)
const SCOPE_CHECK_THRESHOLD_US = 100;
const REGISTRY_LOOKUP_THRESHOLD_US = 1000;
const FEATURE_FLAG_CHECK_THRESHOLD_US = 50;

// Number of iterations for benchmarking
const BENCHMARK_ITERATIONS = 10000;

interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalMs: number;
  avgUs: number;
  minUs: number;
  maxUs: number;
  p50Us: number;
  p95Us: number;
  p99Us: number;
  passesThreshold: boolean;
}

/**
 * Measure execution time with high precision
 */
function measureExecution(fn: () => void): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  return (end - start) * 1000; // Convert to microseconds
}

/**
 * Run multiple iterations and collect statistics
 */
function benchmark(
  name: string,
  fn: () => void,
  iterations: number
): BenchmarkResult {
  const times: number[] = [];
  
  // Warm up
  for (let i = 0; i < 100; i++) {
    fn();
  }
  
  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const time = measureExecution(fn);
    times.push(time);
  }
  
  // Sort for percentiles
  times.sort((a, b) => a - b);
  
  const totalMs = times.reduce((a, b) => a + b, 0) / 1000;
  const avgUs = totalMs * 1000 / iterations;
  const minUs = times[0];
  const maxUs = times[times.length - 1];
  const p50Us = times[Math.floor(iterations * 0.5)];
  const p95Us = times[Math.floor(iterations * 0.95)];
  const p99Us = times[Math.floor(iterations * 0.99)];
  
  return {
    operation: name,
    iterations,
    totalMs,
    avgUs,
    minUs,
    maxUs,
    p50Us,
    p95Us,
    p99Us,
    passesThreshold: avgUs < SCOPE_CHECK_THRESHOLD_US
  };
}

function printBenchmark(result: BenchmarkResult): void {
  console.log(`\n=== ${result.operation} ===`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Total time: ${result.totalMs.toFixed(2)}ms`);
  console.log(`Average: ${result.avgUs.toFixed(2)}µs`);
  console.log(`Min: ${result.minUs.toFixed(2)}µs`);
  console.log(`Max: ${result.maxUs.toFixed(2)}µs`);
  console.log(`P50: ${result.p50Us.toFixed(2)}µs`);
  console.log(`P95: ${result.p95Us.toFixed(2)}µs`);
  console.log(`P99: ${result.p99Us.toFixed(2)}µs`);
  console.log(`Passes threshold (${SCOPE_CHECK_THRESHOLD_US}µs): ${result.passesThreshold ? '✅ YES' : '❌ NO'}`);
}

describe('Performance Benchmarks', () => {
  let registry: ScopeRegistry;
  let checker: RuntimeScopeChecker;
  let featureFlagManager: FeatureFlagManager;
  let v6Context: ScopeContext;
  let devContext: ScopeContext;
  
  // Register test capabilities
  const testCapabilities: CapabilityDefinition[] = [
    { id: 'p0-cap-1', displayName: 'P0 Capability 1', scopeTag: 'p0', entryPoints: [], dependencies: [], description: '' },
    { id: 'p0-cap-2', displayName: 'P0 Capability 2', scopeTag: 'p0', entryPoints: [], dependencies: [], description: '' },
    { id: 'p1-cap-1', displayName: 'P1 Capability 1', scopeTag: 'p1', entryPoints: [], dependencies: [], description: '' },
    { id: 'p1-cap-2', displayName: 'P1 Capability 2', scopeTag: 'p1', entryPoints: [], dependencies: [], description: '' },
    { id: 'p2-cap-1', displayName: 'P2 Capability 1', scopeTag: 'p2', entryPoints: [], dependencies: [], description: '' },
    { id: 'p2-cap-2', displayName: 'P2 Capability 2', scopeTag: 'p2', entryPoints: [], dependencies: [], description: '' },
  ];
  
  beforeAll(() => {
    // Initialize registry with test capabilities
    registry = new ScopeRegistry();
    
    // Register test capabilities directly (bypass parent spec loading)
    for (const cap of testCapabilities) {
      registry.registerCapability(cap);
    }
    
    // Initialize feature flag manager
    featureFlagManager = new FeatureFlagManager({
      enableMasterFlags: true
    });
    
    // Register capabilities with feature flag manager
    for (const cap of testCapabilities) {
      if (cap.scopeTag !== 'p0') {
        featureFlagManager.registerCapability(cap.id, cap.scopeTag as ScopeTag);
      }
    }
    
    // Initialize checker
    checker = new RuntimeScopeChecker(registry, {
      releaseBranch: 'v6.0',
      featureFlags: new Set(),
      environment: 'production'
    });
    
    // Define contexts
    v6Context = {
      releaseBranch: 'v6.0',
      featureFlags: new Set(),
      environment: 'production'
    };
    
    devContext = {
      releaseBranch: 'development',
      featureFlags: new Set(['enable_p1-cap-1']),
      environment: 'development'
    };
  });
  
  describe('Hot Path Benchmarks', () => {
    it('scope check (P0 capability) should be < 100µs', () => {
      const result = benchmark(
        'Scope Check (P0)',
        () => {
          registry.isAvailable('p0-cap-1', v6Context);
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(SCOPE_CHECK_THRESHOLD_US);
    });
    
    it('scope check (P1 capability with flag) should be < 100µs', () => {
      const contextWithFlag = {
        ...v6Context,
        featureFlags: new Set(['enable_p1-cap-1'])
      };
      
      const result = benchmark(
        'Scope Check (P1 with flag)',
        () => {
          registry.isAvailable('p1-cap-1', contextWithFlag);
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(SCOPE_CHECK_THRESHOLD_US);
    });
    
    it('scope check (P1 capability without flag) should be < 100µs', () => {
      const result = benchmark(
        'Scope Check (P1 no flag)',
        () => {
          registry.isAvailable('p1-cap-1', v6Context);
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(SCOPE_CHECK_THRESHOLD_US);
    });
    
    it('checkCapability (RuntimeScopeChecker) should be < 100µs', () => {
      const result = benchmark(
        'checkCapability (P0)',
        () => {
          checker.checkCapability('p0-cap-1', checker.getCurrentContext());
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(SCOPE_CHECK_THRESHOLD_US);
    });
    
    it('getCurrentContext should be fast', () => {
      const result = benchmark(
        'getCurrentContext',
        () => {
          checker.getCurrentContext();
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(50); // Should be very fast
    });
    
    it('hasCapability should be fast', () => {
      const result = benchmark(
        'hasCapability',
        () => {
          registry.hasCapability('p0-cap-1');
          registry.hasCapability('p1-cap-1');
          registry.hasCapability('nonexistent-cap');
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(REGISTRY_LOOKUP_THRESHOLD_US);
    });
    
    it('getCapability should be fast', () => {
      const result = benchmark(
        'getCapability',
        () => {
          registry.getCapability('p0-cap-1');
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(REGISTRY_LOOKUP_THRESHOLD_US);
    });
    
    it('getAllCapabilities should be fast', () => {
      const result = benchmark(
        'getAllCapabilities',
        () => {
          registry.getAllCapabilities();
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(REGISTRY_LOOKUP_THRESHOLD_US);
    });
    
    it('getCapabilitiesByScope should be fast', () => {
      const result = benchmark(
        'getCapabilitiesByScope',
        () => {
          registry.getCapabilitiesByScope('p0');
          registry.getCapabilitiesByScope('p1');
          registry.getCapabilitiesByScope('p2');
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(REGISTRY_LOOKUP_THRESHOLD_US);
    });
    
    it('feature flag check should be < 50µs', () => {
      featureFlagManager.enable('test-flag');
      
      const result = benchmark(
        'isEnabled (existing flag)',
        () => {
          featureFlagManager.isEnabled('test-flag');
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(FEATURE_FLAG_CHECK_THRESHOLD_US);
    });
    
    it('feature flag check (non-existent) should be < 50µs', () => {
      const result = benchmark(
        'isEnabled (non-existent)',
        () => {
          featureFlagManager.isEnabled('non-existent-flag-xyz');
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(FEATURE_FLAG_CHECK_THRESHOLD_US);
    });
  });
  
  describe('Batch Operations', () => {
    it('checkCapabilities (10 capabilities) should be < 500µs', () => {
      const capabilityIds = [
        'p0-cap-1', 'p0-cap-2', 'p1-cap-1', 'p1-cap-2', 'p2-cap-1',
        'p0-cap-1', 'p0-cap-2', 'p1-cap-1', 'p1-cap-2', 'p2-cap-2'
      ];
      
      const result = benchmark(
        'checkCapabilities (10 items)',
        () => {
          checker.checkCapabilities(capabilityIds, v6Context);
        },
        Math.floor(BENCHMARK_ITERATIONS / 10)
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(500);
    });
    
    it('checkAll capabilities should be fast', () => {
      const result = benchmark(
        'checkAll (6 capabilities)',
        () => {
          checker.checkAll(v6Context);
        },
        Math.floor(BENCHMARK_ITERATIONS / 6)
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(REGISTRY_LOOKUP_THRESHOLD_US);
    });
  });
  
  describe('Context Switching', () => {
    it('updateContext should be fast', () => {
      const result = benchmark(
        'updateContext',
        () => {
          checker.updateContext({ environment: 'staging' });
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(100);
    });
    
    it('enableFeatureFlag should be fast', () => {
      const result = benchmark(
        'enableFeatureFlag',
        () => {
          checker.enableFeatureFlag('test-perf-flag');
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      expect(result.p95Us).toBeLessThan(100);
    });
  });
  
  describe('Optimization Verification', () => {
    it('should meet microsecond-level scope check target', () => {
      // Target: < 100 microseconds for scope check
      const context = v6Context;
      
      const result = benchmark(
        'Final: isAvailable (P0)',
        () => {
          registry.isAvailable('p0-cap-1', context);
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      
      // The key metric is p95 - 95% of requests should be under threshold
      expect(result.p95Us).toBeLessThan(SCOPE_CHECK_THRESHOLD_US);
      console.log(`\n✅ Performance target met: P95 = ${result.p95Us.toFixed(2)}µs < ${SCOPE_CHECK_THRESHOLD_US}µs`);
    });
    
    it('should meet feature flag check target', () => {
      // Target: < 50 microseconds for feature flag check
      const flagManager = new FeatureFlagManager();
      flagManager.enable('perf-test-flag');
      
      const result = benchmark(
        'Final: isEnabled',
        () => {
          flagManager.isEnabled('perf-test-flag');
        },
        BENCHMARK_ITERATIONS
      );
      
      printBenchmark(result);
      
      expect(result.p95Us).toBeLessThan(FEATURE_FLAG_CHECK_THRESHOLD_US);
      console.log(`\n✅ Feature flag target met: P95 = ${result.p95Us.toFixed(2)}µs < ${FEATURE_FLAG_CHECK_THRESHOLD_US}µs`);
    });
  });
});

describe('Performance Regression Detection', () => {
  let registry: ScopeRegistry;
  let checker: RuntimeScopeChecker;
  
  const testCapabilities: CapabilityDefinition[] = [
    { id: 'perf-test-p0', displayName: 'P0', scopeTag: 'p0', entryPoints: [], dependencies: [], description: '' },
    { id: 'perf-test-p1', displayName: 'P1', scopeTag: 'p1', entryPoints: [], dependencies: [], description: '' },
  ];
  
  beforeEach(() => {
    registry = new ScopeRegistry();
    for (const cap of testCapabilities) {
      registry.registerCapability(cap);
    }
    
    checker = new RuntimeScopeChecker(registry, {
      releaseBranch: 'v6.0',
      featureFlags: new Set(),
      environment: 'production'
    });
  });
  
  it('no quadratic complexity in isAvailable', () => {
    // Add more capabilities to test scalability
    for (let i = 0; i < 100; i++) {
      registry.registerCapability({
        id: `cap-${i}`,
        displayName: `Capability ${i}`,
        scopeTag: i % 3 === 0 ? 'p0' : i % 3 === 1 ? 'p1' : 'p2',
        entryPoints: [],
        dependencies: [],
        description: ''
      });
    }
    
    // Benchmark with 100+ capabilities
    const iterations = 1000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      registry.isAvailable('perf-test-p0', {
        releaseBranch: 'v6.0',
        featureFlags: new Set(),
        environment: 'production'
      });
    }
    const end = performance.now();
    const avgMs = (end - start) / iterations;
    const avgUs = avgMs * 1000;
    
    console.log(`\nScalability test (102 capabilities): avg = ${avgUs.toFixed(2)}µs per lookup`);
    
    // Should still be fast even with more capabilities
    expect(avgUs).toBeLessThan(SCOPE_CHECK_THRESHOLD_US);
  });
  
  it('no memory leaks in repeated operations', () => {
    // This is a simple smoke test - in production would use process.memoryUsage()
    const gc = () => {
      if (global.gc) {
        global.gc();
      }
    };
    
    gc();
    const initialMemory = process.memoryUsage?.()?.heapUsed ?? 0;
    
    // Perform many operations
    for (let i = 0; i < 10000; i++) {
      const context = {
        releaseBranch: 'v6.0',
        featureFlags: new Set(),
        environment: 'production'
      };
      registry.isAvailable('perf-test-p0', context);
      checker.checkCapability('perf-test-p0', context);
    }
    
    gc();
    const finalMemory = process.memoryUsage?.()?.heapUsed ?? 0;
    const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024;
    
    console.log(`\nMemory growth after 10k operations: ${memoryGrowth.toFixed(2)}MB`);
    
    // Memory growth should be minimal (< 10MB for 10k operations)
    expect(memoryGrowth).toBeLessThan(10);
  });
});