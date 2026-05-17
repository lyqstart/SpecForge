/**
 * Daemon Core Performance Tests
 * 
 * Performance tests covering:
 * - Startup time < 3 seconds (Requirement 5.7 threshold 5)
 * - Event write latency < 5 ms per event
 * - Concurrent session support
 * - Memory usage under load
 * 
 * Requirements: 5.7 threshold 5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Daemon } from '../src/daemon/Daemon';
import { EventBus } from '../src/event-bus/EventBus';
import { SessionRegistry } from '../src/session/SessionRegistry';
import { StateManager } from '../src/state/StateManager';

// Performance thresholds from Requirements 5.7 threshold 5
const STARTUP_TIME_THRESHOLD_MS = 3000; // 3 seconds
const EVENT_WRITE_LATENCY_THRESHOLD_MS = 5; // 5 ms per event
const CONCURRENT_SESSIONS_TARGET = 100; // Support 100+ simultaneous sessions
const MEMORY_USAGE_THRESHOLD_MB = 200; // Memory should stay under 200MB

describe('Daemon Performance Tests', () => {
  let daemon: Daemon;

  beforeEach(() => {
    daemon = new Daemon();
  });

  afterEach(async () => {
    if (daemon.isDaemonRunning()) {
      await daemon.stop();
    }
  });

  describe('Startup Time', () => {
    it('should start daemon within 3 seconds', async () => {
      // Measure startup time
      const startTime = Date.now();
      await daemon.start();
      const endTime = Date.now();
      
      const startupTimeMs = endTime - startTime;
      console.log(`Daemon startup time: ${startupTimeMs}ms`);
      
      // Verify startup completed successfully
      expect(daemon.isDaemonRunning()).toBe(true);
      
      // Verify startup time is under threshold
      expect(startupTimeMs).toBeLessThan(STARTUP_TIME_THRESHOLD_MS);
    });

    it('should have consistent startup times across multiple starts', async () => {
      const startupTimes: number[] = [];
      
      for (let i = 0; i < 5; i++) {
        // Create fresh daemon instance for each test
        const freshDaemon = new Daemon();
        
        const startTime = Date.now();
        await freshDaemon.start();
        const endTime = Date.now();
        
        startupTimes.push(endTime - startTime);
        
        await freshDaemon.stop();
      }
      
      // All startup times should be under threshold
      const allUnderThreshold = startupTimes.every(time => time < STARTUP_TIME_THRESHOLD_MS);
      expect(allUnderThreshold).toBe(true);
      
      // Log average for reference
      const avgStartupTime = startupTimes.reduce((a, b) => a + b, 0) / startupTimes.length;
      console.log(`Average startup time: ${avgStartupTime.toFixed(2)}ms`);
      console.log(`Startup times: ${startupTimes.join(', ')}ms`);
    });
  });
});

describe('Event Write Latency Tests', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();
  });

  afterEach(() => {
    eventBus.stop();
  });

  it('should write events with latency under 5ms', async () => {
    const event = {
      eventId: 'perf-test-event-1',
      ts: Date.now(),
      projectId: 'test-project',
      action: 'test.perf',
      payload: { data: 'test' },
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon' as const,
      },
    };

    // Warm up
    eventBus.publish(event);
    await new Promise(resolve => setTimeout(resolve, 10));

    // Measure event publish latency
    const latencies: number[] = [];
    const numEvents = 100;

    for (let i = 0; i < numEvents; i++) {
      const eventWithId = {
        ...event,
        eventId: `perf-test-${i}`,
        ts: Date.now(),
      };

      const startTime = process.hrtime.bigint();
      eventBus.publish(eventWithId);
      const endTime = process.hrtime.bigint();
      
      const latencyMs = Number(endTime - startTime) / 1_000_000;
      latencies.push(latencyMs);
    }

    // Give time for async processing
    await new Promise(resolve => setTimeout(resolve, 50));

    // Calculate statistics
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);
    const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

    console.log(`Event write latency - Avg: ${avgLatency.toFixed(3)}ms, Max: ${maxLatency.toFixed(3)}ms, P95: ${p95Latency.toFixed(3)}ms`);

    // Verify average latency is under threshold
    expect(avgLatency).toBeLessThan(EVENT_WRITE_LATENCY_THRESHOLD_MS);
  });

  it('should handle high-frequency event writes', async () => {
    const events = Array.from({ length: 1000 }, (_, i) => ({
      eventId: `high-freq-${i}`,
      ts: Date.now() + i,
      projectId: 'test-project',
      action: 'test.highfreq',
      payload: { index: i },
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon' as const,
      },
    }));

    const startTime = Date.now();
    
    // Publish all events as fast as possible
    for (const event of events) {
      eventBus.publish(event);
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const eventsPerSecond = (events.length / totalTime) * 1000;

    console.log(`High-frequency test: ${events.length} events in ${totalTime}ms (${eventsPerSecond.toFixed(0)} events/sec)`);

    // Give time for async processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should be able to handle at least 1000 events per second
    expect(eventsPerSecond).toBeGreaterThan(1000);
  });
});

describe('Concurrent Session Support Tests', () => {
  let eventBus: EventBus;
  let sessionRegistry: SessionRegistry;

  beforeEach(() => {
    eventBus = new EventBus();
    sessionRegistry = new SessionRegistry(eventBus);
    eventBus.start();
    sessionRegistry.start();
  });

  afterEach(() => {
    sessionRegistry.stop();
    eventBus.stop();
  });

  it('should support 100+ concurrent sessions', async () => {
    const numSessions = CONCURRENT_SESSIONS_TARGET;
    const sessions: string[] = [];

    // Create multiple sessions
    for (let i = 0; i < numSessions; i++) {
      const identity = sessionRegistry.registerPending(
        'sf-executor',
        'task-executor',
        `work-item-${i}`,
        `spawn-intent-${i}`
      );
      sessionRegistry.activate(identity.sessionId, `spawn-intent-${i}`);
      sessions.push(identity.sessionId);
    }

    const activeSessions = sessionRegistry.getActiveSessions();
    
    console.log(`Created ${activeSessions.length} concurrent sessions`);
    
    // Verify we created the target number of sessions
    expect(activeSessions.length).toBeGreaterThanOrEqual(CONCURRENT_SESSIONS_TARGET);
  });

  it('should handle rapid session creation and termination', async () => {
    const numIterations = 50;
    const createStartTime = Date.now();

    for (let i = 0; i < numIterations; i++) {
      const identity = sessionRegistry.registerPending(
        'sf-executor',
        'task-executor',
        `work-item-${i}`,
        `spawn-intent-${i}`
      );
      sessionRegistry.activate(identity.sessionId, `spawn-intent-${i}`);
      sessionRegistry.terminate(identity.sessionId);
    }

    const createEndTime = Date.now();
    const totalTime = createEndTime - createStartTime;
    const sessionsPerSecond = (numIterations / totalTime) * 1000;

    console.log(`Session lifecycle: ${numIterations} cycles in ${totalTime}ms (${sessionsPerSecond.toFixed(0)} cycles/sec)`);

    // Should be able to handle at least 10 sessions per second
    expect(sessionsPerSecond).toBeGreaterThan(10);
  });

  it('should maintain session lookup performance with many sessions', async () => {
    const numSessions = 100;
    
    // Create sessions
    for (let i = 0; i < numSessions; i++) {
      const identity = sessionRegistry.registerPending(
        'sf-executor',
        'task-executor',
        `work-item-${i}`,
        `spawn-intent-${i}`
      );
      sessionRegistry.activate(identity.sessionId, `spawn-intent-${i}`);
    }

    // Measure lookup performance
    const activeSessions = sessionRegistry.getActiveSessions();
    const lookups = 1000;
    const lookupStartTime = Date.now();

    for (let i = 0; i < lookups; i++) {
      const sessionId = activeSessions[i % activeSessions.length];
      sessionRegistry.lookupBySessionId(sessionId);
    }

    const lookupEndTime = Date.now();
    const totalLookupTime = lookupEndTime - lookupStartTime;
    const lookupsPerSecond = (lookups / totalLookupTime) * 1000;

    console.log(`Session lookup: ${lookups} lookups in ${totalLookupTime}ms (${lookupsPerSecond.toFixed(0)} lookups/sec)`);

    // Should be able to handle at least 10000 lookups per second
    expect(lookupsPerSecond).toBeGreaterThan(10000);
  });
});

describe('Memory Usage Tests', () => {
  let daemon: Daemon;

  beforeEach(() => {
    daemon = new Daemon();
  });

  afterEach(async () => {
    if (daemon.isDaemonRunning()) {
      await daemon.stop();
    }
  });

  it('should maintain stable memory usage under load', async () => {
    await daemon.start();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Get initial memory usage
    const initialMemory = process.memoryUsage();
    const initialHeapUsed = initialMemory.heapUsed / (1024 * 1024); // Convert to MB
    
    console.log(`Initial memory: ${initialHeapUsed.toFixed(2)}MB`);

    // Perform operations that would stress memory
    const eventBus = new EventBus();
    const sessionRegistry = new SessionRegistry(eventBus);
    eventBus.start();
    sessionRegistry.start();

    // Create many sessions
    for (let i = 0; i < 100; i++) {
      const identity = sessionRegistry.registerPending(
        'sf-executor',
        'task-executor',
        `work-item-${i}`,
        `spawn-intent-${i}`
      );
      sessionRegistry.activate(identity.sessionId, `spawn-intent-${i}`);
    }

    // Publish many events
    for (let i = 0; i < 1000; i++) {
      const event = {
        eventId: `mem-test-${i}`,
        ts: Date.now(),
        projectId: 'test-project',
        action: 'test.memory',
        payload: { data: 'x'.repeat(100) }, // Add some payload size
        metadata: {
          schemaVersion: '1.0',
          source: 'daemon' as const,
        },
      };
      eventBus.publish(event);
    }

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Get final memory usage
    const finalMemory = process.memoryUsage();
    const finalHeapUsed = finalMemory.heapUsed / (1024 * 1024);
    const memoryIncrease = finalHeapUsed - initialHeapUsed;

    console.log(`Final memory: ${finalHeapUsed.toFixed(2)}MB (increase: ${memoryIncrease.toFixed(2)}MB)`);

    // Memory increase should be reasonable
    expect(finalHeapUsed).toBeLessThan(MEMORY_USAGE_THRESHOLD_MB);

    sessionRegistry.stop();
    eventBus.stop();
  });

  it('should not leak memory on repeated start/stop cycles', async () => {
    const memorySnapshots: number[] = [];

    for (let i = 0; i < 5; i++) {
      const testDaemon = new Daemon();
      await testDaemon.start();
      
      // Force GC
      if (global.gc) {
        global.gc();
      }

      const memory = process.memoryUsage();
      memorySnapshots.push(memory.heapUsed / (1024 * 1024));
      
      await testDaemon.stop();
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`Memory snapshots across cycles: ${memorySnapshots.map(m => m.toFixed(2)).join(', ')}MB`);

    // Memory should not grow significantly across cycles
    // Allow some variance but should be relatively stable
    const firstMemory = memorySnapshots[0];
    const lastMemory = memorySnapshots[memorySnapshots.length - 1];
    const memoryGrowth = lastMemory - firstMemory;

    console.log(`Memory growth: ${memoryGrowth.toFixed(2)}MB`);
    
    // Memory growth should be less than 50MB across 5 cycles
    expect(memoryGrowth).toBeLessThan(50);
  });
});

describe('State Manager Performance Tests', () => {
  it('should rebuild state efficiently from many events', async () => {
    const stateManager = new StateManager(`perf-test-${Date.now()}`);
    await stateManager.initialize();

    // Create many events
    const numEvents = 500;
    const events = Array.from({ length: numEvents }, (_, i) => ({
      eventId: `event-${i}`,
      ts: Date.now() + i,
      projectId: 'test-project',
      action: i % 2 === 0 ? 'session.created' : 'session.activated',
      payload: { sessionId: `session-${i}`, data: 'x'.repeat(50) },
      metadata: { schemaVersion: '1.0', source: 'daemon' as const },
    }));

    // Measure rebuild time
    const rebuildStartTime = Date.now();
    const state = await stateManager.rebuildFromEvents(events);
    const rebuildEndTime = Date.now();

    const rebuildTime = rebuildEndTime - rebuildStartTime;
    const eventsPerSecond = (numEvents / rebuildTime) * 1000;

    console.log(`State rebuild: ${numEvents} events in ${rebuildTime}ms (${eventsPerSecond.toFixed(0)} events/sec)`);

    // Should rebuild at least 100 events per second
    expect(eventsPerSecond).toBeGreaterThan(100);
    expect(state.lastEventId).toBe(`event-${numEvents - 1}`);
  });
});

describe('End-to-End Performance Tests', () => {
  let daemon: Daemon;

  beforeEach(() => {
    daemon = new Daemon();
  });

  afterEach(async () => {
    if (daemon.isDaemonRunning()) {
      await daemon.stop();
    }
  });

  it('should handle realistic workload', async () => {
    await daemon.start();

    const eventBus = new EventBus();
    const sessionRegistry = new SessionRegistry(eventBus);
    eventBus.start();
    sessionRegistry.start();

    // Simulate realistic workload:
    // 1. Create 50 sessions
    for (let i = 0; i < 50; i++) {
      const identity = sessionRegistry.registerPending(
        'sf-orchestrator',
        'requirements-phase-executor',
        `work-item-${i}`,
        `spawn-${i}`
      );
      sessionRegistry.activate(identity.sessionId, `spawn-${i}`);
    }

    // 2. Each session does 10 operations
    const operations = 500;
    const operationStartTime = Date.now();

    for (let i = 0; i < operations; i++) {
      const event = {
        eventId: `e2e-${i}`,
        ts: Date.now(),
        projectId: 'test-project',
        action: 'test.operation',
        payload: { sessionIndex: i % 50, data: 'x'.repeat(20) },
        metadata: {
          schemaVersion: '1.0',
          source: 'daemon' as const,
        },
      };
      eventBus.publish(event);
    }

    const operationEndTime = Date.now();
    const totalTime = operationEndTime - operationStartTime;
    const opsPerSecond = (operations / totalTime) * 1000;

    console.log(`E2E workload: ${operations} operations in ${totalTime}ms (${opsPerSecond.toFixed(0)} ops/sec)`);

    // Should handle at least 1000 operations per second
    expect(opsPerSecond).toBeGreaterThan(1000);

    // Get final memory
    if (global.gc) {
      global.gc();
    }
    const finalMemory = process.memoryUsage();
    const finalHeapUsed = finalMemory.heapUsed / (1024 * 1024);
    console.log(`Final memory after E2E: ${finalHeapUsed.toFixed(2)}MB`);

    sessionRegistry.stop();
    eventBus.stop();
  });
});