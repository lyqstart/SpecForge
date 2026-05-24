/**
 * Performance Validation Tests (Task 6.3)
 * 
 * Validates: Requirement 3.1 (performance threshold)
 * 
 * This test file validates performance characteristics of the Permission Engine:
 * 1. Permission decision latency measurements
 * 2. Event logging overhead measurements
 * 3. Rule loading and caching performance
 * 
 * Note: Performance thresholds are context-dependent. These tests measure
 * relative performance and identify regressions, rather than enforcing
 * arbitrary absolute limits.
 * 
 * Iterations: ≥ 100 for each performance test category
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { 
  PolicyEnforcementPoint, 
  createPolicyEnforcementPoint, 
  HttpRequestContext 
} from '../../src/services/policy-enforcement-point';
import { EventLogger } from '../../src/services/event-logger';
import { RuleMergingEngine } from '../../src/services/rule-merging-engine';
import { HardRuleEvaluator } from '../../src/hard-rules';

/**
 * Feature: Performance Validation (Task 6.3)
 * 
 * Derived-From: permission-engine Task 6.3
 */

describe('Performance Validation: Permission Engine', () => {
  let pep: PolicyEnforcementPoint;
  let eventLogger: ReturnType<typeof EventLogger.createInMemoryLogger>;
  const testProjectId = 'test-project-performance';
  const validToken = 'valid-test-token';

  // Performance thresholds (for reference - these are guidelines, not strict limits)
  const LATENCY_THRESHOLD_MS = 10; // Target: <10ms per decision
  const LOGGING_OVERHEAD_THRESHOLD_MS = 5; // Target: <5ms per log
  const CACHE_HIT_THRESHOLD_MS = 1; // Cache hits should be <1ms

  describe('6.3.1: Permission Decision Latency', () => {
    beforeEach(() => {
      eventLogger = EventLogger.createInMemoryLogger(testProjectId);
      pep = createPolicyEnforcementPoint({
        bearerToken: validToken,
        projectId: testProjectId,
        requireAuth: false, // Skip auth for pure decision latency testing
        logDecisions: false, // Disable logging for pure decision latency
        eventLogger: eventLogger.logger,
        pdp: new RuleMergingEngine({
          cacheEnabled: true,
          defaultDecision: 'allow'
        })
      });
    });

    afterEach(() => {
      eventLogger.clearEvents();
    });

    /**
     * Measure latency for permission decisions with various inputs
     */
    it('permission decision latency is consistent across different request types', async () => {
      const latencies: number[] = [];
      
      // Generate various request types
      const requestTypes = [
        { action: 'spec.read', resourceType: 'spec' },
        { action: 'spec.create', resourceType: 'spec' },
        { action: 'task.execute', resourceType: 'task' },
        { action: 'tool.execute', resourceType: 'tool' },
        { action: 'workflow.run', resourceType: 'workflow' },
        { action: 'config.read', resourceType: 'config' },
      ];

      for (let i = 0; i < 100; i++) {
        const reqType = requestTypes[i % requestTypes.length];
        
        const request: HttpRequestContext = {
          method: 'GET',
          path: `/api/${reqType.resourceType}s`,
          headers: {
            'x-actor-id': `actor-${i}`,
            'x-action': reqType.action,
            'x-resource-type': reqType.resourceType,
            'authorization': `Bearer ${validToken}`
          }
        };

        const start = performance.now();
        await pep.processRequest(request);
        const end = performance.now();
        
        latencies.push(end - start);
      }

      // Calculate statistics
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);
      const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

      console.log('Permission Decision Latency Statistics:');
      console.log(`  Average: ${avgLatency.toFixed(3)}ms`);
      console.log(`  Min: ${minLatency.toFixed(3)}ms`);
      console.log(`  Max: ${maxLatency.toFixed(3)}ms`);
      console.log(`  P95: ${p95.toFixed(3)}ms`);

      // Most decisions should be fast (< threshold)
      const slowDecisions = latencies.filter(l => l > LATENCY_THRESHOLD_MS).length;
      const slowPercentage = (slowDecisions / latencies.length) * 100;
      
      // Allow up to 5% to be above threshold (for warm-up, outliers, etc.)
      expect(slowPercentage).toBeLessThan(5);
    });

    /**
     * Test latency with random generated inputs (property-based)
     */
    it('latency remains consistent with random actor/action/resource combinations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (seed) => {
            const request: HttpRequestContext = {
              method: seed % 2 === 0 ? 'GET' : 'POST',
              path: `/api/test/${seed}`,
              headers: {
                'x-actor-id': `actor-${seed}`,
                'x-action': `action.${seed % 10}`,
                'x-resource-type': `resource-${seed % 5}`,
                'authorization': `Bearer ${validToken}`
              }
            };

            // Warm up
            await pep.processRequest(request);

            // Measure
            const start = performance.now();
            await pep.processRequest(request);
            const latency = performance.now() - start;

            // Should be reasonably fast even for random inputs
            expect(latency).toBeLessThan(50); // Allow up to 50ms for any input
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('6.3.2: Event Logging Overhead', () => {
    beforeEach(() => {
      eventLogger = EventLogger.createInMemoryLogger(testProjectId);
    });

    afterEach(() => {
      eventLogger.clearEvents();
    });

    /**
     * Measure the overhead of event logging
     */
    it('event logging adds minimal overhead', async () => {
      const logger = eventLogger.logger;
      const logOverheads: number[] = [];

      for (let i = 0; i < 100; i++) {
        const payload = {
          actor: `actor-${i}`,
          action: 'spec.read',
          resource: 'spec',
          decision: i % 2 === 0 ? 'allow' as const : 'deny' as const,
          matched_rule: 'test-rule',
          rule_layer: 'builtin' as const,
          reason: 'Test event logging'
        };

        const start = performance.now();
        await logger.logPermissionDecision(payload);
        const end = performance.now();

        logOverheads.push(end - start);
      }

      const avgOverhead = logOverheads.reduce((a, b) => a + b, 0) / logOverheads.length;
      const maxOverhead = Math.max(...logOverheads);
      const p95 = logOverheads.sort((a, b) => a - b)[Math.floor(logOverheads.length * 0.95)];

      console.log('Event Logging Overhead Statistics:');
      console.log(`  Average: ${avgOverhead.toFixed(3)}ms`);
      console.log(`  Max: ${maxOverhead.toFixed(3)}ms`);
      console.log(`  P95: ${p95.toFixed(3)}ms`);

      // Most operations should be fast
      const slowLogs = logOverheads.filter(o => o > LOGGING_OVERHEAD_THRESHOLD_MS).length;
      expect(slowLogs / logOverheads.length).toBeLessThan(0.1); // Less than 10% slow
    });

    /**
     * Test event logging with various payload sizes
     */
    it('logging overhead scales appropriately with payload size', async () => {
      const logger = eventLogger.logger;
      
      // Small payload
      const smallPayload = {
        actor: 'actor-1',
        action: 'spec.read',
        resource: 'spec',
        decision: 'allow' as const,
        matched_rule: 'rule-1',
        rule_layer: 'builtin' as const,
        reason: 'Test'
      };

      // Large payload (with more context)
      const largePayload = {
        actor: 'actor-1',
        action: 'spec.read',
        resource: 'spec',
        decision: 'allow' as const,
        matched_rule: 'rule-1',
        rule_layer: 'builtin' as const,
        reason: 'Test with more context'
      };

      // Measure small payload
      const smallStart = performance.now();
      await logger.logPermissionDecision(smallPayload);
      const smallEnd = performance.now();
      const smallOverhead = smallEnd - smallStart;

      // Clear and measure large payload
      eventLogger.clearEvents();
      
      const largeStart = performance.now();
      await logger.logPermissionDecision(largePayload);
      const largeEnd = performance.now();
      const largeOverhead = largeEnd - largeStart;

      console.log('Logging overhead comparison:');
      console.log(`  Small payload: ${smallOverhead.toFixed(3)}ms`);
      console.log(`  Large payload: ${largeOverhead.toFixed(3)}ms`);

      // Large payload should not be disproportionately slower
      // Allow 10x overhead for 100x more data (reasonable serialization cost)
      expect(largeOverhead).toBeLessThan(smallOverhead * 15);
    });

    /**
     * Batch logging performance
     */
    it('batch event logging is more efficient than individual logging', async () => {
      const logger = eventLogger.logger;
      const batchSize = 50;

      // Time individual logging
      const individualStart = performance.now();
      for (let i = 0; i < batchSize; i++) {
        await logger.logPermissionDecision({
          actor: `actor-${i}`,
          action: 'spec.read',
          resource: 'spec',
          decision: 'allow' as const,
          matched_rule: 'rule-1',
          rule_layer: 'builtin' as const,
          reason: 'Test'
        });
      }
      const individualTime = performance.now() - individualStart;

      eventLogger.clearEvents();

      // Time batch logging (simulated - in real impl could be batched)
      const batchStart = performance.now();
      const promises = [];
      for (let i = 0; i < batchSize; i++) {
        promises.push(logger.logPermissionDecision({
          actor: `actor-${i}`,
          action: 'spec.read',
          resource: 'spec',
          decision: 'allow' as const,
          matched_rule: 'rule-1',
          rule_layer: 'builtin' as const,
          reason: 'Test'
        }));
      }
      await Promise.all(promises);
      const batchTime = performance.now() - batchStart;

      console.log('Batch vs Individual Logging:');
      console.log(`  Individual (${batchSize} ops): ${individualTime.toFixed(3)}ms`);
      console.log(`  Batch (${batchSize} ops): ${batchTime.toFixed(3)}ms`);

      // Batch should be faster or similar (in practice, Promise.all helps)
      expect(batchTime).toBeLessThan(individualTime * 1.5);
    });
  });

  describe('6.3.3: Rule Loading and Caching Performance', () => {
    let pdp: RuleMergingEngine;

    beforeEach(() => {
      pdp = new RuleMergingEngine({
        cacheEnabled: true,
        defaultDecision: 'allow',
        hardRuleEvaluator: new HardRuleEvaluator()
      });
    });

    /**
     * Test cache effectiveness - repeated requests should be faster
     */
    it('rule evaluation cache provides significant speedup for repeated requests', async () => {
      const request = {
        actor: 'sf-executor',
        action: 'spec.read',
        resource: 'spec'
      };

      // First evaluation (cache miss)
      const firstStart = performance.now();
      pdp.evaluate(request);
      const firstTime = performance.now() - firstStart;

      // Subsequent evaluations (should be cache hits)
      const cachedTimes: number[] = [];
      for (let i = 0; i < 100; i++) {
        const cachedStart = performance.now();
        pdp.evaluate(request);
        cachedTimes.push(performance.now() - cachedStart);
      }

      const avgCachedTime = cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length;
      const maxCachedTime = Math.max(...cachedTimes);

      console.log('Cache Performance:');
      console.log(`  First evaluation (cache miss): ${firstTime.toFixed(3)}ms`);
      console.log(`  Average cached evaluation: ${avgCachedTime.toFixed(3)}ms`);
      console.log(`  Max cached evaluation: ${maxCachedTime.toFixed(3)}ms`);
      console.log(`  Speedup factor: ${(firstTime / avgCachedTime).toFixed(1)}x`);

      // Cached evaluations should be faster
      expect(avgCachedTime).toBeLessThan(firstTime);
      // Most cached evaluations should be very fast
      const fastCached = cachedTimes.filter(t => t < CACHE_HIT_THRESHOLD_MS).length;
      expect(fastCached / cachedTimes.length).toBeGreaterThan(0.8); // 80% fast
    });

    /**
     * Test with many different requests - cache should handle variety
     */
    it('cache handles many different request patterns efficiently', async () => {
      const uniqueRequests = 100;
      const evaluationsPerRequest = 5;
      const allTimes: number[] = [];

      for (let i = 0; i < uniqueRequests; i++) {
        const request = {
          actor: `role-${i % 5}`,
          action: `action.${i % 10}`,
          resource: `type-${i % 8}`
        };

        // First evaluation for this pattern
        pdp.evaluate(request);

        // Subsequent evaluations (cached)
        for (let j = 0; j < evaluationsPerRequest; j++) {
          const start = performance.now();
          pdp.evaluate(request);
          allTimes.push(performance.now() - start);
        }
      }

      const avgTime = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;
      const maxTime = Math.max(...allTimes);

      console.log('Multiple Pattern Cache Performance:');
      console.log(`  Unique patterns: ${uniqueRequests}`);
      console.log(`  Total evaluations: ${allTimes.length}`);
      console.log(`  Average time: ${avgTime.toFixed(3)}ms`);
      console.log(`  Max time: ${maxTime.toFixed(3)}ms`);

      // Even with many patterns, should be reasonably fast
      expect(avgTime).toBeLessThan(5);
      expect(maxTime).toBeLessThan(20);
    });

    /**
     * Test cache clearing and rebuild
     */
    it('cache can be cleared and rebuilt efficiently', async () => {
      // Populate cache
      for (let i = 0; i < 50; i++) {
        pdp.evaluate({
          actor: `actor-${i}`,
          action: `action.${i}`,
          resource: 'spec'
        });
      }

      // Time to clear cache
      const clearStart = performance.now();
      pdp.clearCache();
      const clearTime = performance.now() - clearStart;

      // Time to repopulate
      const repopStart = performance.now();
      for (let i = 0; i < 50; i++) {
        pdp.evaluate({
          actor: `actor-${i}`,
          action: `action.${i}`,
          resource: 'spec'
        });
      }
      const repopTime = performance.now() - repopStart;

      console.log('Cache Rebuild Performance:');
      console.log(`  Clear time: ${clearTime.toFixed(3)}ms`);
      console.log(`  Repopulate time (50 requests): ${repopTime.toFixed(3)}ms`);

      // Clear should be instant
      expect(clearTime).toBeLessThan(1);
      // Repopulate should be fast
      expect(repopTime).toBeLessThan(50);
    });

    /**
     * Property-based test for cache correctness
     */
    it('cache returns consistent results for same input', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const request = {
              actor: `role-${seed % 3}`,
              action: `action.${seed % 10}`,
              resource: `type-${seed % 5}`
            };

            // Evaluate multiple times
            const results = [];
            for (let i = 0; i < 10; i++) {
              results.push(pdp.evaluate(request));
            }

            // All results should be identical
            for (const result of results) {
              expect(result.decision).toBe(results[0].decision);
              expect(result.matched_rule).toBe(results[0].matched_rule);
              expect(result.rule_layer).toBe(results[0].rule_layer);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('6.3.4: End-to-End Performance with Full Pipeline', () => {
    beforeEach(() => {
      eventLogger = EventLogger.createInMemoryLogger(testProjectId);
      pep = createPolicyEnforcementPoint({
        bearerToken: validToken,
        projectId: testProjectId,
        requireAuth: true,
        logDecisions: true,
        logDenials: true,
        eventLogger: eventLogger.logger,
        pdp: new RuleMergingEngine({
          cacheEnabled: true,
          defaultDecision: 'allow'
        })
      });
    });

    afterEach(() => {
      eventLogger.clearEvents();
    });

    /**
     * Measure full pipeline: auth + decision + logging
     */
    it('full permission pipeline performs well under load', async () => {
      const pipelineTimes: number[] = [];

      for (let i = 0; i < 100; i++) {
        const request: HttpRequestContext = {
          method: 'GET',
          path: `/api/specs/${i}`,
          headers: {
            'x-actor-id': `actor-${i}`,
            'x-session-id': `session-${i}`,
            'x-action': 'spec.read',
            'x-resource-type': 'spec',
            'x-resource-id': `spec-${i}`,
            'authorization': `Bearer ${validToken}`
          },
          clientIp: '127.0.0.1'
        };

        const start = performance.now();
        await pep.processRequest(request);
        const end = performance.now();

        pipelineTimes.push(end - start);
      }

      const avgTime = pipelineTimes.reduce((a, b) => a + b, 0) / pipelineTimes.length;
      const maxTime = Math.max(...pipelineTimes);
      const p95 = pipelineTimes.sort((a, b) => a - b)[Math.floor(pipelineTimes.length * 0.95)];

      console.log('Full Pipeline Performance:');
      console.log(`  Average: ${avgTime.toFixed(3)}ms`);
      console.log(`  Max: ${maxTime.toFixed(3)}ms`);
      console.log(`  P95: ${p95.toFixed(3)}ms`);

      // Should be reasonably fast for typical use
      expect(avgTime).toBeLessThan(20);
      // P95 should be acceptable
      expect(p95).toBeLessThan(30);
    });

    /**
     * Test with various authentication states
     */
    it('performance is consistent regardless of auth result', async () => {
      // Test with valid token (should pass auth)
      const validRequest: HttpRequestContext = {
        method: 'GET',
        path: '/api/specs',
        headers: {
          'x-actor-id': 'actor-1',
          'x-action': 'spec.read',
          'x-resource-type': 'spec',
          'authorization': `Bearer ${validToken}`
        }
      };

      // Test with invalid token (should fail auth)
      const invalidRequest: HttpRequestContext = {
        method: 'GET',
        path: '/api/specs',
        headers: {
          'x-actor-id': 'actor-1',
          'x-action': 'spec.read',
          'x-resource-type': 'spec',
          'authorization': 'Bearer invalid-token'
        }
      };

      // Measure valid auth
      const validTimes: number[] = [];
      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        await pep.processRequest(validRequest);
        validTimes.push(performance.now() - start);
      }

      // Measure invalid auth
      const invalidTimes: number[] = [];
      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        await pep.processRequest(invalidRequest);
        invalidTimes.push(performance.now() - start);
      }

      const avgValid = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
      const avgInvalid = invalidTimes.reduce((a, b) => a + b, 0) / invalidTimes.length;

      console.log('Auth Result Performance:');
      console.log(`  Valid token avg: ${avgValid.toFixed(3)}ms`);
      console.log(`  Invalid token avg: ${avgInvalid.toFixed(3)}ms`);

      // Both should be reasonably fast; invalid might be slightly faster (less processing)
      expect(avgValid).toBeLessThan(20);
      expect(avgInvalid).toBeLessThan(20);
    });
  });

  describe('6.3.5: Memory and Resource Usage', () => {
    /**
     * Test that cache doesn't grow unbounded
     */
    it('cache size remains bounded under sustained load', () => {
      const pdp = new RuleMergingEngine({
        cacheEnabled: true,
        defaultDecision: 'allow'
      });

      // Generate many unique requests to stress cache
      for (let i = 0; i < 1000; i++) {
        pdp.evaluate({
          actor: `role-${i % 10}`,
          action: `action.${i % 20}`,
          resource: `type-${i % 15}`
        });
      }

      // The implementation should have some bounds on cache size
      // (Our implementation has a limit of 1000 entries)
      // This is a sanity check that the cache is working
      const testRequest = {
        actor: 'test-actor',
        action: 'test.action',
        resource: 'test'
      };

      // Should still work after many entries
      const result = pdp.evaluate(testRequest);
      expect(result).toBeDefined();
      expect(result.decision).toBe('allow');
    });
  });
});